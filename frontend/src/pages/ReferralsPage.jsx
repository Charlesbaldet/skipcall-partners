import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, STATUS_ORDER, fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { X, ChevronRight, Clock, Trash2, List, LayoutGrid, GripVertical } from 'lucide-react';

const KANBAN_STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'duplicate'];

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [partners, setPartners] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', partner_id: 'all' });
  const [selected, setSelected] = useState(null);
  const [activities, setActivities] = useState([]);
  const [viewMode, setViewMode] = useState('kanban');
  const [kanbanLimits, setKanbanLimits] = useState({});
  const [showConfetti, setShowConfetti] = useState(false);
  const [draggedId, setDraggedId] = useState(null);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.partner_id !== 'all') params.partner_id = filters.partner_id;
      const [refData, partData] = await Promise.all([api.getReferrals(params), api.getPartners()]);
      setReferrals(refData.referrals); setTotal(refData.total); setPartners(partData.partners);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (ref) => {
    setSelected(ref);
    try {
      const data = await api.getReferral(ref.id);
      setActivities(data.activities || []);
      if (data.referral) setSelected(data.referral);
    } catch {}
  };

  const handleUpdate = async (id, updates) => {
    try {
      const { referral } = await api.updateReferral(id, updates);
      setReferrals(prev => prev.map(r => r.id === id ? { ...r, ...referral } : r));
      setSelected(prev => prev ? { ...prev, ...referral } : null);
      const data = await api.getReferral(id);
      setActivities(data.activities || []);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Supprimer ce referral ?')) return;
    try { await api.deleteReferral(id); setSelected(null); setActivities([]); load(); } catch (err) { alert(err.message); }
  };

  // Kanban drag & drop
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, newStatus) => {
    e.preventDefault();
    if (!draggedId) return;
    const ref = referrals.find(r => r.id === draggedId);
    if (!ref || ref.status === newStatus) { setDraggedId(null); return; }

    // Easter egg: confetti on won!
    if (newStatus === 'won') {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }

    try {
      const { referral } = await api.updateReferral(draggedId, { status: newStatus, deal_value: ref.deal_value || 0, engagement: ref.engagement || 'monthly' });
      setReferrals(prev => prev.map(r => r.id === draggedId ? { ...r, ...referral } : r));
    } catch (err) { console.error(err); }
    setDraggedId(null);
  };

  const handleStatusChangeFromCard = async (id, newStatus) => {
    const ref = referrals.find(r => r.id === id);
    if (!ref) return;
    if (newStatus === 'won') {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    try {
      const { referral } = await api.updateReferral(id, { status: newStatus, deal_value: ref.deal_value || 0, engagement: ref.engagement || 'monthly' });
      setReferrals(prev => prev.map(r => r.id === id ? { ...r, ...referral } : r));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="fade-in">
      {/* Confetti */}
      {showConfetti && <Confetti />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Pipeline</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>{total} recommandation{total > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setViewMode('table')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><List size={14} /> Table</button>
            <button onClick={() => setViewMode('kanban')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><LayoutGrid size={14} /> Kanban</button>
          </div>

          <Select value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}>
            <option value="all">Tous les statuts</option>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
          <Select value={filters.partner_id} onChange={v => setFilters(f => ({ ...f, partner_id: v }))}>
            <option value="all">Tous les partenaires</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Prospect', 'Partenaire', 'Niveau', 'Statut', 'Valeur', 'Date', ''].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucun résultat</td></tr>
              ) : referrals.map(r => (
                <tr key={r.id} onClick={() => openDetail(r)} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.prospect_name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{r.prospect_company}</div>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569' }}>{r.partner_name}</td>
                  <td style={{ padding: '13px 16px' }}><Badge config={LEVEL_CONFIG} value={r.recommendation_level} /></td>
                  <td style={{ padding: '13px 16px' }}><Badge config={STATUS_CONFIG} value={r.status} /></td>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0f172a' }}>{r.deal_value > 0 ? fmt(r.deal_value) : '—'}</td>
                  <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: 13 }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '13px 16px' }}><ChevronRight size={16} color="#94a3b8" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* KANBAN VIEW */
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 16, minHeight: 500 }}>
          {KANBAN_STATUSES.map(status => {
            const sc = STATUS_CONFIG[status];
            const allCards = referrals.filter(r => r.status === status);
            const limit = kanbanLimits[status] || 25;
            const cards = allCards.slice(0, limit);
            const hasMore = allCards.length > limit;
            return (
              <div key={status}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.boxShadow = `inset 0 0 0 2px ${sc.color}`; }}
                onDragLeave={e => { e.currentTarget.style.boxShadow = 'none'; }}
                onDrop={e => { e.currentTarget.style.boxShadow = 'none'; handleDrop(e, status); }}
                style={{
                  minWidth: 250, flex: 1, background: '#fff', borderRadius: 14,
                  padding: 10, display: 'flex', flexDirection: 'column',
                  border: '1px solid #e2e8f0', boxShadow: 'none', transition: 'box-shadow 0.15s',
                }}
              >
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', marginBottom: 8, background: `${sc.color}08`, borderRadius: 10, borderBottom: `3px solid ${sc.color}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: sc.color }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{sc.label}</span>
                  </div>
                  <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{allCards.length}</span>
                </div>

                {/* Cards */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 60 }}>
                  {cards.map(r => (
                    <div key={r.id} draggable onDragStart={e => handleDragStart(e, r.id)}
                      onClick={() => openDetail(r)}
                      style={{
                        background: '#f8fafc', borderRadius: 12, padding: 14, cursor: 'grab',
                        border: `1px solid ${draggedId === r.id ? sc.color : '#e2e8f0'}`,
                        boxShadow: draggedId === r.id ? `0 4px 12px ${sc.color}20` : '0 1px 2px rgba(0,0,0,0.04)',
                        opacity: draggedId === r.id ? 0.5 : 1, transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{r.prospect_name}</div>
                        <GripVertical size={14} color="#cbd5e1" />
                      </div>
                      {r.prospect_company && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{r.prospect_company}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: '#6366f1', fontSize: 11, fontWeight: 600 }}>{r.partner_name}</span>
                        {r.deal_value > 0 && <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{fmt(r.deal_value)}</span>}
                      </div>
                      {/* Quick status change */}
                      <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                        <select value={r.status} onChange={e => { e.stopPropagation(); handleStatusChangeFromCard(r.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: `1px solid ${sc.color}30`, background: sc.bg, color: sc.color, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                        </select>
                      </div>
                    </div>
                  ))}
                  {hasMore && (
                    <button onClick={() => setKanbanLimits(prev => ({ ...prev, [status]: limit + 25 }))} style={{
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

      {selected && (
        <DetailModal referral={selected} activities={activities}
          onClose={() => { setSelected(null); setActivities([]); }}
          onUpdate={handleUpdate} onDelete={handleDelete}
        />
      )}
    </div>
  );
}

// ═══ CONFETTI EASTER EGG ═══
function Confetti() {
  const colors = ['#6366f1', '#f59e0b', '#16a34a', '#dc2626', '#ec4899', '#0ea5e9', '#8b5cf6', '#f97316'];
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i, left: Math.random() * 100, delay: Math.random() * 0.5,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8, duration: 1.5 + Math.random() * 2,
    rotate: Math.random() * 360, drift: -50 + Math.random() * 100,
  }));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none', overflow: 'hidden' }}>
      <style>{`
        @keyframes confetti-fall {
          0% { transform: translateY(-20px) translateX(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) translateX(var(--drift)) rotate(var(--rotate)); opacity: 0; }
        }
      `}</style>
      {pieces.map(p => (
        <div key={p.id} style={{
          position: 'absolute', top: -20, left: `${p.left}%`,
          width: p.size, height: p.size * 0.6, background: p.color,
          borderRadius: 2, '--drift': `${p.drift}px`, '--rotate': `${p.rotate}deg`,
          animation: `confetti-fall ${p.duration}s ease-out ${p.delay}s forwards`,
        }} />
      ))}
    </div>
  );
}

// ═══ DETAIL MODAL (unchanged from original) ═══
function DetailModal({ referral, activities, onClose, onUpdate, onDelete }) {
  const [editStatus, setEditStatus] = useState(referral.status);
  const [editValue, setEditValue] = useState(referral.deal_value || '');
  const [saving, setSaving] = useState(false);
  const [editEngagement, setEditEngagement] = useState(referral.engagement || 'monthly');
  const [tab, setTab] = useState('info');

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(referral.id, { status: editStatus, deal_value: Number(editValue) || 0, engagement: editEngagement });
    setSaving(false);
  };

  const rate = referral.commission_rate || 10;
  const commission = editStatus === 'won' ? (Number(editValue) || 0) * rate / 100 : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 680, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>{referral.prospect_name}</h2>
              <Badge config={LEVEL_CONFIG} value={referral.recommendation_level} />
            </div>
            <p style={{ color: '#64748b', fontSize: 14 }}>{referral.prospect_company} · {referral.partner_name}</p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 38, height: 38, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} color="#475569" /></button>
        </div>
        <div style={{ padding: '16px 32px 0', display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
          {[{ id: 'info', label: 'Informations' }, { id: 'pipeline', label: 'Pipeline' }, { id: 'history', label: `Historique (${activities.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === t.id ? '#6366f1' : '#64748b', borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent', background: 'transparent', marginBottom: -1 }}>{t.label}</button>
          ))}
        </div>
        <div style={{ padding: '24px 32px 28px' }}>
          {tab === 'info' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
                <InfoRow label="Email" value={referral.prospect_email} />
                <InfoRow label="Téléphone" value={referral.prospect_phone || '—'} />
                <InfoRow label="Rôle" value={referral.prospect_role || '—'} />
                <InfoRow label="Partenaire" value={referral.partner_name} />
                <InfoRow label="Assigné à" value={referral.assigned_name || 'Non assigné'} />
                <InfoRow label="Créé le" value={fmtDate(referral.created_at)} />
              </div>
              {referral.notes && (
                <div>
                  <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Notes du partenaire</div>
                  <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, color: '#92400e', fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid #f59e0b' }}>{referral.notes}</div>
                </div>
              )}
            </div>
          )}
          {tab === 'pipeline' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 10 }}>Statut</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setEditStatus(k)} style={{ padding: '8px 14px', borderRadius: 10, border: editStatus === k ? `2px solid ${v.color}` : '2px solid #e2e8f0', background: editStatus === k ? v.bg : '#fff', color: v.color, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{v.label}</button>
                  ))}
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>MRR (€ / mois)</div>
                <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Ex: 24000" style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 600, color: '#0f172a', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Engagement</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['monthly', 'Mensuel'], ['quarterly', 'Trimestriel'], ['yearly', 'Annuel']].map(([k, label]) => (
                    <button key={k} onClick={() => setEditEngagement(k)} style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: editEngagement === k ? '2px solid #6366f1' : '2px solid #e2e8f0', background: editEngagement === k ? '#eef2ff' : '#fff', color: editEngagement === k ? '#6366f1' : '#64748b' }}>{label}</button>
                  ))}
                </div>
              </div>
              {editStatus === 'won' && Number(editValue) > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#fef3c7,#fffbeb)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #fcd34d' }}>
                  <div style={{ color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Commission estimée</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>{fmt(commission)}</span>
                    <span style={{ color: '#92400e', fontSize: 13 }}>({rate}% de {fmt(Number(editValue))})</span>
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 15px rgba(99,102,241,0.3)', opacity: saving ? 0.7 : 1 }}>{saving ? 'Enregistrement...' : 'Sauvegarder'}</button>
                <button onClick={() => onDelete(referral.id)} style={{ padding: '14px 20px', borderRadius: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Trash2 size={16} /> Supprimer</button>
              </div>
            </div>
          )}
          {tab === 'history' && (
            <div>
              {activities.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Aucune activité</div>
              ) : (
                <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {activities.map(a => (
                    <div key={a.id} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -26, top: 4, width: 10, height: 10, borderRadius: '50%', background: '#6366f1', border: '2px solid #fff', boxShadow: '0 0 0 2px #e2e8f0' }} />
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{fmtDateTime(a.created_at)} · {a.user_name}</div>
                      <div style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{formatActivity(a)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatActivity(a) {
  switch (a.action) {
    case 'created': return 'Recommandation créée';
    case 'status_change': return `Statut: ${STATUS_CONFIG[a.old_value]?.label || a.old_value} → ${STATUS_CONFIG[a.new_value]?.label || a.new_value}`;
    case 'value_updated': return `Valeur mise à jour: ${fmt(a.new_value)}`;
    case 'engagement_updated': return `Engagement mis à jour: ${a.new_value}`;
    case 'assigned': return 'Assigné à un commercial';
    case 'note_added': return `Note: ${a.new_value}`;
    default: return a.action;
  }
}

function Badge({ config, value }) {
  const c = config[value];
  if (!c) return <span>{value}</span>;
  return <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: c.bg, color: c.color, whiteSpace: 'nowrap' }}>{c.label}</span>;
}

function InfoRow({ label, value }) {
  return (<div><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div></div>);
}

function Select({ value, onChange, children }) {
  return (<select value={value} onChange={e => onChange(e.target.value)} style={{ padding: '8px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>{children}</select>);
}
