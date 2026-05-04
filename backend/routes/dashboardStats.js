const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'commercial', 'superadmin'));

// Parse optional ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD. Returns
// null when missing/malformed, leaving the default 6-month window.
function parseDateRange(req) {
  const { start_date, end_date } = req.query;
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (start_date && re.test(start_date) && end_date && re.test(end_date)) {
    return { startDate: start_date, endDate: end_date };
  }
  return null;
}

// One-shot bundle for the redesigned admin dashboard. Each sub-query
// is independent so a failure in one block (e.g. commissions) returns
// an empty array rather than failing the whole payload.
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;
  const range = parseDateRange(req);
  const safe = async (fn) => {
    try { return await fn(); } catch (err) {
      console.error('[dashboard.stats]', err.message);
      return null;
    }
  };

  const [
    referralsByMonth,
    referralsByStage,
    partnersByCategory,
    mrrByMonth,
    commissionsByStatus,
    commissionsByMonth,
    performanceByTemperature,
    averageCycleDuration,
  ] = await Promise.all([
    safe(() => monthly(tenantId, range)),
    safe(() => byStage(tenantId, range)),
    safe(() => byCategory(tenantId)),
    safe(() => monthlyMrr(tenantId, range)),
    safe(() => commissionStatus(tenantId, range)),
    safe(() => commissionMonthly(tenantId, range)),
    safe(() => temperature(tenantId, range)),
    safe(() => cycle(tenantId, range)),
  ]);

  res.json({
    referralsByMonth: referralsByMonth || [],
    referralsByStage: referralsByStage || [],
    partnersByCategory: partnersByCategory || [],
    mrrByMonth: mrrByMonth || [],
    commissionsByStatus: commissionsByStatus || [],
    commissionsByMonth: commissionsByMonth || [],
    performanceByTemperature: performanceByTemperature || [],
    averageCycleDuration: averageCycleDuration || { overall: null, qualification: null, proposition: null, closing: null },
  });
});

// ─── helpers ────────────────────────────────────────────────────────

// Build a "$col >= X AND $col < Y" SQL fragment + params appendage,
// starting from $startIdx. When `range` is null and the caller supplies
// a `defaultMonths` window, use the legacy interval-based fallback.
function dateClause(col, range, startIdx, defaultMonths = null) {
  if (range) {
    return {
      sql: `${col} >= $${startIdx}::date AND ${col} < ($${startIdx + 1}::date + INTERVAL '1 day')`,
      params: [range.startDate, range.endDate],
      next: startIdx + 2,
    };
  }
  if (defaultMonths != null) {
    return {
      sql: `${col} >= (date_trunc('month', NOW()) - INTERVAL '${defaultMonths} months')`,
      params: [],
      next: startIdx,
    };
  }
  return { sql: null, params: [], next: startIdx };
}

// ─── sub-queries ────────────────────────────────────────────────────

