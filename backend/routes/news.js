const express = require('express');
const { query, getClient } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const notify = require('../services/notifyService');
const { sendEmail, newsPublishedTpl } = require('../services/emailService');

const router = express.Router();

// All news endpoints require auth.
router.use(authenticate);

// ─── Helpers ─────────────────────────────────────────────────────────
function firstChars(s, n = 200) {
  if (!s) return '';
  const stripped = String(s).replace(/<[^>]+>/g, '').trim();
  return stripped.length > n ? stripped.slice(0, n) + '…' : stripped;
}

// After a news post transitions to "published & not-draft", fan out
// in-app notifications + (optionally) emails to every active partner
// user in the same tenant. Behaviour is gated by the tenant's
// notification_preferences for the 'news' event_type.
async function createNotificationsForPost(post, client = null) {
  const exec = client ? client.query.bind(client) : query;
  const prefs = await notify.shouldNotify(post.tenant_id, 'news');
  if (!prefs.in_app && !prefs.email) return 0;

  const { rows: users } = await exec(
    `SELECT u.id AS user_id, u.email, u.full_name
       FROM users u
       JOIN partners p ON p.id = u.partner_id
      WHERE u.role = 'partner'
        AND p.tenant_id = $1
        AND p.is_active = true`,
    [post.tenant_id]
  );
  if (!users.length) return 0;

  // Map news category to a specific notification type so the sidebar
  // icon + unread-by-category grouping still distinguishes promo/kit/
  // event from generic news.
  const type =
    post.category === 'promotion' ? 'promo' :
    post.is_kit || post.category === 'commercial_kit' ? 'kit' :
    post.category === 'event' ? 'event' : 'news';
  const message = firstChars(post.content, 200);

  if (prefs.in_app) {
    for (const u of users) {
      await exec(
        `INSERT INTO notifications (user_id, type, title, message, link, news_post_id)
         VALUES ($1, $2, $3, $4, '/partner/news', $5)`,
        [u.user_id, type, post.title, message, post.id]
      );
    }
  }

  // Email fan-out (fire-and-forget so we don't slow the admin response).
  if (prefs.email) {
    const { rows: [tRow] } = await query('SELECT name FROM tenants WHERE id = $1', [post.tenant_id]);
    const tenantName = tRow?.name || 'RefBoost';
    const tpl = newsPublishedTpl(post.title, tenantName, message);
    for (const u of users) {
      if (!u.email) continue;
      sendEmail(u.email, tpl.subject, tpl.html).catch(e =>
        console.error('[news email]', u.email, e.message)
      );
    }
  }

  return users.length;
}

function shouldNotifyOnCreate(row) {
  if (row.is_draft) return false;
  if (row.published_at && new Date(row.published_at) > new Date()) return false;
  return true;
}

// ═══════════════════════════════════════════════════════════════════════
// ADMIN ENDPOINTS (tenant-scoped)
// ═══════════════════════════════════════════════════════════════════════

// GET /api/news — list posts for admin's tenant with read/attachment counts
router.get('/', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.json({ posts: [] });
    const { rows } = await query(
      `SELECT
         np.*,
         (SELECT COUNT(*) FROM news_attachments a WHERE a.news_post_id = np.id) AS attachment_count,
         (SELECT COUNT(*) FROM news_reads r WHERE r.news_post_id = np.id) AS read_count,
         (SELECT COUNT(*) FROM partners p WHERE p.tenant_id = np.tenant_id AND p.is_active = true) AS partner_count
       FROM news_posts np
       WHERE np.tenant_id = $1
       ORDER BY np.is_pinned DESC, np.published_at DESC`,
      [tenantId]
    );
    res.json({ posts: rows });
  } catch (err) {
    console.error('[news GET /]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/news — create post (fan out notifications if live)
router.post('/', authorize('admin', 'superadmin'), async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'tenant manquant' });
    const {
      title, content, category = 'update',
      image_url, video_url, link_url, link_label,
      is_pinned = false, is_draft = false, is_kit = false,
      promo_code, promo_discount, promo_expires_at,
      published_at,
    } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'titre et contenu requis' });

    await client.query('BEGIN');
    const { rows: [post] } = await client.query(
      `INSERT INTO news_posts (
         tenant_id, author_id, title, content, category,
         image_url, video_url, link_url, link_label,
         is_pinned, is_draft, is_kit,
         promo_code, promo_discount, promo_expires_at, published_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,COALESCE($16, NOW()))
       RETURNING *`,
      [
        tenantId, req.user.id, title, content, category,
        image_url || null, video_url || null, link_url || null, link_label || null,
        !!is_pinned, !!is_draft, !!is_kit,
        promo_code || null, promo_discount || null, promo_expires_at || null,
        published_at || null,
      ]
    );
    if (shouldNotifyOnCreate(post)) {
      await createNotificationsForPost(post, client);
    }
    await client.query('COMMIT');
    res.status(201).json({ post });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[news POST /]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// PUT /api/news/:id — update (fan out notifications when flipping draft→live)
