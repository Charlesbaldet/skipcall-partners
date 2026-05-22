const router = require('express').Router();
const { query, getClient } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog } = require('../middleware/security');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const resend = require('../services/resend');
const templates = require('../services/email-templates');
const { PLANS } = require('./billing');

// ─── Middleware: require superadmin role ───
function requireSuperAdmin(req, res, next) {
  if (req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Accès réservé au super-administrateur' });
  }
  next();
}

// ─── Period helpers (shared by /stats + /timeline) ───
// Returns { from: Date|null, to: Date, durationMs: number|null }. `from`
// is null when the caller wants "since beginning" (no lower bound).
function parsePeriod(req) {
  const toStr = req.query.to;
  const fromStr = req.query.from;
  const to = toStr ? new Date(toStr) : new Date();
  // 'all' is a sentinel meaning "no lower bound" — used by the
  // "Depuis le début" preset. Skipping the from filter altogether
  // means the SQL keeps everything from the beginning of time.
  const from = (fromStr === 'all' || fromStr === '' || fromStr == null)
    ? (fromStr === 'all' ? null : new Date(to.getTime() - 30 * 24 * 3600 * 1000))
    : new Date(fromStr);
  const durationMs = from ? (to.getTime() - from.getTime()) : null;
  return { from, to, durationMs };
}

// Monthly MRR contribution per plan, sourced from PLANS in billing.js
// so the catalog stays single-source-of-truth. Used in both the live
// snapshot (clients_by_plan + mrr_total) and the period queries.
const PRO_PRICE = PLANS.pro.priceMonthly;            // 29
const BUSINESS_PRICE = PLANS.business.priceMonthly;  // 79

