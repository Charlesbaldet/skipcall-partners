const router = require('express').Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/security');

// ─── Middleware: require superadmin role ───
function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Accès réservé au super-administrateur' });
  }
  next();
}

// ─── Dashboard stats (non-sensitive) ───
router.get('/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const [tenants, users, activeUsers] = await Promise.all([
      query('SELECT COUNT(*) FROM tenants WHERE is_active = true'),
      query('SELECT COUNT(*) FROM users'),
      query("SELECT COUNT(*) FROM users WHERE is_active = true"),
    ]);
    res.json({
      total_tenants: parseInt(tenants.rows[0].count),
      total_users: parseInt(users.rows[0].count),
      active_users: parseInt(activeUsers.rows[0].count),
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── List tenants with user counts (NO financial data) ───
router.get('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT t.id, t.name, t.slug, t.domain, t.logo_url, t.primary_color, t.secondary_color, t.accent_color,
             t.is_active, t.created_at, t.updated_at,
             COUNT(DISTINCT u.id) as user_count,
             COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true) as active_user_count,
             COUNT(DISTINCT p.id) as partner_count
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id
      LEFT JOIN partners p ON p.tenant_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at ASC
    `);
    res.json({ tenants: rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Create tenant ───
router.post('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, slug, domain, primary_color, secondary_color, accent_color, logo_url } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et slug requis' });
  try {
    const { rows } = await query(
      `INSERT INTO tenants (name, slug, domain, primary_color, secondary_color, accent_color, logo_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name, slug.toLowerCase().replace(/[^a-z0-9-]/g, ''), domain || null, primary_color || '#6366f1', secondary_color || '#8b5cf6', accent_color || '#f59e0b', logo_url || null]
    );
    auditLog(req, 'tenant_created', 'tenant', rows[0].id, { name, slug });
    res.json({ tenant: rows[0] });
  } catch (err) {
    if (err.message.includes('duplicate')) return res.status(400).json({ error: 'Ce slug existe déjà' });
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Update tenant ───
router.put('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const { name, domain, primary_color, secondary_color, accent_color, logo_url, is_active } = req.body;
  try {
    const { rows } = await query(
      `UPDATE tenants SET name = COALESCE($1, name), domain = COALESCE($2, domain),
       primary_color = COALESCE($3, primary_color), secondary_color = COALESCE($4, secondary_color),
       accent_color = COALESCE($5, accent_color), logo_url = COALESCE($6, logo_url),
       is_active = COALESCE($7, is_active), updated_at = NOW() WHERE id = $8 RETURNING *`,
      [name, domain, primary_color, secondary_color, accent_color, logo_url, is_active, req.params.id]
    );
    auditLog(req, 'tenant_updated', 'tenant', req.params.id, { name });
    res.json({ tenant: rows[0] });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Audit logs (platform-wide) ───
router.get('/audit-logs', authenticate, requireSuperAdmin, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;
  try {
    const { rows } = await query(
      `SELECT al.*, u.full_name as user_name, t.name as tenant_name
       FROM audit_logs al
       LEFT JOIN users u ON al.user_id = u.id
       LEFT JOIN tenants t ON al.tenant_id = t.id
       ORDER BY al.created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    const { rows: c } = await query('SELECT COUNT(*) FROM audit_logs');
    res.json({ logs: rows, total: parseInt(c[0].count) });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

module.exports = router;
