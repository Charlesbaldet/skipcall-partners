// Global cross-table search.
//
// One request → parallel ILIKE queries against referrals, partners,
// commissions, and news_posts. Admins see everything in their tenant;
// partners see only rows they own (their referrals + their commissions)
// plus news from their tenant.
//
// Intentionally simple: ILIKE with a leading '%' is fine up to ~100k
// rows per table; if any table grows past that we can add a GIN trigram
// index (`CREATE INDEX ... USING gin (col gin_trgm_ops)`) without any
// query-shape changes.
const express = require('express');
const { query } = require('../db');
const { authenticate, tenantScope } = require('../middleware/auth');

const router = express.Router();

const PER_CATEGORY = 5;

router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) return res.json({ results: { referrals: [], partners: [], commissions: [], news: [] }, total: 0 });
    if (q.length < 2) return res.json({ results: { referrals: [], partners: [], commissions: [], news: [] }, total: 0 });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });

    const like = '%' + q.replace(/[%_]/g, ch => '\\' + ch) + '%';
    const tenantId = req.tenantId;
    const isPartner = req.user?.role === 'partner';
    const partnerId = req.user?.partnerId || null;

    // ─── Referrals ────────────────────────────────────────────────
    // Partner: only their own referrals (r.partner_id matches).
    // Admin/commercial: every referral in the tenant.
    const referralsSql = `
      SELECT r.id,
             r.prospect_name,
             r.prospect_company,
             r.prospect_email,
             r.status,
             r.stage_id,
             ps.name AS stage_name,
             ps.color AS stage_color
        FROM referrals r
   LEFT JOIN pipeline_stages ps ON ps.id = r.stage_id
       WHERE r.tenant_id = $1
         AND (${isPartner ? 'r.partner_id = $4 AND ' : ''} (
              r.prospect_name   ILIKE $2
           OR r.prospect_company ILIKE $2
           OR r.prospect_email   ILIKE $2
           OR COALESCE(r.notes, '') ILIKE $2
         ))
       ORDER BY r.created_at DESC
       LIMIT $3`;
    const referralsParams = isPartner
      ? [tenantId, like, PER_CATEGORY, partnerId]
      : [tenantId, like, PER_CATEGORY];

    // ─── Partners ────────────────────────────────────────────────
    // Partners themselves can't browse the whole partner roster —
    // return an empty slot instead of hitting the DB.
    const partnersPromise = isPartner
      ? Promise.resolve({ rows: [] })
      : query(
          `SELECT id, name, contact_name, email, is_active
             FROM partners
            WHERE tenant_id = $1
              AND is_active = TRUE
              AND (name ILIKE $2 OR COALESCE(contact_name, '') ILIKE $2 OR COALESCE(email, '') ILIKE $2)
            ORDER BY created_at DESC
            LIMIT $3`,
          [tenantId, like, PER_CATEGORY]
        );

    // ─── Commissions ─────────────────────────────────────────────
    // Search joins so the query matches prospect name, partner name,
    // or amount (cast to text).
    const commissionsSql = `
      SELECT c.id,
             c.amount,
             c.status,
             p.name AS partner_name,
             r.prospect_name
        FROM commissions c
        JOIN partners p ON p.id = c.partner_id
        JOIN referrals r ON r.id = c.referral_id
       WHERE c.tenant_id = $1
         AND (${isPartner ? 'c.partner_id = $4 AND ' : ''} (
              p.name ILIKE $2
           OR r.prospect_name ILIKE $2
           OR c.amount::text ILIKE $2
         ))
       ORDER BY c.created_at DESC
       LIMIT $3`;
    const commissionsParams = isPartner
      ? [tenantId, like, PER_CATEGORY, partnerId]
      : [tenantId, like, PER_CATEGORY];

    // ─── News ────────────────────────────────────────────────────
    // Table is news_posts. Partners see only published posts from
    // their tenant; admins see all.
    const newsWhere = isPartner
      ? "WHERE tenant_id = $1 AND (is_draft = FALSE OR is_draft IS NULL) AND (title ILIKE $2 OR COALESCE(content,'') ILIKE $2)"
      : "WHERE tenant_id = $1 AND (title ILIKE $2 OR COALESCE(content,'') ILIKE $2)";
    const newsSql = `
      SELECT id, title, category, is_draft, published_at
        FROM news_posts
        ${newsWhere}
       ORDER BY published_at DESC NULLS LAST, created_at DESC
       LIMIT $3`;

    const [referralsRes, partnersRes, commissionsRes, newsRes] = await Promise.all([
      query(referralsSql, referralsParams).catch(e => { console.error('[search.referrals]', e.message); return { rows: [] }; }),
      partnersPromise.catch(e => { console.error('[search.partners]', e.message); return { rows: [] }; }),
      query(commissionsSql, commissionsParams).catch(e => { console.error('[search.commissions]', e.message); return { rows: [] }; }),
      query(newsSql, [tenantId, like, PER_CATEGORY]).catch(e => { console.error('[search.news]', e.message); return { rows: [] }; }),
    ]);

    const fmtMoney = (n) => {
      const num = parseFloat(n) || 0;
      try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num); }
      catch { return num.toFixed(2) + ' €'; }
    };

    const referrals = referralsRes.rows.map(r => ({
      id: r.id,
      title: r.prospect_name,
      subtitle: r.prospect_company || r.prospect_email || '',
      status: r.stage_name || r.status || '',
      statusColor: r.stage_color || null,
      url: isPartner ? '/partner/referrals' : '/referrals',
    }));
    const partners = (partnersRes.rows || []).map(p => ({
      id: p.id,
      title: p.name,
      subtitle: p.contact_name ? `${p.contact_name} · ${p.email || ''}` : (p.email || ''),
      status: p.is_active ? 'active' : 'archived',
      url: '/partners',
    }));
    const commissions = commissionsRes.rows.map(c => ({
      id: c.id,
      title: `${fmtMoney(c.amount)} — ${c.partner_name}`,
      subtitle: c.prospect_name || '',
      status: c.status || 'pending',
      url: isPartner ? '/partner/payments' : '/commissions',
    }));
    const news = newsRes.rows.map(n => ({
      id: n.id,
      title: n.title,
      subtitle: n.category || '',
      status: n.is_draft ? 'draft' : 'published',
      url: isPartner ? '/partner/news' : '/news',
    }));

    const total = referrals.length + partners.length + commissions.length + news.length;
    res.json({
      results: { referrals, partners, commissions, news },
      total,
    });
  } catch (err) {
    console.error('[search] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