router.put('/:id', authorize('admin', 'superadmin'), async (req, res) => {
  const client = await getClient();
  try {
    const tenantId = req.user.tenantId;
    const { rows: [prev] } = await client.query(
      'SELECT * FROM news_posts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (!prev) return res.status(404).json({ error: 'introuvable' });

    const {
      title, content, category, image_url, video_url,
      link_url, link_label, is_pinned, is_draft, is_kit,
      promo_code, promo_discount, promo_expires_at, published_at,
    } = req.body || {};

    await client.query('BEGIN');
    const { rows: [post] } = await client.query(
      `UPDATE news_posts SET
         title = COALESCE($2, title),
         content = COALESCE($3, content),
         category = COALESCE($4, category),
         image_url = $5,
         video_url = $6,
         link_url = $7,
         link_label = $8,
         is_pinned = COALESCE($9, is_pinned),
         is_draft = COALESCE($10, is_draft),
         is_kit = COALESCE($11, is_kit),
         promo_code = $12,
         promo_discount = $13,
         promo_expires_at = $14,
         published_at = COALESCE($15, published_at),
         updated_at = NOW()
       WHERE id = $1 AND tenant_id = $16
       RETURNING *`,
      [
        req.params.id,
        title, content, category,
        image_url ?? null, video_url ?? null, link_url ?? null, link_label ?? null,
        is_pinned, is_draft, is_kit,
        promo_code ?? null, promo_discount ?? null, promo_expires_at ?? null,
        published_at, tenantId,
      ]
    );

    // Fan out notifications if the post just transitioned from draft or
    // future-scheduled into being live.
    const wasLive = !prev.is_draft &&
      (!prev.published_at || new Date(prev.published_at) <= new Date());
    if (!wasLive && shouldNotifyOnCreate(post)) {
      await createNotificationsForPost(post, client);
    }

    await client.query('COMMIT');
    res.json({ post });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[news PUT /:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// DELETE /api/news/:id
router.delete('/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM news_posts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'introuvable' });
    // news_attachments and notifications.news_post_id cascade / set null.
    res.json({ ok: true });
  } catch (err) {
    console.error('[news DELETE /:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/news/:id/attachments
router.post('/:id/attachments', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    // Verify the post belongs to this tenant.
    const { rows: [post] } = await query(
      'SELECT id FROM news_posts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.user.tenantId]
    );
    if (!post) return res.status(404).json({ error: 'introuvable' });

    const { filename, file_url, file_type, file_size } = req.body || {};
    if (!filename || !file_url) return res.status(400).json({ error: 'filename et file_url requis' });

    const { rows: [att] } = await query(
      `INSERT INTO news_attachments (news_post_id, filename, file_url, file_type, file_size)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [req.params.id, filename, file_url, file_type || null, file_size || null]
    );
    res.status(201).json({ attachment: att });
  } catch (err) {
    console.error('[news POST attachments]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/news/attachments/:id
router.delete('/attachments/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    // Tenant check via parent post join.
    const { rowCount } = await query(
      `DELETE FROM news_attachments
        USING news_posts np
        WHERE news_attachments.id = $1
          AND news_attachments.news_post_id = np.id
          AND np.tenant_id = $2`,
      [req.params.id, req.user.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[news DELETE attachment]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/news/engagement — per-partner read ratios (placed BEFORE /:id/stats
// so "engagement" doesn't try to match as an :id UUID).
router.get('/engagement', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { rows: totalRow } = await query(
      `SELECT COUNT(*)::int AS total FROM news_posts
        WHERE tenant_id = $1 AND is_draft = false
          AND (published_at IS NULL OR published_at <= NOW())`,
      [tenantId]
    );
    const totalPosts = totalRow[0]?.total || 0;

    const { rows: partners } = await query(
      `SELECT p.id AS partner_id, p.name, p.contact_name, p.email, u.id AS user_id
         FROM partners p
         LEFT JOIN users u ON u.partner_id = p.id AND u.role = 'partner'
        WHERE p.tenant_id = $1 AND p.is_active = true`,
      [tenantId]
    );

    const perPartner = [];
    for (const p of partners) {
      let postsRead = 0;
      let lastReadAt = null;
      if (p.user_id && totalPosts > 0) {
        const { rows } = await query(
          `SELECT COUNT(*)::int AS c, MAX(r.read_at) AS last
             FROM news_reads r
             JOIN news_posts np ON np.id = r.news_post_id
            WHERE r.user_id = $1 AND np.tenant_id = $2`,
          [p.user_id, tenantId]
        );
        postsRead = rows[0]?.c || 0;
        lastReadAt = rows[0]?.last || null;
      }
      perPartner.push({
        partner_id: p.partner_id,
        name: p.name,
        contact_name: p.contact_name,
        email: p.email,
        posts_read: postsRead,
        total_posts: totalPosts,
        engagement_pct: totalPosts > 0 ? Math.round((postsRead / totalPosts) * 100) : 0,
        last_read_at: lastReadAt,
      });
    }
    perPartner.sort((a, b) => b.engagement_pct - a.engagement_pct);

    // Most / least read posts
    const { rows: mostRead } = await query(
      `SELECT np.id, np.title,
              (SELECT COUNT(*) FROM news_reads r WHERE r.news_post_id = np.id)::int AS reads
         FROM news_posts np
        WHERE np.tenant_id = $1 AND np.is_draft = false
          AND (np.published_at IS NULL OR np.published_at <= NOW())
        ORDER BY reads DESC, np.published_at DESC
        LIMIT 5`,
      [tenantId]
    );
    const { rows: leastRead } = await query(
      `SELECT np.id, np.title,
              (SELECT COUNT(*) FROM news_reads r WHERE r.news_post_id = np.id)::int AS reads
         FROM news_posts np
        WHERE np.tenant_id = $1 AND np.is_draft = false
          AND (np.published_at IS NULL OR np.published_at <= NOW())
        ORDER BY reads ASC, np.published_at DESC
        LIMIT 5`,
      [tenantId]
    );

    const avg = perPartner.length
      ? Math.round(perPartner.reduce((s, p) => s + p.engagement_pct, 0) / perPartner.length)
      : 0;

    res.json({
      partners: perPartner,
      most_read_posts: mostRead,
      least_read_posts: leastRead,
      avg_engagement_pct: avg,
      total_posts: totalPosts,
    });
  } catch (err) {
    console.error('[news engagement]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/news/:id/stats — who has read this post
router.get('/:id/stats', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const { rows: [post] } = await query(
      'SELECT id, title FROM news_posts WHERE id = $1 AND tenant_id = $2',
      [req.params.id, tenantId]
    );
    if (!post) return res.status(404).json({ error: 'introuvable' });

    const { rows: partners } = await query(
      `SELECT p.id AS partner_id, p.name, p.contact_name, p.email, u.id AS user_id,
              r.read_at
         FROM partners p
         LEFT JOIN users u ON u.partner_id = p.id AND u.role = 'partner'
         LEFT JOIN news_reads r ON r.news_post_id = $1 AND r.user_id = u.id
        WHERE p.tenant_id = $2 AND p.is_active = true
        ORDER BY (r.read_at IS NOT NULL) DESC, r.read_at DESC NULLS LAST, p.name`,
      [req.params.id, tenantId]
    );

    const read = partners.filter(p => p.read_at).map(p => ({
      partner_id: p.partner_id, name: p.name, email: p.email, read_at: p.read_at,
    }));
    const notRead = partners.filter(p => !p.read_at).map(p => ({
      partner_id: p.partner_id, name: p.name, email: p.email,
    }));
    const total = partners.length;
    const pct = total > 0 ? Math.round((read.length / total) * 100) : 0;

    res.json({
      post,
      read,
      not_read: notRead,
      total,
      read_count: read.length,
      percentage: pct,
    });
  } catch (err) {
    console.error('[news stats]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// PARTNER ENDPOINTS (mounted under /api/partner/news)
// ═══════════════════════════════════════════════════════════════════════

const partnerRouter = express.Router();
partnerRouter.use(authenticate);

// GET /api/partner/news — feed across every program this partner belongs to
partnerRouter.get('/', async (req, res) => {
  try {
    if (req.user.role !== 'partner') return res.status(403).json({ error: 'partenaire uniquement' });
    // Discover every tenant this partner has an active record in — a
    // partner may exist in multiple programs when an admin re-invites
    // them with the same email.
    const { rows: tenantRows } = await query(
      `SELECT DISTINCT p.tenant_id
         FROM partners p
         JOIN users u ON u.partner_id = p.id
        WHERE u.id = $1 AND p.is_active = true
        UNION
        SELECT DISTINCT p.tenant_id
          FROM partners p
         WHERE p.is_active = true AND LOWER(p.email) = LOWER($2)`,
      [req.user.id, req.user.email || '']
    );
    const tenantIds = tenantRows.map(r => r.tenant_id).filter(Boolean);
    if (!tenantIds.length) return res.json({ posts: [] });

    const { rows: posts } = await query(
      `SELECT np.*, t.name AS tenant_name, t.logo_url AS tenant_logo,
              (SELECT COUNT(*) FROM news_attachments a WHERE a.news_post_id = np.id)::int AS attachment_count
         FROM news_posts np
         JOIN tenants t ON t.id = np.tenant_id
        WHERE np.tenant_id = ANY($1::uuid[])
          AND np.is_draft = false
          AND (np.published_at IS NULL OR np.published_at <= NOW())
        ORDER BY np.is_pinned DESC, np.published_at DESC`,
      [tenantIds]
    );

    // Auto-mark as read.
    for (const p of posts) {
      await query(
        `INSERT INTO news_reads (news_post_id, user_id) VALUES ($1, $2)
           ON CONFLICT (news_post_id, user_id) DO NOTHING`,
        [p.id, req.user.id]
      );
    }
    res.json({ posts });
  } catch (err) {
    console.error('[partner news GET /]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/partner/news/:id — single post with attachments
partnerRouter.get('/:id', async (req, res) => {
  try {
    if (req.user.role !== 'partner') return res.status(403).json({ error: 'partenaire uniquement' });
    const { rows: [post] } = await query(
      `SELECT np.*, t.name AS tenant_name, t.logo_url AS tenant_logo
         FROM news_posts np
         JOIN tenants t ON t.id = np.tenant_id
        WHERE np.id = $1
          AND np.is_draft = false
          AND (np.published_at IS NULL OR np.published_at <= NOW())`,
      [req.params.id]
    );
    if (!post) return res.status(404).json({ error: 'introuvable' });
    const { rows: attachments } = await query(
      'SELECT * FROM news_attachments WHERE news_post_id = $1 ORDER BY created_at',
      [req.params.id]
    );
    await query(
      `INSERT INTO news_reads (news_post_id, user_id) VALUES ($1, $2)
         ON CONFLICT (news_post_id, user_id) DO NOTHING`,
      [post.id, req.user.id]
    );
    res.json({ post, attachments });
  } catch (err) {
    console.error('[partner news GET /:id]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// Program social links (mounted under /api/partner/program)
// ═══════════════════════════════════════════════════════════════════════
const programRouter = express.Router();
programRouter.use(authenticate);

// GET /api/partner/program/:id/socials — the tenant admin's partner record socials
// :id is a tenant id. We return the aggregated social links for that tenant.
programRouter.get('/:id/socials', async (req, res) => {
  try {
    // Find any active partner record in that tenant that has social links
    // set — practically there's usually just one "main" partner storing them.
    const { rows } = await query(
      `SELECT social_linkedin, social_twitter, social_facebook,
              social_instagram, social_youtube, social_website
         FROM partners
        WHERE tenant_id = $1 AND is_active = true
          AND (social_linkedin IS NOT NULL OR social_twitter IS NOT NULL
            OR social_facebook IS NOT NULL OR social_instagram IS NOT NULL
            OR social_youtube IS NOT NULL OR social_website IS NOT NULL)
        LIMIT 1`,
      [req.params.id]
    );
    res.json({ socials: rows[0] || {} });
  } catch (err) {
    console.error('[partner program socials]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.partnerRouter = partnerRouter;
module.exports.programRouter = programRouter;
