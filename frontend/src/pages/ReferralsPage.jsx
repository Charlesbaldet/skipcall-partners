import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, STATUS_ORDER, fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { X, ChevronRight, Clock, Trash2, List, LayoutGrid, GripVertical } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal.jsx';

const KANBAN_STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'duplicate'];

export default function ReferralsPage() {
  const { t } = useTranslation();
  const [referrals, setReferrals] = useState([]);
  const [partners, setPartners] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ status: 'all', partner_id: 'all' });
  const [selected, setSelected] = useState(null);
  const [activities, setActivities] = useState([]);
  const [viewMode, setViewMode] = useState('kanban');
  const [kanbanLimits, setKanbanLimits] = useState({});
  const [deleteId, setDeleteId] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [draggedId, setDraggedId] = useState(null);
  const [myTenant, setMyTenant] = useState(null);
  const [stages, setStages] = useState([]);

  // Load tenant pipeline stages once — used as Kanban columns, filter
  // dropdown options, and the authoritative colour source for badges.
  useEffect(() => {
    api.getPipelineStages().then(d => setStages(d.stages || [])).catch(() => {});
  }, []);

  // Build a Badge-compatible config keyed by slug from tenant stages.
  // Falls back to STATUS_CONFIG when the tenant has no custom stages
  // (shouldn't happen after the migration, but a safe belt).
  const stageStatusConfig = stages.length
    ? Object.fromEntries(stages.map(s => [s.slug, { label: s.name, color: s.color, bg: s.color + '15' }]))
    : STATUS_CONFIG;

  const load = useCallback(async () => {
    try {
      const params = {};
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.partner_id !== 'all') params.partner_id = filters.partner_id;
      const [refData, partData, mt] = await Promise.all([api.getReferrals(params), api.getPartners(), api.getMyTenant()]);
      setReferrals(refData.referrals); setMyTenant(mt && (mt.tenant || mt)); setTotal(refData.total); setPartners(partData.partners);
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

  const handleDelete = (id) => setDeleteId(id);
  const confirmDelete = async () => {
    if (!deleteId) return;
    try {
      await api.deleteReferral(deleteId);
      setSelected(null); setActivities([]); load();
    } catch (err) { alert(err.message); }
    finally { setDeleteId(null); }
  };

  // Kanban drag & drop
  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  // Drop onto a kanban column — `targetStage` is the stage object the
  // card landed on. Send stage_id to the backend; it maps the stage's
  // is_won/is_lost flags back to the legacy status string and fires
  // the commission/email hooks that depend on it.
  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    if (!draggedId) return;
    const ref = referrals.find(r => r.id === draggedId);
    if (!ref || ref.stage_id === targetStage.id) { setDraggedId(null); return; }

    // Confetti when the card lands on the "won" stage (is_won flag).
    if (targetStage.is_won) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }

    try {
      const { referral } = await api.updateReferral(draggedId, { stage_id: targetStage.id, deal_value: ref.deal_value || 0, engagement: ref.engagement || 'monthly' });
      setReferrals(prev => prev.map(r => r.id === draggedId ? { ...r, ...referral } : r));
    } catch (err) { console.error(err); }
    setDraggedId(null);
  };

  const handleStatusChangeFromCard = async (id, newStatus) => {
    const ref = referrals.find(r => r.id === id);
    if (!ref) return;
    // Resolve the stage that matches this legacy status slug so the
    // card moves between the right Kanban columns.
    const matchedStage = stages.find(s => s.slug === newStatus);
    if (newStatus === 'won' || matchedStage?.is_won) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    try {
      const patch = matchedStage
        ? { stage_id: matchedStage.id, deal_value: ref.deal_value || 0, engagement: ref.engagement || 'monthly' }
        : { status: newStatus, deal_value: ref.deal_value || 0, engagement: ref.engagement || 'monthly' };
      const { referral } = await api.updateReferral(id, patch);
      setReferrals(prev => prev.map(r => r.id === id ? { ...r, ...referral } : r));
    } catch (err) { console.error(err); }
  };

  return (
    <div className="fade-in">
      <ConfirmModal
        isOpen={!!deleteId}
        title={t('referrals.delete_title') || 'Supprimer'}
        message={t('referrals.confirm_delete')}
        confirmLabel={t('referrals.delete') || 'Supprimer'}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      {/* Confetti */}
      {showConfetti && <Confetti />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>{t('referrals.title')}</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>{total} {t('referrals.count')}</p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setViewMode('kanban')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><LayoutGrid size={14} /> {t('referrals.view_kanban')}</button>
            <button onClick={() => setViewMode('table')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><List size={14} /> {t('referrals.view_table')}</button>
          </div>

          <Select value={filters.status} onChange={v => setFilters(f => ({ ...f, status: v }))}>
            <option value="all">{t('referrals.all_statuses')}</option>
            {(stages.length ? stages.map(s => ({ k: s.slug, label: s.name })) : Object.entries(STATUS_CONFIG).map(([k, v]) => ({ k, label: v.label }))).map(({ k, label }) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </Select>
          <Select value={filters.partner_id} onChange={v => setFilters(f => ({ ...f, partner_id: v }))}>
            <option value="all">{t('referrals.all_partners')}</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('referrals.loading')}</div>
      ) : viewMode === 'table' ? (
        /* TABLE VIEW */
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {[t('referrals.tbl_prospect'), t('referrals.tbl_partner'), t('referrals.tbl_level'), t('referrals.tbl_status'), t('referrals.tbl_value'), t('referrals.tbl_date'), ''].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('referrals.no_result')}</td></tr>
              ) : referrals.map(r => (
                <tr key={r.id} onClick={() => openDetail(r)} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.prospect_name}</span>
                      <CrmSyncBadge referral={r}/>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{r.prospect_company}</div>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569' }}>{r.partner_name}</td>
                  <td style={{ padding: '13px 16px' }}><Badge config={LEVEL_CONFIG} value={r.recommendation_level} /></td>
                  <td style={{ padding: '13px 16px' }}><Badge config={stageStatusConfig} value={(stages.find(s => s.id === r.stage_id)?.slug) || r.status} /></td>
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
        <div style={{ overflow: 'hidden', borderRadius: 16 }}>
        <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, height: 'calc(100vh - 140px)', minHeight: 400 }}>
          {(stages.length ? stages : KANBAN_STATUSES.map(slug => ({ id: slug, slug, name: STATUS_CONFIG[slug]?.label || slug, color: STATUS_CONFIG[slug]?.color || '#64748b' }))).map(stage => {
            // Match referrals to this column by stage_id primarily;
            // fall back to legacy status slug so anything predating
            // the migration still renders somewhere.
            const allCards = referrals.filter(r =>
              r.stage_id ? r.stage_id === stage.id : r.status === stage.slug
            );
            const limit = kanbanLimits[stage.id || stage.slug] || 25;
            const cards = allCards.slice(0, limit);
            const hasMore = allCards.length > limit;
            const stageColor = stage.color || '#64748b';
            return (
              <div key={stage.id || stage.slug}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = `${stageColor}0a`; }}
                onDragLeave={e => { e.currentTarget.style.background = '#f8fafc'; }}
                onDrop={e => { e.currentTarget.style.background = '#f8fafc'; handleDrop(e, stage); }}
                style={{
                  minWidth: 260, width: 260, flexShrink: 0, background: '#f8fafc', borderRadius: 16,
                  padding: 12, display: 'flex', flexDirection: 'column',
                  border: '1px solid #e2e8f0',
                  borderTop: `3px solid ${stageColor}`,
                }}
              >
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: stageColor }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{stage.name}</span>
                  </div>
                  <span style={{ background: stageColor + '15', color: stageColor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{allCards.length}</span>
                </div>

                {/* Cards - scrollable */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                  {cards.map(r => (
                    <div key={r.id} draggable onDragStart={e => handleDragStart(e, r.id)}
                      onClick={() => openDetail(r)}
                      style={{
                        background: '#fff', borderRadius: 12, padding: 14, cursor: 'grab',
                        border: draggedId === r.id ? `2px solid ${stageColor}` : '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        opacity: draggedId === r.id ? 0.5 : 1, transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.prospect_name}</div>
                          <CrmSyncBadge referral={r}/>
                        </div>
                        <GripVertical size={14} color="#cbd5e1" />
                      </div>
                      <LeadHandlingBadge handling={r.lead_handling}/>
                      {r.prospect_company && <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 2 }}>{r.prospect_company}</div>}
                      {(r.contact_first_name || r.contact_last_name) && (
                        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, fontStyle: 'italic' }}>
                          {[r.contact_first_name, r.contact_last_name].filter(Boolean).join(' ')}
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--rb-primary, #059669)', fontSize: 11, fontWeight: 600 }}>{r.partner_name}</span>
                        {r.deal_value > 0 && <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{fmt(r.deal_value)}</span>}
                      </div>
                      {/* Quick status change */}
                      <div style={{ marginTop: 10, borderTop: '1px solid #e2e8f0', paddingTop: 8 }}>
                        <select value={r.status} onChange={e => { e.stopPropagation(); handleStatusChangeFromCard(r.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '4px 6px', borderRadius: 6, border: `1px solid ${stageColor}30`, background: stageColor + '15', color: stageColor, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                          {(stages.length ? stages.map(s => ({ k: s.slug, label: s.name })) : Object.entries(STATUS_CONFIG).map(([k, v]) => ({ k, label: v.label }))).map(({ k, label }) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                  {hasMore && (
                    <button onClick={() => setKanbanLimits(prev => ({ ...prev, [stage.id || stage.slug]: limit + 25 }))} style={{
                      padding: '10px', borderRadius: 10, border: '1px dashed #cbd5e1', background: 'transparent',
                      color: 'var(--rb-primary, #059669)', fontWeight: 600, fontSize: 12, cursor: 'pointer', textAlign: 'center',
                    }}>{t('referrals.see_more', { count: allCards.length - limit })}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        </div>
      )}

      {selected && (
        <DetailModal referral={selected} activities={activities}
          onClose={() => { setSelected(null); setActivities([]); }}
          onUpdate={handleUpdate} onDelete={handleDelete} myTenant={myTenant}
          stages={stages}
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

// ═══ DETAIL MODAL ═══
// `stages` comes from the parent page (api.getPipelineStages) so the
// Pipeline tab renders the tenant's custom columns — not a hardcoded
// list. Falls back to STATUS_CONFIG so the modal still works during
// the brief window before stages load.
function DetailModal({ referral, activities, onClose, onUpdate, onDelete, myTenant, stages = [] }) {
  const { t } = useTranslation();
  const rModel = myTenant?.revenue_model || 'CA';
  const rLabel = rModel === 'ARR' ? 'ARR' : rModel === 'CA' ? t('common.revenue') : rModel === 'Other' ? t('common.revenue') : 'MRR';
  const rUnit = rModel === 'ARR' ? t('referrals.unit_year') : rModel === 'MRR' ? t('referrals.unit_month') : '€';

  // Prefer stage_id for the source of truth; fall back to matching a
  // stage by legacy status slug so existing referrals still highlight
  // the right button.
  const initialStage = stages.find(s => s.id === referral.stage_id)
    || stages.find(s => s.slug === referral.status)
    || null;
  const [editStageId, setEditStageId] = useState(initialStage?.id || referral.stage_id || null);
  const [editStatus, setEditStatus] = useState(initialStage?.slug || referral.status);
  const [editValue, setEditValue] = useState(referral.deal_value || '');
  const [saving, setSaving] = useState(false);
  const [editEngagement, setEditEngagement] = useState(referral.engagement || 'monthly');
  const [tab, setTab] = useState('info');
  const [saveToast, setSaveToast] = useState(null);

  const pickStage = (stage) => {
    setEditStageId(stage.id);
    setEditStatus(stage.slug || stage.id);
  };

  const selectedStage = stages.find(s => s.id === editStageId) || null;

  const handleSave = async () => {
    setSaving(true);
    setSaveToast(null);
    try {
      const patch = { deal_value: Number(editValue) || 0, engagement: editEngagement };
      if (editStageId) patch.stage_id = editStageId;
      else if (editStatus) patch.status = editStatus;
      await onUpdate(referral.id, patch);
      setSaveToast({ type: 'success', text: t('referrals.saved_ok') });
      setTimeout(() => setSaveToast(null), 2500);
    } catch (e) {
      setSaveToast({ type: 'error', text: e.message || t('referrals.save_error') });
    }
    setSaving(false);
  };

  const rate = referral.commission_rate || 10;
  const isWonSelected = selectedStage ? !!selectedStage.is_won : editStatus === 'won';
  const commission = isWonSelected ? (Number(editValue) || 0) * rate / 100 : 0;

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
            <p style={{ color: '#64748b', fontSize: 14 }}>
              {referral.prospect_company} · {referral.partner_name}
              {(referral.contact_first_name || referral.contact_last_name) && (
                <> · <span style={{ fontStyle: 'italic' }}>{[referral.contact_first_name, referral.contact_last_name].filter(Boolean).join(' ')}</span></>
              )}
            </p>
          </div>
          <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 38, height: 38, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={18} color="#475569" /></button>
        </div>
        <div style={{ padding: '16px 32px 0', display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
          {[{ id: 'info', label: t('referrals.tab_info') }, { id: 'pipeline', label: t('referrals.tab_pipeline') }, { id: 'history', label: `${t('referrals.tab_history')} (${activities.length})` }].map(tab_ => (
            <button key={tab_.id} onClick={() => setTab(tab_.id)} style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === tab_.id ? '#6366f1' : '#64748b', borderBottom: tab === tab_.id ? '2px solid var(--rb-primary, #059669)' : '2px solid transparent', background: 'transparent', marginBottom: -1 }}>{tab_.label}</button>
          ))}
        </div>
        <div style={{ padding: '24px 32px 28px' }}>
          {tab === 'info' && (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 20, marginBottom: 24 }}>
                <InfoRow label={t('referrals.field_first_name', { defaultValue: 'Prénom' })} value={referral.contact_first_name || '—'} />
                <InfoRow label={t('referrals.field_last_name',  { defaultValue: 'Nom' })}    value={referral.contact_last_name  || '—'} />
                <InfoRow label={t('referrals.field_role')} value={referral.prospect_role || '—'} />
                <InfoRow label={t('referrals.field_email')} value={referral.prospect_email} />
                <InfoRow label={t('referrals.field_phone')} value={referral.prospect_phone || '—'} />
                <InfoRow label={t('referrals.field_partner')} value={referral.partner_name} />
                <InfoRow label={t('referrals.field_assigned')} value={referral.assigned_name || t('referrals.not_assigned')} />
                <InfoRow label={t('referrals.field_created')} value={fmtDate(referral.created_at)} />
              </div>
              {referral.notes && (
                <div>
                  <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>{t('referrals.partner_notes')}</div>
                  <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, color: '#92400e', fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid #f59e0b' }}>{referral.notes}</div>
                </div>
              )}
            </div>
          )}
          {tab === 'pipeline' && (
            <div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 10 }}>{t('referrals.field_status')}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(stages.length
                    ? stages.map(s => ({ id: s.id, slug: s.slug, label: s.name, color: s.color || '#64748b', isStage: true, stage: s }))
                    : Object.entries(STATUS_CONFIG).map(([k, v]) => ({ id: k, slug: k, label: v.label, color: v.color, bg: v.bg, isStage: false }))
                  ).map(opt => {
                    const active = opt.isStage ? editStageId === opt.id : editStatus === opt.slug;
                    const bg = opt.isStage ? (opt.color + '15') : opt.bg;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => opt.isStage ? pickStage(opt.stage) : (setEditStageId(null), setEditStatus(opt.slug))}
                        style={{
                          padding: '8px 14px', borderRadius: 10,
                          border: active ? `2px solid ${opt.color}` : '2px solid #e2e8f0',
                          background: active ? bg : '#fff',
                          color: opt.color,
                          fontWeight: 600, fontSize: 12, cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>{rLabel} ({rUnit})</div>
                <input type="number" value={editValue} onChange={e => setEditValue(e.target.value)} placeholder={t('referrals.value_ph')} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 600, color: '#0f172a', boxSizing: 'border-box' }} />
              </div>
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>{t('referrals.engagement')}</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {[['monthly', t('referrals.engagement_monthly')], ['quarterly', t('referrals.engagement_quarterly')], ['yearly', t('referrals.engagement_yearly')]].map(([k, label]) => (
                    <button key={k} onClick={() => setEditEngagement(k)} style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: editEngagement === k ? '2px solid var(--rb-primary, #059669)' : '2px solid #e2e8f0', background: editEngagement === k ? '#eef2ff' : '#fff', color: editEngagement === k ? '#6366f1' : '#64748b' }}>{label}</button>
                  ))}
                </div>
              </div>
              {isWonSelected && Number(editValue) > 0 && (
                <div style={{ background: 'linear-gradient(135deg,#fef3c7,#fffbeb)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #fcd34d' }}>
                  <div style={{ color: '#92400e', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{t('referrals.commission_est')}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b' }}>{fmt(commission)}</span>
                    <span style={{ color: '#92400e', fontSize: 13 }}>({rate}% {t('referrals.of')} {fmt(Number(editValue))})</span>
                  </div>
                </div>
              )}
              {saveToast && (
              <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 600, background: saveToast.type === 'success' ? '#f0fdf4' : '#fef2f2', color: saveToast.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${saveToast.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
                {saveToast.text}
              </div>
            )}
            <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer', boxShadow: '0 4px 15px rgba(5,150,105,0.3)', opacity: saving ? 0.7 : 1 }}>{saving ? t('referrals.saving') : t('referrals.save')}</button>
                <button onClick={() => onDelete(referral.id)} style={{ padding: '14px 20px', borderRadius: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Trash2 size={16} /> {t('referrals.delete')}</button>
              </div>
            </div>
          )}
          {tab === 'history' && (
            <div>
              {activities.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>{t('referrals.no_activity')}</div>
              ) : (
                <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {activities.map(a => (
                    <div key={a.id} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -26, top: 4, width: 10, height: 10, borderRadius: '50%', background: 'var(--rb-primary, #059669)', border: '2px solid #fff', boxShadow: '0 0 0 2px #e2e8f0' }} />
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{fmtDateTime(a.created_at)} · {a.user_name}</div>
                      <div style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{formatActivity(a, t)}</div>
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

function formatActivity(a, t) {
  switch (a.action) {
    case 'created': return t('referrals.act_created');
    case 'status_change': return `${t('referrals.act_status')}: ${STATUS_CONFIG[a.old_value]?.label || a.old_value} → ${STATUS_CONFIG[a.new_value]?.label || a.new_value}`;
    case 'value_updated': return t('referrals.act_value_updated', { value: fmt(a.new_value) });
    case 'engagement_updated': return t('referrals.act_engagement_updated', { value: a.new_value });
    case 'assigned': return t('referrals.act_assigned');
    case 'note_added': return t('referrals.act_note', { value: a.new_value });
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

// Per-CRM sync badges — tiny letter circles (H / N / S) shown next to
// the prospect name on the Kanban card. Each badge lights up green
// once the referral is linked to that CRM's record; Notion stays a
// clickable link to the underlying page for quick access. The
// generic `crm_deal_id` fallback covers legacy rows that predate the
// split into provider-specific columns.
function CrmSyncBadge({ referral }) {
  if (!referral) return null;
  const date = referral.crm_synced_at ? new Date(referral.crm_synced_at).toLocaleString() : '';
  const hubspotLinked   = !!referral.hubspot_deal_id;
  const salesforceLinked = !!referral.salesforce_opportunity_id;
  const notionLinked    = !!(referral.notion_page_id || referral.notion_transaction_id);
  // Legacy `crm_deal_id` with no provider-specific column populated —
  // treat it as a generic sync so pre-migration rows still get a
  // badge.
  const legacyLinked = !!referral.crm_deal_id && !hubspotLinked && !salesforceLinked;

  const circle = (bg, fg, letter) => ({
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: 16, height: 16, borderRadius: '50%',
    background: bg, color: fg,
    fontSize: 9, fontWeight: 800, flexShrink: 0,
    textDecoration: 'none', border: '1px solid transparent',
  });

  const suffix = referral.crm_link_status === 'linked_existing'
    ? ' (linked to existing)'
    : referral.crm_link_status === 'created_new'
      ? ' (new)'
      : '';

  const badges = [];
  if (hubspotLinked) {
    badges.push(
      <span key="hs" title={`HubSpot${suffix}${date ? ' — ' + date : ''}`} aria-label="HubSpot synced"
        style={circle(hubspotLinked ? '#ff7a59' : '#f1f5f9', '#fff', 'H')}>H</span>
    );
  }
  if (notionLinked) {
    const id = String(referral.notion_page_id || referral.notion_transaction_id).replace(/-/g, '');
    badges.push(
      <a key="notion" href={`https://notion.so/${id}`} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}
        title={`Notion${suffix}`} aria-label="Open in Notion"
        style={circle('#111827', '#fff', 'N')}>N</a>
    );
  }
  if (salesforceLinked) {
    badges.push(
      <span key="sf" title={`Salesforce${suffix}${date ? ' — ' + date : ''}`} aria-label="Salesforce synced"
        style={circle('#00a1e0', '#fff', 'S')}>S</span>
    );
  }
  if (legacyLinked) {
    // Unknown-provider fallback — neutral grey dot so admins at least
    // see something's been synced.
    badges.push(
      <span key="legacy" title={`CRM synced${date ? ' — ' + date : ''}`} aria-label="CRM synced"
        style={circle('#f0fdf4', '#059669', '')}>•</span>
    );
  }
  if (!badges.length) return null;
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>{badges}</span>;
}

// Small pill showing who drives the lead. Green when the partner
// handles it directly, blue when it's been handed off to the sales
// team. Shown on Kanban cards so everyone knows who's expected to
// move the deal forward. Not interactive here — the detail drawer is
// the place to change it.
function LeadHandlingBadge({ handling }) {
  const { t } = useTranslation();
  if (handling === 'client_prospect') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#2563eb', fontSize: 10, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
         {t('referral.client_prospect_badge')}
      </div>
    );
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#059669', fontSize: 10, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
       {t('referral.partner_managed_badge')}
    </div>
  );
}
