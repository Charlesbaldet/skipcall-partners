const router = require('express').Router();
const { query, getClient } = require('../db');
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
    const [tenants, users, activeUsers, partners, activePartners, referralsByStatus, volumeByStatus, leadsByTenant] = await Promise.all([
      query('SELECT COUNT(*) FROM tenants WHERE is_active = true'),
      query('SELECT COUNT(*) FROM users'),
      query('SELECT COUNT(*) FROM users WHERE is_active = true'),
      query('SELECT COUNT(*) FROM partners'),
      query("SELECT COUNT(*) FROM partners WHERE is_active = true"),
      query('SELECT status, COUNT(*) as count FROM referrals GROUP BY status'),
      query('SELECT status, COALESCE(SUM(deal_value), 0) as total FROM referrals WHERE deal_value IS NOT NULL GROUP BY status'),
      query(`
        SELECT t.id, t.name, t.slug,
               COUNT(DISTINCT r.id) as lead_count,
               COALESCE(SUM(r.deal_value) FILTER (WHERE r.status = 'won'), 0) as volume_won,
               COALESCE(SUM(r.deal_value) FILTER (WHERE r.status IN ('contacted', 'meeting', 'proposal')), 0) as volume_pipeline
        FROM tenants t
        LEFT JOIN partners p ON p.tenant_id = t.id
        LEFT JOIN referrals r ON r.partner_id = p.id
        WHERE t.is_active = true
        GROUP BY t.id
        ORDER BY lead_count DESC
      `),
    ]);
    // Format referrals by status as object
    const referralsMap = {};
    referralsByStatus.rows.forEach(r => { referralsMap[r.status] = parseInt(r.count); });
    const volumeMap = {};
    volumeByStatus.rows.forEach(r => { volumeMap[r.status] = parseFloat(r.total); });
    res.json({
      total_tenants: parseInt(tenants.rows[0].count),
      total_users: parseInt(users.rows[0].count),
      active_users: parseInt(activeUsers.rows[0].count),
      total_partners: parseInt(partners.rows[0].count),
      active_partners: parseInt(activePartners.rows[0].count),
      total_leads: Object.values(referralsMap).reduce((a, b) => a + b, 0),
      leads_by_status: referralsMap,
      volume_by_status: volumeMap,
      tenants_breakdown: leadsByTenant.rows.map(t => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        lead_count: parseInt(t.lead_count),
        volume_won: parseFloat(t.volume_won),
        volume_pipeline: parseFloat(t.volume_pipeline),
      })),
    });
  } catch (err) { console.error('Stats error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
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

// ─── Delete tenant (soft delete - deactivate) ───
router.delete('/tenants/:id', authenticate, requireSuperAdmin, async (req, res) => {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    // Check tenant exists and get info for audit
    const { rows: [tenant] } = await client.query('SELECT id, name, slug FROM tenants WHERE id = $1', [req.params.id]);
    if (!tenant) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Tenant introuvable' });
    }
    // Protect the default founder tenant
    if (tenant.slug === 'skipcall') {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Impossible de supprimer le tenant fondateur' });
    }
    // Count what will be deleted (for the response)
    const { rows: [counts] } = await client.query(`
      SELECT
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1) as users,
        (SELECT COUNT(*) FROM partners WHERE tenant_id = $1) as partners,
        (SELECT COUNT(*) FROM referrals r JOIN partners p ON r.partner_id = p.id WHERE p.tenant_id = $1) as referrals
    `, [req.params.id]);
    // Explicit cascade delete in dependency order (safer than relying on FK cascades)
    await client.query('DELETE FROM commissions WHERE referral_id IN (SELECT r.id FROM referrals r JOIN partners p ON r.partner_id = p.id WHERE p.tenant_id = $1)', [req.params.id]);
    await client.query('DELETE FROM referral_activities WHERE referral_id IN (SELECT r.id FROM referrals r JOIN partners p ON r.partner_id = p.id WHERE p.tenant_id = $1)', [req.params.id]);
    await client.query('DELETE FROM referrals WHERE partner_id IN (SELECT id FROM partners WHERE tenant_id = $1)', [req.params.id]);
    await client.query('DELETE FROM partners WHERE tenant_id = $1', [req.params.id]);
    // Clean messaging for users of this tenant
    await client.query('DELETE FROM messages WHERE sender_id IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
    await client.query('DELETE FROM conversation_participants WHERE user_id IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
    // Delete users
    await client.query('DELETE FROM users WHERE tenant_id = $1', [req.params.id]);
    // Delete tenant-level config (levels, api keys, etc.)
    await client.query('DELETE FROM tenant_levels WHERE tenant_id = $1', [req.params.id]);
    // Finally delete the tenant itself
    await client.query('DELETE FROM tenants WHERE id = $1', [req.params.id]);
    await client.query('COMMIT');
    res.json({
      message: 'Tenant supprimé définitivement',
      deleted: {
        tenant_name: tenant.name,
        users: parseInt(counts.users),
        partners: parseInt(counts.partners),
        referrals: parseInt(counts.referrals),
      },
    });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch(e) {}
    console.error('Hard delete tenant error:', err);
    res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  } finally {
    client.release();
  }
});

module.exports = router;
