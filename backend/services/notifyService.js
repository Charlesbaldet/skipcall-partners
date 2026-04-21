// Central helper for creating in-app notifications + sending emails
// based on the tenant's notification_preferences.
//
// Public API:
//   shouldNotify(tenantId, eventType)       → { in_app, email }
//   createNotification(userId, eventType, { title, message, link, newsPostId, tenantId })
//   fanoutPartnerNotification(tenantId, eventType, { title, message, link, newsPostId, extraSelect })
//     — inserts one notification row per active partner user in the tenant
//   fanoutAdminNotification(tenantId, eventType, { title, message, link })
//     — inserts one notification row per admin user in the tenant
//
// All DB work is best-effort: any error is logged but never rethrown,
// because these are side-effects of user-facing actions and should not
// roll back the primary flow.

const { query } = require('../db');

const KNOWN_EVENTS = new Set([
  'new_referral',
  'new_application',
  'referral_update',
  'commission',
  'news',
  'deal_won',
  'access_revoked',
]);

// Cache a tenant's preferences in memory for a few seconds to avoid
// hammering the DB on every fan-out.
const PREFS_TTL_MS = 15 * 1000;
const prefsCache = new Map(); // tenantId → { at, prefs }

async function loadTenantPrefs(tenantId) {
  if (!tenantId) return {};
  const cached = prefsCache.get(tenantId);
  if (cached && Date.now() - cached.at < PREFS_TTL_MS) return cached.prefs;
  try {
    const { rows } = await query(
      'SELECT event_type, in_app, email FROM notification_preferences WHERE tenant_id = $1',
      [tenantId]
    );
    const prefs = {};
    for (const r of rows) prefs[r.event_type] = { in_app: r.in_app, email: r.email };
    prefsCache.set(tenantId, { at: Date.now(), prefs });
    return prefs;
  } catch (err) {
    // If the prefs table doesn't exist yet (migration not run) we
    // fall back to "everything on" so functionality degrades gracefully
    // rather than silently dropping notifications.
    if (err.code === '42P01') return {};
    console.error('[notify loadTenantPrefs]', err.message);
    return {};
  }
}

function invalidatePrefsCache(tenantId) {
  if (tenantId) prefsCache.delete(tenantId);
}

async function shouldNotify(tenantId, eventType) {
  if (!KNOWN_EVENTS.has(eventType)) return { in_app: true, email: true };
  const prefs = await loadTenantPrefs(tenantId);
  const p = prefs[eventType];
  if (!p) return { in_app: true, email: true }; // Default all on.
  return { in_app: !!p.in_app, email: !!p.email };
}

// Partner-scoped preference check. Partners own one JSONB row
// (partners.notification_preferences) with six email toggles:
//   email_referral_status, email_referral_won, email_commission_update,
//   email_new_message, email_news, email_tier_change
// In-app delivery is always allowed (the spec locks toggles to email
// only). Returns { in_app: true, email: bool }.
async function shouldNotifyPartner(partnerId, prefKey) {
  if (!partnerId) return { in_app: true, email: true };
  try {
    const { rows } = await query(
      'SELECT notification_preferences FROM partners WHERE id = $1 LIMIT 1',
      [partnerId]
    );
    const prefs = rows[0]?.notification_preferences || {};
    // Default-ON for every key except email_news which defaults OFF
    // (matches the column's JSONB default so pre-migration rows also
    // behave predictably).
    const defaultOn = prefKey !== 'email_news';
    const value = prefs[prefKey];
    const email = typeof value === 'boolean' ? value : defaultOn;
    return { in_app: true, email };
  } catch (err) {
    console.error('[notify.shouldNotifyPartner]', err.message);
    return { in_app: true, email: true };
  }
}

// Insert one row if the event is allowed in-app for the tenant.
async function createNotification(userId, eventType, meta = {}, opts = {}) {
  if (!userId) return;
  const tenantId = meta.tenantId || opts.tenantId || null;
  if (!opts.skipPreferenceCheck) {
    const { in_app } = await shouldNotify(tenantId, eventType);
    if (!in_app) return;
  }
  try {
    await query(
      `INSERT INTO notifications (user_id, type, title, message, link, news_post_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        userId, eventType,
        meta.title || '',
        meta.message || null,
        meta.link || null,
        meta.newsPostId || null,
      ]
    );
  } catch (err) {
    console.error('[notify createNotification]', eventType, err.message);
  }
}

// Fan out to every active partner user in a tenant.
async function fanoutPartnerNotification(tenantId, eventType, meta = {}) {
  if (!tenantId) return 0;
  const { in_app } = await shouldNotify(tenantId, eventType);
  if (!in_app) return 0;
  try {
    const { rows } = await query(
      `SELECT DISTINCT u.id AS user_id
         FROM users u
         JOIN partners p ON p.id = u.partner_id
        WHERE u.role = 'partner'
          AND p.tenant_id = $1
          AND p.is_active = TRUE`,
      [tenantId]
    );
    for (const r of rows) {
      await createNotification(r.user_id, eventType, { ...meta, tenantId }, { skipPreferenceCheck: true });
    }
    return rows.length;
  } catch (err) {
    console.error('[notify fanoutPartner]', err.message);
    return 0;
  }
}

// Fan out to admins (optionally commercials) of the tenant.
async function fanoutAdminNotification(tenantId, eventType, meta = {}, { includeCommercial = false } = {}) {
  if (!tenantId) return 0;
  const { in_app } = await shouldNotify(tenantId, eventType);
  if (!in_app) return 0;
  const roles = includeCommercial ? ['admin', 'commercial'] : ['admin'];
  try {
    const { rows } = await query(
      `SELECT DISTINCT u.id AS user_id
         FROM users u
        WHERE u.tenant_id = $1 AND u.role = ANY($2::text[])`,
      [tenantId, roles]
    );
    for (const r of rows) {
      await createNotification(r.user_id, eventType, { ...meta, tenantId }, { skipPreferenceCheck: true });
    }
    return rows.length;
  } catch (err) {
    console.error('[notify fanoutAdmin]', err.message);
    return 0;
  }
}

// Return the list of admin/commercial user emails for outgoing email fan-out.
async function adminEmails(tenantId) {
  if (!tenantId) return [];
  try {
    const { rows } = await query(
      `SELECT u.email, u.full_name FROM users u
        WHERE u.tenant_id = $1 AND u.role IN ('admin','commercial') AND u.email IS NOT NULL`,
      [tenantId]
    );
    return rows;
  } catch (err) { return []; }
}

// Return all partner user emails (for email fan-out).
async function partnerEmails(tenantId) {
  if (!tenantId) return [];
  try {
    const { rows } = await query(
      `SELECT DISTINCT u.email, u.full_name
         FROM users u
         JOIN partners p ON p.id = u.partner_id
        WHERE u.role = 'partner' AND p.tenant_id = $1 AND p.is_active = TRUE AND u.email IS NOT NULL`,
      [tenantId]
    );
    return rows;
  } catch (err) { return []; }
}

module.exports = {
  KNOWN_EVENTS,
  shouldNotify,
  shouldNotifyPartner,
  invalidatePrefsCache,
  createNotification,
  fanoutPartnerNotification,
  fanoutAdminNotification,
  adminEmails,
  partnerEmails,
};
