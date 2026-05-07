const router = require('express').Router();
const { query } = require('../db');
const jwt = require('jsonwebtoken');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/security');
const { getTenantConfig, clearTenantCache } = require('../middleware/tenant');

// ─── Public: Get tenant config (for frontend theming) ───
//
// Source of truth precedence:
//   1. The JWT, when an Authorization header is present and valid.
//      A logged-in partner / admin should always see THEIR tenant's
//      branding, regardless of which domain the SPA is served from.
//   2. The host-derived req.tenant (tenantMiddleware) for
//      unauthenticated visitors — used by the public marketing
//      pages and the apply form.
//
// The previous implementation only looked at req.tenant, so a
// partner from "Eficia" hitting refboost.io/api/tenants/config
// got the SPA's default tenant ("Skipcall") back, which the FE
// then displayed as the branded label everywhere.
router.get('/config', async (req, res) => {
  try {
    const auth = req.headers.authorization;
    if (auth && auth.startsWith('Bearer ')) {
      try {
        const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET);
        if (decoded?.tenantId) {
          const { rows } = await query(
            `SELECT id, name, slug, primary_color, secondary_color, accent_color,
                    logo_url, domain, settings
               FROM tenants WHERE id = $1`,
            [decoded.tenantId]
          );
          if (rows[0]) return res.json({ tenant: getTenantConfig(rows[0]) });
        }
      } catch { /* fall through to host-derived tenant for invalid/expired tokens */ }
    }
    if (!req.tenant) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant: getTenantConfig(req.tenant) });
  } catch (err) {
    console.error('[tenants.config]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Admin: List all tenants ───
// Explicit column allow-list — `SELECT *` would leak
// pennylane_api_token (added in v35) and any future secret columns
// added to the tenants table. New columns must be opted in
// deliberately rather than auto-included.
const TENANT_PUBLIC_COLUMNS = `
  id, name, slug, primary_color, secondary_color, accent_color,
  logo_url, domain, is_active, created_at, updated_at, settings,
  level_threshold_type, revenue_model,
  sector, website, icp, short_description, marketplace_visible,
  notion_status_mapping,
  short_description_en, short_description_es, short_description_de,
  short_description_it, short_description_nl, short_description_pt,
  billing_company_name, billing_address, billing_city,
  billing_postal_code, billing_country, billing_siret,
  onboarding_completed_at, onboarding_dismissed,
  pennylane_enabled
`;
router.get('/', authenticate, async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès interdit' });
  }
  try {
    const { rows } = await query(`SELECT ${TENANT_PUBLIC_COLUMNS} FROM tenants ORDER BY created_at ASC`);
    res.json({ tenants: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Admin: Create tenant ───
router.post('/', authenticate, async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès interdit' });
  }
  const { name, slug, domain, primary_color, secondary_color, logo_url } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et slug requis' });

  try {
    const { rows } = await query(
      `INSERT INTO tenants (name, slug, domain, primary_color, secondary_color, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name, slug.toLowerCase().replace(/[^a-z0-9-]/g, ''), domain || null, primary_color || '#6366f1', secondary_color || '#8b5cf6', logo_url || null]
    );
    clearTenantCache();
    auditLog(req, 'tenant_created', 'tenant', rows[0].id, { name, slug });
    res.json({ tenant: rows[0] });
  } catch (err) {
    if (err.message.includes('duplicate')) return res.status(400).json({ error: 'Ce slug existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Billing details ───
// GET is open to any authenticated user inside the tenant (partners
// need it for invoicing), PUT is admin/superadmin only. Both routes
// MUST be registered BEFORE PUT /:id below — otherwise Express
// matches "/billing" against "/:id" and swallows the call.
router.get('/billing', authenticate, async (req, res) => {
  if (!req.user.tenantId) return res.status(400).json({ error: 'tenant_missing' });
  try {
    const { rows } = await query(
      `SELECT billing_company_name, billing_address, billing_city,
              billing_postal_code, billing_country, billing_siret
         FROM tenants WHERE id = $1`,
      [req.user.tenantId]
    );
    res.json({ billing: rows[0] || {} });
  } catch (err) {
    console.error('[tenants.billing GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/billing', authenticate, async (req, res) => {
  if (!['admin', 'superadmin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Accès interdit' });
  }
  if (!req.user.tenantId) return res.status(400).json({ error: 'tenant_missing' });
  try {
    const {
      billing_company_name, billing_address, billing_city,
      billing_postal_code, billing_country, billing_siret,
    } = req.body || {};
    const { rows } = await query(
      `UPDATE tenants
          SET billing_company_name = $2,
              billing_address      = $3,
              billing_city         = $4,
              billing_postal_code  = $5,
              billing_country      = $6,
              billing_siret        = $7
        WHERE id = $1
        RETURNING billing_company_name, billing_address, billing_city,
                  billing_postal_code, billing_country, billing_siret`,
      [
        req.user.tenantId,
        billing_company_name || null,
        billing_address || null,
        billing_city || null,
        billing_postal_code || null,
        billing_country || null,
        billing_siret || null,
      ]
    );
    res.json({ billing: rows[0] || {} });
  } catch (err) {
    console.error('[tenants.billing PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Admin: Update tenant ───
router.put('/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin' && req.user.role !== 'superadmin') return res.status(403).json({ error: 'Accès interdit' });
  if (req.user.role !== 'superadmin' && req.params.id !== req.user.tenantId) {
    return res.status(403).json({ error: 'Vous ne pouvez modifier que votre propre espace' });
  }
  const { name, slug, domain, primary_color, secondary_color, accent_color, logo_url, settings , revenue_model } = req.body;

  let cleanSlug = null;
  if (slug !== undefined && slug !== null && String(slug).trim() !== '') {
    cleanSlug = String(slug).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
    if (cleanSlug.length === 0) return res.status(400).json({ error: 'Slug invalide' });
    try {
      // Skip the uniqueness check when the slug hasn't actually
      // changed. The Apparence form derives the slug from form.name
      // on every save, so an admin who just bumps their accent
      // colour would resubmit the same slug — and any data drift
      // (legacy duplicates from before the unique constraint, or a
      // concurrent edit racing the same PUT) would surface a
      // false-positive 409 even though the current tenant's row
      // was the only match. Reading the current slug first keeps
      // the no-change path unconditionally green.
      const { rows: [current] } = await query('SELECT slug FROM tenants WHERE id = $1', [req.params.id]);
      if (!current || current.slug !== cleanSlug) {
        const { rows: existing } = await query('SELECT id FROM tenants WHERE slug = $1 AND id != $2', [cleanSlug, req.params.id]);
        if (existing.length > 0) return res.status(409).json({ error: 'Ce slug est déjà utilisé par un autre espace' });
      }
    } catch (e) {}
  }

  try {
    const { rows } = await query(
      `UPDATE tenants SET name = COALESCE($1, name), slug = COALESCE($2, slug), domain = COALESCE($3, domain), primary_color = COALESCE($4, primary_color), secondary_color = COALESCE($5, secondary_color), accent_color = COALESCE($6, accent_color), logo_url = COALESCE($7, logo_url), settings = COALESCE($8, settings), updated_at = NOW()  WHERE id = $9 RETURNING *`,
      [name, cleanSlug, domain, primary_color, secondary_color, accent_color, logo_url, settings ? JSON.stringify(settings) : null, req.params.id]
    );

    // Safe optional revenue_model update (column may not exist yet if migration v15 failed)
    if (revenue_model !== undefined) {
      try {
        await query('UPDATE tenants SET revenue_model = $1 WHERE id = $2', [revenue_model || null, req.params.id]);
      } catch (e) {
        console.error('[tenants PUT] revenue_model update skipped:', e.message);
      }
    }
    clearTenantCache();
    auditLog(req, 'tenant_updated', 'tenant', req.params.id, { name });
    res.json({ tenant: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Admin: Get audit logs ───
router.get('/audit-logs', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const { rows } = await query(
      `SELECT al.*, u.full_name as user_name FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       WHERE al.tenant_id = $1
       ORDER BY al.created_at DESC LIMIT $2 OFFSET $3`,
      [req.user.tenantId, limit, offset]
    );
    const { rows: countRows } = await query(
      'SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1', [req.user.tenantId]
    );
    res.json({ logs: rows, total: parseInt(countRows[0].count) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get current user's tenant (JWT-based, for theme / branding)
router.get('/me', authenticate, async (req, res) => {
  if (!req.user || !req.user.tenantId) return res.status(404).json({ error: 'No tenant' });
  try {
    const { rows } = await query(
      'SELECT id, name, slug, primary_color, secondary_color, accent_color, logo_url, revenue_model FROM tenants WHERE id = $1',
      [req.user.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant: rows[0] });
  } catch (err) {
    console.error('Get my tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Public: Get tenant by slug (for public pages like /r/:slug — theme + logo)
async function publicTenantBySlug(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, name, slug, primary_color, secondary_color, accent_color, logo_url,
              website, tracking_redirect_url
         FROM tenants WHERE slug = $1`,
      [req.params.slug]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant: rows[0] });
  } catch (err) {
    console.error('[tenants.public]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}
// Two equivalent public read paths so existing callers (/public/:slug)
// and new ones (/by-slug/:slug) both hit the same handler.
router.get('/public/:slug',  publicTenantBySlug);
router.get('/by-slug/:slug', publicTenantBySlug);

module.exports = router;
