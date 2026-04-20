import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate } from '../lib/constants';
import { FileText, TrendingUp, DollarSign, Trash2, LayoutGrid, List, ChevronRight, X, Search, Lock, GripVertical, Link as LinkIcon, Copy, Plus, RotateCcw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ConfirmModal from '../components/ConfirmModal.jsx';

const KANBAN_STATUSES = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'duplicate'];

export default function PartnerMyReferrals() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [referrals, setReferrals] = useState([]);
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [viewMode, setViewMode] = useState('kanban');
  const [deleteId, setDeleteId] = useState(null);
  const [stages, setStages] = useState([]);
  const [draggedId, setDraggedId] = useState(null);
  const [toast, setToast] = useState(null);
  const [features, setFeatures] = useState(null);

  const load = async () => {
    try {
      const [r, k, s, f] = await Promise.all([
        api.getReferrals(),
        api.getKPIs(),
        api.getPipelineStages().catch(() => ({ stages: [] })),
        api.getTenantFeatures().catch(() => ({ features: {} })),
      ]);
      setReferrals(r.referrals);
      setKpis(k);
      setStages(s.stages || []);
      setFeatures(f.features || {});
    } catch (err) { console.error(err); }
  };

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  const showToast = (text, type = 'warning') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 3500);
  };

  const handleDragStart = (e, r) => {
    if (r.lead_handling === 'client_prospect') {
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
    if (ref.lead_handling === 'client_prospect') {
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
      const k = await api.getKPIs();
      setKpis(k);
    } catch (err) { alert(err.message); }
    setDeleting(null);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partnerReferrals.loading')}</div>;

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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('partnerReferrals.title')}</h1>
          <p style={{ color: '#64748b' }}>{t('partnerReferrals.subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          <button onClick={() => setViewMode('kanban')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><LayoutGrid size={14} /> {t('partnerReferrals.view_kanban')}</button>
          <button onClick={() => setViewMode('table')} style={{ padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8', fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none' }}><List size={14} /> {t('partnerReferrals.view_table')}</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <PKPI icon={FileText} label={t('partnerReferrals.kpi_total')} value={kpis?.total_referrals || 0} color="var(--rb-primary, #059669)" />
        <PKPI icon={TrendingUp} label={t('partnerReferrals.kpi_won')} value={kpis?.won_count || 0} sub={fmt(kpis?.total_revenue || 0)} color="#16a34a" />
        <PKPI icon={DollarSign} label={t('partnerReferrals.kpi_commission')} value={fmt(kpis?.total_commission || 0)} color="var(--rb-accent, #f97316)" />
      </div>

      {features?.feature_referral_links && user?.partnerId && (
        <ReferralLinkCard partnerId={user.partnerId} />
      )}
      {features?.feature_promo_codes && user?.partnerId && (
        <PartnerPromoCodes partnerId={user.partnerId} />
      )}

      {referrals.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <p style={{ color: '#94a3b8', marginBottom: 16 }}>{t('partnerReferrals.empty_message')}</p>
          <a href="/partner/submit" style={{ color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{t('partnerReferrals.empty_cta')}</a>
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
          background: toast.type === 'error' ? '#fef2f2' : '#fffbeb',
          color: toast.type === 'error' ? '#dc2626' : '#92400e',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#fcd34d'}`,
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

      {/* Explore other partner programs — moved here from the sidebar
          so partners discover the marketplace without it living in the
          nav. */}
      <div
        onClick={() => navigate('/marketplace')}
        style={{
          marginTop: 32,
          padding: '16px 20px',
          background: 'rgba(5,150,105,0.05)',
          border: '1px solid rgba(5,150,105,0.18)',
          borderRadius: 14,
          display: 'flex', alignItems: 'center', gap: 14,
          cursor: 'pointer',
          fontFamily: 'inherit',
          transition: 'background .15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.08)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'rgba(5,150,105,0.05)'; }}
      >
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(5,150,105,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Search size={18} color="#059669"/>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
            {t('partnerReferrals.discover_title') || 'Découvrez d\'autres programmes partenaires'}
          </div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
            {t('partnerReferrals.discover_subtitle') || 'Trouvez de nouveaux programmes à recommander.'}
          </div>
        </div>
        <span style={{ color: '#059669', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap' }}>
          {t('partnerReferrals.explore_marketplace') || 'Explorer la marketplace'} →
        </span>
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
      <div style={{ display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 8, height: 'calc(100vh - 320px)', minHeight: 400 }}>
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
                  const locked = r.lead_handling === 'client_prospect';
                  return (
                    <div
                      key={r.id}
                      draggable={!locked}
                      onDragStart={e => onDragStart(e, r)}
                      onClick={() => onSelect(r)}
                      style={{
                        background: '#fff', borderRadius: 12, padding: 14,
                        cursor: locked ? 'pointer' : 'grab',
                        border: draggedId === r.id ? `2px solid ${stageColor}` : '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                        opacity: draggedId === r.id ? 0.5 : 1,
                        transition: 'all 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.prospect_name}</div>
                        {locked
                          ? <Lock size={13} color="#94a3b8" />
                          : <GripVertical size={14} color="#cbd5e1" />}
                      </div>
                      <LeadHandlingBadge handling={r.lead_handling} />
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

function LeadHandlingBadge({ handling }) {
  const { t } = useTranslation();
  if (handling === 'client_prospect') {
    return (
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#dbeafe', color: '#2563eb', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
        📞 {t('referral.client_prospect_badge')}
      </div>
    );
  }
  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 999, background: '#f0fdf4', color: '#059669', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 }}>
      🤝 {t('referral.partner_managed_badge')}
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

// ═══ Referral link card (partner) ═══
function ReferralLinkCard({ partnerId }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.getPartnerReferralLink(partnerId)
      .then(setData)
      .catch(() => setData(null));
  }, [partnerId]);

  if (!data) return null;

  const copy = () => {
    navigator.clipboard.writeText(data.referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const regenerate = async () => {
    if (!window.confirm(t('referral_link.regenerate_confirm'))) return;
    setBusy(true);
    try {
      const r = await api.regenerateReferralCode(partnerId);
      const fresh = await api.getPartnerReferralLink(partnerId);
      setData(fresh);
    } catch (e) { alert(e.message); }
    setBusy(false);
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LinkIcon size={18} color="#059669" />
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{t('referral_link.title')}</div>
          <div style={{ fontSize: 12, color: '#64748b', marginTop: 1 }}>{t('referral_link.subtitle')}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input
          readOnly
          value={data.referralLink}
          style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, monospace', color: '#334155', background: '#f8fafc', boxSizing: 'border-box' }}
          onFocus={e => e.target.select()}
        />
        <button onClick={copy} style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Copy size={14} /> {copied ? t('referral_link.copied') : t('referral_link.copy')}
        </button>
        <button onClick={regenerate} disabled={busy} title={t('referral_link.regenerate')} style={{ padding: '10px 12px', borderRadius: 10, background: '#f1f5f9', color: '#475569', border: 'none', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
          <RotateCcw size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <LinkStat label={t('referral_link.clicks')} value={data.stats?.total_clicks || 0} />
        <LinkStat label={t('referral_link.clicks_month')} value={data.stats?.month_clicks || 0} />
        <LinkStat label={t('referral_link.conversions')} value={data.stats?.conversions || 0} accent />
      </div>
    </div>
  );
}

function LinkStat({ label, value, accent }) {
  return (
    <div style={{ background: accent ? '#f0fdf4' : '#f8fafc', borderRadius: 10, padding: '12px 14px', border: '1px solid ' + (accent ? '#bbf7d0' : '#e2e8f0') }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent ? '#059669' : '#0f172a', marginTop: 4 }}>{value}</div>
    </div>
  );
}

// ═══ Partner promo codes (CRUD) ═══
function PartnerPromoCodes({ partnerId }) {
  const { t } = useTranslation();
  const [codes, setCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ code: '', discountType: 'percentage', discountValue: '10', description: '', maxUses: '', expiresAt: '' });
  const [err, setErr] = useState(null);

  const reload = () => {
    setLoading(true);
    api.getPartnerPromoCodes()
      .then(d => setCodes(d.promoCodes || []))
      .catch(() => setCodes([]))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const create = async () => {
    setErr(null);
    try {
      await api.createPromoCode({ ...form, partnerId });
      setCreating(false);
      setForm({ code: '', discountType: 'percentage', discountValue: '10', description: '', maxUses: '', expiresAt: '' });
      reload();
    } catch (e) { setErr(e.message); }
  };

  const toggleActive = async (c) => {
    try {
      await api.updatePromoCode(c.id, { isActive: !c.is_active });
      reload();
    } catch (e) { alert(e.message); }
  };
  const remove = async (c) => {
    if (!window.confirm(t('promo_code.delete_confirm'))) return;
    try { await api.deletePromoCode(c.id); reload(); } catch (e) { alert(e.message); }
  };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 24, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{t('promo_code.title')}</div>
        <button onClick={() => setCreating(true)} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={14} /> {t('promo_code.create')}
        </button>
      </div>

      {loading ? (
        <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>…</div>
      ) : codes.length === 0 ? (
        <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center', fontSize: 14 }}>{t('promo_code.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {codes.map(c => (
            <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 100px 120px 100px', gap: 12, alignItems: 'center', padding: '10px 14px', borderRadius: 10, background: c.is_active ? '#f8fafc' : '#fef2f2', border: '1px solid ' + (c.is_active ? '#e2e8f0' : '#fecaca') }}>
              <div>
                <div style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 700, color: '#0f172a' }}>{c.code}</div>
                {c.description && <div style={{ fontSize: 12, color: '#64748b' }}>{c.description}</div>}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#059669' }}>
                {c.discount_type === 'percentage' ? `${parseFloat(c.discount_value)}%` : `${parseFloat(c.discount_value)}€`}
              </div>
              <div style={{ fontSize: 12, color: '#475569' }}>
                {c.current_uses || 0}{c.max_uses ? ` / ${c.max_uses}` : ` / ${t('promo_code.unlimited')}`}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: c.is_active ? '#f0fdf4' : '#fef2f2', color: c.is_active ? '#059669' : '#dc2626', width: 'fit-content' }}>
                {c.is_active ? t('promo_code.active') : t('promo_code.inactive')}
              </div>
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                <button onClick={() => { navigator.clipboard.writeText(c.code); }} style={{ padding: 6, background: 'none', border: 'none', color: '#64748b', cursor: 'pointer' }} title={t('referral_link.copy')}>
                  <Copy size={14} />
                </button>
                <button onClick={() => toggleActive(c)} style={{ padding: '4px 8px', borderRadius: 6, background: c.is_active ? '#fff' : '#059669', color: c.is_active ? '#64748b' : '#fff', border: '1px solid ' + (c.is_active ? '#e2e8f0' : '#059669'), cursor: 'pointer', fontSize: 11, fontWeight: 600 }}>
                  {c.is_active ? t('promo_code.inactive') : t('promo_code.active')}
                </button>
                <button onClick={() => remove(c)} style={{ padding: 6, background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {creating && (
        <div onClick={() => setCreating(false)} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 16 }}>{t('promo_code.create')}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.code')}</label>
                <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="SEBDU20" style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.discount_type')}</label>
                  <select value={form.discountType} onChange={e => setForm(f => ({ ...f, discountType: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }}>
                    <option value="percentage">{t('promo_code.percentage')}</option>
                    <option value="fixed">{t('promo_code.fixed')}</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.discount_value')}</label>
                  <input type="number" min="0" value={form.discountValue} onChange={e => setForm(f => ({ ...f, discountValue: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.description')}</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.max_uses')}</label>
                  <input type="number" min="0" placeholder={t('promo_code.unlimited')} value={form.maxUses} onChange={e => setForm(f => ({ ...f, maxUses: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4 }}>{t('promo_code.expires_at')}</label>
                  <input type="date" value={form.expiresAt} onChange={e => setForm(f => ({ ...f, expiresAt: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
              </div>
              {err && <div style={{ padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{err}</div>}
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button onClick={() => setCreating(false)} style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{t('common.cancel')}</button>
                <button onClick={create} style={{ flex: 1, padding: '10px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{t('common.save')}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
