import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate } from '../lib/constants';
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
  const [deleting, setDeleting] = useState(null);
  const [viewMode, setViewMode] = useState('kanban');
  const [deleteId, setDeleteId] = useState(null);
  const [stages, setStages] = useState([]);
  const [draggedId, setDraggedId] = useState(null);
  const [toast, setToast] = useState(null);
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
      .then(d => { if (d?.referral) setSelected(d.referral); })
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
      if (selected?.id === id) setSelected(null);
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
          onSelect={setSelected}
        />
      ) : (
        <TableView referrals={referrals} onSelect={setSelected} />
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
          onClose={() => setSelected(null)}
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

function DetailModal({ referral, onClose, onDelete, deleting }) {
  const { t } = useTranslation();
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

