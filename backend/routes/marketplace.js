const router = require('express').Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { resolveLang } = require('../middleware/i18n-lang');

// Public: liste tenants marketplace
router.get('/', async (req, res) => {
  try {
    const { sector, q } = req.query;
    const lang = resolveLang(req);
    // Key browser / CDN caches by language so changing locale invalidates.
    res.vary('Accept-Language');
    // Serve `short_description` in the caller's language with fallback to
    // the original (French) column. Only the whitelisted lang from
    // resolveLang() reaches this interpolation — safe for SQL.
    const descCol = lang === 'fr'
      ? 'short_description'
      : `COALESCE(NULLIF(short_description_${lang}, ''), short_description)`;
    let sql = `SELECT id, name, slug, logo_url, primary_color, sector, website, icp, ${descCol} AS short_description, created_at FROM tenants WHERE marketplace_visible = true AND short_description IS NOT NULL AND short_description <> ''`;
    const params = [];
    if (sector) { params.push(sector); sql += ` AND sector = $${params.length}`; }
    if (q) { params.push(`%${q.toLowerCase()}%`); sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(short_description) LIKE $${params.length} OR LOWER(icp) LIKE $${params.length})`; }
    sql += ' ORDER BY created_at DESC';
    // Pagination caps on the public marketplace listing. Without a
    // LIMIT, a marketplace with 100+ visible tenants returns the full
    // payload (logo URLs + descriptions + JSONB) on every public hit —
    // a CDN cache miss on a popular slug would slam the DB. Defaults
    // line up with the listing UI's page size; max=50 stops a malicious
    // ?limit=99999 from defeating the cap.
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 50);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    params.push(limit); sql += ` LIMIT $${params.length}`;
    params.push(offset); sql += ` OFFSET $${params.length}`;
    const { rows } = await query(sql, params);
    res.json({ partners: rows });
  } catch (err) { console.error('[marketplace]', err.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Public: secteurs
router.get('/sectors', async (req, res) => {
  try {
    const { rows } = await query("SELECT DISTINCT sector FROM tenants WHERE marketplace_visible = true AND sector IS NOT NULL AND sector <> '' ORDER BY sector ASC");
    res.json({ sectors: rows.map(r => r.sector) });
  } catch (err) {
    console.error('[marketplace GET settings]', err.message, 'tenantId:', req.user?.tenantId);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// Auth: get mes settings
router.get('/settings', authenticate, async (req, res) => {
  if (!['admin','superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const { rows } = await query('SELECT sector, website, icp, short_description, marketplace_visible FROM tenants WHERE id = $1', [req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Tenant non trouvé' });
    res.json({ settings: rows[0] });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Auth: update settings
router.patch('/settings', authenticate, async (req, res) => {
  if (!['admin','superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Acces interdit' });
  const { sector, website, icp, short_description, marketplace_visible } = req.body;
  if (website && !/^https?:\/\/.+/.test(website))
    return res.status(400).json({ error: 'URL invalide (doit commencer par http:// ou https://)' });
  // Auto-disable visibility if required fields are missing
  const visible = marketplace_visible === true && sector && website && short_description ? true : false;
  try {
    const { rows } = await query(
      'UPDATE tenants SET sector=$1, website=$2, icp=$3, short_description=$4, marketplace_visible=$5 WHERE id=$6 RETURNING sector, website, icp, short_description, marketplace_visible',
      [sector || null, website || null, icp || null, short_description || null, visible, req.user.tenantId]
    );
    res.json({ settings: rows[0] || {} });
  } catch (err) {
    console.error('[marketplace PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Helpers for the editor / public page endpoints ──────────────────
const crypto = require('crypto');

const DEFAULT_PAGE_BLOCKS = ['hero', 'tiers', 'conditions', 'about', 'ideal_client', 'why_join', 'references', 'additional_info', 'cta'];

function requireAdmin(req, res, next) {
  if (!req.user || !['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès interdit' });
  }
  next();
}

// Lazily insert a marketplace_settings row on first read so the editor
// doesn't need a separate "init" call.
async function loadOrCreatePage(tenantId) {
  const { rows } = await query(
    `SELECT id, tenant_id, page_headline, page_description, ideal_client,
            ideal_client_tags, why_join, commission_blocks, client_references,
            additional_info, page_blocks,
            page_description_i18n, ideal_client_i18n, why_join_i18n,
            commission_blocks_i18n, client_references_i18n, additional_info_i18n
       FROM marketplace_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  if (rows.length) return rows[0];
  const { rows: [created] } = await query(
    `INSERT INTO marketplace_settings (tenant_id, page_blocks)
     VALUES ($1, $2::jsonb)
     RETURNING id, tenant_id, page_headline, page_description, ideal_client,
               ideal_client_tags, why_join, commission_blocks, client_references,
               additional_info, page_blocks,
               page_description_i18n, ideal_client_i18n, why_join_i18n,
               commission_blocks_i18n, client_references_i18n, additional_info_i18n`,
    [tenantId, JSON.stringify(DEFAULT_PAGE_BLOCKS)]
  );
  return created;
}

async function tenantBundle(tenantId) {
  const { rows } = await query(
    `SELECT id, name AS company_name, slug, logo_url, sector, website, icp,
            short_description, marketplace_visible,
            revenue_model, level_threshold_type
       FROM tenants WHERE id = $1`,
    [tenantId]
  );
  if (!rows[0]) return null;
  // Normalize threshold_type alias so the FE doesn't have to know
  // whether it lives on tenants.level_threshold_type or somewhere
  // else.
  const t = rows[0];
  return {
    ...t,
    revenue_model: t.revenue_model || 'CA',
    threshold_type: t.level_threshold_type || 'deals',
  };
}

// ─── GET /api/marketplace/page ───────────────────────────────────────
// Two failure modes hide behind the FE's hardcoded "Tenant introuvable"
// message: tenantBundle returning null (real 404) and loadOrCreatePage
// throwing (500 swallowed by the outer catch). Split the try blocks so
// Railway logs distinguish them — debugging a blanket "Erreur serveur"
// against a known-good DB took longer than it should have.
router.get('/page', authenticate, requireAdmin, async (req, res) => {
  const tenantId = req.user && req.user.tenantId;
  if (!tenantId) {
    console.error('[marketplace.page GET] missing tenantId on req.user', { userId: req.user?.id, role: req.user?.role });
    return res.status(400).json({ error: 'tenant_missing' });
  }
  let tenant;
  try {
    tenant = await tenantBundle(tenantId);
  } catch (err) {
    console.error('[marketplace.page GET] tenantBundle failed', { tenantId, msg: err.message });
    return res.status(500).json({ error: 'Erreur serveur (tenant lookup)' });
  }
  if (!tenant) {
    console.error('[marketplace.page GET] tenant row not found', { tenantId });
    return res.status(404).json({ error: 'Tenant introuvable' });
  }
  try {
    const page = await loadOrCreatePage(tenantId);
    res.json({ tenant, page });
  } catch (err) {
    console.error('[marketplace.page GET] loadOrCreatePage failed', { tenantId, msg: err.message });
    res.status(500).json({ error: 'Erreur serveur (page load)' });
  }
});

// ─── PUT /api/marketplace/page ───────────────────────────────────────
// Whole-page save (debounced 2s on the editor). Accepts any subset of
// editable fields plus the marketplace_visible toggle that lives on
// tenants. Anything not in the body is left untouched.
router.put('/page', authenticate, requireAdmin, async (req, res) => {
  try {
    const tenantId = req.user.tenantId;
    const b = req.body || {};
    await loadOrCreatePage(tenantId);

    // Tenant-level fields (publishing toggle + hero copy on tenants).
    const tenantUpdates = [];
    const tenantParams = [];
    let i = 1;
    const tenantField = (col, value) => {
      if (value === undefined) return;
      tenantUpdates.push(`${col} = $${i++}`);
      tenantParams.push(value);
    };
    tenantField('marketplace_visible', typeof b.marketplace_visible === 'boolean' ? b.marketplace_visible : undefined);
    tenantField('name', b.company_name);
    tenantField('logo_url', b.logo_url);
    tenantField('sector', b.sector);
    tenantField('website', b.website);
    tenantField('icp', b.icp);
    tenantField('short_description', b.short_description);
    if (tenantUpdates.length) {
      tenantParams.push(tenantId);
      await query(`UPDATE tenants SET ${tenantUpdates.join(', ')} WHERE id = $${i}`, tenantParams);
    }

    // marketplace_settings fields.
    const updates = [];
    const params = [];
    let j = 1;
    const set = (col, value) => {
      if (value === undefined) return;
      updates.push(`${col} = $${j++}`);
      params.push(value);
    };
    set('page_headline', b.page_headline);
    set('page_description', b.page_description);
    set('ideal_client', b.ideal_client);
    if (b.ideal_client_tags !== undefined) {
      updates.push(`ideal_client_tags = $${j++}`);
      params.push(Array.isArray(b.ideal_client_tags) ? b.ideal_client_tags : []);
    }
    const setJsonb = (col, value) => {
      if (value === undefined) return;
      updates.push(`${col} = $${j++}::jsonb`);
      params.push(JSON.stringify(value));
    };
    setJsonb('why_join', b.why_join);
    setJsonb('commission_blocks', b.commission_blocks);
    setJsonb('client_references', b.client_references);
    setJsonb('additional_info', b.additional_info);
    setJsonb('page_blocks', b.page_blocks);
    updates.push('updated_at = NOW()');
    if (updates.length > 1) {
      params.push(tenantId);
      await query(`UPDATE marketplace_settings SET ${updates.join(', ')} WHERE tenant_id = $${j}`, params);
    }

    const tenant = await tenantBundle(tenantId);
    const page = await loadOrCreatePage(tenantId);
    res.json({ ok: true, tenant, page });
  } catch (err) {
    console.error('[marketplace.page PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/marketplace/page/reorder ─────────────────────────────
router.post('/page/reorder', authenticate, requireAdmin, async (req, res) => {
  try {
    const blocks = Array.isArray(req.body?.blocks) ? req.body.blocks : null;
    if (!blocks) return res.status(400).json({ error: 'blocks[] requis' });
    await loadOrCreatePage(req.user.tenantId);
    await query(
      `UPDATE marketplace_settings SET page_blocks = $1::jsonb, updated_at = NOW() WHERE tenant_id = $2`,
      [JSON.stringify(blocks), req.user.tenantId]
    );
    res.json({ ok: true, blocks });
  } catch (err) {
    console.error('[marketplace.page reorder]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/marketplace/references/upload ─────────────────────────
// JSON { name, description, data_url } — base64 image data URL stored
// inline in client_references JSONB. Mirrors the invoice-upload pattern
// so we don't need filesystem / S3 wiring.
router.post('/references/upload', authenticate, requireAdmin, async (req, res) => {
  try {
    const { name, description, data_url } = req.body || {};
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name requis' });
    // Strict MIME allow-list. The previous /^data:image\// regex
    // accepted SVG payloads, which carry inline <script> + on*
    // handlers — a stored XSS vector once an admin uploads it and a
    // partner / public-marketplace visitor renders the reference
    // page. Bitmap formats only.
    if (data_url && (typeof data_url !== 'string' || !/^data:image\/(png|jpeg|gif|webp);base64,/.test(data_url))) {
      return res.status(400).json({ error: 'data_url doit être PNG, JPEG, GIF ou WebP en base64' });
    }
    if (data_url && data_url.length > 1024 * 1024) {
      return res.status(413).json({ error: 'Logo trop volumineux (1MB max)' });
    }
    const page = await loadOrCreatePage(req.user.tenantId);
    const refs = Array.isArray(page.client_references) ? page.client_references : [];
    const ref = {
      id: crypto.randomUUID(),
      name: name.trim(),
      description: (description || '').trim() || null,
      logo_url: data_url || null,
    };
    refs.push(ref);
    await query(
      `UPDATE marketplace_settings SET client_references = $1::jsonb, updated_at = NOW() WHERE tenant_id = $2`,
      [JSON.stringify(refs), req.user.tenantId]
    );
    res.status(201).json({ ok: true, reference: ref });
  } catch (err) {
    console.error('[marketplace.references upload]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/marketplace/references/:id ──────────────────────────
router.delete('/references/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const page = await loadOrCreatePage(req.user.tenantId);
    const refs = (Array.isArray(page.client_references) ? page.client_references : []).filter(r => r.id !== req.params.id);
    await query(
      `UPDATE marketplace_settings SET client_references = $1::jsonb, updated_at = NOW() WHERE tenant_id = $2`,
      [JSON.stringify(refs), req.user.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[marketplace.references delete]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/marketplace/page/translate ────────────────────────────
// Fire-and-forget. Returns 202 immediately; the actual translation runs
// in the background (6 langs × ~5 fields × 13s throttle ≈ 6-8 min).
const marketplaceTranslate = require('../services/marketplaceTranslateService');
const _runningTranslate = new Map();

router.post('/page/translate', authenticate, requireAdmin, async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'anthropic_key_missing', message: 'ANTHROPIC_API_KEY n\'est pas configuré.' });
  }
  const tenantId = req.user.tenantId;
  if (_runningTranslate.has(tenantId)) {
    return res.status(409).json({
      error: 'already_running',
      startedAt: _runningTranslate.get(tenantId),
      message: 'Une traduction est déjà en cours pour ce tenant.',
    });
  }
  _runningTranslate.set(tenantId, new Date().toISOString());
  res.status(202).json({ ok: true, message: 'Translation started', startedAt: _runningTranslate.get(tenantId) });

  setImmediate(async () => {
    try {
      const result = await marketplaceTranslate.translatePage(tenantId, {
        log: (msg) => console.log(`[marketplace.translate ${String(tenantId).slice(0, 8)}] ${msg}`),
      });
      console.log(`[marketplace.translate ${String(tenantId).slice(0, 8)}] done`, result);
    } catch (err) {
      console.error(`[marketplace.translate ${String(tenantId).slice(0, 8)}] failed:`, err.message);
    } finally {
      _runningTranslate.delete(tenantId);
    }
  });
});

router.get('/page/translate/status', authenticate, requireAdmin, async (req, res) => {
  const startedAt = _runningTranslate.get(req.user.tenantId) || null;
  res.json({ running: !!startedAt, startedAt });
});

// ─── GET /api/marketplace/programs/:slug ────────────────────────────
// PUBLIC. Localized page bundle by tenant slug. Falls back to French
// when ?lang=xx columns are empty.
router.get('/programs/:slug', async (req, res) => {
  try {
    const lang = resolveLang(req);
    res.vary('Accept-Language');
    const descCol = lang === 'fr'
      ? 't.short_description'
      : `COALESCE(NULLIF(t.short_description_${lang}, ''), t.short_description)`;
    const { rows } = await query(
      `SELECT t.id, t.name AS company_name, t.slug, t.logo_url, t.sector,
              t.website, t.icp, t.marketplace_visible,
              t.revenue_model, t.level_threshold_type,
              ${descCol} AS short_description,
              ms.page_headline, ms.page_description, ms.ideal_client,
              ms.ideal_client_tags, ms.why_join, ms.commission_blocks,
              ms.client_references, ms.additional_info, ms.page_blocks,
              ms.page_description_i18n, ms.ideal_client_i18n, ms.ideal_client_tags_i18n,
              ms.why_join_i18n,
              ms.commission_blocks_i18n, ms.client_references_i18n, ms.additional_info_i18n
         FROM tenants t
         LEFT JOIN marketplace_settings ms ON ms.tenant_id = t.id
        WHERE t.slug = $1
          AND t.marketplace_visible = true
          AND t.short_description IS NOT NULL
          AND t.short_description <> ''
        LIMIT 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Programme introuvable' });
    const r = rows[0];
    // Public tier list — stripped to the public-facing fields only.
    // Empty tenants get an empty array, not null, so the FE doesn't
    // need to nullcheck.
    const { rows: tierRows } = await query(
      `SELECT name, min_threshold, commission_rate, color, icon, position
         FROM tenant_levels
        WHERE tenant_id = $1
        ORDER BY position ASC, min_threshold ASC`,
      [r.id]
    );
    const pickI18n = (base, i18nObj) => {
      if (lang === 'fr') return base;
      const v = i18nObj && typeof i18nObj === 'object' ? i18nObj[lang] : null;
      return v != null && v !== '' ? v : base;
    };
    res.json({
      program: {
        id: r.id,
        company_name: r.company_name,
        slug: r.slug,
        logo_url: r.logo_url,
        sector: r.sector,
        website: r.website,
        icp: r.icp,
        short_description: r.short_description,
        page_headline: r.page_headline || null,
        page_description: pickI18n(r.page_description, r.page_description_i18n),
        ideal_client: pickI18n(r.ideal_client, r.ideal_client_i18n),
        ideal_client_tags: pickI18n(r.ideal_client_tags || [], r.ideal_client_tags_i18n),
        why_join: pickI18n(r.why_join || [], r.why_join_i18n),
        commission_blocks: pickI18n(r.commission_blocks || [], r.commission_blocks_i18n),
        client_references: pickI18n(r.client_references || [], r.client_references_i18n),
        additional_info: pickI18n(r.additional_info || [], r.additional_info_i18n),
        page_blocks: Array.isArray(r.page_blocks) && r.page_blocks.length ? r.page_blocks : DEFAULT_PAGE_BLOCKS,
        revenue_model: r.revenue_model || 'CA',
        threshold_type: r.level_threshold_type || 'deals',
        tiers: tierRows,
      },
    });
  } catch (err) {
    console.error('[marketplace.programs GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/marketplace/programs/:slug/similar ────────────────────
router.get('/programs/:slug/similar', async (req, res) => {
  try {
    const lang = resolveLang(req);
    res.vary('Accept-Language');
    const descCol = lang === 'fr'
      ? 't.short_description'
      : `COALESCE(NULLIF(t.short_description_${lang}, ''), t.short_description)`;
    const { rows: cur } = await query('SELECT sector FROM tenants WHERE slug = $1 LIMIT 1', [req.params.slug]);
    const sector = cur[0]?.sector || null;
    const select = `t.id, t.name AS company_name, t.slug, t.logo_url, t.sector, ${descCol} AS short_description`;

    // First pass: same sector (when the program has one). Mirrors the
    // /blog/posts/:slug/related approach so every detail page emits a
    // consistent, populated cross-link block.
    let rows = [];
    if (sector) {
      const r = await query(
        `SELECT ${select}
           FROM tenants t
          WHERE t.slug <> $1
            AND t.marketplace_visible = true
            AND t.short_description IS NOT NULL AND t.short_description <> ''
            AND t.sector = $2
          ORDER BY t.created_at DESC
          LIMIT 3`,
        [req.params.slug, sector]
      );
      rows = r.rows;
    }

    // Backfill with most-recent visible programs so every page always
    // emits 3 cross-links — orphan / single-link reports flagged
    // detail pages whose sector matched zero peers.
    if (rows.length < 3) {
      const have = [req.params.slug, ...rows.map(r => r.slug)];
      const need = 3 - rows.length;
      const r2 = await query(
        `SELECT ${select}
           FROM tenants t
          WHERE t.slug <> ALL($1::text[])
            AND t.marketplace_visible = true
            AND t.short_description IS NOT NULL AND t.short_description <> ''
          ORDER BY t.created_at DESC
          LIMIT $2`,
        [have, need]
      );
      rows = [...rows, ...r2.rows];
    }
    res.json({ programs: rows });
  } catch (err) {
    console.error('[marketplace.programs/similar]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;