import { useState, useEffect } from 'react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { DollarSign, CheckCircle, Clock, CreditCard, AlertTriangle } from 'lucide-react';

const COM_STATUS = {
  pending: { label: 'En attente', color: '#f59e0b', bg: '#fffbeb', icon: Clock },
  approved: { label: 'Approuvée', color: '#6366f1', bg: '#eef2ff', icon: CheckCircle },
  paid: { label: 'Payée', color: '#16a34a', bg: '#f0fdf4', icon: CreditCard },
};

export default function CommissionsPage() {
  const [summary, setSummary] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [totals, setTotals] = useState({ pending: 0, paid: 0 });
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('summary');

  useEffect(() => {
    Promise.all([api.getCommissionsSummary(), api.getCommissions()]).then(([s, c]) => {
      setSummary(s.summary);
      setCommissions(c.commissions);
      setTotals({ pending: c.totalPending, paid: c.totalPaid });
    }).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleStatusChange = async (id, status) => {
    try {
      await api.updateCommission(id, status);
      const c = await api.getCommissions();
      setCommissions(c.commissions);
      setTotals({ pending: c.totalPending, paid: c.totalPaid });
      const s = await api.getCommissionsSummary();
      setSummary(s.summary);
    } catch (err) { console.error(err); }
  };

  const totalAll = summary.reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);
  const filtered = filterStatus === 'all' ? commissions : commissions.filter(c => c.status === filterStatus);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>Commissions</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>Suivi des commissions partenaires</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <ComKPI icon={DollarSign} label="Total Commissions" value={fmt(totalAll)} color="#6366f1" />
        <ComKPI icon={Clock} label="En attente" value={fmt(totals.pending)} color="#f59e0b" />
        <ComKPI icon={CheckCircle} label="Payées" value={fmt(totals.paid)} color="#16a34a" />
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        {[{ id: 'summary', label: 'Par partenaire' }, { id: 'detail', label: 'Détail' }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0f172a' : '#64748b',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'summary' ? (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Partenaire', 'Taux', 'Deals', 'CA Généré', 'En attente', 'Approuvé', 'Payé', 'Total'].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{p.contact_name}</div>
                  </td>
                  <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700, fontSize: 12 }}>{p.commission_rate}%</span></td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{p.total_commissions}</td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(p.total_deal_value)}</td>
                  <td style={{ padding: '13px 16px', color: '#f59e0b', fontWeight: 600 }}>{fmt(p.pending_amount)}</td>
                  <td style={{ padding: '13px 16px', color: '#6366f1', fontWeight: 600 }}>{fmt(p.approved_amount)}</td>
                  <td style={{ padding: '13px 16px', color: '#16a34a', fontWeight: 600 }}>{fmt(p.paid_amount)}</td>
                  <td style={{ padding: '13px 16px', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{fmt(p.total_amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background: '#fefce8' }}>
                <td colSpan={7} style={{ padding: '13px 16px', fontWeight: 700, color: '#0f172a' }}>Total</td>
                <td style={{ padding: '13px 16px', fontWeight: 800, color: '#f59e0b', fontSize: 18 }}>{fmt(totalAll)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
              style={{ padding: '8px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>
              <option value="all">Tous les statuts</option>
              {Object.entries(COM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>

          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  {['Prospect', 'Partenaire', 'Taux', 'Deal', 'Commission', 'Statut', 'Valid\u00e9 le', '\u00c9ch\u00e9ance', 'Action'].map((h, i) => (
                    <th key={i} style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const cs = COM_STATUS[c.status];
                  return (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '13px 16px' }}>
                        <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name}</div>
                        <div style={{ color: '#94a3b8', fontSize: 12 }}>{c.prospect_company}</div>
                      </td>
                      <td style={{ padding: '13px 16px', color: '#475569' }}>{c.partner_name}</td>
                      <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700, fontSize: 12 }}>{c.rate}%</span></td>
                      <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(c.deal_value)}</td>
                      <td style={{ padding: '13px 16px', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{fmt(c.amount)}</td>
                      <td style={{ padding: '13px 16px' }}>
                        <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: cs.bg, color: cs.color }}>{cs.label}</span>
                      </td>
                      <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 12 }}>{c.approved_at ? fmtDate(c.approved_at) : '\u2014'}</td>
                      <td style={{ padding: '13px 16px', fontSize: 12 }}>
                        {c.payment_due_date ? (
                          <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.is_late ? '#dc2626' : '#64748b', fontWeight: c.is_late ? 700 : 400 }}>
                            {c.is_late && <AlertTriangle size={14} />}
                            {fmtDate(c.payment_due_date)}
                          </span>
                        ) : '\u2014'}
                      </td>
                      <td style={{ padding: '13px 16px' }}>
                        {c.status === 'pending' && (
                          <button onClick={() => handleStatusChange(c.id, 'approved')} style={{ padding: '6px 12px', borderRadius: 8, background: '#eef2ff', border: 'none', color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Approuver</button>
                        )}
                        {c.status === 'approved' && (
                          <button onClick={() => handleStatusChange(c.id, 'paid')} style={{ padding: '6px 12px', borderRadius: 8, background: '#f0fdf4', border: 'none', color: '#16a34a', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Marquer payée</button>
                        )}
                        {c.status === 'paid' && <span style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(c.paid_at)}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucune commission</div>}
          </div>
        </>
      )}
    </div>
  );
}

function ComKPI({ icon: Icon, label, value, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}
