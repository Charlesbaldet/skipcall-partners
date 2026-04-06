const router = require('express').Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/security');
const { getTenantConfig, clearTenantCache } = require('../middleware/tenant');

// ─── Public: Get tenant config (for frontend theming) ───
router.get('/config', (req, res) => {
  if (!req.tenant) return res.status(404).json({ error: 'Tenant not found' });
  res.json({ tenant: getTenantConfig(req.tenant) });
});

// ─── Admin: List all tenants ───
router.get('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
  try {
    const { rows } = await query('SELECT * FROM tenants ORDER BY created_at ASC');
    res.json({ tenants: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Admin: Create tenant ───
router.post('/', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
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

// ─── Admin: Update tenant ───
router.put('/:id', authenticate, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Accès interdit' });
  const { name, domain, primary_color, secondary_color, accent_color, logo_url, settings } = req.body;

  try {
    const { rows } = await query(
      `UPDATE tenants SET name = COALESCE($1, name), domain = COALESCE($2, domain),
       primary_color = COALESCE($3, primary_color), secondary_color = COALESCE($4, secondary_color),
       accent_color = COALESCE($5, accent_color), logo_url = COALESCE($6, logo_url),
       settings = COALESCE($7, settings), updated_at = NOW() WHERE id = $8 RETURNING *`,
      [name, domain, primary_color, secondary_color, accent_color, logo_url, settings ? JSON.stringify(settings) : null, req.params.id]
    );
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
      [req.tenantId, limit, offset]
    );
    const { rows: countRows } = await query(
      'SELECT COUNT(*) FROM audit_logs WHERE tenant_id = $1', [req.tenantId]
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
      'SELECT id, name, slug, primary_color, secondary_color, accent_color, logo_url FROM tenants WHERE id = $1',
      [req.user.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Tenant not found' });
    res.json({ tenant: rows[0] });
  } catch (err) {
    console.error('Get my tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
