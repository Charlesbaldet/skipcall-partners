import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { TrendingUp, Users, FileText, DollarSign, Target, Zap, Trophy, Copy, CheckCircle, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import OnboardingWizard from '../components/OnboardingWizard.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import { fmt, STATUS_CONFIG, LEVEL_CONFIG, categoryName } from '../lib/constants';
import DateRangePicker from '../components/DateRangePicker.jsx';

const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#c026d3', '#16a34a', '#dc2626'];

const LEVEL_COLORS = {
  Bronze: { bg: '#fef3e2', color: '#cd7f32', border: '#f5d5a0' },
  Silver: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Gold: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  Platinum: { bg: '#eef2ff', color: 'var(--rb-primary, #059669)', border: '#c7d2fe' },
};

export default function DashboardPage() {
  const { t } = useTranslation();
  const [kpis, setKpis] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [topPartners, setTopPartners] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenueCumul, setRevenueCumul] = useState(false);
  const [tab, setTab] = useState('overview');
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLevels, setLbLevels] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [myTenant, setMyTenant] = useState(null);
  const [features, setFeatures] = useState(null);
  const [stats, setStats] = useState(null);
  const [revenueCumulState, setRevenueCumulState] = useState(false);
  // Wizard is admin-only. The pending flag is set during /signup
  // (admins only sign up new tenants), but DashboardPage is also
  // visible to commercial users — clamp to admin/superadmin so a
  // copy-pasted localStorage flag can't surface the wizard to a
  // non-admin role. Partners never reach this page (they live on
  // /partner/dashboard) so they're already excluded by routing.
  const [showWizard, setShowWizard] = useState(() => {
    const u = api.getUser && api.getUser();
    if (!u || (u.role !== 'admin' && u.role !== 'superadmin')) return false;
    // Tenant-scoped flag, with legacy unscoped flag as a fallback so
    // a user who signed up before this patch still gets the wizard
    // once. The legacy key is cleared by the wizard on dismiss
    // alongside the new one.
    if (u.tenantId && localStorage.getItem('refboost_onboarding_pending_' + u.tenantId) === '1') return true;
    if (localStorage.getItem('refboost_onboarding_pending') === '1') return true;
    return false;
  });
  const [billingPlan, setBillingPlan] = useState(null);
  const [dateRange, setDateRange] = useState(null);
  const [monthlyCumul, setMonthlyCumul] = useState(false);
  const navigate = useNavigate();

  // Re-fetch every dashboard endpoint when the picker range changes.
  // Initial mount runs with `null` (no filter), matching the legacy
  // behaviour exactly. Only the first load shows the full-page loader;
  // subsequent range changes refresh stale data in place.
  useEffect(() => {
    let active = true;
    Promise.all([
      api.getKPIs(dateRange), api.getTimeline(6, dateRange), api.getPipeline(dateRange),
      api.getTopPartners(dateRange), api.getLevels(dateRange),
    ]).then(([k, tl, p, tp, l]) => {
      if (!active) return;
      setKpis(k); setTimeline(tl.timeline); setPipeline(p.pipeline);
      setTopPartners(tp.topPartners); setLevels(l.levels);
    }).catch(console.error).finally(() => { if (active) setLoading(false); });
    api.getDashboardStats(dateRange).then(d => { if (active) setStats(d); }).catch(() => { if (active) setStats({}); });
    return () => { active = false; };
  }, [dateRange]);

  // Range-independent one-time fetches.
  useEffect(() => {
    api.getMyTenant().then(mt => setMyTenant(mt && (mt.tenant || mt))).catch(() => {});
    api.getTenantFeatures().then(d => setFeatures(d.features || {})).catch(() => setFeatures({}));
    api.getBillingPlan().then(setBillingPlan).catch(() => {});
  }, []);

  const loadLeaderboard = () => {
    if (leaderboard.length > 0) return;
    setLbLoading(true);
    api.getLeaderboard()
      .then(data => { setLeaderboard(data.leaderboard); setLbLevels(data.levels); })
      .catch(console.error)
      .finally(() => setLbLoading(false));
  };

  const handleTabChange = (id) => {
    setTab(id);
    if (id === 'classement') loadLeaderboard();
  };

  // Unified referral-link URL: /r/{tenantSlug}?ref={code}. This is the
  // same shape the partner-side ReferralLinkCard and the tracking
  // script use, so admins copying from Classement share the same
  // trackable link the partner would.
  const copyLink = (code) => {
    const slug = myTenant?.slug || '';
    const url = `${window.location.origin}/r/${encodeURIComponent(slug)}?ref=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopied(code);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return <PageLoader />;

  const pipelineData = pipeline.map(p => ({
    name: STATUS_CONFIG[p.status]?.label || p.status,
    count: parseInt(p.count), value: parseFloat(p.value),
    fill: STATUS_CONFIG[p.status]?.color || '#94a3b8',
  }));

  const levelData = levels.map(l => {
    const total = parseInt(l.count);
    const won = parseInt(l.won);
    return {
      name: LEVEL_CONFIG[l.level]?.label || l.level,
      total, won, lost: total - won,
      convRate: total > 0 ? Math.round((won / total) * 100) : 0,
      fill: LEVEL_CONFIG[l.level]?.color || '#94a3b8',
    };
  });

  const timelineData = timeline.map(tl => ({
    month: new Date(tl.month + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
    total: parseInt(tl.total), won: parseInt(tl.won), lost: parseInt(tl.lost),
    revenue: parseFloat(tl.revenue),
  }));

  const revenueData = revenueCumul
    ? timelineData.reduce((acc, tl, i) => { acc.push({ ...tl, revenue: (i > 0 ? acc[i - 1].revenue : 0) + tl.revenue }); return acc; }, [])
    : timelineData;

  return (
    <div className="fade-in">
      {showWizard && <OnboardingWizard onClose={() => setShowWizard(false)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.2, margin: 0 }}>{t('dashboard.title')}</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{t('dashboard.subtitle')}</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <DateRangePicker value={dateRange} onChange={setDateRange} />

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            {[
              { id: 'overview', label: t('dashboard.tab_overview'), icon: Target },
              { id: 'classement', label: t('dashboard.tab_leaderboard'), icon: Trophy },
            ].map(tab_ => (
              <button key={tab_.id} onClick={() => handleTabChange(tab_.id)} style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                background: tab === tab_.id ? '#fff' : 'transparent', color: tab === tab_.id ? '#0f172a' : '#64748b',
                boxShadow: tab === tab_.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <tab_.icon size={14} /> {tab_.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {tab === 'overview' && (
        <OverviewTab
          kpis={kpis}
          stats={stats}
          dateRange={dateRange}
          revenueCumul={revenueCumulState} setRevenueCumul={setRevenueCumulState}
          monthlyCumul={monthlyCumul} setMonthlyCumul={setMonthlyCumul}
          myTenant={myTenant}
          billingPlan={billingPlan} navigate={navigate}
        />
      )}

      {tab === 'classement' && (
        <ClassementTab
          leaderboard={leaderboard} levels={lbLevels} loading={lbLoading}
          copied={copied} copyLink={copyLink} myTenant={myTenant}
          features={features}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// VUE D'ENSEMBLE TAB
// ═══════════════════════════════════════
function OverviewTab({ kpis, stats, dateRange, revenueCumul, setRevenueCumul, monthlyCumul, setMonthlyCumul, myTenant, billingPlan, navigate }) {
  const { t } = useTranslation();
  const rModel = myTenant?.revenue_model || 'CA';
  const rLabel = rModel === 'ARR' ? 'ARR' : rModel === 'CA' ? t('common.revenue') : rModel === 'Other' ? t('common.revenue') : 'MRR';
  const over = !!(billingPlan
    && typeof billingPlan.partnerLimit === 'number'
    && billingPlan.partnerLimit !== -1
    && typeof billingPlan.partnerCount === 'number'
    && billingPlan.partnerCount > billingPlan.partnerLimit);
  const paymentFailed = billingPlan && (billingPlan.paymentStatus === 'past_due' || billingPlan.paymentStatus === 'unpaid');

  const openStripePortal = async () => {
    try {
      const { url } = await api.createPortal();
      if (url) window.location.href = url;
    } catch (e) {
      navigate('/billing');
    }
  };

  // Short month label for x-axes (nov., déc., jan., …).
  const monthShort = (ym) => {
    if (!ym) return '';
    const [y, m] = ym.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'short' }).toLowerCase();
  };
  const monthlyBase = (stats?.referralsByMonth || []).map(r => ({ ...r, label: monthShort(r.month) }));
  const monthlyData = monthlyCumul
    ? monthlyBase.reduce((acc, m, i) => {
        const prev = i > 0 ? acc[i - 1] : { total: 0, won: 0, lost: 0 };
        acc.push({
          ...m,
          total: (prev.total || 0) + (m.total || 0),
          won: (prev.won || 0) + (m.won || 0),
          lost: (prev.lost || 0) + (m.lost || 0),
        });
        return acc;
      }, [])
    : monthlyBase;
  const mrrSeries = (stats?.mrrByMonth || []).map(r => ({ ...r, label: monthShort(r.month), value: revenueCumul ? r.cumulative : r.mrr }));
  const commissionMonthly = (stats?.commissionsByMonth || []).map(r => ({ ...r, label: monthShort(r.month) }));
  const stageData = (stats?.referralsByStage || []).filter(s => s.count > 0);
  const stageTotal = stageData.reduce((s, r) => s + r.count, 0);
  const commissionStatusData = (stats?.commissionsByStatus || []).filter(c => c.amount > 0);
  const commissionTotal = commissionStatusData.reduce((s, c) => s + c.amount, 0);
  const temperatureData = stats?.performanceByTemperature || [];
  const cycle = stats?.averageCycleDuration || {};
  const mrrTotal = (stats?.mrrByMonth || []).reduce((s, r) => s + (r.mrr || 0), 0);
  const fmtDays = (n) => n == null ? '—' : `${Math.round(n)}j`;
  const fmtK = (n) => {
    if (n == null) return '—';
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K€`;
    return `${Math.round(n)}€`;
  };

  return (
    <>
      {paymentFailed && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '14px 16px', borderRadius: 12, fontSize: 14, marginBottom: 20, fontFamily: 'inherit' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }}/>
          <div style={{ flex: 1, fontWeight: 500 }}>{t('billing.payment_failed_banner')}</div>
          <button onClick={openStripePortal} style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {t('billing.update_payment')}
          </button>
        </div>
      )}
      {over && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '14px 16px', borderRadius: 12, fontSize: 14, marginBottom: 20, fontFamily: 'inherit' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }}/>
          <div style={{ flex: 1 }}>
            {t('billing.over_limit_banner', { count: billingPlan.partnerCount, limit: billingPlan.partnerLimit, plan: t('billing.' + (billingPlan.plan || 'starter')) })}
          </div>
          <button onClick={() => navigate('/billing')} style={{ background: 'linear-gradient(135deg,#059669,#10b981)', color: '#fff', border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' }}>
            {t('billing.upgrade')}
          </button>
        </div>
      )}

      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPICard icon={FileText} label={t('dashboard.kpi_total')} value={kpis?.total_referrals} color="#6366f1" />
        <KPICard icon={Zap} label={t('dashboard.kpi_new')} value={kpis?.new_count} color="#f59e0b" />
        <KPICard icon={Target} label={t('dashboard.kpi_pipeline')} value={kpis?.active_count} sub={fmt(kpis?.pipeline_value || 0)} color="#0ea5e9" />
        <KPICard icon={TrendingUp} label={t('dashboard.kpi_won')} value={kpis?.won_count} sub={fmt(kpis?.total_revenue || 0)} color="#16a34a" />
        <KPICard icon={DollarSign} label={t('dashboard.kpi_commissions')} value={fmt(kpis?.pending_commission || 0)} color="#f59e0b" highlight />
        <KPICard icon={Users} label={t('dashboard.kpi_rate')} value={`${kpis?.win_rate || 0}%`} color="#c026d3" />
      </div>

      {/* Leads inflow chart — full-width row sitting between the
          KPI tiles and the existing Évolution mensuelle (which
          tracks total + won, not just inflow). Granularity is
          server-decided from the date-picker range so the line
          stays readable from a 7-day zoom up to "Depuis le début". */}
      <div style={{ marginBottom: 20 }}>
        <LeadsEvolutionChart dateRange={dateRange} />
      </div>

      {/* Row 3: 3 cartes côte à côte. Évolution mensuelle réduite
          (slider horizontal interne quand la série dépasse la largeur
          de la colonne), puis Pipeline par statut au milieu, puis
          Partenaires par catégorie à droite. Hauteurs alignées
          sur ~180 px pour matcher les deux donuts. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard
          title={t('dashboard.chart_monthly')}
          action={
            <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
              {[{ key: false, label: t('dashboard.monthly') }, { key: true, label: t('dashboard.cumulative') }].map(opt => (
                <button key={String(opt.key)} onClick={() => setMonthlyCumul(opt.key)} style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: monthlyCumul === opt.key ? '#fff' : 'transparent',
                  color: monthlyCumul === opt.key ? '#059669' : '#9ca3af',
                  boxShadow: monthlyCumul === opt.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}>{opt.label}</button>
              ))}
            </div>
          }
        >
          {/* Slider horizontal interne : on force un min-width
              proportionnel au nombre de points (~46 px / mois) pour
              qu'avec ~12 mois ça remplisse la colonne, et qu'au-delà
              le chart scroll plutôt que de comprimer les ticks. */}
          <div style={{ overflowX: 'auto', overflowY: 'hidden', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: Math.max(220, (monthlyData.length || 1) * 46), height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyData} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="totalGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#059669" stopOpacity={0.18}/>
                      <stop offset="100%" stopColor="#059669" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f3f4f6" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={32} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }} />
                  <Area type="monotone" dataKey="total" stroke="#059669" strokeWidth={2} fill="url(#totalGrad)" name="Total" isAnimationActive={false} />
                  <Area type="monotone" dataKey="won"   stroke="#059669" strokeWidth={2} strokeDasharray="4 4" strokeOpacity={0.55} fill="transparent" name="Gagnés" isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', fontSize: 11, color: '#6b7280', marginTop: 6 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, background: '#059669' }}/> Total</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 0, borderTop: '2px dashed #059669', opacity: 0.55 }}/> Gagnés</span>
          </div>
        </ChartCard>

        <PipelineDonutCard stages={stageData} total={stageTotal} />
        <PartnersByCategoryCard />
      </div>

      {/* Row 4: MRR area + Temperature bars */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard
          title={`${rLabel} Généré (€)`}
          action={
            <div style={{ display: 'flex', gap: 2, background: '#f3f4f6', borderRadius: 8, padding: 2 }}>
              {[{ key: false, label: t('dashboard.monthly') }, { key: true, label: t('dashboard.cumulative') }].map(opt => (
                <button key={String(opt.key)} onClick={() => setRevenueCumul(opt.key)} style={{
                  padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: revenueCumul === opt.key ? '#fff' : 'transparent',
                  color: revenueCumul === opt.key ? '#059669' : '#9ca3af',
                  boxShadow: revenueCumul === opt.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
                }}>{opt.label}</button>
              ))}
            </div>
          }
        >
          <div style={{ fontSize: 28, fontWeight: 800, color: '#059669', letterSpacing: -1, marginBottom: 4 }}>
            {fmtK(revenueCumul ? mrrTotal : (mrrSeries[mrrSeries.length - 1]?.mrr || 0))}
          </div>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={mrrSeries} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#059669" stopOpacity={0.18}/>
                  <stop offset="100%" stopColor="#059669" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} formatter={v => fmt(v)} />
              <Area type="monotone" dataKey="value" stroke="#059669" strokeWidth={2} fill="url(#mrrGrad)" name={revenueCumul ? 'Cumulé' : 'Mensuel'} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Performance par niveau de reco">
          <TemperatureBars data={temperatureData} />
        </ChartCard>
      </div>

      {/* Row 5: Commissions donut + Cycle duration */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <CommissionStatusCard data={commissionStatusData} total={commissionTotal} />
        <CycleDurationCard cycle={cycle} />
      </div>

      {/* Row 6: Commission evolution, full width */}
      <ChartCard title="Évolution des commissions">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={commissionMonthly} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
            <defs>
              <linearGradient id="commGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#F59E0B" stopOpacity={0.22}/>
                <stop offset="100%" stopColor="#F59E0B" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#9ca3af' }} axisLine={false} tickLine={false} width={40} tickFormatter={v => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} formatter={v => fmt(v)} />
            <Area type="monotone" dataKey="amount" stroke="#F59E0B" strokeWidth={2} fill="url(#commGrad)" name="Commissions" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>
    </>
  );
}