async function monthly(tenantId, range) {
  const dc = dateClause('created_at', range, 2, 5);
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'won')::int AS won,
            COUNT(*) FILTER (WHERE status = 'lost')::int AS lost
       FROM referrals
      WHERE tenant_id = $1
        AND deleted_at IS NULL
        AND ${dc.sql}
      GROUP BY 1
      ORDER BY 1`,
    [tenantId, ...dc.params]
  );
  return fillMonths(rows, ['total', 'won', 'lost'], range);
}

async function byStage(tenantId, range) {
  // Stage list always reflects current pipeline configuration. Date
  // range narrows the deal counts on each stage; stages with zero
  // matches still show via LEFT JOIN.
  const params = [tenantId];
  let joinDate = ' AND r.deleted_at IS NULL';
  if (range) {
    joinDate += ` AND r.created_at >= $2::date AND r.created_at < ($3::date + INTERVAL '1 day')`;
    params.push(range.startDate, range.endDate);
  }
  const { rows } = await query(
    `SELECT s.id, s.slug, s.name, s.color,
            COUNT(r.id)::int AS count,
            COALESCE(SUM(r.deal_value), 0)::numeric AS value
       FROM pipeline_stages s
       LEFT JOIN referrals r ON r.stage_id = s.id AND r.tenant_id = s.tenant_id${joinDate}
      WHERE s.tenant_id = $1
      GROUP BY s.id, s.slug, s.name, s.color, s.position
      ORDER BY s.position ASC`,
    params
  );
  return rows.map(r => ({ id: r.id, slug: r.slug, name: r.name, color: r.color, count: r.count, value: parseFloat(r.value) }));
}

async function byCategory(tenantId) {
  // Partners-per-category is a snapshot, not a temporal metric — date
  // range intentionally does not apply.
  const { rows } = await query(
    `SELECT c.id, c.name, c.color,
            COUNT(p.id) FILTER (WHERE p.is_active IS NOT FALSE)::int AS count
       FROM partner_categories c
       LEFT JOIN partners p ON p.category_id = c.id AND p.tenant_id = c.tenant_id
      WHERE c.tenant_id = $1
      GROUP BY c.id, c.name, c.color, c.position
      ORDER BY c.position ASC`,
    [tenantId]
  );
  return rows;
}

async function monthlyMrr(tenantId, range) {
  // MRR proxied as won-deal value closed in each month. Tenants with a
  // non-MRR revenue model still see a meaningful "revenue by month"
  // view.
  const dc = dateClause('updated_at', range, 2, 5);
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', updated_at), 'YYYY-MM') AS month,
            COALESCE(SUM(deal_value), 0)::numeric AS mrr
       FROM referrals
      WHERE tenant_id = $1 AND status = 'won'
        AND deleted_at IS NULL
        AND ${dc.sql}
      GROUP BY 1
      ORDER BY 1`,
    [tenantId, ...dc.params]
  );
  const filled = fillMonths(rows, ['mrr'], range);
  // Also compute the cumulative series so the frontend's toggle doesn't
  // have to rebuild it.
  let acc = 0;
  return filled.map(r => { acc += r.mrr; return { ...r, cumulative: acc }; });
}

async function commissionStatus(tenantId, range) {
  // Status labels the frontend will colour-code. The 'approved' bucket
  // here covers both awaiting_invoice (post-approval, no invoice yet)
  // and pending_validation (invoice received, awaiting payment) — both
  // are "approved but not yet paid" from a partner-finance perspective.
  const dc = dateClause('created_at', range, 2);
  const params = [tenantId, ...dc.params];
  const dateAnd = dc.sql ? ` AND ${dc.sql}` : '';
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE status = 'pending_approval'), 0)::numeric AS pending,
       COALESCE(SUM(amount) FILTER (WHERE status IN ('awaiting_invoice','pending_validation')), 0)::numeric AS approved,
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS paid,
       COALESCE(SUM(amount) FILTER (WHERE approval_status = 'rejected'), 0)::numeric AS rejected
     FROM commissions
     WHERE tenant_id = $1 AND deleted_at IS NULL${dateAnd}`,
    params
  );
  const r = rows[0] || {};
  return [
    { key: 'pending',  label: 'En attente', color: '#F59E0B', amount: parseFloat(r.pending || 0) },
    { key: 'approved', label: 'Approuvées', color: '#059669', amount: parseFloat(r.approved || 0) },
    { key: 'paid',     label: 'Payées',     color: '#3B82F6', amount: parseFloat(r.paid || 0) },
    { key: 'rejected', label: 'Rejetées',   color: '#EF4444', amount: parseFloat(r.rejected || 0) },
  ];
}

async function commissionMonthly(tenantId, range) {
  const dc = dateClause('created_at', range, 2, 5);
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            COALESCE(SUM(amount), 0)::numeric AS amount
       FROM commissions
      WHERE tenant_id = $1
        AND deleted_at IS NULL
        AND ${dc.sql}
      GROUP BY 1
      ORDER BY 1`,
    [tenantId, ...dc.params]
  );
  return fillMonths(rows, ['amount'], range);
}