// ─── Dashboard stats (non-sensitive) ───
// Two layers of data:
//   1. Live snapshot — total_*, active_*, clients_by_plan, mrr_total,
//      conversions_total, partners_per_client. Independent of any
//      period; reflects the current state of the database.
//   2. Period block — every metric defined over [from, to] plus the
//      delta vs the previous equivalent window [from − duration, from].
//      Drives the KPI cards on the Statistiques page that follow the
//      date-picker selection. delta_* fields are null when the period
//      is "depuis le début" (no previous window to compare against).
router.get('/stats', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { from, to, durationMs } = parsePeriod(req);
    const prevFrom = (from && durationMs) ? new Date(from.getTime() - durationMs) : null;
    const prevTo = from || null;
    const hasPrev = !!(prevFrom && prevTo);

    // Live snapshot queries — these don't take from/to.
    const [
      tenantsTotal, usersTotal, activeUsersTotal, partnersTotal, activePartnersTotal,
      referralsByStatus, volumeByStatus, leadsByTenant,
      plansBreakdown, conversionsTotalRow,
    ] = await Promise.all([
      query('SELECT COUNT(*) FROM tenants WHERE is_active = true'),
      query("SELECT COUNT(*) FROM users WHERE role != 'system'"),
      query('SELECT COUNT(*) FROM users WHERE is_active = true'),
      query('SELECT COUNT(*) FROM partners'),
      query("SELECT COUNT(*) FROM partners WHERE is_active = true"),
      query('SELECT status, COUNT(*) as count FROM referrals WHERE deleted_at IS NULL GROUP BY status'),
      query('SELECT status, COALESCE(SUM(deal_value), 0) as total FROM referrals WHERE deal_value IS NOT NULL AND deleted_at IS NULL GROUP BY status'),
      query(`
        SELECT t.id, t.name, t.slug,
               (SELECT u.full_name FROM users u WHERE u.tenant_id = t.id AND u.role = 'admin' ORDER BY u.id LIMIT 1) as admin_name,
               (SELECT u.email FROM users u WHERE u.tenant_id = t.id AND u.role = 'admin' ORDER BY u.id LIMIT 1) as admin_email,
               COUNT(DISTINCT r.id) as lead_count,
               COALESCE(SUM(r.deal_value) FILTER (WHERE r.status = 'won'), 0) as volume_won,
               COALESCE(SUM(r.deal_value) FILTER (WHERE r.status IN ('contacted', 'meeting', 'proposal')), 0) as volume_pipeline
        FROM tenants t
        LEFT JOIN partners p ON p.tenant_id = t.id
        LEFT JOIN referrals r ON r.partner_id = p.id AND r.deleted_at IS NULL
        WHERE t.is_active = true
        GROUP BY t.id
        ORDER BY lead_count DESC
      `),
      query(`SELECT plan, COUNT(*)::int AS c FROM tenants WHERE is_active = TRUE GROUP BY plan`),
      // Conversions all-time = tenants that ever started a paying plan.
      // Proxy: plan_started_at IS NOT NULL AND plan != 'starter'. Covers
      // upgrades pro→business as well as first paid signups — acceptable
      // until/unless we add a first_paid_at column.
      query(`SELECT COUNT(*)::int AS c FROM tenants WHERE plan_started_at IS NOT NULL AND plan IS NOT NULL AND plan <> 'starter'`),
    ]);

    // Plan counts → object + MRR total. Prices come from PLANS via the
    // module-level constants so the catalog stays in one place.
    const plansMap = { starter: 0, pro: 0, business: 0 };
    plansBreakdown.rows.forEach(r => { if (r.plan in plansMap) plansMap[r.plan] = parseInt(r.c); });
    const mrrTotal = plansMap.pro * PRO_PRICE + plansMap.business * BUSINESS_PRICE;
    const totalTenants = parseInt(tenantsTotal.rows[0].count);
    const totalPartners = parseInt(partnersTotal.rows[0].count);
    const partnersPerClient = totalTenants > 0 ? totalPartners / totalTenants : 0;

    // Period queries — every metric over [from, to]. Previous window
    // runs the same SQL with the shifted bounds when hasPrev is true.
    //
    // v2 fix (after Postgres 42P18 "could not determine data type of
    // parameter $1" crash on v1):
    //   • Queries 0–5 unchanged structurally; the `where` helper is
    //     kept as-is. Only addition: explicit ::timestamptz casts on
    //     every placeholder — defence in depth, kills any latent
    //     42P18 even on queries that already happened to reference
    //     every arg.
    //   • Queries 6 (MRR end) and 7 (tenants active end) had a real
    //     orphan: when `lo` is non-null, [loStr, hiStr] was passed
    //     but the SQL only referenced $2 → $1 had no type context →
    //     42P18. Both are *snapshots at hi*, so the rewrite uses a
    //     single static SQL keyed on hiStr (no lo branching at all),
    //     no orphan possible.
    async function periodCounts(lo, hi) {
      if (!hi) return null;
      const loStr = lo ? lo.toISOString() : null;
      const hiStr = hi.toISOString();
      const where = (col, useFrom) => useFrom
        ? `${col} >= $1::timestamptz AND ${col} < $2::timestamptz`
        : `${col} < $1::timestamptz`;
      const params = lo ? [loStr, hiStr] : [hiStr];

      const [newT, newP, newU, newL, vol, conv, mrrEndRow, tenantsEndRow] = await Promise.all([
        query(`SELECT COUNT(*)::int AS c FROM tenants WHERE ${where('created_at', !!lo)}`, params),
        query(`SELECT COUNT(*)::int AS c FROM partners WHERE ${where('created_at', !!lo)}`, params),
        query(`SELECT COUNT(*)::int AS c FROM users WHERE ${where('created_at', !!lo)} AND role != 'system'`, params),
        query(`SELECT COUNT(*)::int AS c FROM referrals WHERE deleted_at IS NULL AND ${where('created_at', !!lo)}`, params),
        query(`SELECT COALESCE(SUM(deal_value), 0)::float AS s FROM referrals WHERE status = 'won' AND deleted_at IS NULL AND closed_at IS NOT NULL AND ${where('closed_at', !!lo)}`, params),
        query(`SELECT COUNT(*)::int AS c FROM tenants WHERE plan IN ('pro','business') AND plan_started_at IS NOT NULL AND ${where('plan_started_at', !!lo)}`, params),
        // MRR snapshot at hi. Static SQL, 3 fixed params — no lo
        // dependency, no orphan risk.
        query(
          `SELECT COALESCE(SUM(
             CASE plan
               WHEN 'pro' THEN $2::int
               WHEN 'business' THEN $3::int
               ELSE 0
             END
           ), 0)::int AS s
           FROM tenants
           WHERE is_active = TRUE
             AND plan_started_at IS NOT NULL
             AND plan_started_at <= $1::timestamptz
             AND (plan_ends_at IS NULL OR plan_ends_at > $1::timestamptz)`,
          [hiStr, PRO_PRICE, BUSINESS_PRICE],
        ),
        // Tenants active at hi snapshot. Static SQL, 1 fixed param.
        query(
          `SELECT COUNT(*)::int AS c FROM tenants WHERE is_active = TRUE AND created_at <= $1::timestamptz`,
          [hiStr],
        ),
      ]);
      return {
        new_tenants: newT.rows[0].c,
        new_partners: newP.rows[0].c,
        new_users: newU.rows[0].c,
        new_leads: newL.rows[0].c,
        volume_won: vol.rows[0].s,
        conversions: conv.rows[0].c,
        mrr_end: mrrEndRow.rows[0].s,
        tenants_active_end: tenantsEndRow.rows[0].c,
      };
    }

    const [curr, prev] = await Promise.all([
      periodCounts(from, to),
      hasPrev ? periodCounts(prevFrom, prevTo) : Promise.resolve(null),
    ]);

    // Delta helpers — return null when there's no previous window to
    // compare against, so the FE can hide the hint instead of showing
    // "+Infinity %" or similar.
    const deltaPct = (c, p) => (prev == null || p == null || p === 0) ? null : Math.round(((c - p) / p) * 100);
    const deltaAbs = (c, p) => (prev == null || p == null) ? null : (c - p);

    const referralsMap = {};
    referralsByStatus.rows.forEach(r => { referralsMap[r.status] = parseInt(r.count); });
    const volumeMap = {};
    volumeByStatus.rows.forEach(r => { volumeMap[r.status] = parseFloat(r.total); });

    res.json({
      // ── Existing fields (preserved for back-compat with other UI) ──
      total_tenants: totalTenants,
      total_users: parseInt(usersTotal.rows[0].count),
      active_users: parseInt(activeUsersTotal.rows[0].count),
      total_partners: totalPartners,
      active_partners: parseInt(activePartnersTotal.rows[0].count),
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
      // ── New: live snapshot ──
      clients_by_plan: plansMap,
      mrr_total: mrrTotal,
      conversions_total: parseInt(conversionsTotalRow.rows[0].c),
      partners_per_client: partnersPerClient,
      // ── New: per-period block with deltas vs previous window ──
      period: {
        from: from ? from.toISOString() : null,
        to: to.toISOString(),
        new_tenants: curr.new_tenants,
        new_tenants_delta_pct: deltaPct(curr.new_tenants, prev?.new_tenants),
        new_partners: curr.new_partners,
        new_partners_delta_abs: deltaAbs(curr.new_partners, prev?.new_partners),
        new_users: curr.new_users,
        new_users_delta_abs: deltaAbs(curr.new_users, prev?.new_users),
        new_leads: curr.new_leads,
        new_leads_delta_pct: deltaPct(curr.new_leads, prev?.new_leads),
        volume_won: curr.volume_won,
        volume_won_delta_pct: deltaPct(curr.volume_won, prev?.volume_won),
        conversions: curr.conversions,
        conversions_delta_abs: deltaAbs(curr.conversions, prev?.conversions),
        mrr_end: curr.mrr_end,
        mrr_end_delta_abs: deltaAbs(curr.mrr_end, prev?.mrr_end),
        tenants_active_end: curr.tenants_active_end,
        tenants_active_end_delta_abs: deltaAbs(curr.tenants_active_end, prev?.tenants_active_end),
      },
    });
  } catch (err) { console.error('Stats error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── List tenants with user counts (NO financial data) ───
router.get('/tenants', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT t.id, t.name, t.slug, t.domain, t.logo_url, t.primary_color, t.secondary_color, t.accent_color,
             t.is_active, t.created_at, t.updated_at, t.revenue_model, t.plan,
             COUNT(DISTINCT u.id) as user_count,
             COUNT(DISTINCT u.id) FILTER (WHERE u.is_active = true) as active_user_count,
             COUNT(DISTINCT p.id) as partner_count
      FROM tenants t
      LEFT JOIN users u ON u.tenant_id = t.id AND u.role != 'system'
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
    try {
      const { seedDefaultCategories } = require('../services/partnerCategoriesSeed');
      await seedDefaultCategories(rows[0].id);
    } catch (e) { console.error('[tenants.create.categories]', e.message); }
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
        (SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role != 'system') as users,
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
    // J2-FIX1 — email_verified_at = NOW() pour invite-superadmin
    // (même rationale que admin.js : invitation administrative =
    // preuve d'email via password temp envoyé).
    const { rows: [newUser] } = await query(
      'INSERT INTO users (email, password_hash, full_name, role, tenant_id, is_active, email_verified_at) VALUES ($1, $2, $3, $4, $5, true, NOW()) RETURNING id, email, full_name, role',
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
    const { from: fromIn, to } = parsePeriod(req);
    // "Depuis le début" sentinel: when from is null we widen the
    // axis to 12 months by default — same behaviour as the legacy
    // endpoint so existing dashboards don't break.
    const from = fromIn || new Date(to.getTime() - 365 * 24 * 3600 * 1000);
    const durationDays = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / (24 * 3600 * 1000)));

    // Auto-granularity: day for short windows, week for quarterly,
    // month otherwise. Keeps the X axis from looking crowded or
    // sparse across very different period lengths.
    const granularity = durationDays <= 31 ? 'day' : (durationDays <= 95 ? 'week' : 'month');
    const truncUnit = granularity;  // PG accepts 'day' | 'week' | 'month'
    const stepInterval = granularity === 'day' ? '1 day' : (granularity === 'week' ? '1 week' : '1 month');

    // Time axis via generate_series. date_trunc + the step interval
    // keeps the buckets aligned (e.g. weekly series starts on Monday).
    const axisRows = await query(`
      SELECT generate_series(
        date_trunc($1, $2::timestamptz),
        date_trunc($1, $3::timestamptz),
        $4::interval
      ) AS point
    `, [truncUnit, from.toISOString(), to.toISOString(), stepInterval]);

    // Cumulative-count queries grouped by the truncated bucket. The
    // "before" pre-window totals seed the cumulative counter so the
    // first point in the visible series carries the all-time value.
    const [tenantsRows, partnersRows, leadsRows, volumeRows, tBefore, pBefore, lBefore, vBefore] = await Promise.all([
      query(`SELECT date_trunc($1, created_at) AS bucket, COUNT(*)::int AS c FROM tenants WHERE created_at >= $2 AND created_at <= $3 GROUP BY bucket`,
        [truncUnit, from.toISOString(), to.toISOString()]),
      query(`SELECT date_trunc($1, created_at) AS bucket, COUNT(*)::int AS c FROM partners WHERE created_at >= $2 AND created_at <= $3 GROUP BY bucket`,
        [truncUnit, from.toISOString(), to.toISOString()]),
      query(`SELECT date_trunc($1, created_at) AS bucket, COUNT(*)::int AS c FROM referrals WHERE deleted_at IS NULL AND created_at >= $2 AND created_at <= $3 GROUP BY bucket`,
        [truncUnit, from.toISOString(), to.toISOString()]),
      query(`SELECT date_trunc($1, closed_at) AS bucket, COALESCE(SUM(deal_value), 0)::float AS s FROM referrals WHERE status = 'won' AND deleted_at IS NULL AND closed_at IS NOT NULL AND closed_at >= $2 AND closed_at <= $3 GROUP BY bucket`,
        [truncUnit, from.toISOString(), to.toISOString()]),
      query(`SELECT COUNT(*)::int AS c FROM tenants WHERE created_at < $1`, [from.toISOString()]),
      query(`SELECT COUNT(*)::int AS c FROM partners WHERE created_at < $1`, [from.toISOString()]),
      query(`SELECT COUNT(*)::int AS c FROM referrals WHERE created_at < $1 AND deleted_at IS NULL`, [from.toISOString()]),
      query(`SELECT COALESCE(SUM(deal_value), 0)::float AS s FROM referrals WHERE status = 'won' AND deleted_at IS NULL AND closed_at IS NOT NULL AND closed_at < $1`, [from.toISOString()]),
    ]);

    const bucketKey = (d) => new Date(d).toISOString();
    const tMap = Object.fromEntries(tenantsRows.rows.map(r => [bucketKey(r.bucket), r.c]));
    const pMap = Object.fromEntries(partnersRows.rows.map(r => [bucketKey(r.bucket), r.c]));
    const lMap = Object.fromEntries(leadsRows.rows.map(r => [bucketKey(r.bucket), r.c]));
    const vMap = Object.fromEntries(volumeRows.rows.map(r => [bucketKey(r.bucket), r.s]));

    let cumulT = tBefore.rows[0].c;
    let cumulP = pBefore.rows[0].c;
    let cumulL = lBefore.rows[0].c;
    let cumulV = vBefore.rows[0].s;

    // MRR per bucket: tenants whose paid plan started on or before
    // the bucket boundary AND whose plan hadn't ended yet. Computed
    // per-point (N small queries, capped by durationDays/granularity
    // so worst case ~31). The CASE uses the same PRO_PRICE /
    // BUSINESS_PRICE constants as /stats so the catalog stays in
    // one place.
    const points = axisRows.rows.map(r => new Date(r.point));
    const mrrAtPoint = async (p) => {
      const { rows } = await query(`
        SELECT COALESCE(SUM(
          CASE plan
            WHEN 'pro' THEN $2::int
            WHEN 'business' THEN $3::int
            ELSE 0
          END
        ), 0)::int AS s
        FROM tenants
        WHERE is_active = TRUE
          AND plan_started_at IS NOT NULL
          AND plan_started_at <= $1
          AND (plan_ends_at IS NULL OR plan_ends_at > $1)
      `, [p.toISOString(), PRO_PRICE, BUSINESS_PRICE]);
      return rows[0].s;
    };
    const mrrValues = await Promise.all(points.map(mrrAtPoint));

    // Localised bucket label. The FE doesn't translate this — it
    // displays the precomputed `label` directly on the X axis.
    const fmtLabel = (d) => {
      if (granularity === 'month') return d.toLocaleDateString('fr-FR', { month: 'short', year: '2-digit' });
      if (granularity === 'week') return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
    };

    const series = points.map((p, i) => {
      const k = p.toISOString();
      cumulT += (tMap[k] || 0);
      cumulP += (pMap[k] || 0);
      cumulL += (lMap[k] || 0);
      cumulV += (vMap[k] || 0);
      return {
        point: k,
        label: fmtLabel(p),
        tenants_cumul: cumulT,
        partners_cumul: cumulP,
        leads_cumul: cumulL,
        volume_won: cumulV,
        mrr: mrrValues[i],
      };
    });

    res.json({ series, granularity, from: from.toISOString(), to: to.toISOString() });
  } catch (err) {
    console.error('Timeline error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/super-admin/search?q=…
//
// Cross-tenant search for super-admins only. Same ILIKE shape as the
// per-tenant /api/search router, but no tenant filter — super-admins
// need to spot which client a row belongs to, so we join the tenant
// name onto every result that has a tenant_id. Capped at 10 hits per
// category to keep the dropdown responsive on large datasets.
//
// Searchable surfaces: tenants, users, partners, referrals (cross-
// tenant), blog_posts (no tenant), audit_logs (event-level audit
// trail). audit_logs is included for completeness but skipped on the
// FE highlight side — clicking just navigates to the Logs tab.
router.get('/search', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    const empty = { tenants: [], users: [], partners: [], referrals: [], blog_posts: [], audit_logs: [] };
    if (q.length < 2) return res.json({ results: empty, total: 0 });
    const like = '%' + q.replace(/[%_]/g, ch => '\\' + ch) + '%';
    const CAP = 10;

    const tenantsSql = `
      SELECT id, name, slug, plan
        FROM tenants
       WHERE name ILIKE $1 OR slug ILIKE $1 OR COALESCE(domain, '') ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`;

    const usersSql = `
      SELECT u.id, u.email, u.full_name, u.role, u.tenant_id,
             t.name AS tenant_name
        FROM users u
   LEFT JOIN tenants t ON t.id = u.tenant_id
       WHERE u.role != 'system'
         AND (u.email ILIKE $1 OR COALESCE(u.full_name, '') ILIKE $1)
       ORDER BY u.created_at DESC NULLS LAST
       LIMIT $2`;

    const partnersSql = `
      SELECT p.id, p.name, p.contact_name, p.email, p.tenant_id, p.is_active,
             t.name AS tenant_name
        FROM partners p
   LEFT JOIN tenants t ON t.id = p.tenant_id
       WHERE p.deleted_at IS NULL
         AND (p.name ILIKE $1 OR COALESCE(p.contact_name, '') ILIKE $1 OR COALESCE(p.email, '') ILIKE $1)
       ORDER BY p.created_at DESC
       LIMIT $2`;

    const referralsSql = `
      SELECT r.id, r.prospect_name, r.prospect_company, r.prospect_email,
             r.status, r.tenant_id,
             t.name AS tenant_name
        FROM referrals r
   LEFT JOIN tenants t ON t.id = r.tenant_id
       WHERE r.deleted_at IS NULL
         AND (r.prospect_name ILIKE $1
              OR COALESCE(r.prospect_company, '') ILIKE $1
              OR COALESCE(r.prospect_email, '')   ILIKE $1
              OR COALESCE(r.notes, '')            ILIKE $1)
       ORDER BY r.created_at DESC
       LIMIT $2`;

    const blogSql = `
      SELECT id, title, slug, category, published
        FROM blog_posts
       WHERE title ILIKE $1
          OR COALESCE(excerpt, '') ILIKE $1
          OR COALESCE(category, '') ILIKE $1
       ORDER BY created_at DESC
       LIMIT $2`;

    const auditSql = `
      SELECT a.id, a.action, a.user_email, a.resource_type, a.entity_type,
             a.created_at, a.tenant_id,
             t.name AS tenant_name
        FROM audit_logs a
   LEFT JOIN tenants t ON t.id = a.tenant_id
       WHERE a.action ILIKE $1
          OR COALESCE(a.user_email, '') ILIKE $1
          OR COALESCE(a.resource_type, '') ILIKE $1
          OR COALESCE(a.entity_type, '') ILIKE $1
       ORDER BY a.created_at DESC
       LIMIT $2`;

    const swallow = (label) => (e) => {
      console.error('[super-admin.search.' + label + ']', e.message);
      return { rows: [] };
    };

    const [tn, us, pa, rf, bl, au] = await Promise.all([
      query(tenantsSql,   [like, CAP]).catch(swallow('tenants')),
      query(usersSql,     [like, CAP]).catch(swallow('users')),
      query(partnersSql,  [like, CAP]).catch(swallow('partners')),
      query(referralsSql, [like, CAP]).catch(swallow('referrals')),
      query(blogSql,      [like, CAP]).catch(swallow('blog_posts')),
      query(auditSql,     [like, CAP]).catch(swallow('audit_logs')),
    ]);

    const results = {
      tenants: tn.rows.map(r => ({
        id: r.id,
        title: r.name,
        subtitle: r.slug + (r.plan ? ' · ' + r.plan : ''),
      })),
      users: us.rows.map(r => ({
        id: r.id,
        title: r.full_name || r.email,
        subtitle: [r.email, r.role, r.tenant_name].filter(Boolean).join(' · '),
        tenant_id: r.tenant_id,
      })),
      partners: pa.rows.map(r => ({
        id: r.id,
        title: r.name,
        subtitle: [r.contact_name, r.email, r.tenant_name].filter(Boolean).join(' · '),
        tenant_id: r.tenant_id,
        status: r.is_active ? 'active' : 'inactive',
      })),
      referrals: rf.rows.map(r => ({
        id: r.id,
        title: r.prospect_name || r.prospect_company || r.prospect_email,
        subtitle: [r.prospect_company, r.tenant_name].filter(Boolean).join(' · '),
        tenant_id: r.tenant_id,
        status: r.status || '',
      })),
      blog_posts: bl.rows.map(r => ({
        id: r.id,
        title: r.title,
        subtitle: '/blog/' + r.slug + (r.category ? ' · ' + r.category : ''),
        status: r.published ? 'published' : 'draft',
      })),
      audit_logs: au.rows.map(r => ({
        id: r.id,
        title: r.action,
        subtitle: [r.user_email, r.entity_type || r.resource_type, r.tenant_name].filter(Boolean).join(' · '),
        tenant_id: r.tenant_id,
      })),
    };

    const total = Object.values(results).reduce((acc, arr) => acc + arr.length, 0);
    res.json({ results, total });
  } catch (err) {
    console.error('[super-admin.search] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
