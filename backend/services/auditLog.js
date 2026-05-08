// Audit log service — single best-effort write that never fails the
// caller. Mirrors the existing security middleware audit shape but
// writes BOTH the new entity_type/entity_id columns (added in v40)
// AND the legacy resource_type/resource_id columns so existing
// queries against the older shape keep working until we migrate
// callers off them.
const { query } = require('../db');

async function logAudit(req, action, entityType, entityId, details = {}) {
  try {
    await query(
      `INSERT INTO audit_logs
         (tenant_id, user_id, user_email, action,
          entity_type, entity_id, resource_type, resource_id,
          details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $5, $6, $7, $8, $9)`,
      [
        req.tenantId || (req.user && req.user.tenantId) || null,
        (req.user && req.user.id) || null,
        (req.user && req.user.email) || null,
        action,
        entityType || null,
        entityId || null,
        JSON.stringify(details || {}),
        (req.ip || (req.connection && req.connection.remoteAddress) || null),
        ((req.headers && req.headers['user-agent']) || '').toString().slice(0, 500),
      ]
    );
  } catch (err) {
    console.error('[auditLog]', err.message);
  }
}

module.exports = { logAudit };
