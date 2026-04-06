import { useState, useEffect } from 'react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { DollarSign, CheckCircle, Clock, CreditCard, AlertTriangle, Download, X, Building, User, Banknote, List, LayoutGrid } from 'lucide-react';

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
  const [viewMode, setViewMode] = useState('kanban');
  const [payModal, setPayModal] = useState(null);
  const [paying, setPaying] = useState(false);
  const [comLimits, setComLimits] = useState({});

  const reload = async () => {
    const [s, c] = await Promise.all([api.getCommissionsSummary(), api.getCommissions()]);
    setSummary(s.summary); setCommissions(c.commissions);
    setTotals({ pending: c.totalPending, paid: c.totalPaid });
  };

  useEffect(() => { reload().catch(console.error).finally(() => setLoading(false)); }, []);

  const handleStatusChange = async (id, status) => {
    try { await api.updateCommission(id, status); await reload(); } catch (err) { console.error(err); }
  };

  const handlePayClick = async (commission) => {
    try {
      const partnerData = await api.getPartner(commission.partner_id);
      setPayModal({ commission, partner: partnerData.partner || partnerData });
    } catch (err) {
      setPayModal({ commission, partner: { name: commission.partner_name, contact_name: commission.partner_contact } });
    }
  };

  const handleConfirmPay = async () => {
    setPaying(true);
    try { await api.updateCommission(payModal.commission.id, 'paid'); setPayModal(null); await reload(); }
    catch (err) { alert('Erreur lors du paiement'); }
    setPaying(false);
  };

  const exportCSV = () => {
    const headers = ['Prospect', 'Entreprise', 'Partenaire', 'Taux %', 'Deal €', 'Commission €', 'Statut', 'Date création', 'Date validation', 'Date paiement'];
    const rows = commissions.map(c => [c.prospect_name, c.prospect_company, c.partner_name, c.rate, c.deal_value, c.amount, COM_STATUS[c.status]?.label || c.status, c.created_at?.split('T')[0] || '', c.approved_at?.split('T')[0] || '', c.paid_at?.split('T')[0] || '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `commissions_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const totalAll = summary.reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);
  const filtered = filterStatus === 'all' ? commissions : commissions.filter(c => c.status === filterStatus);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>Commissions</h1>
          <p style={{ color: '#64748b', marginBottom: 24 }}>Suivi des commissions partenaires</p>
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Download size={14} /> Export CSV
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <ComKPI icon={DollarSign} label="Total Commissions" value={fmt(totalAll)} color="#6366f1" />
        <ComKPI icon={Clock} label="En attente" value={fmt(totals.pending)} color="#f59e0b" />
        <ComKPI icon={CheckCircle} label="Payées" value={fmt(totals.paid)} color="#16a34a" />
      </div>

      {/* Tabs + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {[{ id: 'summary', label: 'Par partenaire' }, { id: 'detail', label: 'Détail' }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0f172a' : '#64748b',
              boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {tab === 'detail' && (
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setViewMode('kanban')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><LayoutGrid size={14} /> Kanban</button>
            <button onClick={() => setViewMode('table')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><List size={14} /> Table</button>
          </div>
        )}
      </div>

      {tab === 'summary' && (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {['Partenaire', 'Taux', 'Deals', 'MRR Généré', 'En attente', 'Approuvé', 'Payé', 'Total'].map((h, i) => (
                <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{summary.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '13px 16px' }}><div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div><div style={{ color: '#94a3b8', fontSize: 12 }}>{p.contact_name}</div></td>
                <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700, fontSize: 12 }}>{p.commission_rate}%</span></td>
                <td style={{ padding: '13px 16px', fontWeight: 600 }}>{p.total_commissions}</td>
                <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(p.total_deal_value)}</td>
                <td style={{ padding: '13px 16px', color: '#f59e0b', fontWeight: 600 }}>{fmt(p.pending_amount)}</td>
                <td style={{ padding: '13px 16px', color: '#6366f1', fontWeight: 600 }}>{fmt(p.approved_amount)}</td>
                <td style={{ padding: '13px 16px', color: '#16a34a', fontWeight: 600 }}>{fmt(p.paid_amount)}</td>
                <td style={{ padding: '13px 16px', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{fmt(p.total_amount)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr style={{ background: '#fefce8' }}>
              <td colSpan={7} style={{ padding: '13px 16px', fontWeight: 700, color: '#0f172a' }}>Total</td>
              <td style={{ padding: '13px 16px', fontWeight: 800, color: '#f59e0b', fontSize: 18 }}>{fmt(totalAll)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {tab === 'detail' && viewMode === 'kanban' && (
        <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 280px)', minHeight: 400 }}>
          {Object.entries(COM_STATUS).map(([status, sc]) => {
            const allCards = commissions.filter(c => c.status === status);
            const limit = comLimits[status] || 25;
            const cards = allCards.slice(0, limit);
            const hasMore = allCards.length > limit;
            return (
              <div key={status} style={{ flex: 1, background: '#f8fafc', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{sc.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 13, color: sc.color }}>{fmt(allCards.reduce((s, c) => s + parseFloat(c.amount), 0))}</span>
                    <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{allCards.length}</span>
                  </div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                  {cards.map(c => (
                    <div key={c.id} style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, marginBottom: 4 }}>{c.prospect_name}</div>
                      {c.prospect_company && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{c.prospect_company}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ color: '#6366f1', fontSize: 11, fontWeight: 600 }}>{c.partner_name}</span>
                        <span style={{ fontWeight: 800, color: sc.color, fontSize: 15 }}>{fmt(c.amount)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>
                        <span>Deal: {fmt(c.deal_value)}</span>
                        <span>{c.rate}%</span>
                      </div>
                      {status === 'pending' && (
                        <button onClick={() => handleStatusChange(c.id, 'approved')} style={{ width: '100%', padding: '7px', borderRadius: 8, background: '#eef2ff', border: 'none', color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Approuver</button>
                      )}
                      {status === 'approved' && (
                        <button onClick={() => handlePayClick(c)} style={{ width: '100%', padding: '7px', borderRadius: 8, background: '#f0fdf4', border: 'none', color: '#16a34a', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                          <CreditCard size={12} /> Payer
                        </button>
                      )}
                      {status === 'paid' && c.paid_at && (
                        <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>Payée le {fmtDate(c.paid_at)}</div>
                      )}
                    </div>
                  ))}
                  {cards.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#cbd5e1', fontSize: 13 }}>Aucune commission</div>}
                  {hasMore && (
                    <button onClick={() => setComLimits(prev => ({ ...prev, [status]: limit + 25 }))} style={{
                      padding: '10px', borderRadius: 10, border: '1px dashed #cbd5e1', background: 'transparent',
                      color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer', textAlign: 'center',
                    }}>Voir plus ({allCards.length - limit} restants)</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'detail' && viewMode === 'table' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>
              <option value="all">Tous les statuts</option>
              {Object.entries(COM_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Prospect', 'Partenaire', 'Taux', 'Deal', 'Commission', 'Statut', 'Validé le', 'Échéance', 'Action'].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{filtered.map(c => {
                const cs = COM_STATUS[c.status];
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '13px 16px' }}><div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name}</div><div style={{ color: '#94a3b8', fontSize: 12 }}>{c.prospect_company}</div></td>
                    <td style={{ padding: '13px 16px', color: '#475569' }}>{c.partner_name}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700, fontSize: 12 }}>{c.rate}%</span></td>
                    <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(c.deal_value)}</td>
                    <td style={{ padding: '13px 16px', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{fmt(c.amount)}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: cs.bg, color: cs.color }}>{cs.label}</span></td>
                    <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 12 }}>{c.approved_at ? fmtDate(c.approved_at) : '—'}</td>
                    <td style={{ padding: '13px 16px', fontSize: 12 }}>
                      {c.payment_due_date ? (<span style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.is_late ? '#dc2626' : '#64748b', fontWeight: c.is_late ? 700 : 400 }}>{c.is_late && <AlertTriangle size={14} />}{fmtDate(c.payment_due_date)}</span>) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {c.status === 'pending' && <button onClick={() => handleStatusChange(c.id, 'approved')} style={{ padding: '6px 12px', borderRadius: 8, background: '#eef2ff', border: 'none', color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>Approuver</button>}
                      {c.status === 'approved' && <button onClick={() => handlePayClick(c)} style={{ padding: '6px 12px', borderRadius: 8, background: '#f0fdf4', border: 'none', color: '#16a34a', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><CreditCard size={12} /> Payer</button>}
                      {c.status === 'paid' && <span style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(c.paid_at)}</span>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucune commission</div>}
          </div>
        </>
      )}

      {/* Payment modal */}
      {payModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => setPayModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 480, maxWidth: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div><h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>Confirmer le paiement</h2><p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Vérifiez les informations avant de valider</p></div>
              <button onClick={() => setPayModal(null)} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#475569" /></button>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><Building size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: '#94a3b8', fontSize: 11 }}>Partenaire</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{payModal.partner.name || payModal.commission.partner_name}</div></div></div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><User size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: '#94a3b8', fontSize: 11 }}>Contact</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{payModal.partner.contact_name || payModal.commission.partner_contact}</div></div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}><Banknote size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: '#94a3b8', fontSize: 11 }}>IBAN</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, fontFamily: 'monospace' }}>{payModal.partner.iban || 'Non renseigné'}</div></div></div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><div style={{ color: '#94a3b8', fontSize: 11 }}>Prospect</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{payModal.commission.prospect_name}</div></div>
                <div><div style={{ color: '#94a3b8', fontSize: 11 }}>Deal</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{fmt(payModal.commission.deal_value)}</div></div>
                <div><div style={{ color: '#94a3b8', fontSize: 11 }}>Taux</div><div style={{ fontWeight: 600, color: '#6366f1', fontSize: 13 }}>{payModal.commission.rate}%</div></div>
              </div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderRadius: 14, padding: 20, textAlign: 'center', marginBottom: 24, border: '1px solid #bbf7d0' }}>
              <div style={{ color: '#16a34a', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Montant à verser</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#16a34a', letterSpacing: -1 }}>{fmt(payModal.commission.amount)}</div>
            </div>
            {!payModal.partner.iban && (<div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #fde68a' }}><AlertTriangle size={14} /> IBAN non renseigné.</div>)}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setPayModal(null)} style={{ flex: 1, padding: '13px', borderRadius: 12, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>Annuler</button>
              <button onClick={handleConfirmPay} disabled={paying} style={{ flex: 2, padding: '13px', borderRadius: 12, background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: paying ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
                <CreditCard size={16} /> {paying ? 'Validation...' : 'Confirmer le virement'}
              </button>
            </div>
          </div>
        </div>
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
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={color} /></div>
      </div>
    </div>
  );
}