// ═══ Donut: Pipeline par statut ═══
function PipelineDonutCard({ stages, total }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2236', marginBottom: 12 }}>Pipeline par statut</div>
      {stages.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>Aucune donnée</div>
      ) : (
        <>
          <div style={{ position: 'relative', height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={stages} dataKey="count" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                  {stages.map((s, i) => <Cell key={i} fill={s.color || '#94a3b8'} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1a2236', letterSpacing: -1 }}>{total}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>total</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 12, fontSize: 12 }}>
            {stages.map(s => (
              <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4b5563' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color || '#94a3b8', flexShrink: 0 }}/>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.name}</span>
                <span style={{ fontWeight: 700, color: '#1a2236' }}>{s.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══ Horizontal progress bars per lead temperature ═══
function TemperatureBars({ data }) {
  const PALETTE = {
    hot:  { label: 'Hot',  fg: '#DC2626', bg: '#FEE2E2' },
    warm: { label: 'Warm', fg: '#F59E0B', bg: '#FEF3C7' },
    cold: { label: 'Cold', fg: '#3B82F6', bg: '#DBEAFE' },
  };
  const any = data.some(d => d.total > 0);
  if (!any) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>Aucune donnée</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18, paddingTop: 6 }}>
      {data.map(row => {
        const p = PALETTE[row.temperature] || PALETTE.cold;
        const pct = Math.max(0, Math.min(100, row.conversion));
        return (
          <div key={row.temperature}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#1a2236' }}>{p.label}</span>
              <span style={{ fontSize: 13, fontWeight: 700, color: p.fg }}>{row.conversion}%</span>
            </div>
            <div style={{ height: 10, borderRadius: 999, background: p.bg, overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${pct}%`, background: p.fg, borderRadius: 999, transition: 'width .4s' }}/>
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 3 }}>{row.won} / {row.total} deals</div>
          </div>
        );
      })}
    </div>
  );
}

// ═══ Donut: Commissions par statut ═══
function CommissionStatusCard({ data, total }) {
  const fmtEur = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2236', marginBottom: 12 }}>Commissions par statut</div>
      {data.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>Aucune donnée</div>
      ) : (
        <>
          <div style={{ position: 'relative', height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="amount" nameKey="label" innerRadius={55} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                  {data.map((s, i) => <Cell key={i} fill={s.color} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} formatter={v => fmtEur(v)} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#1a2236', letterSpacing: -0.5 }}>{fmtEur(total)}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>total</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 12, fontSize: 12 }}>
            {data.map(s => (
              <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4b5563' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, flexShrink: 0 }}/>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: '#1a2236' }}>{fmtEur(s.amount)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ═══ Cycle duration card ═══
function CycleDurationCard({ cycle }) {
  const fmt = (n) => n == null ? '—' : `${Math.round(n)}j`;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2236', marginBottom: 12 }}>Durée moyenne du cycle</div>
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <div style={{ fontSize: 56, fontWeight: 800, color: '#8B5CF6', letterSpacing: -2, lineHeight: 1 }}>{fmt(cycle.overall)}</div>
        <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>Nouveau à Gagné</div>
      </div>
      <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, textAlign: 'center' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2236' }}>{fmt(cycle.qualification)}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Qualification</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2236' }}>{fmt(cycle.proposition)}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Proposition</div>
        </div>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a2236' }}>{fmt(cycle.closing)}</div>
          <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>Closing</div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// CLASSEMENT TAB
// ═══════════════════════════════════════
function ClassementTab({ leaderboard, levels, loading, myTenant }) {
  const { t } = useTranslation();
  const rModel = myTenant?.revenue_model || 'CA';
  const rLabel = rModel === 'ARR' ? 'ARR' : rModel === 'CA' ? t('common.revenue') : rModel === 'Other' ? t('common.revenue') : 'MRR';
  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('dashboard.loading')}</div>;

  const topThree = leaderboard.slice(0, 3);

  return (
    <>
      {/* Level badges */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24, flexWrap: 'wrap' }}>
        {levels.map(l => {
          const lc = LEVEL_COLORS[l.name] || LEVEL_COLORS.Bronze;
          return (
            <div key={l.name} style={{ padding: '8px 16px', borderRadius: 10, background: lc.bg, border: `1px solid ${lc.border}`, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 18 }}>{l.icon}</span>
              <div>
                <div style={{ fontWeight: 700, color: lc.color, fontSize: 13 }}>{l.name}</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{l.min}+ {t('dashboard.deals').toLowerCase()} · {l.rate}% com.</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Podium */}
      {topThree.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: topThree.length === 1 ? '1fr' : topThree.length === 2 ? '1fr 1fr' : '1fr 1.2fr 1fr', gap: 16, marginBottom: 28, alignItems: 'end' }}>
          {topThree.length >= 2 && <PodiumCard partner={topThree[1]} />}
          {topThree.length >= 1 && <PodiumCard partner={topThree[0]} isFirst />}
          {topThree.length >= 3 && <PodiumCard partner={topThree[2]} />}
        </div>
      )}

      {/* Full ranking table — only when there's content beyond the
          podium top 3. ≤ 3 partners or 0 partners are handled by the
          podium itself + the no_partner empty state below. */}
      {leaderboard.length > 3 && (
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {[
                t('dashboard.tbl_rank'),
                t('dashboard.tbl_partner'),
                t('dashboard.tbl_level'),
                t('dashboard.tbl_won'),
                `${rLabel} ${t('dashboard.tbl_generated')}`,
                t('dashboard.tbl_commissions'),
                t('dashboard.tbl_conversion'),
                t('dashboard.tbl_progression'),
              ].map((h, i) => (
                <th key={i} style={{ padding: '13px 14px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Top 3 already render as the podium above; the table
                starts at #4 to avoid the duplicate. If the tenant has
                ≤ 3 partners the .slice yields an empty array and the
                empty-state row below picks it up. */}
            {leaderboard.slice(3).map(p => {
              const lc = LEVEL_COLORS[p.level] || LEVEL_COLORS.Bronze;
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '13px 14px', fontWeight: 800, color: p.rank <= 3 ? '#f59e0b' : '#94a3b8', fontSize: 16 }}>
                    {p.rank <= 3 ? ['', '', ''][p.rank - 1] : p.rank}
                  </td>
                  <td style={{ padding: '13px 14px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{p.contact_name}</div>
                  </td>
                  <td style={{ padding: '13px 14px' }}>
                    <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, background: lc.bg, color: lc.color, border: `1px solid ${lc.border}` }}>
                      {p.level_icon} {p.level}
                    </span>
                  </td>
                  <td style={{ padding: '13px 14px', fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{p.won_deals}</td>
                  <td style={{ padding: '13px 14px', fontWeight: 600 }}>{fmt(p.total_revenue)}</td>
                  <td style={{ padding: '13px 14px', fontWeight: 600, color: '#16a34a' }}>{fmt(p.total_commissions)}</td>
                  <td style={{ padding: '13px 14px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      background: p.conversion_rate >= 50 ? '#f0fdf4' : p.conversion_rate >= 25 ? '#fffbeb' : '#fef2f2',
                      color: p.conversion_rate >= 50 ? '#16a34a' : p.conversion_rate >= 25 ? '#f59e0b' : '#dc2626',
                    }}>{p.conversion_rate}%</span>
                  </td>
                  <td style={{ padding: '13px 14px', fontSize: 12, minWidth: 120 }}>
                    {p.next_level ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 6, background: '#f1f5f9', borderRadius: 3, overflow: 'hidden' }}>
                          <div style={{ height: '100%', borderRadius: 3, background: lc.color, width: `${Math.min(100, (p.won_deals / (p.won_deals + p.next_level.deals_needed)) * 100)}%` }} />
                        </div>
                        <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{p.next_level.deals_needed} → {p.next_level.icon}</span>
                      </div>
                    ) : (
                      <span style={{ color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{t('dashboard.max')}</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
      {leaderboard.length === 0 && (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
          {t('dashboard.no_partner')}
        </div>
      )}
    </>
  );
}

// ═══════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════
function PodiumCard({ partner: p, isFirst }) {
  const { t } = useTranslation();
  const lc = LEVEL_COLORS[p.level] || LEVEL_COLORS.Bronze;
  return (
    <div style={{
      background: '#fff', borderRadius: 20, padding: isFirst ? 28 : 22, border: '1px solid #e2e8f0',
      textAlign: 'center', boxShadow: isFirst ? '0 8px 30px rgba(99,102,241,0.15)' : 'none',
      transform: isFirst ? 'scale(1)' : 'scale(0.95)',
    }}>
      <div style={{ fontSize: isFirst ? 40 : 32, marginBottom: 8 }}>{['', '', ''][p.rank - 1]}</div>
      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: isFirst ? 18 : 16, marginBottom: 4 }}>{p.name}</div>
      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: lc.bg, color: lc.color }}>{p.level_icon} {p.level}</span>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16 }}>
        <div>
          <div style={{ fontSize: isFirst ? 24 : 20, fontWeight: 800, color: '#0f172a' }}>{p.won_deals}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>{t('dashboard.deals')}</div>
        </div>
        <div>
          <div style={{ fontSize: isFirst ? 24 : 20, fontWeight: 800, color: '#16a34a' }}>{fmt(p.total_commissions)}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>{t('dashboard.commissions_label')}</div>
        </div>
      </div>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, color, highlight }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: highlight ? 'linear-gradient(135deg,#fef3c7,#fffbeb)' : '#fff', border: highlight ? '1px solid #fcd34d' : '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: color || '#0f172a', letterSpacing: -1 }}>{value}</div>
          {sub && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, action, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: -0.3 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

// ─── Leads evolution chart ──────────────────────────────────────────
// Area chart of new referrals entering the pipeline per period.
// Distinct from the existing chart_monthly card (which mixes total +
// won bars). Granularity is decided server-side from the date-picker
// range (day ≤31d, week ≤180d, month otherwise) so the line stays
// readable across zoom levels without a client-side toggle. Re-fires
// the fetch whenever the parent's dateRange changes.
function LeadsEvolutionChart({ dateRange }) {
  const { t, i18n } = useTranslation();
  const [data, setData] = useState([]);
  const [granularity, setGranularity] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getLeadsEvolution(dateRange)
      .then(res => {
        if (cancelled) return;
        const rows = (res && res.data) || [];
        const g = (res && res.granularity) || 'month';
        setGranularity(g);
        setData(rows.map(r => ({
          period: r.period,
          label: formatPeriodLabel(r.period, g, i18n.language),
          leads: parseInt(r.new_leads, 10) || 0,
        })));
      })
      .catch(() => { if (!cancelled) setData([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [dateRange, i18n.language]);

  return (
    <ChartCard title={t('dashboard.leads_evolution', 'Évolution des leads')}>
      <div style={{ height: 250 }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>
            {t('dashboard.loading', 'Chargement…')}
          </div>
        ) : data.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#94a3b8', fontSize: 13 }}>
            {t('dashboard.no_data', 'Aucune donnée')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="leadsEvolutionFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#16a34a" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#f3f4f6" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb', padding: '8px 12px' }}
                formatter={(value) => [value, t('dashboard.new_leads', 'Nouveaux leads')]}
                labelStyle={{ color: '#0f172a', fontWeight: 600, marginBottom: 4 }}
              />
              <Area
                type="monotone"
                dataKey="leads"
                stroke="#16a34a"
                strokeWidth={2}
                fill="url(#leadsEvolutionFill)"
                dot={false}
                activeDot={{ r: 4, fill: '#16a34a', stroke: '#fff', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </ChartCard>
  );
}

// X-axis tick formatter. Granularity comes from the server so the
// label vocabulary matches the bucket size (no awkward "S37" tick on
// a daily series).
function formatPeriodLabel(periodIso, granularity, lang) {
  if (!periodIso) return '';
  const d = new Date(periodIso);
  if (Number.isNaN(d.getTime())) return '';
  const locale = (lang || 'fr').slice(0, 2);
  if (granularity === 'day') {
    return d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  }
  if (granularity === 'week') {
    return 'S' + isoWeekNumber(d);
  }
  return d.toLocaleDateString(locale, { month: 'short', year: '2-digit' });
}

// ISO 8601 week number — Monday-based, week 1 contains the year's
// first Thursday. Inline rather than pulling date-fns since this is
// the only consumer.
function isoWeekNumber(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

function PageLoader() {
  return <PageSkeleton />;
}

// Small admin-only breakdown of active partners per category.
// Self-fetches categories + partners so it's drop-in from any
// dashboard tab. Hides itself when no categories exist.
function PartnersByCategoryCard() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [partners, setPartners] = useState([]);

  useEffect(() => {
    Promise.all([api.getPartnerCategories().catch(() => ({ categories: [] })), api.request('/partners').catch(() => ({ partners: [] }))])
      .then(([c, p]) => { setCategories(c.categories || []); setPartners(p.partners || []); });
  }, []);

  if (!categories.length) return null;
  const counts = categories.map(c => ({
    ...c,
    count: partners.filter(p => p.category_id === c.id && p.is_active !== false).length,
  }));
  const total = counts.reduce((s, c) => s + c.count, 0) || 0;
  const data = counts.map(c => ({
    id: c.id,
    name: categoryName(c),
    value: c.count,
    color: c.color || '#6B7280',
  }));

  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#1a2236', marginBottom: 12 }}>
        {t('partner_category.stats')}
      </div>
      {total === 0 ? (
        <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 13 }}>—</div>
      ) : (
        <>
          <div style={{ position: 'relative', height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={2} isAnimationActive={false}>
                  {data.map((d, i) => <Cell key={i} fill={d.color} stroke="#fff" strokeWidth={2} />)}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#1a2236', letterSpacing: -1 }}>{total}</div>
              <div style={{ fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5 }}>total</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginTop: 12, fontSize: 12 }}>
            {data.map(d => (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#4b5563' }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: d.color, flexShrink: 0 }}/>
                <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.name}</span>
                <span style={{ fontWeight: 700, color: '#1a2236' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
