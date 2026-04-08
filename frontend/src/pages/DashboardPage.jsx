import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, LabelList } from 'recharts';
import { TrendingUp, Users, FileText, DollarSign, Target, Zap, Trophy, Copy, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import OnboardingWizard from '../components/OnboardingWizard.jsx';
import { fmt, STATUS_CONFIG, LEVEL_CONFIG } from '../lib/constants';

const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#c026d3', '#16a34a', '#dc2626'];

const LEVEL_COLORS = {
  Bronze: { bg: '#fef3e2', color: '#cd7f32', border: '#f5d5a0' },
  Silver: { bg: '#f1f5f9', color: '#64748b', border: '#cbd5e1' },
  Gold: { bg: '#fffbeb', color: '#d97706', border: '#fde68a' },
  Platinum: { bg: '#eef2ff', color: 'var(--rb-primary, #059669)', border: '#c7d2fe' },
};

export default function DashboardPage() {
  const [kpis, setKpis] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [topPartners, setTopPartners] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenueCumul, setRevenueCumul] = useState(false);
  const [myTenant, setMyTenant] = useState(null);
  const [tab, setTab] = useState('overview');
  const [leaderboard, setLeaderboard] = useState([]);
  const [lbLevels, setLbLevels] = useState([]);
  const [lbLoading, setLbLoading] = useState(false);
  const [copied, setCopied] = useState(null);
  const [showWizard, setShowWizard] = useState(() => localStorage.getItem('refboost_onboarding_pending') === '1');

  useEffect(() => {
    Promise.all([
      api.getKPIs(), api.getTimeline(6), api.getPipeline(),
      api.getTopPartners(), api.getLevels(), api.getMyTenant(),
    ]).then(([k, t, p, tp, l, mt]) => {
      setKpis(k); setTimeline(t.timeline); setPipeline(p.pipeline);
      setTopPartners(tp.topPartners); setLevels(l.levels); setMyTenant(mt && (mt.tenant || mt));
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const loadLeaderboard = () => {
    if (leaderboard.length > 0) return;
    setLbLoading(true);
    api.getLeaderboard()
      .then(data => { setLeaderboard(data.leaderboard); setLbLevels(data.levels); })
      .catch(console.error)
      .finally(() => setLbLoading(false));
  };

  const handleTabChange = (t) => {
    setTab(t);
    if (t === 'classement') loadLeaderboard();
  };

  const copyLink = (code) => {
    navigator.clipboard.writeText(`${window.location.origin}/ref/${code}`);
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

  const timelineData = timeline.map(t => ({
    month: new Date(t.month + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
    total: parseInt(t.total), won: parseInt(t.won), lost: parseInt(t.lost),
    revenue: parseFloat(t.revenue),
  }));

  const revenueData = revenueCumul
    ? timelineData.reduce((acc, t, i) => { acc.push({ ...t, revenue: (i > 0 ? acc[i - 1].revenue : 0) + t.revenue }); return acc; }, [])
    : timelineData;

  const rModel = myTenant?.revenue_model || 'CA';
  const rLabel = rModel === 'ARR' ? 'ARR' : rModel === 'CA' ? 'CA' : rModel === 'Other' ? 'Revenus' : 'MRR';
  const rPeriod = rModel === 'ARR' ? 'Annualisé' : 'Mensuel';

  return (
    <div className="fade-in">
      {showWizard && <OnboardingWizard onClose={() => setShowWizard(false)} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Dashboard</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>Vue d'ensemble de votre programme partenaires</p>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {[
            { id: 'overview', label: 'Vue d\'ensemble', icon: Target },
            { id: 'classement', label: 'Classement', icon: Trophy },
          ].map(t => (
            <button key={t.id} onClick={() => handleTabChange(t.id)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0f172a' : '#64748b',
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'overview' && (
        <OverviewTab
          kpis={kpis} pipelineData={pipelineData} levelData={levelData}
          timelineData={timelineData} revenueData={revenueData}
          revenueCumul={revenueCumul} setRevenueCumul={setRevenueCumul}
          topPartners={topPartners}
        />
      )}

      {tab === 'classement' && (
        <ClassementTab
          leaderboard={leaderboard} levels={lbLevels} loading={lbLoading}
          copied={copied} copyLink={copyLink}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// VUE D'ENSEMBLE TAB
// ═══════════════════════════════════════
function OverviewTab({ kpis, pipelineData, levelData, timelineData, revenueData, revenueCumul, setRevenueCumul, topPartners }) {
  return (
    <>
      {/* KPI Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPICard icon={FileText} label="Total Referrals" value={kpis?.total_referrals} color="#6366f1" />
        <KPICard icon={Zap} label="Nouveaux" value={kpis?.new_count} color="#f59e0b" />
        <KPICard icon={Target} label="Pipeline actif" value={kpis?.active_count} sub={fmt(kpis?.pipeline_value || 0)} color="#0ea5e9" />
        <KPICard icon={TrendingUp} label="Deals gagnés" value={kpis?.won_count} sub={fmt(kpis?.total_revenue || 0)} color="#16a34a" />
        <KPICard icon={DollarSign} label="Commissions dues" value={fmt(kpis?.pending_commission || 0)} color="#f59e0b" highlight />
        <KPICard icon={Users} label="Taux de conversion" value={`${kpis?.win_rate || 0}%`} color="#c026d3" />
      </div>

      {/* Charts Row 1 */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title="Évolution mensuelle">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={timelineData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" name="Total" fill="#6366f1" radius={[4,4,0,0]}>
                <LabelList dataKey="total" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#6366f1' }} />
              </Bar>
              <Bar dataKey="won" name="Gagnés" fill="#16a34a" radius={[4,4,0,0]}>
                <LabelList dataKey="won" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#16a34a' }} />
              </Bar>
              <Bar dataKey="lost" name="Perdus" fill="#dc2626" radius={[4,4,0,0]}>
                <LabelList dataKey="lost" position="top" style={{ fontSize: 11, fontWeight: 700, fill: '#dc2626' }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Pipeline par statut">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4 }}>
            {pipelineData.filter(p => p.count > 0).map((p, i) => {
              const total = pipelineData.reduce((s, d) => s + d.count, 0);
              const pct = total > 0 ? Math.round(p.count / total * 100) : 0;
              return (
                <div key={i}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.fill }} />
                      <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{p.name}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 800, color: '#0f172a', fontSize: 18 }}>{p.count}</span>
                      <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>{pct}%</span>
                    </div>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: '#f1f5f9', overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 4, background: p.fill, width: `${pct}%`, transition: 'width 0.5s ease' }} />
                  </div>
                </div>
              );
            })}
            {pipelineData.every(p => p.count === 0) && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>Aucune donnée</div>}
          </div>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        <ChartCard title={`${rLabel} Généré (€)`} action={
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 8, padding: 2 }}>
            {[{ key: false, label: 'Mensuel' }, { key: true, label: 'Cumulé' }].map(opt => (
              <button key={String(opt.key)} onClick={() => setRevenueCumul(opt.key)} style={{
                padding: '4px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontWeight: 600,
                background: revenueCumul === opt.key ? '#fff' : 'transparent',
                color: revenueCumul === opt.key ? '#6366f1' : '#94a3b8',
                boxShadow: revenueCumul === opt.key ? '0 1px 2px rgba(0,0,0,0.08)' : 'none',
              }}>{opt.label}</button>
            ))}
          </div>
        }>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `${(v/1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} formatter={v => fmt(v)} />
              <Line type="monotone" dataKey="revenue" name={revenueCumul ? `${rLabel} Cumulé` : `${rLabel} ${rPeriod}`} stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Performance par niveau de reco">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>
            {levelData.map((l, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{l.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{l.total} referrals</span>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{l.won} gagnés</span>
                    <span style={{ padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                      background: l.convRate >= 50 ? '#f0fdf4' : l.convRate >= 25 ? '#fffbeb' : '#fef2f2',
                      color: l.convRate >= 50 ? '#16a34a' : l.convRate >= 25 ? '#f59e0b' : '#dc2626',
                    }}>{l.convRate}%</span>
                  </div>
                </div>
                <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }}>
                  {l.won > 0 && (
                    <div style={{ width: `${(l.won / l.total) * 100}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', minWidth: 28 }}>{l.won}</div>
                  )}
                  {l.lost > 0 && (
                    <div style={{ width: `${(l.lost / l.total) * 100}%`, background: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 600, color: '#64748b', minWidth: 28 }}>{l.lost}</div>
                  )}
                </div>
              </div>
            ))}
            {levelData.length === 0 && <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 14 }}>Aucune donnée</div>}
            {levelData.length > 0 && (
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#16a34a' }} /><span style={{ color: '#64748b' }}>Gagnés</span></span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: '#e2e8f0' }} /><span style={{ color: '#64748b' }}>Autres</span></span>
              </div>
            )}
          </div>
        </ChartCard>
      </div>


    </>
  );
}

