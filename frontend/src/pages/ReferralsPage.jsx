import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { X, ChevronRight, Clock, MessageSquare, Trash2 } from 'lucide-react';

export default function ReferralsPage() {
  const [referrals, setReferrals] = useState([]);
  const [partners, setPartners] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', partner_id: 'all' });
  const [selected, setSelected] = useState(null);
  const [activities, setActivities] = useState([]);

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.partner_id !== 'all') params.partner_id = filters.partner_id;
      const [refData, partData] = await Promise.all([api.getReferrals(params), api.getPartners()]);
      setReferrals(refData.referrals);
      setTotal(refData.total);
      setPartners(partData.partners);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const openDetail = async (ref) => {
    setSelected(ref);
    try {
      const data = await api.getReferral(ref.id);
      setActivities(data.activities || []);
      // Update selected with full data including commission_rate
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
    try {
      await api.deleteReferral(id);
      setSelected(null);
      setActivities([]);
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Pipeline</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>{total} recommandation{total > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
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

      {/* Table */}
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
            {loading ? (
              <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</td></tr>
            ) : referrals.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucun résultat</td></tr>
            ) : referrals.map(r => (
              <tr key={r.id} onClick={() => openDetail(r)} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.1s' }} onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{r.prospect_name}</div>
                  <div style={{ color: '#94a3b8', fontSize: 12 }}>{r.prospect_company}</div>
                </td>
                <td style={{ padding: '13px 16px', color: '#475569' }}>{r.partner_name}</td>
                <td style={{ padding: '13px 16px' }}>
                  <Badge config={LEVEL_CONFIG} value={r.recommendation_level} />
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <Badge config={STATUS_CONFIG} value={r.status} />
                </td>
                <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0f172a' }}>{r.deal_value > 0 ? fmt(r.deal_value) : '—'}</td>
                <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: 13 }}>{fmtDate(r.created_at)}</td>
                <td style={{ padding: '13px 16px' }}>
                  <ChevronRight size={16} color="#94a3b8" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Feature #6: Centered Modal instead of Drawer */}
      {selected && (
        <DetailModal
          referral={selected}
          activities={activities}
          onClose={() => { setSelected(null); setActivities([]); }}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}

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
      <div className="fade-in" style={{
        position: 'relative', background: '#fff', borderRadius: 24, width: 680, maxWidth: '100%',
        maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>{referral.prospect_name}</h2>
              <Badge config={LEVEL_CONFIG} value={referral.recommendation_level} />
            </div>
            <p style={{ color: '#64748b', fontSize: 14 }}>{referral.prospect_company} · {referral.partner_name}</p>
          </div>
          <button onClick={onClose} style={{
            background: '#f1f5f9', border: 'none', width: 38, height: 38, borderRadius: 12,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
            onMouseEnter={e => e.currentTarget.style.background = '#e2e8f0'}
            onMouseLeave={e => e.currentTarget.style.background = '#f1f5f9'}
          >
            <X size={18} color="#475569" />
          </button>
        </div>

        {/* Tabs */}
        <div style={{ padding: '16px 32px 0', display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
          {[{ id: 'info', label: 'Informations' }, { id: 'pipeline', label: 'Pipeline' }, { id: 'history', label: `Historique (${activities.length})` }].map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              color: tab === t.id ? '#6366f1' : '#64748b',
              borderBottom: tab === t.id ? '2px solid #6366f1' : '2px solid transparent',
              background: 'transparent', marginBottom: -1,
            }}>{t.label}</button>
          ))}
        </div>

        <div style={{ padding: '24px 32px 28px' }}>
          {tab === 'info' && (
            <div>
              {/* Prospect Info */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
                <InfoRow label="Email" value={referral.prospect_email} />
                <InfoRow label="Téléphone" value={referral.prospect_phone || '—'} />
                <InfoRow label="Rôle" value={referral.prospect_role || '—'} />
                <InfoRow label="Partenaire" value={referral.partner_name} />
                <InfoRow label="Assigné à" value={referral.assigned_name || 'Non assigné'} />
                <InfoRow label="Créé le" value={fmtDate(referral.created_at)} />
              </div>

              {/* Notes */}
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
              {/* Status */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 10 }}>Statut</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setEditStatus(k)} style={{
                      padding: '8px 14px', borderRadius: 10,
                      border: editStatus === k ? `2px solid ${v.color}` : '2px solid #e2e8f0',
                      background: editStatus === k ? v.bg : '#fff',
                      color: v.color, fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    }}>{v.label}</button>
                  ))}
                </div>
              </div>

              {/* Deal Value */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>MRR (€ / mois)</div>
                <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Ex: 24000"
                  style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 600, color: '#0f172a', boxSizing: 'border-box' }} />
              </div>

              {/* Engagement */}
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Engagement</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['monthly', 'Mensuel'], ['quarterly', 'Trimestriel'], ['yearly', 'Annuel']].map(([k, label]) => (
                    <button key={k} onClick={() => setEditEngagement(k)} style={{
                      padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                      border: editEngagement === k ? '2px solid #6366f1' : '2px solid #e2e8f0',
                      background: editEngagement === k ? '#eef2ff' : '#fff',
                      color: editEngagement === k ? '#6366f1' : '#64748b',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Commission Preview */}
              {editStatus === 'won' && Number(editValue) > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#fef3c7,#fffbeb)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #fcd34d' }}>
                  <div style={{ color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Commission estimée</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>{fmt(commission)}</span>
                    <span style={{ color: '#92400e', fontSize: 13 }}>({rate}% de {fmt(Number(editValue))})</span>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSave} disabled={saving} style={{
                  flex: 1, padding: '14px', borderRadius: 12,
                  background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
                  border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
                  opacity: saving ? 0.7 : 1,
                }}>
                  {saving ? 'Enregistrement...' : 'Sauvegarder'}
                </button>
                <button onClick={() => onDelete(referral.id)} style={{
                  padding: '14px 20px', borderRadius: 12, background: '#fef2f2',
                  color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600,
                  fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <Trash2 size={16} /> Supprimer
                </button>
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
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div>
    </div>
  );
}

function Select({ value, onChange, children }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      style={{ padding: '8px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>
      {children}
    </select>
  );
}
