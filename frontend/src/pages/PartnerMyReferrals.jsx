import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { DollarSign, Trash2, LayoutGrid, List, ChevronRight, X, Lock, GripVertical, Plus } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import PartnerSubmitPage from './PartnerSubmitPage.jsx';

const KANBAN_STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'duplicate'];

export default function PartnerMyReferrals() {
  const { t } = useTranslation();
  const [referrals, setReferrals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  // partner-read-access: hydrate activities alongside the referral on
  // detail open so the read-only History tab can render the full
  // timeline without a second click. Same shape as the admin modal.
  const [activities, setActivities] = useState([]);
  const [deleting, setDeleting] = useState(null);
  const [viewMode, setViewMode] = useState('kanban');
  const [deleteId, setDeleteId] = useState(null);
  const [stages, setStages] = useState([]);
  const [draggedId, setDraggedId] = useState(null);
  const [toast, setToast] = useState(null);

  // Click on a card → set the row immediately for snappy UI, then
  // fetch the detail payload to hydrate commission breakdown,
  // revisions, longevity snapshot, and the activity timeline.
  const openDetail = async (ref) => {
    setSelected(ref);
    setActivities([]);
    try {
      const data = await api.getReferral(ref.id);
      if (data?.referral) setSelected(data.referral);
      setActivities(data?.activities || []);
    } catch {}
  };
  // Submit modal — opened by the header button OR by ?submit=1 in
  // the URL (the legacy /partner/submit route now redirects here).
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const load = async () => {
    try {
      const [r, s] = await Promise.all([
        api.getReferrals(),
        api.getPipelineStages().catch(() => ({ stages: [] })),
      ]);
      setReferrals(r.referrals);
      setStages(s.stages || []);
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  // Deep-link from /search: open the matching referral in the
  // existing detail modal, then strip the ?open= param so a refresh
  // won't keep firing it.
  const [searchParams, setSearchParams] = useSearchParams();
  const openIdRef = useRef(null);
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openIdRef.current === openId) return;
    openIdRef.current = openId;
    api.getReferral(openId)
      .then(d => {
        if (d?.referral) setSelected(d.referral);
        setActivities(d?.activities || []);
      })
      .catch(() => {});
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // Legacy /partner/submit deep-link: redirect lands us here with
  // ?submit=1, open the submit modal, strip the param so a refresh
  // doesn't reopen it.
  const submitFlagSeen = useRef(false);
  useEffect(() => {
    if (submitFlagSeen.current) return;
    if (searchParams.get('submit') !== '1') return;
    submitFlagSeen.current = true;
    setShowSubmitModal(true);
    const next = new URLSearchParams(searchParams);
    next.delete('submit');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const showToast = (text, type = 'warning') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Only cards the partner explicitly manages are draggable. Treat
  // anything else — client_prospect, null, missing field — as
  // company-managed and locked. Matches the semantic the partner UI
  // surfaces: "Géré par l'entreprise" → read-only.
  const canDrag = (r) => r && r.lead_handling === 'partner_managed';

  const handleDragStart = (e, r) => {
    if (!canDrag(r)) {
      e.preventDefault();
      showToast(t('referral.cannot_move_client_lead'));
      return;
    }
    setDraggedId(r.id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = async (e, targetStage) => {
    e.preventDefault();
    if (!draggedId) return;
    const ref = referrals.find(r => r.id === draggedId);
    if (!ref || ref.stage_id === targetStage.id) { setDraggedId(null); return; }
    if (!canDrag(ref)) {
      setDraggedId(null);
      showToast(t('referral.cannot_move_client_lead'));
      return;
    }
    try {
      const { referral } = await api.updateReferral(draggedId, { stage_id: targetStage.id });
      setReferrals(prev => prev.map(r => r.id === draggedId ? { ...r, ...referral } : r));
    } catch (err) {
      showToast(err.message || 'Error', 'error');
    }
    setDraggedId(null);
  };

  const handleDelete = (id) => setDeleteId(id);
  const confirmDelete = async () => {
    const id = deleteId;
    if (!id) return;
    setDeleteId(null);
    setDeleting(id);
    try {
      await api.deleteReferral(id);
      setReferrals(prev => prev.filter(r => r.id !== id));
      if (selected?.id === id) { setSelected(null); setActivities([]); }
    } catch (err) { showToast(err.message || 'Error', 'error'); }
    setDeleting(null);
  };

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      <ConfirmModal
        isOpen={!!deleteId}
        title={t('referrals.delete_title') || t('partnerReferrals.confirm_delete')}
        message={t('partnerReferrals.confirm_delete')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('partnerReferrals.title')}</h1>
          <p style={{ color: '#64748b' }}>{t('partnerReferrals.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setViewMode('kanban')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={14} /> {t('partnerReferrals.view_kanban')}</button>
            <button onClick={() => setViewMode('table')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><List size={14} /> {t('partnerReferrals.view_table')}</button>
          </div>
          <button
            onClick={() => setShowSubmitModal(true)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '10px 16px', borderRadius: 10,
              background: '#059669', color: '#fff', border: 'none',
              fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
            }}
          >
            <Plus size={14} /> {t('partner.submit_referral', 'Soumettre un referral')}
          </button>
        </div>
      </div>

      {referrals.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>{t('partnerReferrals.empty_message')}</p>
          <button
            onClick={() => setShowSubmitModal(true)}
            style={{ background: 'transparent', border: 'none', color: 'var(--rb-primary, #059669)', fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', fontSize: 14 }}
          >{t('partnerReferrals.empty_cta')}</button>
        </div>
      ) : viewMode === 'kanban' ? (
        <KanbanView
          referrals={referrals}
          stages={stages}
          draggedId={draggedId}
          onDragStart={handleDragStart}
          onDrop={handleDrop}
          onSelect={openDetail}
        />
      ) : (
        <TableView referrals={referrals} onSelect={openDetail} />
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '14px 18px', borderRadius: 12,
          background: toast.type === 'error' ? '#fef2f2' : toast.type === 'success' ? '#ecfdf5' : '#fffbeb',
          color: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#047857' : '#92400e',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : toast.type === 'success' ? '#a7f3d0' : '#fcd34d'}`,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          maxWidth: 360,
        }}>
          {toast.text}
        </div>
      )}

      {selected && (
        <DetailModal
          referral={selected}
          activities={activities}
          onClose={() => { setSelected(null); setActivities([]); }}
          onDelete={selected.status === 'new' ? () => handleDelete(selected.id) : null}
          deleting={deleting === selected.id}
        />
      )}

      {showSubmitModal && (
        <SubmitReferralModal
          onClose={() => setShowSubmitModal(false)}
          onSubmitted={() => {
            setShowSubmitModal(false);
            showToast(t('partner.referral_submitted', 'Referral soumis avec succès'), 'success');
            load(); // Refresh the kanban with the new card.
          }}
          t={t}
        />
      )}

    </div>
  );
}

// Branded modal that wraps PartnerSubmitPage. Closing the modal
// (backdrop, Escape, X) discards in-progress fields — the partner's
// next session starts fresh, which mirrors how the admin's modals
// behave throughout the app.
function SubmitReferralModal({ onClose, onSubmitted, t }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    // Lock the body scroll while the modal is open so the page
    // behind doesn't scroll under the dialog.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '64px 16px 32px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 720, padding: '28px 32px 32px',
          boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
        }}
      >
        <button
          onClick={onClose}
          aria-label={t('common.close', 'Fermer')}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: 8,
            background: '#f1f5f9', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <X size={16} color="#475569" />
        </button>
        <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: -0.3 }}>
          {t('partner.submit_referral_title', 'Nouveau referral')}
        </h2>
        <PartnerSubmitPage onSubmitted={onSubmitted} />
      </div>
    </div>
  );
}

function KanbanView({ referrals, stages, draggedId, onDragStart, onDrop, onSelect }) {
  const { t } = useTranslation();
  const cols = stages.length
    ? stages
    : KANBAN_STATUSES.map(slug => ({ id: slug, slug, name: STATUS_CONFIG[slug]?.label || slug, color: STATUS_CONFIG[slug]?.color || '#64748b' }));
  return (
    <div style={{ overflow: 'hidden', borderRadius: 16 }}>
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, height: 'calc(100vh - 140px)', minHeight: 400 }}>
        {cols.map(stage => {
          const stageColor = stage.color || '#64748b';
          const cards = referrals.filter(r =>
            r.stage_id ? r.stage_id === stage.id : r.status === stage.slug
          );
          return (
            <div
              key={stage.id || stage.slug}
              onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = `${stageColor}0a`; }}
              onDragLeave={e => { e.currentTarget.style.background = '#f8fafc'; }}
              onDrop={e => { e.currentTarget.style.background = '#f8fafc'; onDrop(e, stage); }}
              style={{
                minWidth: 260, width: 260, flexShrink: 0, background: '#f8fafc', borderRadius: 16,
                padding: 12, display: 'flex', flexDirection: 'column',
                border: '1px solid #e2e8f0',
                borderTop: `3px solid ${stageColor}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: stageColor }} />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{stage.name}</span>
                </div>
                <span style={{ background: stageColor + '15', color: stageColor, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{cards.length}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                {cards.map(r => {
                  // Locked === anything that isn't explicitly
                  // partner_managed: company-managed leads are read-only
                  // for the partner.
                  const locked = r.lead_handling !== 'partner_managed';
                  return (
                    <div
                      key={r.id}
                      draggable={!locked}
                      onDragStart={e => onDragStart(e, r)}
                      onClick={() => onSelect(r)}
                      title={locked ? t('referral.managed_by_company_tooltip') : undefined}
                      style={{
                        background: locked ? '#f8fafc' : '#fff',
                        borderRadius: 12, padding: 14,
                        cursor: locked ? 'not-allowed' : 'grab',
                        border: draggedId === r.id ? `2px solid ${stageColor}` : '1px solid #e2e8f0',
                        boxShadow: locked ? 'none' : '0 1px 3px rgba(0,0,0,0.04)',
                        opacity: draggedId === r.id ? 0.5 : (locked ? 0.75 : 1),
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prospect_name}</div>
                        {locked
                          ? <Lock size={13} color="#94a3b8" />
                          : <GripVertical size={14} color="#cbd5e1" />}
                      </div>
                      <LeadHandlingBadge locked={locked} />
                      {r.prospect_company && <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4, marginBottom: 6 }}>{r.prospect_company}</div>}
                      {r.deal_value > 0 && <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13 }}>{fmt(r.deal_value)}</div>}
                    </div>
                  );
                })}
                {cards.length === 0 && <div style={{ color: '#cbd5e1', fontSize: 12, textAlign: 'center', padding: 16 }}>{t('partnerReferrals.empty_col')}</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadHandlingBadge({ locked }) {
  const { t } = useTranslation();
  if (locked) {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#2563eb', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        {t('referral.managed_by_company')}
      </div>
    );
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#059669', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      {t('referral.managed_by_you')}
    </div>
  );
}

function TableView({ referrals, onSelect }) {
  const { t } = useTranslation();
  return (
    <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#f8fafc' }}>
            {[t('partnerReferrals.tbl_prospect'), t('referrals.tbl_level'), t('partnerReferrals.tbl_status'), t('partnerReferrals.tbl_value'), t('partnerReferrals.tbl_date'), ''].map((h, i) => (
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

// partner-read-access: 3-tab modal mirroring the admin one
// (frontend/src/pages/ReferralsPage.jsx DetailModal) but in
// READ-ONLY mode. Everything the partner sees on the Pipeline tab is
// rendered as <span> or disabled — no Save button, no drag handles,
// no editable inputs. The PUT guard in backend/routes/referrals.js
// (L.561-588) is the ultimate enforcement; the FE matches it.
function DetailModal({ referral, activities, onClose, onDelete, deleting }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState('info');

  // Cycle / period helpers — identical formulas to E5 admin Kanban
  // so the partner card readout matches the admin's verbatim.
  const PERIOD_MONTHS = { forfait: 1, mensuel: 1, trimestriel: 3, annuel: 12 };
  const cycleMonths = (parseInt(referral.engagement_periods, 10) || 1)
                    * (PERIOD_MONTHS[referral.engagement] || 1);
  const cycleDurationLabel = cycleMonths % 12 === 0
    ? `${cycleMonths / 12} ${cycleMonths / 12 > 1 ? t('commissions.years', 'ans') : t('commissions.year', 'an')}`
    : `${cycleMonths} ${t('commissions.months', 'mois')}`;

  const isRecurring = !!referral.commission_is_recurring;
  const isPerpetual = !!referral.commission_is_perpetual;
  const engagementUntil = referral.commission_engagement_until;
  const tierAtWon = referral.commission_tier_at_won;
  const cycleIndex = referral.commission_cycle_index || 1;
  const paidCount = referral.commission_paid_count || 0;
  const commTtc = referral.commission_amount_ttc;
  const commHt  = referral.commission_amount_ht;
  const commTax = referral.commission_amount_tax;
  const commTaxRate = referral.commission_tax_rate_applied;
  const commRate = referral.commission_rate;
  const revisions = Array.isArray(referral.commission_revisions) ? referral.commission_revisions : [];

  // Longevity pill — same snapshot-derived logic as E2-bis on
  // CommissionsPage.jsx. Read straight from the frozen columns, no
  // dynamic resolution.
  let longevityPill = null;
  if (isRecurring) {
    if (isPerpetual) {
      longevityPill = { label: t('commissions.duration_perpetual_badge', 'À vie'), bg: '#eef2ff', color: '#6366f1' };
    } else if (!engagementUntil) {
      longevityPill = { label: t('commissions.duration_bounded_badge', 'Durée limitée'), bg: '#eef2ff', color: '#6366f1' };
    } else {
      const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
      const endMs   = new Date(engagementUntil).getTime();
      if (endMs < todayMs) {
        longevityPill = { label: t('commissions.duration_terminated_badge', 'Terminé'), bg: '#f1f5f9', color: '#64748b' };
      } else {
        longevityPill = { label: t('commissions.duration_until_badge', { date: fmtDate(engagementUntil), defaultValue: "Jusqu'au {{date}}" }), bg: '#eef2ff', color: '#6366f1' };
      }
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 560, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        {/* Header — read-only, only an X to close. No save button, no drag handle. */}
        <div style={{ padding: '24px 32px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{referral.prospect_name}</h2>
                {LEVEL_CONFIG[referral.recommendation_level] && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: LEVEL_CONFIG[referral.recommendation_level]?.bg, color: LEVEL_CONFIG[referral.recommendation_level]?.color }}>{LEVEL_CONFIG[referral.recommendation_level]?.label}</span>
                )}
                {STATUS_CONFIG[referral.status] && (
                  <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: STATUS_CONFIG[referral.status]?.bg, color: STATUS_CONFIG[referral.status]?.color }}>{STATUS_CONFIG[referral.status]?.label}</span>
                )}
              </div>
              <p style={{ color: '#64748b', fontSize: 13 }}>{referral.prospect_company}</p>
            </div>
            <button onClick={onClose} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#475569" /></button>
          </div>
        </div>

        {/* Tabs strip — same visual + interaction as the admin modal. */}
        <div style={{ padding: '0 32px', display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0' }}>
          {[
            { id: 'info',     label: t('referrals.tab_info',     'Informations') },
            { id: 'pipeline', label: t('referrals.tab_pipeline', 'Pipeline') },
            { id: 'history',  label: `${t('referrals.tab_history', 'Historique')} (${activities.length})` },
          ].map(tab_ => (
            <button key={tab_.id} onClick={() => setTab(tab_.id)} style={{ padding: '10px 18px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: tab === tab_.id ? '#6366f1' : '#64748b', borderBottom: tab === tab_.id ? '2px solid var(--rb-primary, #059669)' : '2px solid transparent', background: 'transparent', marginBottom: -1 }}>{tab_.label}</button>
          ))}
        </div>

        <div style={{ padding: '24px 32px 28px' }}>
          {/* ─── INFO tab ───────────────────────────────────────── */}
          {tab === 'info' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
                <Field label={t('referrals.field_email')} value={referral.prospect_email} />
                <Field label={t('referrals.field_phone')} value={referral.prospect_phone || '—'} />
                <Field label={t('referrals.field_role')} value={referral.prospect_role || '—'} />
                <Field label={t('partnerReferrals.tbl_date')} value={fmtDate(referral.created_at)} />
                {referral.deal_value > 0 && <Field label={t('partnerReferrals.deal_value')} value={fmt(referral.deal_value)} />}
              </div>

              {referral.notes && (
                <div style={{ background: '#fffbeb', borderRadius: 10, padding: 14, color: '#92400e', fontSize: 13, lineHeight: 1.5, borderLeft: '3px solid #f59e0b', marginBottom: 18 }}>{referral.notes}</div>
              )}

              {referral.status === 'won' && referral.deal_value > 0 && (
                <div style={{ background: '#f0fdf4', borderRadius: 10, padding: 12, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <DollarSign size={16} color="#16a34a" />
                  <span style={{ color: '#16a34a', fontWeight: 600, fontSize: 13 }}>{t('partnerReferrals.deal_won_msg')}</span>
                </div>
              )}

              {onDelete && (
                <button onClick={onDelete} disabled={deleting} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: deleting ? 0.5 : 1 }}>
                  <Trash2 size={14} /> {deleting ? t('partnerReferrals.deleting') : t('partnerReferrals.delete')}
                </button>
              )}
            </>
          )}

          {/* ─── PIPELINE tab — READ-ONLY ──────────────────────── */}
          {tab === 'pipeline' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Status — pill only, no interactive control. */}
              <div>
                <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('referrals.field_status', 'Statut')}</div>
                {STATUS_CONFIG[referral.status] && (
                  <span style={{ padding: '4px 14px', borderRadius: 999, fontSize: 12, fontWeight: 700, background: STATUS_CONFIG[referral.status].bg, color: STATUS_CONFIG[referral.status].color }}>{STATUS_CONFIG[referral.status].label}</span>
                )}
              </div>

              {/* Deal value — span, never an input. */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('partnerReferrals.deal_value', 'Valeur du deal')}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{referral.deal_value > 0 ? fmt(referral.deal_value) : '—'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('referrals.field_rate', 'Taux de commission')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{commRate != null ? `${commRate}%` : '—'}</span>
                    {tierAtWon && (
                      <span style={{ padding: '3px 8px', borderRadius: 6, fontSize: 10, fontWeight: 700, background: '#f1f5f9', color: '#475569' }}>{tierAtWon}</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Engagement — read-only summary. */}
              {referral.engagement && (
                <div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('referrals.engagement', 'Engagement')}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f1f5f9', color: '#0f172a' }}>
                      {t('pipeline.' + referral.engagement, referral.engagement)}
                      {referral.engagement !== 'forfait' && ` × ${referral.engagement_periods || 1}`}
                    </span>
                    {cycleMonths > 0 && (
                      <span style={{ color: '#64748b', fontSize: 12 }}>· {cycleDurationLabel}</span>
                    )}
                    {longevityPill && (
                      <span style={{ padding: '2px 8px', borderRadius: 6, background: longevityPill.bg, color: longevityPill.color, fontWeight: 700, fontSize: 11 }}>{longevityPill.label}</span>
                    )}
                  </div>
                </div>
              )}

              {/* Cycle counter — only meaningful for recurring rows
                  that have already paid at least one cycle, or that
                  are past their initial cycle. */}
              {isRecurring && commTtc != null && (
                <div style={{ background: '#f0fdf4', borderRadius: 12, padding: 14, border: '1px solid #bbf7d0' }}>
                  <div style={{ fontSize: 11, color: '#15803d', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                    {t('partnerReferrals.cycle_label', 'Cycle')} #{cycleIndex}
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: '#16a34a' }}>
                    {fmt(commTtc)}
                    <span style={{ fontSize: 12, color: '#15803d', fontWeight: 500, marginLeft: 6 }}>
                      / {cycleDurationLabel} ·{' '}
                      {t('commissions.card_paid_count', { count: paidCount, defaultValue: '{{count}} versé(s)' })}
                    </span>
                  </div>
                </div>
              )}

              {/* Commission breakdown — HT / TVA / TTC. Read-only,
                  same shape as the admin "forecast" block in
                  ReferralsPage.jsx. */}
              {commTtc != null && (
                <div style={{ background: '#fff', borderRadius: 12, padding: 14, border: '1px solid #e2e8f0' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                    {t('pipeline.forecast_commission', 'Commission prévisionnelle')}
                  </div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <tbody>
                      <tr>
                        <td style={{ padding: '4px 0', color: '#64748b' }}>{t('commissions.tbl_ht', 'HT')}</td>
                        <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{fmt(commHt)}</td>
                      </tr>
                      {parseFloat(commTax || 0) > 0 && (
                        <tr>
                          <td style={{ padding: '4px 0', color: '#64748b' }}>{t('commissions.tbl_tva', 'TVA')} {commTaxRate}%</td>
                          <td style={{ padding: '4px 0', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{fmt(commTax)}</td>
                        </tr>
                      )}
                      <tr style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 0 0', color: '#166534', fontWeight: 700 }}>{t('commissions.tbl_ttc', 'TTC')}</td>
                        <td style={{ padding: '6px 0 0', textAlign: 'right', fontWeight: 800, color: '#059669' }}>{fmt(commTtc)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {referral.deal_value > 0 && commRate != null && (
                    <div style={{ marginTop: 8, fontSize: 11, color: '#94a3b8' }}>
                      {commRate}% × {fmt(referral.deal_value)}
                    </div>
                  )}
                </div>
              )}

              {/* Amendment history — same shape as the admin E3 panel.
                  Read-only by design (amendments are immutable). Only
                  rendered when more than one revision exists. */}
              {revisions.length > 1 && (
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                    {t('pipeline.revisions_title', { count: revisions.length, defaultValue: 'Historique des avenants ({{count}})' })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {revisions.map(r => {
                      const reasonLabel = r.reason === 'upsell'   ? t('pipeline.rev_upsell',   'upsell')
                                       : r.reason === 'downsell' ? t('pipeline.rev_downsell', 'downsell')
                                       : r.reason === 'initial'  ? t('pipeline.rev_initial',  'initial')
                                       : r.reason === 'renewal'  ? t('pipeline.rev_renewal',  'renouvellement')
                                       : (r.reason || '—');
                      const color = r.reason === 'upsell' ? '#16a34a' : r.reason === 'downsell' ? '#dc2626' : '#64748b';
                      return (
                        <div key={r.revision_index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: '#475569', fontFamily: 'tabular-nums' }}>
                            <span style={{ fontWeight: 700, color: '#0f172a' }}>#{r.revision_index}</span>
                            <span style={{ padding: '1px 7px', borderRadius: 6, background: '#f1f5f9', color, fontWeight: 600, fontSize: 11 }}>{reasonLabel}</span>
                            <span>{fmt(r.amount_ttc)} TTC</span>
                          </span>
                          <span style={{ color: '#94a3b8', fontSize: 11 }}>{fmtDate(r.effective_date)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── HISTORY tab — full timeline, ZERO filter ─────── */}
          {tab === 'history' && (
            <div>
              {activities.length === 0 ? (
                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>{t('referrals.no_activity', 'Aucune activité')}</div>
              ) : (
                <div style={{ borderLeft: '2px solid #e2e8f0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 18 }}>
                  {activities.map(a => (
                    <div key={a.id} style={{ position: 'relative' }}>
                      <div style={{ position: 'absolute', left: -26, top: 4, width: 10, height: 10, borderRadius: '50%', background: 'var(--rb-primary, #059669)', border: '2px solid #fff', boxShadow: '0 0 0 2px #e2e8f0' }} />
                      <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 3 }}>{fmtDateTime(a.created_at)}{a.user_name ? ` · ${a.user_name}` : ''}</div>
                      <div style={{ fontSize: 14, color: '#334155', fontWeight: 500 }}>{formatPartnerActivity(a, t)}</div>
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

// Mirror of formatActivity in ReferralsPage.jsx. Duplicated rather
// than imported because the admin module isn't loaded for partner
// users — partial bundling. Q2-a decision: ALL activities surface,
// no filter on note_added / assigned (= internal notes / internal
// assignments). If product later wants to scrub some, edit ONE place.
function formatPartnerActivity(a, t) {
  switch (a.action) {
    case 'created':           return t('referrals.act_created', 'Recommandation créée');
    case 'status_change':     return `${t('referrals.act_status', 'Statut')}: ${STATUS_CONFIG[a.old_value]?.label || a.old_value} → ${STATUS_CONFIG[a.new_value]?.label || a.new_value}`;
    case 'value_updated':     return t('referrals.act_value_updated', { value: fmt(a.new_value), defaultValue: 'Valeur mise à jour: {{value}}' });
    case 'engagement_updated':return t('referrals.act_engagement_updated', { value: a.new_value, defaultValue: 'Engagement mis à jour : {{value}}' });
    case 'engagement_duration_set':
      return t('referrals.act_engagement_duration_set', { from: a.old_value || '—', to: a.new_value, defaultValue: 'Durée de la commission : {{from}} → {{to}}' });
    case 'commission_recalculated':
      return t('referrals.act_commission_recalculated', { from: a.old_value ? fmt(a.old_value) : '—', to: a.new_value ? fmt(a.new_value) : '—', detail: a.comment || '', defaultValue: 'Commission révisée : {{from}} → {{to}} TTC. {{detail}}' });
    case 'commission_cancelled_lost':
      return t('referrals.act_commission_cancelled_lost', { detail: a.comment || '', defaultValue: 'Commission annulée (deal perdu). {{detail}}' });
    case 'commission_last_cycle_authorized':
      return t('referrals.act_commission_last_cycle_authorized', 'Dernier cycle autorisé au paiement avant arrêt définitif.');
    case 'commission_cancellation_confirmed':
      return t('referrals.act_commission_cancellation_confirmed', 'Arrêt définitif confirmé — aucun versement supplémentaire.');
    case 'commission_renewed':
      return t('referrals.act_commission_renewed', { from: a.old_value, to: a.new_value, defaultValue: 'Renouvellement préparé (cycle {{from}} → {{to}}).' });
    case 'assigned':          return t('referrals.act_assigned', 'Assignation interne mise à jour');
    case 'note_added':        return t('referrals.act_note', { value: a.new_value, defaultValue: 'Note interne ajoutée : {{value}}' });
    default:                  return a.action;
  }
}

function Field({ label, value }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div>
    </div>
  );
}

