const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);

// All trash endpoints are admin/commercial only — partners can't see
// deleted items even if they were the original creator.
const adminOnly = authorize('admin', 'commercial', 'superadmin');

// Build a tenant predicate that respects skipTenantFilter (superadmin).
function tenantClause(req, alias = '') {
  if (req.skipTenantFilter || !req.tenantId) return { sql: 'TRUE', params: [] };
  const col = alias ? `${alias}.tenant_id` : 'tenant_id';
  return { sql: `${col} = $1`, params: [req.tenantId] };
}

// ─── GET /api/trash ────────────────────────────────────────────────
// Single payload listing soft-deleted referrals AND commissions for
// the current tenant, newest deletions first. Returns enough context
// for the frontend to render an item: name + amount + days_remaining.
router.get('/', adminOnly, async (req, res) => {
  try {
    const refTenant  = tenantClause(req);
    const commTenant = tenantClause(req, 'c');

    const [{ rows: referrals }, { rows: commissions }] = await Promise.all([
      query(
        `SELECT id,
                'referral' AS type,
                prospect_name,
                prospect_company,
                deal_value AS amount,
                NULL::text AS status,
                deleted_at,
                deleted_by
           FROM referrals
          WHERE deleted_at IS NOT NULL
            AND ${refTenant.sql}
          ORDER BY deleted_at DESC`,
        refTenant.params
      ),
      query(
        `SELECT c.id,
                'commission' AS type,
                r.prospect_name,
                r.prospect_company,
                c.amount,
                c.status,
                c.deleted_at,
                c.deleted_by
           FROM commissions c
           JOIN referrals r ON r.id = c.referral_id
          WHERE c.deleted_at IS NOT NULL
            AND r.deleted_at IS NULL
            AND ${commTenant.sql}
          ORDER BY c.deleted_at DESC`,
        commTenant.params
      ),
    ]);

    // Standalone-deleted commissions appear in the trash on their own.
    // Commissions whose parent referral is also in the trash are
    // omitted here — restoring the referral restores them in cascade,
    // so showing both rows would be confusing duplicate entries.
    const items = [...referrals, ...commissions].sort(
      (a, b) => new Date(b.deleted_at) - new Date(a.deleted_at)
    );
    res.json({ items });
  } catch (err) {
    console.error('[trash.list] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/trash/count ──────────────────────────────────────────
// Tiny payload for the sidebar badge. Mirrors the visibility rules of
// the list endpoint (commissions whose parent is also trashed are
// hidden so the count matches what the page actually renders).
router.get('/count', adminOnly, async (req, res) => {
  try {
    const refTenant  = tenantClause(req);
    const commTenant = tenantClause(req, 'c');
    const { rows } = await query(
      `SELECT
        (SELECT COUNT(*) FROM referrals
          WHERE deleted_at IS NOT NULL AND ${refTenant.sql})
        +
        (SELECT COUNT(*) FROM commissions c
          JOIN referrals r ON r.id = c.referral_id
          WHERE c.deleted_at IS NOT NULL AND r.deleted_at IS NULL
            AND ${commTenant.sql})
        AS count`,
      // Both sub-queries use $1 = tenantId; safe to share when tenant
      // mode is on, and the params are identical (or both empty).
      refTenant.params
    );
    res.json({ count: parseInt(rows[0]?.count || 0) });
  } catch (err) {
    console.error('[trash.count] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/trash/referral/:id/restore ──────────────────────────
// Clearing deleted_at + deleted_by puts the row back in the live
// pipeline. Linked commissions are restored too — but only those that
// were soft-deleted as part of the same cascade (i.e. where
// deleted_at matches within a small tolerance, or simply: any
// soft-deleted commission on this referral).
router.post('/referral/:id/restore', adminOnly, async (req, res) => {
  try {
    const tenantParams = req.skipTenantFilter || !req.tenantId
      ? [req.params.id]
      : [req.params.id, req.tenantId];
    const tenantAnd = req.skipTenantFilter || !req.tenantId
      ? ''
      : ' AND tenant_id = $2';

    const { rows } = await query(
      `UPDATE referrals
          SET deleted_at = NULL, deleted_by = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL${tenantAnd}
        RETURNING id`,
      tenantParams
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });

    // Cascade-restore commissions that were soft-deleted alongside.
    await query(
      `UPDATE commissions
          SET deleted_at = NULL, deleted_by = NULL
        WHERE referral_id = $1 AND deleted_at IS NOT NULL`,
      [req.params.id]
    );

    res.json({ restored: rows[0] });
  } catch (err) {
    console.error('[trash.restore.referral] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/trash/commission/:id/restore ────────────────────────
router.post('/commission/:id/restore', adminOnly, async (req, res) => {
  try {
    const tenantParams = req.skipTenantFilter || !req.tenantId
      ? [req.params.id]
      : [req.params.id, req.tenantId];
    const tenantAnd = req.skipTenantFilter || !req.tenantId
      ? ''
      : ' AND tenant_id = $2';

    // Block restore when the parent referral itself is in the
    // Corbeille — restoring just the commission would leave it
    // orphaned (its referral wouldn't show up on the pipeline).
    const { rows: [parent] } = await query(
      `SELECT r.deleted_at
         FROM commissions c JOIN referrals r ON r.id = c.referral_id
        WHERE c.id = $1`,
      [req.params.id]
    );
    if (parent && parent.deleted_at) {
      return res.status(409).json({
        error: 'parent_referral_deleted',
        message: 'Restaurez d\'abord le deal parent depuis la corbeille.',
      });
    }

    const { rows } = await query(
      `UPDATE commissions
          SET deleted_at = NULL, deleted_by = NULL
        WHERE id = $1 AND deleted_at IS NOT NULL${tenantAnd}
        RETURNING id`,
      tenantParams
    );
    if (!rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ restored: rows[0] });
  } catch (err) {
    console.error('[trash.restore.commission] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/trash/:type/:id/permanent ─────────────────────────
// Admin-only (not commercial). Bypasses the 30-day window — once
// permanently deleted, the row is gone and Postgres rolls forward.
router.delete('/:type/:id/permanent', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { type, id } = req.params;
    const tenantParams = req.skipTenantFilter || !req.tenantId ? [id] : [id, req.tenantId];
    const tenantAnd = req.skipTenantFilter || !req.tenantId ? '' : ' AND tenant_id = $2';

    if (type === 'referral') {
      // Cascade: kill linked commissions + activities first, in any
      // soft-deleted state, then the referral itself.
      await query('DELETE FROM commissions WHERE referral_id = $1', [id]);
      await query('DELETE FROM referral_activities WHERE referral_id = $1', [id]);
      const { rowCount } = await query(
        `DELETE FROM referrals WHERE id = $1 AND deleted_at IS NOT NULL${tenantAnd}`,
        tenantParams
      );
      if (!rowCount) return res.status(404).json({ error: 'not_found' });
    } else if (type === 'commission') {
      const { rowCount } = await query(
        `DELETE FROM commissions WHERE id = $1 AND deleted_at IS NOT NULL${tenantAnd}`,
        tenantParams
      );
      if (!rowCount) return res.status(404).json({ error: 'not_found' });
    } else {
      return res.status(400).json({ error: 'invalid_type' });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[trash.permanent] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Worker: purge rows older than 30 days ─────────────────────────
// Exported so the same logic can run from server.js's daily cleanup
// loop AND from any future cron / admin button.
async function purgeDeletedRecords() {
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  // Delete commissions first to avoid orphaning during the brief window
  // between the two statements (FK cascade does the same eventually,
  // but explicit ordering keeps logs readable).
  const { rowCount: commCount } = await query(
    'DELETE FROM commissions WHERE deleted_at IS NOT NULL AND deleted_at < $1',
    [cutoff]
  );
  const { rowCount: actCount } = await query(
    `DELETE FROM referral_activities
      WHERE referral_id IN (
        SELECT id FROM referrals WHERE deleted_at IS NOT NULL AND deleted_at < $1
      )`,
    [cutoff]
  );
  const { rowCount: refCount } = await query(
    'DELETE FROM referrals WHERE deleted_at IS NOT NULL AND deleted_at < $1',
    [cutoff]
  );
  if (commCount || refCount) {
    console.log(`[trash.purge] permanently removed ${refCount} referrals + ${commCount} commissions + ${actCount} activities (>30d)`);
  }
}

module.exports = router;
module.exports.purgeDeletedRecords = purgeDeletedRecords;
