// Audit log service — single best-effort write that never fails the
// caller. Mirrors the existing security middleware audit shape but
// writes BOTH the new entity_type/entity_id columns (added in v40)
// AND the legacy resource_type/resource_id columns so existing
// queries against the older shape keep working until we migrate
// callers off them.
const { query } = require('../db');

// J2 ITEM 2 (A4) — Tenant_id priority for audit_logs :
//   1. explicit `tenantIdOverride` (caller knows resource.tenant_id —
//      e.g. superadmin modifying tenant X : log should attribute to X,
//      not to the superadmin's own tenant)
//   2. `req.user.tenantId` (JWT-derived, signed, trusted)
//   3. `req.tenantId` (synthetic-req fallback for unauthenticated
//      paths — auth.js login_failed passes user.tenant_id here, and
//      authenticated routes that apply tenantScope have it == JWT
//      value anyway)
//   4. null (acceptable for fully-anonymous events like login_failed
//      with unknown email)
//
// Pré-J2 ordre était (req.tenantId || req.user.tenantId) — qui faisait
// gagner le host header pour les routes authentifiées sans
// tenantScope (ex: tenants.js PUT /:id). Dylan se loguant via
// skipcall-partners.vercel.app sur AlloAgent SAS voyait ses logs
// attribués au tenant TEST (propriétaire du domaine Vercel). Inversé
// en J2 : JWT > host-header.
async function logAudit(req, action, entityType, entityId, details = {}, tenantIdOverride) {
  try {
    let resolvedTenantId = null;
    if (tenantIdOverride !== undefined && tenantIdOverride !== null) {
      resolvedTenantId = tenantIdOverride;
    } else if (req && req.user && req.user.tenantId) {
      resolvedTenantId = req.user.tenantId;
    } else if (req && req.tenantId) {
      resolvedTenantId = req.tenantId;
    }
    await query(
      `INSERT INTO audit_logs
         (tenant_id, user_id, user_email, action,
          entity_type, entity_id, resource_type, resource_id,
          details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $5, $6, $7, $8, $9)`,
      [
        resolvedTenantId,
        (req && req.user && req.user.id) || null,
        (req && req.user && req.user.email) || null,
        action,
        entityType || null,
        entityId || null,
        JSON.stringify(details || {}),
        ((req && req.ip) || (req && req.connection && req.connection.remoteAddress) || null),
        ((req && req.headers && req.headers['user-agent']) || '').toString().slice(0, 500),
      ]
    );
  } catch (err) {
    console.error('[auditLog]', err.message);
  }
}

module.exports = { logAudit };
