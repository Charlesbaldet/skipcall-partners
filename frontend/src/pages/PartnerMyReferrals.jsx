import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate } from '../lib/constants';
import { FileText, TrendingUp, DollarSign, Trash2, LayoutGrid, List, ChevronRight, X } from 'lucide-react';

const KANBAN_STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'duplicate'];

export default function PartnerMyReferrals() {
  const { t } = useTranslation();
  const [referrals, setReferrals] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewMode, setViewMode] = useState('kanban');

  const load = async () => {
    try {
      const [r, k] = await Promise.all([api.getReferrals(), api.getKPIs()]);
      setReferrals(r.referrals);
      setKpis(k);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const handleDelete = async (id) => {
    if (!confirm('Supprimer cette recommandation ?')) return;
    setDeleting(id);
    try {
      await api.deleteReferral(id);
      setReferrals(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) setSelected(null);
      const k = await api.getKPIs();
      setKpis(k);
    } catch (err) { alert(err.message); }
    setDeleting(null);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>Mes recommandations</h1>
          <p style={{ color: '#64748b' }}>Suivez l'avancement de vos mises en relation</p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          <button onClick={() => setViewMode('kanban')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={14} /> Kanban</button>
          <button onClick={() => setViewMode('table')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><List size={14} /> Table</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <PKPI icon={FileText} label="Total" value={kpis?.total_referrals || 0} color="var(--rb-primary, #059669)" />
        <PKPI icon={TrendingUp} label="Gagnés" value={kpis?.won_count || 0} sub={fmt(kpis?.total_revenue || 0)} color="#16a34a" />
        <PKPI icon={DollarSign} label="Ma Commission" value={fmt(kpis?.total_commission || 0)} color="var(--rb-accent, #f97316)" />
      </div>

      {referrals.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>Aucune recommandation pour le moment.</p>
          <a href="/partner/submit" style={{ color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>Créer ma première recommandation →</a>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView referrals={referrals} onSelect={setSelected} />
      ) : (
        <TableView referrals={referrals} onSelect={setSelected} />
      )}

      {selected && (
        <DetailModal
          referral={selected}
          onClose={() => setSelected(null)}
          onDelete={selected.status === 'new' ? () => handleDelete(selected.id) : null}
          deleting={deleting === selected.id}
        />
      )}
    </div>
  );
}

function KanbanView({ referrals, onSelect }) {
  return (
    <div style={{ overflow: 'hidden', borderRadius: 16 }}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, height: 'calc(100vh - 320px)', minHeight: 400 }}>
        {KANBAN_STATUSES.map(status => {
          const sc = STATUS_CONFIG[status];
          const cards = referrals.filter(r => r.status === status);
          return (
            <div key={status} style={{ minWidth: 260, width: 260, flexShrink: 0, background: '#f8fafc', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{sc.label}</span>
                </div>
                <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{cards.length}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                {cards.map(r => (
                  <div key={r.id} onClick={() => onSelect(r)} style={{ background: '#fff', borderRadius: 12, padding: 14, cursor: 'pointer', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, marginBottom: 4 }}>{r.prospect_name}</div>
                    {r.prospect_company && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{r.prospect_company}</div>}
                    {r.deal_value > 0 && <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{fmt(r.deal_value)}</div>}
                  </div>
                ))}
                {cards.length === 0 && <div style={{ color: '#cbd5e1', fontSize: 12, textAlign: 'center', padding: 16 }}>Aucune</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TableView({ referrals, onSelect }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {['Prospect', 'Niveau', 'Statut', 'Valeur', 'Date', ''].map((h, i) => (
              <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {referrals.map(r => (
            <tr key={r.id} onClick={() => onSelect(r)} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
              <td style={{ padding: '13px 16px' }}>
                <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.prospect_name}</div>
                <div style={{ color: '#94a3b8', fontSize: 12 }}>{r.prospect_company}</div>
              </td>
              <td style={{ padding: '13px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: LEVEL_CONFIG[r.recommendation_level]?.bg, color: LEVEL_CONFIG[r.recommendation_level]?.color }}>{LEVEL_CONFIG[r.recommendation_level]?.label}</span></td>
              <td style={{ padding: '13px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: STATUS_CONFIG[r.status]?.bg, color: STATUS_CONFIG[r.status]?.color }}>{STATUS_CONFIG[r.status]?.label}</span></td>
              <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0f172a' }}>{r.deal_value > 0 ? fmt(r.deal_value) : '—'}</td>
              <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: 13 }}>{fmtDate(r.created_at)}</td>
              <td style={{ padding: '13px 16px' }}><ChevronRight size={16} color="#94a3b8" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailModal({ referral, onClose, onDelete, deleting }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 520, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: '28px 32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{referral.prospect_name}</h2>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: LEVEL_CONFIG[referral.recommendation_level]?.bg, color: LEVEL_CONFIG[referral.recommendation_level]?.color }}>{LEVEL_CONFIG[referral.recommendation_level]?.label}</span>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: STATUS_CONFIG[referral.status]?.bg, color: STATUS_CONFIG[referral.status]?.color }}>{STATUS_CONFIG[referral.status]?.label}</span>
            </div>
            <p style={{ color: '#64748b', fontSize: 13 }}>{referral.prospect_company}</p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#475569" /></button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <Field label="Email" value={referral.prospect_email} />
          <Field label="Téléphone" value={referral.prospect_phone || '—'} />
          <Field label="Rôle" value={referral.prospect_role || '—'} />
          <Field label="Date" value={fmtDate(referral.created_at)} />
          {referral.deal_value > 0 && <Field label="Valeur deal" value={fmt(referral.deal_value)} />}
        </div>

        {referral.notes && (
          <div style={{ background: '#fffbeb', borderRadius: 10, padding: 14, color: '#92400e', fontSize: 13, lineHeight: 1.5, borderLeft: '3px solid #f59e0b', marginBottom: 18 }}>{referral.notes}</div>
        )}

        {referral.status === 'won' && referral.deal_value > 0 && (
          <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
            <DollarSign size={16} color="#16a34a" />
            <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>Deal gagné — Commission en attente de traitement</span>
          </div>
        )}

        {onDelete && (
          <button onClick={onDelete} disabled={deleting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}>
            <Trash2 size={14} /> {deleting ? 'Suppression...' : 'Supprimer'}
          </button>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div>
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
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={18} color={color} />
        </div>
      </div>
    </div>
  );
}
