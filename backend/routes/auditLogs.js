// GET /api/audit-logs — paginated, filterable feed of admin actions
// for the Settings → Historique tab. Tenant-scoped except for
// superadmin (skipTenantFilter); admin/superadmin only.

const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'superadmin'));

router.get('/', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(req.query.pageSize, 10) || 50));
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];
    let i = 1;

    if (!req.skipTenantFilter) {
      if (!req.tenantId) return res.status(400).json({ error: 'tenant_missing' });
      where.push(`al.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }
    if (req.query.from) {
      where.push(`al.created_at >= $${i++}`);
      params.push(req.query.from);
    }
    if (req.query.to) {
      where.push(`al.created_at <= $${i++}`);
      params.push(req.query.to);
    }
    if (req.query.action) {
      where.push(`al.action = $${i++}`);
      params.push(req.query.action);
    }
    if (req.query.userId) {
      where.push(`al.user_id = $${i++}`);
      params.push(req.query.userId);
    }
    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows: countRows } = await query(
      `SELECT COUNT(*)::int AS total FROM audit_logs al ${whereClause}`,
      params
    );
    const total = countRows[0]?.total || 0;

    const listParams = [...params, pageSize, offset];
    const { rows } = await query(
      `SELECT al.id,
              al.tenant_id,
              al.user_id,
              al.action,
              COALESCE(al.entity_type, al.resource_type) AS entity_type,
              COALESCE(al.entity_id, al.resource_id)     AS entity_id,
              al.details,
              al.ip_address,
              al.user_agent,
              al.created_at,
              COALESCE(u.full_name, al.user_email) AS user_name,
              COALESCE(u.email, al.user_email)     AS user_email
         FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
         ${whereClause}
     ORDER BY al.created_at DESC
        LIMIT $${i++} OFFSET $${i++}`,
      listParams
    );

    res.json({
      logs: rows,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (err) {
    console.error('[auditLogs.list]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