async function temperature(tenantId, range) {
  const dc = dateClause('created_at', range, 2);
  const params = [tenantId, ...dc.params];
  const dateAnd = dc.sql ? ` AND ${dc.sql}` : '';
  const { rows } = await query(
    `SELECT recommendation_level AS temperature,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'won')::int AS won
       FROM referrals
      WHERE tenant_id = $1 AND recommendation_level IS NOT NULL AND deleted_at IS NULL${dateAnd}
      GROUP BY recommendation_level`,
    params
  );
  const byKey = Object.fromEntries(rows.map(r => [r.temperature, r]));
  return ['hot', 'warm', 'cold'].map(k => {
    const r = byKey[k] || { total: 0, won: 0 };
    const conv = r.total > 0 ? Math.round((r.won / r.total) * 100) : 0;
    return { temperature: k, total: r.total, won: r.won, conversion: conv };
  });
}

async function cycle(tenantId, range) {
  // Overall duration: submitted → won (updated_at when status flipped
  // to 'won'). Per-stage transitions use referral_activities rows
  // keyed on (old_value, new_value). Returns null values when the
  // tenant hasn't closed any deal yet. Date range narrows the deals
  // considered (by their created_at).
  const dc = dateClause('created_at', range, 2);
  const dateAnd = dc.sql ? ` AND ${dc.sql}` : '';
  const overallParams = [tenantId, ...dc.params];

  const overallRow = await query(
    `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400)::numeric AS days
       FROM referrals
      WHERE tenant_id = $1 AND status = 'won' AND deleted_at IS NULL${dateAnd}`,
    overallParams
  );

  const tr = async (from, to) => {
    // For the per-stage transitions, narrow the referrals via the same
    // date predicate on r.created_at.
    const trParams = [tenantId, from, to, ...dc.params];
    const trDateAnd = dc.sql ? ` AND r.${dc.sql}` : '';
    const { rows } = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (a2.created_at - a1.created_at))/86400)::numeric AS days
         FROM referral_activities a1
         JOIN referral_activities a2 ON a2.referral_id = a1.referral_id
         JOIN referrals r ON r.id = a1.referral_id
        WHERE r.tenant_id = $1 AND r.deleted_at IS NULL
          AND a1.action = 'status_change' AND a1.new_value = $2
          AND a2.action = 'status_change' AND a2.new_value = $3
          AND a2.created_at > a1.created_at${trDateAnd}`,
      trParams
    );
    const v = rows[0]?.days;
    return v != null ? parseFloat(v) : null;
  };
  return {
    overall:       overallRow.rows[0]?.days != null ? parseFloat(overallRow.rows[0].days) : null,
    qualification: await tr('new', 'qualified'),
    proposition:   await tr('qualified', 'proposal'),
    closing:       await tr('proposal', 'won'),
  };
}

// ─── utils ──────────────────────────────────────────────────────────

// Pad the month series so charts render every bucket in the chosen
// window. With a `range`, fill from start month to end month inclusive.
// Otherwise default to the trailing 6-month window.
function fillMonths(rows, numericKeys, range) {
  const months = [];
  if (range) {
    const [sy, sm] = range.startDate.split('-').map(Number);
    const [ey, em] = range.endDate.split('-').map(Number);
    let y = sy, m = sm;
    // Cap at ~36 months to keep pathological ranges sane.
    let guard = 0;
    while ((y < ey || (y === ey && m <= em)) && guard++ < 36) {
      months.push(`${y}-${String(m).padStart(2, '0')}`);
      m++;
      if (m > 12) { m = 1; y++; }
    }
  } else {
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
  }
  const byMonth = Object.fromEntries(rows.map(r => [r.month, r]));
  return months.map(m => {
    const r = byMonth[m] || {};
    const out = { month: m };
    for (const k of numericKeys) out[k] = parseFloat(r[k] || 0);
    return out;
  });
}

module.exports = router;
