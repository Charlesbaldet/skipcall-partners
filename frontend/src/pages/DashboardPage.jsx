import { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Users, FileText, DollarSign, Target, Zap } from 'lucide-react';
import api from '../lib/api';
import { fmt, STATUS_CONFIG, LEVEL_CONFIG } from '../lib/constants';

const COLORS = ['#6366f1', '#0ea5e9', '#f59e0b', '#c026d3', '#16a34a', '#dc2626'];

export default function DashboardPage() {
  const [kpis, setKpis] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [topPartners, setTopPartners] = useState([]);
  const [levels, setLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [revenueCumul, setRevenueCumul] = useState(false);

  useEffect(() => {
    Promise.all([
      api.getKPIs(),
      api.getTimeline(6),
      api.getPipeline(),
      api.getTopPartners(),
      api.getLevels(),
    ]).then(([k, t, p, tp, l]) => {
      setKpis(k);
      setTimeline(t.timeline);
      setPipeline(p.pipeline);
      setTopPartners(tp.topPartners);
      setLevels(l.levels);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <PageLoader />;

  const pipelineData = pipeline.map(p => ({
    name: STATUS_CONFIG[p.status]?.label || p.status,
    count: parseInt(p.count),
    value: parseFloat(p.value),
    fill: STATUS_CONFIG[p.status]?.color || '#94a3b8',
  }));

  // Feature #4: enhanced level data with conversion rate
  const levelData = levels.map(l => {
    const total = parseInt(l.count);
    const won = parseInt(l.won);
    const convRate = total > 0 ? Math.round((won / total) * 100) : 0;
    return {
      name: LEVEL_CONFIG[l.level]?.label || l.level,
      total,
      won,
      lost: total - won,
      convRate,
      fill: LEVEL_CONFIG[l.level]?.color || '#94a3b8',
    };
  });

  const timelineData = timeline.map(t => ({
    month: new Date(t.month + '-01').toLocaleDateString('fr-FR', { month: 'short' }),
    total: parseInt(t.total),
    won: parseInt(t.won),
    lost: parseInt(t.lost),
    revenue: parseFloat(t.revenue),
  }));

  // Feature #5: compute cumulative revenue
  const revenueData = revenueCumul
    ? timelineData.reduce((acc, t, i) => {
        const cumul = (i > 0 ? acc[i - 1].revenue : 0) + t.revenue;
        acc.push({ ...t, revenue: cumul });
        return acc;
      }, [])
    : timelineData;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Dashboard</h1>
        <p style={{ color: '#64748b', marginTop: 4 }}>Vue d'ensemble de votre programme partenaires</p>
      </div>

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
        {/* Timeline chart */}
        <ChartCard title="Évolution mensuelle">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={timelineData} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="total" name="Total" fill="#6366f1" radius={[4,4,0,0]} />
              <Bar dataKey="won" name="Gagnés" fill="#16a34a" radius={[4,4,0,0]} />
              <Bar dataKey="lost" name="Perdus" fill="#dc2626" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Pipeline funnel */}
        <ChartCard title="Pipeline par statut">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pipelineData} dataKey="count" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={50} paddingAngle={3}>
                {pipelineData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      {/* Charts Row 2 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, marginBottom: 20 }}>
        {/* Revenue over time — Feature #5: cumul toggle */}
        <ChartCard title="MRR Généré (€)" action={
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
              <Line type="monotone" dataKey="revenue" name={revenueCumul ? 'MRR Cumulé' : 'MRR Mensuel'} stroke="#6366f1" strokeWidth={3} dot={{ r: 5, fill: '#6366f1' }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Feature #4: Improved level chart */}
        <ChartCard title="Performance par niveau de reco">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingTop: 4 }}>
            {levelData.map((l, idx) => (
              <div key={idx}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{l.name}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 }}>
                    <span style={{ color: '#64748b' }}>{l.total} referrals</span>
                    <span style={{ color: '#16a34a', fontWeight: 700 }}>{l.won} gagnés</span>
                    <span style={{
                      padding: '2px 10px', borderRadius: 20, fontWeight: 700, fontSize: 12,
                      background: l.convRate >= 50 ? '#f0fdf4' : l.convRate >= 25 ? '#fffbeb' : '#fef2f2',
                      color: l.convRate >= 50 ? '#16a34a' : l.convRate >= 25 ? '#f59e0b' : '#dc2626',
                    }}>{l.convRate}%</span>
                  </div>
                </div>
                {/* Stacked progress bar */}
                <div style={{ display: 'flex', height: 28, borderRadius: 8, overflow: 'hidden', background: '#f1f5f9' }}>
                  {l.won > 0 && (
                    <div style={{
                      width: `${(l.won / l.total) * 100}%`, background: 'linear-gradient(90deg, #22c55e, #16a34a)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, color: '#fff', minWidth: l.won > 0 ? 28 : 0,
                    }}>{l.won}</div>
                  )}
                  {l.lost > 0 && (
                    <div style={{
                      width: `${(l.lost / l.total) * 100}%`, background: '#e2e8f0',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 600, color: '#64748b', minWidth: l.lost > 0 ? 28 : 0,
                    }}>{l.lost}</div>
                  )}
                </div>
              </div>
            ))}
            {levelData.length === 0 && (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: 32, fontSize: 14 }}>Aucune donnée</div>
            )}
            {/* Legend */}
            {levelData.length > 0 && (
              <div style={{ display: 'flex', gap: 16, justifyContent: 'center', fontSize: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#16a34a' }}></span>
                  <span style={{ color: '#64748b' }}>Gagnés</span>
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: '#e2e8f0' }}></span>
                  <span style={{ color: '#64748b' }}>Autres</span>
                </span>
              </div>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Top Partners Table */}
      <ChartCard title="Top Partenaires">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                {['#', 'Partenaire', 'Referrals', 'Gagnés', 'MRR', 'Conversion', 'Taux com.'].map((h, i) => (
                  <th key={i} style={{ padding: '10px 14px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #f1f5f9' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topPartners.map((p, idx) => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '12px 14px', fontWeight: 700, color: idx < 3 ? '#6366f1' : '#94a3b8' }}>{idx + 1}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{p.name}</td>
                  <td style={{ padding: '12px 14px', color: '#475569' }}>{p.total_referrals}</td>
                  <td style={{ padding: '12px 14px', color: '#16a34a', fontWeight: 600 }}>{p.won_deals}</td>
                  <td style={{ padding: '12px 14px', fontWeight: 600 }}>{fmt(p.revenue)}</td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: parseFloat(p.win_rate) >= 50 ? '#f0fdf4' : '#fef2f2', color: parseFloat(p.win_rate) >= 50 ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 12 }}>{p.win_rate}%</span>
                  </td>
                  <td style={{ padding: '12px 14px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 600, fontSize: 12 }}>{p.commission_rate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>
    </div>
  );
}

function KPICard({ icon: Icon, label, value, sub, color, highlight }) {
  return (
    <div style={{
      padding: 20, borderRadius: 16,
      background: highlight ? 'linear-gradient(135deg,#fef3c7,#fffbeb)' : '#fff',
      border: highlight ? '1px solid #fcd34d' : '1px solid #e2e8f0',
      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
    }}>
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
