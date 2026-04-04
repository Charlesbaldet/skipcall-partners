import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { X, ChevronRight, Clock, MessageSquare } from 'lucide-react';

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
    } catch {}
  };

  const handleUpdate = async (id, updates) => {
    try {
      const { referral } = await api.updateReferral(id, updates);
      setReferrals(prev => prev.map(r => r.id === id ? { ...r, ...referral } : r));
      setSelected(prev => prev ? { ...prev, ...referral } : null);
      // Reload activities
      const data = await api.getReferral(id);
      setActivities(data.activities || []);
    } catch (err) { console.error(err); }
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

      {/* Detail Drawer */}
      {selected && (
        <DetailDrawer
          referral={selected}
          activities={activities}
          onClose={() => { setSelected(null); setActivities([]); }}
          onUpdate={handleUpdate}
        />
      )}
    </div>
  );
}

function DetailDrawer({ referral, activities, onClose, onUpdate }) {
  const [editStatus, setEditStatus] = useState(referral.status);
  const [editValue, setEditValue] = useState(referral.deal_value || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await onUpdate(referral.id, { status: editStatus, deal_value: Number(editValue) || 0 });
    setSaving(false);
  };

  const rate = referral.commission_rate || 10;
  const commission = editStatus === 'won' ? (Number(editValue) || 0) * rate / 100 : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
      <div className="slide-in" style={{ position: 'relative', width: 500, maxWidth: '100%', background: '#fff', height: '100%', overflowY: 'auto', padding: 32, boxShadow: '-10px 0 40px rgba(0,0,0,0.1)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Détail du deal</h2>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 34, height: 34, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={16} color="#64748b" />
          </button>
        </div>

        {/* Prospect Info */}
        <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, marginBottom: 24 }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18, marginBottom: 4 }}>{referral.prospect_name}</div>
          <div style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>{referral.prospect_company} · {referral.prospect_role || 'N/A'}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <InfoRow label="Email" value={referral.prospect_email} />
            <InfoRow label="Tél" value={referral.prospect_phone || '—'} />
            <InfoRow label="Partenaire" value={referral.partner_name} />
            <InfoRow label="Niveau" value={<Badge config={LEVEL_CONFIG} value={referral.recommendation_level} />} />
            <InfoRow label="Assigné à" value={referral.assigned_name || 'Non assigné'} />
            <InfoRow label="Créé le" value={fmtDate(referral.created_at)} />
          </div>
        </div>

        {/* Notes */}
        {referral.notes && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Notes du partenaire</div>
            <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, color: '#92400e', fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid #f59e0b' }}>{referral.notes}</div>
          </div>
        )}

        {/* Status Update */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 10 }}>Mettre à jour le statut</div>
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
          <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>Valeur du deal (€ / an)</div>
          <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder="Ex: 24000"
            style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 600, color: '#0f172a', boxSizing: 'border-box' }} />
        </div>

        {/* Commission Preview */}
        {editStatus === 'won' && Number(editValue) > 0 && (
          <div style={{ background: 'linear-gradient(135deg,#fef3c7,#fffbeb)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #fcd34d' }}>
            <div style={{ color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>💰 Commission estimée</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>{fmt(commission)}</span>
              <span style={{ color: '#92400e', fontSize: 13 }}>({rate}% de {fmt(Number(editValue))})</span>
            </div>
          </div>
        )}

        {/* Activity Log */}
        {activities.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 12 }}>Historique</div>
            <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {activities.map(a => (
                <div key={a.id} style={{ position: 'relative' }}>
                  <div style={{ position: 'absolute', left: -22, top: 4, width: 10, height: 10, borderRadius: '50%', background: '#6366f1', border: '2px solid #fff' }} />
                  <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 2 }}>{fmtDateTime(a.created_at)} · {a.user_name}</div>
                  <div style={{ fontSize: 13, color: '#334155' }}>{formatActivity(a)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save */}
        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', padding: '14px', borderRadius: 12,
          background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff',
          border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
          boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
          opacity: saving ? 0.7 : 1,
        }}>
          {saving ? 'Enregistrement...' : 'Sauvegarder'}
        </button>
      </div>
    </div>
  );
}

function formatActivity(a) {
  switch (a.action) {
    case 'created': return 'Recommandation créée';
    case 'status_change': return `Statut: ${STATUS_CONFIG[a.old_value]?.label || a.old_value} → ${STATUS_CONFIG[a.new_value]?.label || a.new_value}`;
    case 'value_updated': return `Valeur mise à jour: ${fmt(a.new_value)}`;
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
      <div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 13 }}>{value}</div>
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