// ═══════════════════════════════════════
// CLASSEMENT TAB
// ═══════════════════════════════════════
function ClassementTab({ leaderboard, levels, loading, copied, copyLink }) {
  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

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
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{l.min}+ deals · {l.rate}% com.</div>
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

      {/* Full ranking table */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['#', 'Partenaire', 'Niveau', 'Deals gagnés', `${rLabel} Généré`, 'Commissions', 'Conversion', 'Lien', 'Progression'].map((h, i) => (
                <th key={i} style={{ padding: '13px 14px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {leaderboard.map(p => {
              const lc = LEVEL_COLORS[p.level] || LEVEL_COLORS.Bronze;
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '13px 14px', fontWeight: 800, color: p.rank <= 3 ? '#f59e0b' : '#94a3b8', fontSize: 16 }}>
                    {p.rank <= 3 ? ['🥇', '🥈', '🥉'][p.rank - 1] : p.rank}
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
                  <td style={{ padding: '13px 14px' }}>
                    {p.referral_code && (
                      <button onClick={() => copyLink(p.referral_code)} style={{ padding: '4px 8px', borderRadius: 6, background: copied === p.referral_code ? '#f0fdf4' : '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: '#475569', fontWeight: 500 }}>
                        {copied === p.referral_code ? <CheckCircle size={12} color="#16a34a" /> : <Copy size={12} />}
                        {p.referral_code}
                      </button>
                    )}
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
                      <span style={{ color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>Max ✨</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {leaderboard.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucun partenaire</div>}
      </div>
    </>
  );
}

// ═══════════════════════════════════════
// SHARED COMPONENTS
// ═══════════════════════════════════════
function PodiumCard({ partner: p, isFirst }) {
  const lc = LEVEL_COLORS[p.level] || LEVEL_COLORS.Bronze;
  return (
    <div style={{
      background: '#fff', borderRadius: 20, padding: isFirst ? 28 : 22, border: '1px solid #e2e8f0',
      textAlign: 'center', boxShadow: isFirst ? '0 8px 30px rgba(99,102,241,0.15)' : 'none',
      transform: isFirst ? 'scale(1)' : 'scale(0.95)',
    }}>
      <div style={{ fontSize: isFirst ? 40 : 32, marginBottom: 8 }}>{['🥇', '🥈', '🥉'][p.rank - 1]}</div>
      <div style={{ fontWeight: 800, color: '#0f172a', fontSize: isFirst ? 18 : 16, marginBottom: 4 }}>{p.name}</div>
      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: lc.bg, color: lc.color }}>{p.level_icon} {p.level}</span>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 20, marginTop: 16 }}>
        <div>
          <div style={{ fontSize: isFirst ? 24 : 20, fontWeight: 800, color: '#0f172a' }}>{p.won_deals}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>Deals</div>
        </div>
        <div>
          <div style={{ fontSize: isFirst ? 24 : 20, fontWeight: 800, color: '#16a34a' }}>{fmt(p.total_commissions)}</div>
          <div style={{ color: '#94a3b8', fontSize: 11 }}>Commissions</div>
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

function PageLoader() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <p style={{ color: '#94a3b8' }}>Chargement...</p>
    </div>
  );
}
