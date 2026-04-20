const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'commercial', 'superadmin'));

// One-shot bundle for the redesigned admin dashboard. Each sub-query
// is independent so a failure in one block (e.g. commissions) returns
// an empty array rather than failing the whole payload.
router.get('/stats', async (req, res) => {
  const tenantId = req.tenantId;
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
    safe(() => monthly(tenantId)),
    safe(() => byStage(tenantId)),
    safe(() => byCategory(tenantId)),
    safe(() => monthlyMrr(tenantId)),
    safe(() => commissionStatus(tenantId)),
    safe(() => commissionMonthly(tenantId)),
    safe(() => temperature(tenantId)),
    safe(() => cycle(tenantId)),
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

// ─── sub-queries ────────────────────────────────────────────────────

async function monthly(tenantId) {
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'won')::int AS won,
            COUNT(*) FILTER (WHERE status = 'lost')::int AS lost
       FROM referrals
      WHERE tenant_id = $1
        AND created_at >= (date_trunc('month', NOW()) - INTERVAL '5 months')
      GROUP BY 1
      ORDER BY 1`,
    [tenantId]
  );
  return fillMonths(rows, ['total', 'won', 'lost']);
}

async function byStage(tenantId) {
  const { rows } = await query(
    `SELECT s.id, s.slug, s.name, s.color,
            COUNT(r.id)::int AS count,
            COALESCE(SUM(r.deal_value), 0)::numeric AS value
       FROM pipeline_stages s
       LEFT JOIN referrals r ON r.stage_id = s.id AND r.tenant_id = s.tenant_id
      WHERE s.tenant_id = $1
      GROUP BY s.id, s.slug, s.name, s.color, s.position
      ORDER BY s.position ASC`,
    [tenantId]
  );
  return rows.map(r => ({ id: r.id, slug: r.slug, name: r.name, color: r.color, count: r.count, value: parseFloat(r.value) }));
}

async function byCategory(tenantId) {
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

async function monthlyMrr(tenantId) {
  // MRR proxied as won-deal value closed in each month. Tenants with a
  // non-MRR revenue model still see a meaningful "revenue by month"
  // view.
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', updated_at), 'YYYY-MM') AS month,
            COALESCE(SUM(deal_value), 0)::numeric AS mrr
       FROM referrals
      WHERE tenant_id = $1 AND status = 'won'
        AND updated_at >= (date_trunc('month', NOW()) - INTERVAL '5 months')
      GROUP BY 1
      ORDER BY 1`,
    [tenantId]
  );
  const filled = fillMonths(rows, ['mrr']);
  // Also compute the cumulative series so the frontend's toggle doesn't
  // have to rebuild it.
  let acc = 0;
  return filled.map(r => { acc += r.mrr; return { ...r, cumulative: acc }; });
}

async function commissionStatus(tenantId) {
  // Status labels the frontend will colour-code:
  //   pending_approval → En attente (amber)
  //   approved         → Approuvées (green)
  //   paid             → Payées (blue)   — matches commissions.status
  //   rejected         → Rejetées (red)
  const { rows } = await query(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE approval_status = 'pending_approval'), 0)::numeric AS pending,
       COALESCE(SUM(amount) FILTER (WHERE approval_status = 'approved' AND status <> 'paid'), 0)::numeric AS approved,
       COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0)::numeric AS paid,
       COALESCE(SUM(amount) FILTER (WHERE approval_status = 'rejected'), 0)::numeric AS rejected
     FROM commissions
     WHERE tenant_id = $1`,
    [tenantId]
  );
  const r = rows[0] || {};
  return [
    { key: 'pending',  label: 'En attente', color: '#F59E0B', amount: parseFloat(r.pending || 0) },
    { key: 'approved', label: 'Approuvées', color: '#059669', amount: parseFloat(r.approved || 0) },
    { key: 'paid',     label: 'Payées',     color: '#3B82F6', amount: parseFloat(r.paid || 0) },
    { key: 'rejected', label: 'Rejetées',   color: '#EF4444', amount: parseFloat(r.rejected || 0) },
  ];
}

async function commissionMonthly(tenantId) {
  const { rows } = await query(
    `SELECT to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
            COALESCE(SUM(amount), 0)::numeric AS amount
       FROM commissions
      WHERE tenant_id = $1
        AND created_at >= (date_trunc('month', NOW()) - INTERVAL '5 months')
      GROUP BY 1
      ORDER BY 1`,
    [tenantId]
  );
  return fillMonths(rows, ['amount']);
}

async function temperature(tenantId) {
  const { rows } = await query(
    `SELECT recommendation_level AS temperature,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE status = 'won')::int AS won
       FROM referrals
      WHERE tenant_id = $1 AND recommendation_level IS NOT NULL
      GROUP BY recommendation_level`,
    [tenantId]
  );
  const byKey = Object.fromEntries(rows.map(r => [r.temperature, r]));
  return ['hot', 'warm', 'cold'].map(k => {
    const r = byKey[k] || { total: 0, won: 0 };
    const conv = r.total > 0 ? Math.round((r.won / r.total) * 100) : 0;
    return { temperature: k, total: r.total, won: r.won, conversion: conv };
  });
}

async function cycle(tenantId) {
  // Overall duration: submitted → won (updated_at when status flipped
  // to 'won'). Per-stage transitions use referral_activities rows
  // keyed on (old_value, new_value). Returns null values when the
  // tenant hasn't closed any deal yet.
  const overallRow = await query(
    `SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/86400)::numeric AS days
       FROM referrals
      WHERE tenant_id = $1 AND status = 'won'`,
    [tenantId]
  );
  const tr = async (from, to) => {
    const { rows } = await query(
      `SELECT AVG(EXTRACT(EPOCH FROM (a2.created_at - a1.created_at))/86400)::numeric AS days
         FROM referral_activities a1
         JOIN referral_activities a2 ON a2.referral_id = a1.referral_id
         JOIN referrals r ON r.id = a1.referral_id
        WHERE r.tenant_id = $1
          AND a1.action = 'status_change' AND a1.new_value = $2
          AND a2.action = 'status_change' AND a2.new_value = $3
          AND a2.created_at > a1.created_at`,
      [tenantId, from, to]
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

// Pad the month series so every chart renders 6 points even for
// sparsely-populated tenants.
function fillMonths(rows, numericKeys) {
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push(key);
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
