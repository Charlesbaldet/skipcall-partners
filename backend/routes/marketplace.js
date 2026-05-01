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
            short_description, marketplace_visible
       FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return rows[0] || null;
}

// ─── GET /api/marketplace/page ───────────────────────────────────────
router.get('/page', authenticate, requireAdmin, async (req, res) => {
  try {
    const tenant = await tenantBundle(req.user.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });
    const page = await loadOrCreatePage(req.user.tenantId);
    res.json({ tenant, page });
  } catch (err) {
    console.error('[marketplace.page GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
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
    if (data_url && (typeof data_url !== 'string' || !/^data:image\//.test(data_url))) {
      return res.status(400).json({ error: 'data_url doit être une image base64' });
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
              ${descCol} AS short_description,
              ms.page_headline, ms.page_description, ms.ideal_client,
              ms.ideal_client_tags, ms.why_join, ms.commission_blocks,
              ms.client_references, ms.additional_info, ms.page_blocks,
              ms.page_description_i18n, ms.ideal_client_i18n, ms.why_join_i18n,
              ms.commission_blocks_i18n, ms.client_references_i18n, ms.additional_info_i18n
         FROM tenants t
         LEFT JOIN marketplace_settings ms ON ms.tenant_id = t.id
        WHERE t.slug = $1
          AND t.marketplace_visible = true
        LIMIT 1`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Programme introuvable' });
    const r = rows[0];
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
        ideal_client_tags: r.ideal_client_tags || [],
        why_join: pickI18n(r.why_join || [], r.why_join_i18n),
        commission_blocks: pickI18n(r.commission_blocks || [], r.commission_blocks_i18n),
        client_references: pickI18n(r.client_references || [], r.client_references_i18n),
        additional_info: pickI18n(r.additional_info || [], r.additional_info_i18n),
        page_blocks: Array.isArray(r.page_blocks) && r.page_blocks.length ? r.page_blocks : DEFAULT_PAGE_BLOCKS,
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
    const params = [req.params.slug];
    let where = `t.slug <> $1 AND t.marketplace_visible = true AND t.short_description IS NOT NULL AND t.short_description <> ''`;
    if (sector) { params.push(sector); where += ` AND t.sector = $${params.length}`; }
    const { rows } = await query(
      `SELECT t.id, t.name AS company_name, t.slug, t.logo_url, t.sector,
              ${descCol} AS short_description
         FROM tenants t
        WHERE ${where}
        ORDER BY t.created_at DESC
        LIMIT 3`,
      params
    );
    res.json({ programs: rows });
  } catch (err) {
    console.error('[marketplace.programs/similar]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;