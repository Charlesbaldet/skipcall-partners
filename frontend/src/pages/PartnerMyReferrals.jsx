import { useState, useEffect } from 'react';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate } from '../lib/constants';
import { FileText, TrendingUp, DollarSign, Eye } from 'lucide-react';

export default function PartnerMyReferrals() {
  const [referrals, setReferrals] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    Promise.all([api.getReferrals(), api.getKPIs()]).then(([r, k]) => {
      setReferrals(r.referrals);
      setKpis(k);
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>Mes recommandations</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>Suivez l'avancement de vos mises en relation</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <PKPI icon={FileText} label="Total" value={kpis?.total_referrals || 0} color="#6366f1" />
        <PKPI icon={TrendingUp} label="Gagnés" value={kpis?.won_count || 0} sub={fmt(kpis?.total_revenue || 0)} color="#16a34a" />
        <PKPI icon={DollarSign} label="Ma Commission" value={fmt(kpis?.total_commission || 0)} color="#f59e0b" />
      </div>

      {/* Referrals list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {referrals.length === 0 ? (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
            <p style={{ color: '#94a3b8', marginBottom: 16 }}>Aucune recommandation pour le moment.</p>
            <a href="/partner/submit" style={{ color: '#6366f1', fontWeight: 600 }}>Créer ma première recommandation →</a>
          </div>
        ) : referrals.map(r => (
          <div key={r.id} style={{ background: '#fff', borderRadius: 16, padding: 20, border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'border-color 0.15s' }}
            onClick={() => setSelected(selected?.id === r.id ? null : r)}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#6366f1'}
            onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 16 }}>{r.prospect_name}</div>
                  <div style={{ color: '#64748b', fontSize: 13 }}>{r.prospect_company} · {fmtDate(r.created_at)}</div>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: LEVEL_CONFIG[r.recommendation_level]?.bg, color: LEVEL_CONFIG[r.recommendation_level]?.color }}>{LEVEL_CONFIG[r.recommendation_level]?.label}</span>
                <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: STATUS_CONFIG[r.status]?.bg, color: STATUS_CONFIG[r.status]?.color }}>{STATUS_CONFIG[r.status]?.label}</span>
                {r.deal_value > 0 && <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{fmt(r.deal_value)}</span>}
              </div>
            </div>

            {/* Expanded detail */}
            {selected?.id === r.id && (
              <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid #f1f5f9' }} className="fade-in">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, fontSize: 13, marginBottom: 12 }}>
                  <div><span style={{ color: '#94a3b8', fontSize: 11 }}>Email</span><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2 }}>{r.prospect_email}</div></div>
                  <div><span style={{ color: '#94a3b8', fontSize: 11 }}>Téléphone</span><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2 }}>{r.prospect_phone || '—'}</div></div>
                  <div><span style={{ color: '#94a3b8', fontSize: 11 }}>Rôle</span><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2 }}>{r.prospect_role || '—'}</div></div>
                </div>
                {r.notes && (
                  <div style={{ background: '#fffbeb', borderRadius: 10, padding: 12, color: '#92400e', fontSize: 13, lineHeight: 1.5, borderLeft: '3px solid #f59e0b' }}>{r.notes}</div>
                )}
                {r.status === 'won' && r.deal_value > 0 && (
                  <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 12, marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <DollarSign size={16} color="#16a34a" />
                    <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 14 }}>Deal gagné — Commission en attente de traitement</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PKPI({ icon: Icon, label, value, sub, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
          {sub && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </div>
  );
}
