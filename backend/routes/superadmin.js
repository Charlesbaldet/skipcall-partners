const router = require('express').Router();
const { query, getClient } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/security');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const resend = require('../services/resend');
const templates = require('../services/email-templates');

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
             t.is_active, t.created_at, t.updated_at, t.revenue_model,
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
      `INSERT INTO tenants (name, slug, domain, primary_color, secondary_color, accent_color, logo_url, revenue_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, slug.toLowerCase().replace(/[^a-z0-9-]/g, ''), domain || null, primary_color || '#6366f1', secondary_color || '#8b5cf6', accent_color || '#f59e0b', logo_url || null, req.body.revenue_model || 'CA']
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
       is_active = COALESCE($7, is_active), revenue_model = COALESCE($8, revenue_model), updated_at = NOW() WHERE id = $9 RETURNING *`,
      [name, domain, primary_color, secondary_color, accent_color, logo_url, is_active, req.body.revenue_model || null, req.params.id]
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
    // Delete messaging: catches both conversations linked to this tenant AND those created by users of this tenant
    await client.query('DELETE FROM messages WHERE conversation_id IN (SELECT id FROM conversations WHERE tenant_id = $1 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1))', [req.params.id]);
    await client.query('DELETE FROM conversation_participants WHERE conversation_id IN (SELECT id FROM conversations WHERE tenant_id = $1 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1))', [req.params.id]);
    await client.query('DELETE FROM conversations WHERE tenant_id = $1 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
    // Delete sessions for this tenant (ephemeral, FK on users + tenant)
    await client.query('DELETE FROM sessions WHERE tenant_id = $1 OR user_id IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
    // Audit logs: preserve for compliance, set tenant_id to NULL instead of DELETE
    await client.query('UPDATE audit_logs SET tenant_id = NULL WHERE tenant_id = $1', [req.params.id]);
    // Delete API keys belonging to this tenant or created by its users
    await client.query('DELETE FROM api_keys WHERE tenant_id = $1 OR created_by IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
    // Partner applications belonging to this tenant: full DELETE
    await client.query('DELETE FROM partner_applications WHERE tenant_id = $1', [req.params.id]);
        // Partner applications: nullify reviewer (column is nullable), preserves audit trail
    await client.query('UPDATE partner_applications SET reviewed_by = NULL WHERE reviewed_by IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
    // User invitations: invited_by is NOT NULL, must DELETE invitations issued by these users
    await client.query('DELETE FROM user_invitations WHERE invited_by IN (SELECT id FROM users WHERE tenant_id = $1)', [req.params.id]);
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

// ─── List all super admins ───
router.get('/superadmins', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT id, email, full_name, is_active, created_at
      FROM users
      WHERE role = 'superadmin'
      ORDER BY created_at ASC
    `);
    res.json({ superadmins: rows });
  } catch (err) {
    console.error('List superadmins error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Invite a new super admin ───
router.post('/invite-superadmin', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { email, full_name } = req.body;
    if (!email || !full_name) {
      return res.status(400).json({ error: 'Email et nom complet requis' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Email invalide' });
    }
    // Check if user already exists
    const { rows: existing } = await query('SELECT id, role FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà' });
    }
    // Generate temporary password
    const tempPassword = crypto.randomBytes(9).toString('base64').replace(/[+/=]/g, '').slice(0, 12);
    const hash = await bcrypt.hash(tempPassword, 10);
    // Find the founder tenant (skipcall) to attach the superadmin to
    const { rows: [founder] } = await query("SELECT id, name FROM tenants WHERE slug = 'skipcall' LIMIT 1");
    const tenantId = founder ? founder.id : null;
    // Insert user with superadmin role
    const { rows: [newUser] } = await query(
      'INSERT INTO users (email, password_hash, full_name, role, tenant_id, is_active) VALUES ($1, $2, $3, $4, $5, true) RETURNING id, email, full_name, role',
      [email.toLowerCase(), hash, full_name, 'superadmin', tenantId]
    );
    // Fire-and-forget welcome email with credentials
    try {
      const loginUrl = (process.env.FRONTEND_URL || 'https://refboost.io') + '/login';
      const senderName = req.user && req.user.full_name ? req.user.full_name : 'L\'équipe RefBoost';
      const bodyHtml = `
        <p style="margin:0 0 16px;">Bonjour ${full_name},</p>
        <p style="margin:0 0 16px;"><strong>${senderName}</strong> vient de vous nommer <strong>super administrateur</strong> sur RefBoost.</p>
        <p style="margin:0 0 16px;">À ce titre, vous avez accès à la gestion globale de la plateforme : tenants, utilisateurs, métriques. <strong>Utilisez ce pouvoir avec précaution.</strong></p>
        <p style="margin:0 0 16px;">Voici vos identifiants de connexion :</p>
        <div style="margin:20px 0;padding:18px;background:#f0fdf4;border-radius:10px;border:1px solid #bbf7d0;">
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Email</div>
          <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:15px;color:#1f2937;margin-bottom:12px;">${email}</div>
          <div style="font-size:13px;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;margin-bottom:4px;">Mot de passe temporaire</div>
          <div style="font-family:ui-monospace,SFMono-Regular,monospace;font-size:17px;font-weight:600;color:#059669;">${tempPassword}</div>
        </div>
        <p style="margin:0 0 16px;color:#6b7280;font-size:13px;">Modifiez ce mot de passe dès votre première connexion depuis vos paramètres.</p>
      `;
      const html = templates.baseLayout({
        title: `Vous êtes super administrateur RefBoost`,
        preheader: `${senderName} vous a nommé super administrateur`,
        tenantName: 'RefBoost',
        bodyHtml,
        ctaLabel: 'Se connecter au super admin',
        ctaUrl: loginUrl,
      });
      await resend.sendAndLog({
        to: email,
        subject: 'Vous êtes super administrateur RefBoost',
        html,
        text: `Bonjour ${full_name},\n\n${senderName} vous a nommé super administrateur RefBoost.\n\nEmail: ${email}\nMot de passe temporaire: ${tempPassword}\n\nConnexion: ${loginUrl}`,
        template: 'superadmin_invite',
        payload: { recipient_name: full_name },
        query,
      });
    } catch (e) { console.error('[superadmin.invite] email error:', e.message); }
    res.status(201).json({ message: 'Super administrateur créé', user: newUser, tempPassword });
  } catch (err) {
    console.error('Invite superadmin error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Delete superadmin ───
router.delete('/delete-superadmin/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user.id) {
      return res.status(400).json({ error: 'Vous ne pouvez pas vous supprimer vous-même' });
    }
    const { rows: [target] } = await query('SELECT id, role, email FROM users WHERE id = $1', [id]);
    if (!target) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }
    if (target.role !== 'superadmin') {
      return res.status(400).json({ error: "Cet utilisateur n'est pas un super administrateur" });
    }
    // Clean up FK dependencies before deleting
    await query('DELETE FROM conversation_participants WHERE user_id = $1', [id]);
    await query('DELETE FROM sessions WHERE user_id = $1', [id]);
    await query('UPDATE audit_logs SET user_id = NULL WHERE user_id = $1', [id]);
    await query('DELETE FROM notification_queue WHERE recipient_email = $1', [target.email]);
    await query('DELETE FROM users WHERE id = $1 AND role = $2', [id, 'superadmin']);
    res.json({ success: true, message: 'Super administrateur supprimé' });
  } catch (err) {
    console.error('[superadmin] Delete error:', err.message);
    res.status(500).json({ error: 'Erreur serveur: ' + err.message });
  }
});

// ─── Timeline KPIs (last 12 months evolution) ───
router.get('/timeline', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    // Generate the last 12 months as YYYY-MM strings
    const months = [];
    const now = new Date();
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        label: d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' }),
      });
    }
    // Cumulative count queries: for each month, how many entities existed at the end of that month
    const [tenantsRows, partnersRows, leadsRows, volumeRows] = await Promise.all([
      query(`
        SELECT to_char(created_at, 'YYYY-MM') as month, COUNT(*) as count
        FROM tenants
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
      query(`
        SELECT to_char(created_at, 'YYYY-MM') as month, COUNT(*) as count
        FROM partners
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
      query(`
        SELECT to_char(created_at, 'YYYY-MM') as month, COUNT(*) as count
        FROM referrals
        WHERE created_at >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
      query(`
        SELECT to_char(closed_at, 'YYYY-MM') as month, COALESCE(SUM(deal_value), 0) as total
        FROM referrals
        WHERE status = 'won' AND closed_at IS NOT NULL AND closed_at >= NOW() - INTERVAL '12 months'
        GROUP BY month ORDER BY month
      `),
    ]);
    // Map results into the months array
    const tenantsMap = Object.fromEntries(tenantsRows.rows.map(r => [r.month, parseInt(r.count)]));
    const partnersMap = Object.fromEntries(partnersRows.rows.map(r => [r.month, parseInt(r.count)]));
    const leadsMap = Object.fromEntries(leadsRows.rows.map(r => [r.month, parseInt(r.count)]));
    const volumeMap = Object.fromEntries(volumeRows.rows.map(r => [r.month, parseFloat(r.total)]));
    // Get cumulative totals before the 12-month window for accurate cumulative lines
    const [tBefore, pBefore, lBefore, vBefore] = await Promise.all([
      query(`SELECT COUNT(*) as count FROM tenants WHERE created_at < NOW() - INTERVAL '12 months'`),
      query(`SELECT COUNT(*) as count FROM partners WHERE created_at < NOW() - INTERVAL '12 months'`),
      query(`SELECT COUNT(*) as count FROM referrals WHERE created_at < NOW() - INTERVAL '12 months'`),
      query(`SELECT COALESCE(SUM(deal_value), 0) as total FROM referrals WHERE status = 'won' AND closed_at IS NOT NULL AND closed_at < NOW() - INTERVAL '12 months'`),
    ]);
    let cumulTenants = parseInt(tBefore.rows[0].count);
    let cumulPartners = parseInt(pBefore.rows[0].count);
    let cumulLeads = parseInt(lBefore.rows[0].count);
    let cumulVolume = parseFloat(vBefore.rows[0].total);
    const series = months.map(m => {
      cumulTenants += (tenantsMap[m.key] || 0);
      cumulPartners += (partnersMap[m.key] || 0);
      cumulLeads += (leadsMap[m.key] || 0);
      cumulVolume += (volumeMap[m.key] || 0);
      return {
        month: m.key,
        label: m.label,
        tenants_cumul: cumulTenants,
        partners_cumul: cumulPartners,
        leads_cumul: cumulLeads,
        volume_won: cumulVolume,
      };
    });
    res.json({ series });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
