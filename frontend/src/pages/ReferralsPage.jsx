import { useTranslation } from 'react-i18next';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import { STATUS_CONFIG, LEVEL_CONFIG, TEMPERATURE_CONFIG, STATUS_ORDER, fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { calculateCommissionAmount, decomposeAmountWithTax } from '../lib/commissionFormula';
import { X, ChevronRight, Clock, Trash2, List, LayoutGrid, GripVertical, Lock, AlertTriangle, ArrowUp, ArrowDown, ChevronsUpDown } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal.jsx';
import PartnerCombobox from '../components/PartnerCombobox.jsx';

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

  // URL-driven sort state. Default to date DESC (newest on top). Sort
  // is shared with the BE via ?sort=&order= so a refresh restores the
  // user's column choice and a link is shareable.
  const [searchParamsState, setSearchParamsState] = useSearchParams();
  const sortKey = ['prospect','partner','level','status','value','date'].includes(searchParamsState.get('sort'))
    ? searchParamsState.get('sort') : 'date';
  const sortOrder = searchParamsState.get('order') === 'asc' ? 'asc' : 'desc';
  const setSort = (col) => {
    const next = new URLSearchParams(searchParamsState);
    if (sortKey === col) {
      next.set('order', sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      next.set('sort', col);
      next.set('order', col === 'date' || col === 'value' ? 'desc' : 'asc');
    }
    setSearchParamsState(next, { replace: true });
  };

  const load = useCallback(async () => {
    try {
      const params = { sort: sortKey, order: sortOrder };
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.partner_id !== 'all') params.partner_id = filters.partner_id;
      const [refData, partData, mt] = await Promise.all([api.getReferrals(params), api.getPartners(), api.getMyTenant()]);
      setReferrals(refData.referrals); setMyTenant(mt && (mt.tenant || mt)); setTotal(refData.total); setPartners(partData.partners);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [filters, sortKey, sortOrder]);

  useEffect(() => { load(); }, [load]);

  // Deep-link from /search: navigate('/referrals?open=<id>') opens
  // that referral in the existing detail modal. Strip the param after
  // we consume it so a refresh doesn't re-open the modal forever.
  // Reuses the same searchParams hook handle from the sort block above.
  const openIdRef = useRef(null);
  useEffect(() => {
    const openId = searchParamsState.get('open');
    if (!openId || openIdRef.current === openId) return;
    openIdRef.current = openId;
    (async () => {
      try {
        const data = await api.getReferral(openId);
        if (data.referral) {
          setSelected(data.referral);
          setActivities(data.activities || []);
        }
      } catch {}
    })();
    const next = new URLSearchParams(searchParamsState);
    next.delete('open');
    setSearchParamsState(next, { replace: true });
  }, [searchParamsState, setSearchParamsState]);

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
    } catch (err) { showToast.error(err.message); }
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
    } catch (err) {
      const code = err?.data?.error || err?.message;
      const friendly = err?.data?.message
        || (code === 'commission_locked' && t('referrals.error_commission_locked', 'Cette commission est déjà en cours de paiement, le statut ne peut pas être modifié.'))
        || err.message
        || 'Error';
      showToast.error(friendly);
    }
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
        title={t('trash.confirm_title')}
        message={t('trash.confirm_message')}
        confirmLabel={t('trash.confirm_delete')}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={confirmDelete}
        onCancel={() => setDeleteId(null)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
          {t('trash.recovery_notice')}
        </span>
      </ConfirmModal>
      {/* Confetti */}
      {showConfetti && <Confetti />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.2, margin: 0 }}>{t('referrals.title')}</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>{total} {t('referrals.count')}</p>
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
          <PartnerCombobox
            value={filters.partner_id}
            partners={partners}
            onChange={(id) => setFilters(f => ({ ...f, partner_id: id }))}
            allLabel={t('referrals.all_partners')}
          />
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
                {/* Per-column alignment + click-to-sort. align defaults
                    to 'left'; numeric/date columns use 'right',
                    badge columns use 'center'. Arrow icon mirrors
                    sortKey + sortOrder. */}
                {[
                  { key: 'prospect', label: t('referrals.tbl_prospect'), align: 'left'   },
                  { key: 'partner',  label: t('referrals.tbl_partner'),  align: 'left'   },
                  { key: 'level',    label: t('referrals.tbl_level'),    align: 'center' },
                  { key: 'status',   label: t('referrals.tbl_status'),   align: 'center' },
                  { key: 'value',    label: t('referrals.tbl_value'),    align: 'right'  },
                  { key: 'date',     label: t('referrals.tbl_date'),     align: 'right'  },
                ].map((h) => {
                  const active = sortKey === h.key;
                  const ArrowIcon = !active ? ChevronsUpDown : (sortOrder === 'asc' ? ArrowUp : ArrowDown);
                  return (
                    <th key={h.key} onClick={() => setSort(h.key)}
                      style={{
                        padding: '13px 16px', textAlign: h.align,
                        fontWeight: 600, color: active ? '#0f172a' : '#64748b',
                        fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5,
                        borderBottom: '1px solid #e2e8f0', cursor: 'pointer',
                        whiteSpace: 'nowrap', userSelect: 'none',
                      }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        // Centre/right alignment for the inline-flex container needs the
                        // wrapper's text-align to push the chip the right way.
                      }}>
                        {h.label}
                        <ArrowIcon size={11} color={active ? '#059669' : '#cbd5e1'} />
                      </span>
                    </th>
                  );
                })}
                <th style={{ borderBottom: '1px solid #e2e8f0', padding: '13px 16px', width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {referrals.length === 0 ? (
                <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('referrals.no_result')}</td></tr>
              ) : referrals.map(r => (
                <tr key={r.id} onClick={() => openDetail(r)} style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#fafbfc'} onMouseLeave={e => e.currentTarget.style.background = ''}>
                  <td style={{ padding: '13px 16px', textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontWeight: 600, color: '#0f172a' }}>{r.prospect_name}</span>
                      <CrmSyncBadge referral={r}/>
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{r.prospect_company}</div>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#475569', textAlign: 'left' }}>{r.partner_name}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}><Badge config={TEMPERATURE_CONFIG} value={r.recommendation_level} /></td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}><Badge config={stageStatusConfig} value={(stages.find(s => s.id === r.stage_id)?.slug) || r.status} /></td>
                  <td style={{ padding: '13px 16px', fontWeight: 600, color: '#0f172a', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.deal_value > 0 ? fmt(r.deal_value) : '—'}</td>
                  <td style={{ padding: '13px 16px', color: '#94a3b8', fontSize: 13, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtDate(r.created_at)}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'right' }}><ChevronRight size={16} color="#94a3b8" /></td>
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
            // Sum MRR/CA across the WHOLE column, not the page
            // slice, so the header total stays correct even when
            // only the first 25 cards are rendered.
            const columnMrr = allCards.reduce((sum, r) => sum + (parseFloat(r.deal_value) || 0), 0);
            // Per tenant revenue_model: MRR/CA bill monthly, ARR is
            // annual, Other gets a generic label. The /mois suffix
            // tracks whatever monthly cadence applies.
            const rModel = (myTenant?.revenue_model || 'CA');
            const columnLabel = rModel === 'ARR'
              ? `${rModel} /${t('referrals.unit_year_short', 'an')}`
              : rModel === 'Other'
                ? t('common.revenue', 'Revenu')
                : `${rModel} /${t('referrals.unit_month_short', 'mois')}`;
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
                {/* Column header — title row + MRR/CA total. Total
                    is the WHOLE-column sum, not the visible slice,
                    so paging through the column doesn't shift it. */}
                <div style={{ padding: '10px 12px', marginBottom: 10, borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: stageColor, flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stage.name}</span>
                      <span style={{ background: '#f1f5f9', color: '#64748b', fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999, flexShrink: 0 }}>{allCards.length}</span>
                    </div>
                    {columnMrr > 0 && (
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 13, color: '#0f172a' }}>{fmt(columnMrr)}</div>
                        <div style={{ fontSize: 10, color: '#94a3b8', marginTop: -1 }}>{columnLabel}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cards - scrollable */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                  {cards.map(r => {
                    // Forecast commission per the shared helper —
                    // matches the cents that will land in /commissions
                    // when this deal moves to won. Only shown when the
                    // partner's rate is known and the deal carries a
                    // positive MRR/CA value.
                    const dealValue = parseFloat(r.deal_value) || 0;
                    const rate = r.effective_commission_rate != null
                      ? Number(r.effective_commission_rate)
                      : (Number(r.commission_rate) || 0);
                    const fc = dealValue > 0 && r.engagement
                      ? calculateCommissionAmount({
                          engagementType: r.engagement,
                          periods: r.engagement_periods,
                          dealValue,
                          rate,
                        })
                      : null;
                    return (
                    <div key={r.id} draggable onDragStart={e => handleDragStart(e, r.id)}
                      onClick={() => openDetail(r)}
                      style={{
                        background: '#fff', borderRadius: 12, padding: 12, cursor: 'grab',
                        border: draggedId === r.id ? `2px solid ${stageColor}` : '1px solid #e2e8f0',
                        // Won column: 3px green left accent so closed
                        // deals jump out visually without a separate
                        // badge.
                        borderLeft: stage.is_won ? '3px solid #16a34a' : (draggedId === r.id ? `2px solid ${stageColor}` : '1px solid #e2e8f0'),
                        boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
                        opacity: draggedId === r.id ? 0.5 : 1, transition: 'all 0.15s',
                      }}
                    >
                      {/* Row 1: company / prospect + amount */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {r.prospect_company || r.prospect_name}
                          </div>
                          <CrmSyncBadge referral={r}/>
                        </div>
                        {dealValue > 0 && (
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, whiteSpace: 'nowrap' }}>{fmt(dealValue)}</div>
                        )}
                      </div>
                      {/* Row 2: lead-handling badge ("GÉRÉ PAR
                          PARTENAIRE" / "PROSPECT CLIENT"). */}
                      <div style={{ marginTop: 6 }}>
                        <LeadHandlingBadge handling={r.lead_handling}/>
                      </div>
                      {/* Row 3: contact + partner name. The
                          "GÉRÉ PAR PARTENAIRE" line above already
                          covers the lead source, so this line is
                          purely contact info. */}
                      {(r.contact_first_name || r.contact_last_name || r.partner_name) && (
                        <div style={{ color: '#64748b', fontSize: 11, marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {[r.contact_first_name, r.contact_last_name].filter(Boolean).join(' ')}
                          {(r.contact_first_name || r.contact_last_name) && r.partner_name ? ' · ' : ''}
                          {r.partner_name && <span style={{ color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{r.partner_name}</span>}
                        </div>
                      )}
                      {/* Row 4: temperature pill (left) + commission
                          forecast (right). Forecast omitted when the
                          deal has no MRR or no engagement set. */}
                      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 18 }}>
                        {r.recommendation_level && TEMPERATURE_CONFIG[r.recommendation_level] ? (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: 5,
                            padding: '2px 8px', borderRadius: 999,
                            background: TEMPERATURE_CONFIG[r.recommendation_level].bg,
                            color: TEMPERATURE_CONFIG[r.recommendation_level].color,
                            fontSize: 10, fontWeight: 700,
                          }}>
                            <span aria-hidden="true" style={{
                              width: 5, height: 5, borderRadius: '50%',
                              background: TEMPERATURE_CONFIG[r.recommendation_level].color,
                            }}/>
                            {TEMPERATURE_CONFIG[r.recommendation_level].label}
                          </span>
                        ) : <span/>}
                        {fc && fc.amount > 0 && (
                          <span style={{ color: '#16a34a', fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap' }}>
                            ~{fmt(fc.amount)} {t('referrals.commission_short', 'comm.')}
                          </span>
                        )}
                      </div>
                      {/* Quick status change — kept verbatim from
                          before the redesign, including the
                          stopPropagation guard so the dropdown
                          doesn't open the modal. */}
                      <div style={{ marginTop: 8 }}>
                        <select value={r.status} onChange={e => { e.stopPropagation(); handleStatusChangeFromCard(r.id, e.target.value); }}
                          onClick={e => e.stopPropagation()}
                          style={{ width: '100%', padding: '6px 8px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#475569', fontWeight: 500, fontSize: 11, cursor: 'pointer' }}>
                          {(stages.length ? stages.map(s => ({ k: s.slug, label: s.name })) : Object.entries(STATUS_CONFIG).map(([k, v]) => ({ k, label: v.label }))).map(({ k, label }) => (
                            <option key={k} value={k}>{label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    );
                  })}
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
// Tier badge palette. Bronze/Silver/Gold/Platinum are the default
// tier names — any custom name a tenant defines falls through to
// the neutral slate palette so unknown tiers still look intentional.
const TIER_PALETTE = {
  Bronze:   { bg: '#fef3c7', text: '#92400e', border: '#f59e0b' },
  Silver:   { bg: '#e0f2fe', text: '#0c4a6e', border: '#3b82f6' },
  Gold:     { bg: '#fef9c3', text: '#854d0e', border: '#eab308' },
  Platinum: { bg: '#f3e8ff', text: '#6b21a8', border: '#8b5cf6' },
};
const TIER_NEUTRAL = { bg: '#f1f5f9', text: '#475569', border: '#cbd5e1' };
function tierPalette(tier) {
  if (!tier || !tier.name) return TIER_NEUTRAL;
  return TIER_PALETTE[tier.name] || TIER_NEUTRAL;
}

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
  // G2 — setup_value du contrat client final (montant setup one-shot HT).
  // Visible uniquement en business_model 'hybrid'. Le partenaire touchera
  // un % distinct (tenant_levels.setup_rate) sur ce montant, au won.
  const [editSetupValue, setEditSetupValue] = useState(
    referral.setup_value != null ? String(parseFloat(referral.setup_value)) : ''
  );
  const isHybridTenant = (myTenant?.business_model || 'mrr_only') === 'hybrid';
  const [saving, setSaving] = useState(false);
  // Existing rows can ship one of the legacy English keys
  // (monthly/quarterly/yearly) until the v27 migration drains them.
  // Map them on read so the selector highlights the right pill;
  // writes always send the French key.
  const _legacyEng = { monthly: 'mensuel', quarterly: 'trimestriel', yearly: 'annuel' };
  const _initialEng = _legacyEng[referral.engagement] || referral.engagement || 'mensuel';
  const [editEngagement, setEditEngagement] = useState(_initialEng);
  const [editPeriods, setEditPeriods] = useState(
    _initialEng === 'forfait' ? 1 : Math.max(1, parseInt(referral.engagement_periods, 10) || 1)
  );
  // E2 refonte: longevity moved off the deal modal entirely — it's
  // now configured per-tier in the Programme page. The deal modal
  // only carries the cadence (engagement_type + engagement_periods),
  // which the user is always free to edit regardless of any flag.
  const [tab, setTab] = useState('info');
  const [saveToast, setSaveToast] = useState(null);

  // Inline contact-field patch. Used by the EditableInfoRow widgets
  // on the Info tab. Returns the API promise so the widget can flip
  // its busy state + show a success/error indicator. Errors bubble
  // up so the row can revert the optimistic value.
  const patchContact = async (patch) => {
    await onUpdate(referral.id, patch);
    setSaveToast({ type: 'success', text: t('referrals.saved_ok') });
    setTimeout(() => setSaveToast(null), 1800);
  };

  // Commission rate state. Initial value is the effective rate the
  // backend resolved (override → tier → legacy partner.commission_rate).
  // partner_tier carries the live tier so the badge + warning modal
  // know what to compare against.
  const partnerTier = referral.partner_tier || null;
  const initialRate = referral.effective_commission_rate != null
    ? Number(referral.effective_commission_rate)
    : (Number(referral.commission_rate) || 10);
  const [editRate, setEditRate] = useState(initialRate);
  const [commissionOverridden, setCommissionOverridden] = useState(!!referral.commission_overridden);
  const [pendingRate, setPendingRate] = useState(null);
  const [showCommissionWarning, setShowCommissionWarning] = useState(false);

  // Editing the rate is a two-step flow:
  //   - typing always commits a local "pending" value (so the input
  //     feels live)
  //   - on blur (or hit-Enter) we compare to the tier rate; if it
  //     differs, the warning modal pops to confirm the override.
  // This keeps the user from accidentally locking a deal to a custom
  // rate by pressing the wrong key.
  const tierRate = partnerTier ? parseFloat(partnerTier.commission_rate) : null;
  const handleRateBlur = () => {
    const v = parseFloat(editRate);
    if (!isFinite(v)) {
      // Bad input — snap back to whatever the saved state has.
      setEditRate(initialRate);
      return;
    }
    const clamped = Math.max(0, Math.min(100, v));
    if (clamped !== v) setEditRate(clamped);
    if (tierRate != null && clamped !== tierRate) {
      // Pop the warning before committing the override flag.
      setPendingRate(clamped);
      setShowCommissionWarning(true);
    } else if (clamped === tierRate) {
      // User snapped back to the tier rate — clear the override.
      setCommissionOverridden(false);
    }
  };

  // Keep periods=1 whenever the user flips to forfait. The backend
  // also clamps but doing it client-side keeps the forecast number
  // honest the moment the pill changes.
  const handleEngagementChange = (next) => {
    setEditEngagement(next);
    if (next === 'forfait') setEditPeriods(1);
  };

  const pickStage = (stage) => {
    setEditStageId(stage.id);
    setEditStatus(stage.slug || stage.id);
  };

  const selectedStage = stages.find(s => s.id === editStageId) || null;

  const handleSave = async () => {
    setSaving(true);
    setSaveToast(null);
    try {
      const patch = {
        deal_value: Number(editValue) || 0,
        engagement: editEngagement,
        engagement_periods: editEngagement === 'forfait' ? 1 : Math.max(1, parseInt(editPeriods, 10) || 1),
        commission_overridden: commissionOverridden,
        // Always send the override value so the backend can clear
        // it on flag-off (it sets commission_rate_override = null
        // when commission_overridden flips to false).
        commission_rate_override: commissionOverridden ? Number(editRate) : null,
      };
      // G2 — setup_value : envoyé UNIQUEMENT si le tenant est en
      // business_model='hybrid' (en mrr_only, le champ n'est pas
      // affiché → on ne pollue pas la requête avec une valeur stale).
      if (isHybridTenant) {
        patch.setup_value = editSetupValue === '' ? null : Number(editSetupValue);
      }
      if (editStageId) patch.stage_id = editStageId;
      else if (editStatus) patch.status = editStatus;
      await onUpdate(referral.id, patch);
      setSaveToast({ type: 'success', text: t('referrals.saved_ok') });
      setTimeout(() => setSaveToast(null), 2500);
    } catch (e) {
      // The backend uses `error` as a short code and `message` for
      // the human-readable sentence (deal_value_locked /
      // commission_locked are the two we map here). Fall back to
      // the generic save_error otherwise.
      const code = e?.data?.error || e?.message;
      const friendly = e?.data?.message
        || (code === 'deal_value_locked' && t('referrals.error_deal_value_locked', 'Le montant ne peut plus être modifié — un virement est en cours pour cette commission.'))
        || (code === 'commission_locked' && t('referrals.error_commission_locked', 'Cette commission est déjà en cours de paiement, le statut ne peut pas être modifié.'))
        || (code === 'revision_blocked_payment_in_flight' && t('referrals.error_revision_payment_in_flight', 'Un virement est déjà initié pour cette commission. Attendez sa finalisation avant de modifier le montant.'))
        || (code === 'lost_blocked_payment_in_flight' && t('referrals.error_lost_payment_in_flight', 'Un virement est déjà initié pour cette commission. Attendez sa finalisation avant de clôturer le deal en perdu.'))
        || t('referrals.save_error');
      setSaveToast({ type: 'error', text: friendly });
    }
    setSaving(false);
  };

  // Live rate flows through to the forecast so the displayed
  // amount tracks every keystroke in the rate input.
  const rate = Number(editRate) || 0;
  const isWonSelected = selectedStage ? !!selectedStage.is_won : editStatus === 'won';
  // Shared with the backend's calculateCommissionAmount() so the
  // forecast we show here matches the row that lands in
  // /commissions to the cent. multiplier exposes the
  // months-per-period × periods product so the breakdown line can
  // explain the math without recomputing it.
  const forecast = calculateCommissionAmount({
    engagementType: editEngagement,
    periods: editPeriods,
    dealValue: Number(editValue) || 0,
    rate,
  });
  const commission = isWonSelected ? forecast.amount : 0;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 680, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ padding: '28px 32px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>{referral.prospect_name}</h2>
              <Badge config={TEMPERATURE_CONFIG} value={referral.recommendation_level} />
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
                {/* Five contact fields are inline-editable so a form
                    lead (anonymous prospect, possibly synthetic email)
                    or a hastily-entered manual lead can be corrected
                    without round-tripping through a separate edit
                    modal. partner_name / assigned_name / created_at
                    stay read-only — they're system-managed. */}
                <EditableInfoRow label={t('referrals.field_first_name', { defaultValue: 'Prénom' })}
                  value={referral.contact_first_name || ''}
                  onSave={v => patchContact({ contact_first_name: v })} />
                <EditableInfoRow label={t('referrals.field_last_name',  { defaultValue: 'Nom' })}
                  value={referral.contact_last_name || ''}
                  onSave={v => patchContact({ contact_last_name: v })} />
                <EditableInfoRow label={t('referrals.field_role')}
                  value={referral.prospect_role || ''}
                  onSave={v => patchContact({ prospect_role: v })} />
                <EditableInfoRow label={t('referrals.field_email')}
                  value={referral.prospect_email || ''}
                  type="email" required
                  onSave={v => patchContact({ prospect_email: v })} />
                <EditableInfoRow label={t('referrals.field_phone')}
                  value={referral.prospect_phone || ''}
                  type="tel"
                  onSave={v => patchContact({ prospect_phone: v })} />
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
          {tab === 'pipeline' && (() => {
            // Compute stepper data once per render — both the bar and
            // the pills below it derive their state from the same
            // selected-stage flags so the visual progress stays in
            // lock-step with the active pill.
            const stageList = stages.length ? stages : [];
            const currentStage = stageList.find(s => s.id === editStageId)
              || stageList.find(s => s.slug === editStatus)
              || null;
            const isLost = !!(currentStage && currentStage.is_lost) || editStatus === 'lost' || editStatus === 'perdu';
            // Index of the currently-selected stage. Lost stages are
            // collapsed to -1 so the green progression doesn't reach
            // them; the lost-state colours the whole bar red instead.
            const currentIndex = stageList.findIndex(s =>
              s.id === editStageId || s.slug === editStatus
            );
            return (
            <div>
              {/* Section: status with stepper bar */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 10 }}>{t('referrals.field_status')}</div>
                {stageList.length > 0 && (
                  <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
                    {stageList.map((s, i) => {
                      const bg = isLost
                        ? '#fee2e2'
                        : i <= currentIndex && currentIndex >= 0
                          ? '#16a34a'
                          : i === currentIndex + 1
                            ? '#fbbf24'
                            : '#e2e8f0';
                      return <div key={s.id} style={{ flex: 1, height: 4, borderRadius: 999, background: bg, transition: 'background-color .15s' }} />;
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(stages.length
                    ? stages.map(s => ({ id: s.id, slug: s.slug, label: s.name, color: s.color || '#64748b', isStage: true, stage: s }))
                    : Object.entries(STATUS_CONFIG).map(([k, v]) => ({ id: k, slug: k, label: v.label, color: v.color, bg: v.bg, isStage: false }))
                  ).map(opt => {
                    const active = opt.isStage ? editStageId === opt.id : editStatus === opt.slug;
                    const bg = opt.isStage ? (opt.color + '15') : opt.bg;
                    const stageLocked = !!referral.deal_value_locked && !active;
                    return (
                      <button
                        key={opt.id}
                        onClick={() => {
                          if (stageLocked) return;
                          if (opt.isStage) pickStage(opt.stage);
                          else { setEditStageId(null); setEditStatus(opt.slug); }
                        }}
                        disabled={stageLocked}
                        title={stageLocked ? t('referrals.status_locked_tooltip', 'Statut verrouillé — commission en cours de paiement') : undefined}
                        style={{
                          padding: '8px 14px', borderRadius: 10,
                          border: active ? `2px solid ${opt.color}` : '2px solid #e2e8f0',
                          background: active ? bg : '#fff',
                          opacity: stageLocked ? 0.45 : 1,
                          color: opt.color,
                          fontWeight: 600, fontSize: 12,
                          cursor: stageLocked ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Separator between status and the financial section */}
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '20px 0' }} />

              {/* Section: MRR/CA + Commission rate side by side. The
                  two-column row matches the Option A approved
                  layout — the value drives the forecast on the
                  left, the rate drives it on the right. */}
              <div style={{ display: 'flex', gap: 14, marginBottom: 20, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
                    {rLabel} ({rUnit})
                    {referral.deal_value_locked && (
                      <span title={t('referrals.deal_value_locked_tooltip', 'Montant verrouillé — commission en cours de traitement')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 999, padding: '2px 8px' }}>
                        <Lock size={11} /> {t('referrals.deal_value_locked', 'Verrouillé')}
                      </span>
                    )}
                    {/* E3: clear visual signal that an edit here will
                        spawn an amendment (commission_revisions) on
                        an already-approved recurring commission. */}
                    {referral.deal_value_revision_allowed && Number(editValue) !== Number(referral.deal_value) && (
                      <span title={t('referrals.deal_value_revision_tooltip', 'La modification créera un avenant — les versements passés restent figés.')} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: '#6366f1', background: '#eef2ff', border: '1px solid #c7d2fe', borderRadius: 999, padding: '2px 8px' }}>
                        {t('referrals.deal_value_revision_badge', 'Crée un avenant')}
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    placeholder={t('referrals.value_ph')}
                    disabled={referral.deal_value_locked}
                    title={referral.deal_value_locked ? t('referrals.deal_value_locked_tooltip', 'Montant verrouillé — commission en cours de traitement') : undefined}
                    style={{
                      width: '100%', padding: '10px 14px', borderRadius: 10,
                      border: '2px solid #e2e8f0',
                      fontSize: 14, fontWeight: 600,
                      color: referral.deal_value_locked ? '#94a3b8' : '#0f172a',
                      background: referral.deal_value_locked ? '#f8fafc' : '#fff',
                      cursor: referral.deal_value_locked ? 'not-allowed' : 'text',
                      boxSizing: 'border-box',
                    }}
                  />
                  {/* G2 — Setup one-shot HT (hybrid uniquement). Sub-input
                      sous le MRR pour ne pas perturber l'alignement à
                      2 colonnes ; help-text pour clarifier la sémantique. */}
                  {isHybridTenant && (
                    <div style={{ marginTop: 10 }}>
                      <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
                        {t('referrals.setup_value_label', 'Setup one-shot HT')}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={editSetupValue}
                        onChange={e => setEditSetupValue(e.target.value)}
                        placeholder={t('referrals.setup_value_ph', 'Montant setup HT (laisser vide si pas de setup)')}
                        style={{
                          width: '100%', padding: '10px 14px', borderRadius: 10,
                          border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 600,
                          color: '#0f172a', background: '#fff', boxSizing: 'border-box',
                        }}
                      />
                      <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4, lineHeight: 1.4 }}>
                        {t('referrals.setup_value_help', 'Montant one-shot facturé au client à la signature (configuration, onboarding, etc.). Le partenaire touchera un % distinct sur ce montant.')}
                      </div>
                    </div>
                  )}
                </div>
                <div style={{ flex: '1 1 220px' }}>
                  <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 6 }}>
                    {t('pipeline.partner_commission', 'Commission du partenaire')}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', width: 90 }}>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={editRate}
                        onChange={e => setEditRate(e.target.value)}
                        onBlur={handleRateBlur}
                        style={{
                          width: '100%', padding: '10px 26px 10px 12px', borderRadius: 10,
                          border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 700,
                          color: '#0f172a', background: '#fff', boxSizing: 'border-box',
                        }}
                      />
                      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>%</span>
                    </div>
                    {partnerTier && (() => {
                      const pal = tierPalette(partnerTier);
                      return (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          fontSize: 12, fontWeight: 600,
                          padding: '5px 12px', borderRadius: 999,
                          background: pal.bg, color: pal.text,
                          borderTop: `2px solid ${pal.border}`,
                        }}>
                          {partnerTier.icon ? `${partnerTier.icon} ` : ''}{partnerTier.name}
                        </span>
                      );
                    })()}
                  </div>
                  {commissionOverridden && partnerTier && tierRate != null && (
                    <div style={{ marginTop: 6, fontSize: 12, color: '#b45309', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <AlertTriangle size={13} />
                      {t('pipeline.commission_overridden', {
                        tierName: partnerTier.name,
                        tierRate: tierRate,
                        defaultValue: 'Taux modifié (niveau {{tierName}} : {{tierRate}}%)',
                      })}
                    </div>
                  )}
                </div>
              </div>
              {referral.deal_value_locked && (
                <div style={{ marginTop: -10, marginBottom: 16, fontSize: 12, color: '#92400e' }}>
                  {t('referrals.deal_value_locked_help', 'Le montant ne peut plus être modifié — un virement est en cours pour cette commission.')}
                </div>
              )}

              {/* Section: engagement + periods */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>{t('referrals.engagement')}</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {[
                    ['forfait',     t('pipeline.forfait',     'Forfait')],
                    ['mensuel',     t('pipeline.mensuel',     'Mensuel')],
                    ['trimestriel', t('pipeline.trimestriel', 'Trimestriel')],
                    ['annuel',      t('pipeline.annuel',      'Annuel')],
                  ].map(([k, label]) => (
                    <button key={k} onClick={() => handleEngagementChange(k)} style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: editEngagement === k ? '2px solid var(--rb-primary, #059669)' : '2px solid #e2e8f0', background: editEngagement === k ? '#eef2ff' : '#fff', color: editEngagement === k ? '#6366f1' : '#64748b' }}>{label}</button>
                  ))}
                </div>
                {editEngagement !== 'forfait' && (
                  <div style={{ marginTop: 12 }}>
                    <label style={{ display: 'block', fontSize: 12, color: '#64748b', marginBottom: 6 }}>
                      {editEngagement === 'mensuel' && t('pipeline.nb_months', 'Nombre de mois')}
                      {editEngagement === 'trimestriel' && t('pipeline.nb_quarters', 'Nombre de trimestres')}
                      {editEngagement === 'annuel' && t('pipeline.nb_years', "Nombre d'années")}
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={editPeriods}
                      onChange={e => setEditPeriods(Math.max(1, parseInt(e.target.value, 10) || 1))}
                      style={{
                        width: 140, padding: '10px 14px', borderRadius: 10,
                        border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 600,
                        color: '#0f172a', background: '#fff', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                )}
              </div>

              {/* Section: forecast commission. Updates live as the
                  user drags any of the four inputs above. When the
                  partner is VAT-subject, the headline is HT and a
                  second line shows TVA + TTC so the admin sees what
                  the partner will actually receive on payout (the
                  same breakdown the Qonto note will carry). */}
              {Number(editValue) > 0 && (() => {
                const partnerVatSubject = !!referral.partner_tax_subject;
                const partnerVatRate = parseFloat(referral.partner_tax_rate) || 0;
                const breakdown = partnerVatSubject && partnerVatRate > 0
                  ? decomposeAmountWithTax(forecast.amount, partnerVatRate)
                  : null;
                return (
                  <div style={{ background: '#f0fdf4', borderRadius: 14, padding: 16, marginBottom: 20, border: '1px solid #bbf7d0' }}>
                    <div style={{ fontSize: 10, color: '#166534', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                      {t('pipeline.forecast_commission', 'Commission prévisionnelle')}
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 600, color: '#16a34a', lineHeight: 1.2 }}>
                      {fmt(forecast.amount)}{breakdown ? ' HT' : ''}
                    </div>
                    {breakdown && (
                      <div style={{ fontSize: 13, color: '#15803d', marginTop: 4 }}>
                        TVA {breakdown.tax_rate}% : {fmt(breakdown.amount_tax)}
                        {' · '}
                        <strong style={{ color: '#166534' }}>TTC : {fmt(breakdown.amount_ttc)}</strong>
                      </div>
                    )}
                    <div style={{ fontSize: 11, color: '#15803d', marginTop: breakdown ? 4 : 2 }}>
                      {rate}% × {fmt(Number(editValue))} × {forecast.multiplier}
                      {editEngagement === 'forfait'     && ` (${t('pipeline.forfait', 'Forfait').toLowerCase()})`}
                      {editEngagement === 'mensuel'     && ` (${editPeriods} ${t('pipeline.months',   'mois')})`}
                      {editEngagement === 'trimestriel' && ` (${editPeriods} ${t('pipeline.quarters', 'trim.')} × 3 ${t('pipeline.months', 'mois')})`}
                      {editEngagement === 'annuel'      && ` (${editPeriods} ${t('pipeline.years',    'an(s)')} × 12 ${t('pipeline.months', 'mois')})`}
                    </div>
                  </div>
                );
              })()}

              {/* E3: amendment history. Renders right below the
                  forecast block when the commission has more than one
                  revision row (i.e. the deal_value has been edited
                  after approval at least once). The list is read-only
                  by design — amendments are immutable. */}
              {Array.isArray(referral.commission_revisions) && referral.commission_revisions.length > 1 && (
                <div style={{ marginTop: 16, padding: 14, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                    {t('pipeline.revisions_title', { count: referral.commission_revisions.length, defaultValue: 'Historique des avenants ({{count}})' })}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {referral.commission_revisions.map(r => {
                      const reasonLabel = r.reason === 'upsell'   ? t('pipeline.rev_upsell',   'upsell')
                                       : r.reason === 'downsell' ? t('pipeline.rev_downsell', 'downsell')
                                       : r.reason === 'initial'  ? t('pipeline.rev_initial',  'initial')
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

              {/* Separator before the footer buttons. */}
              <div style={{ borderTop: '1px solid #f1f5f9', margin: '20px 0' }} />

              {/* Pipedrive sync action — visible only when the tenant
                  has Pipedrive connected. Label adapts to whether the
                  referral already has a deal id in Pipedrive. */}
              <PipedrivePushButton referral={referral} t={t} />

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
            );
          })()}
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
      {showCommissionWarning && partnerTier && (
        <ConfirmModal
          isOpen={showCommissionWarning}
          title={t('pipeline.commission_warning_title', 'Taux de commission personnalisé')}
          message={t('pipeline.commission_warning_message', {
            tierName: partnerTier.name,
            tierRate: tierRate,
            newRate: pendingRate,
            defaultValue: 'Le taux du niveau {{tierName}} est de {{tierRate}}%. Vous allez appliquer un taux de {{newRate}}%. Êtes-vous sûr de vouloir modifier la commission ?',
          })}
          confirmLabel={t('pipeline.commission_warning_confirm', 'Appliquer le taux personnalisé')}
          cancelLabel={t('pipeline.commission_warning_cancel', 'Garder le taux du niveau')}
          variant="warning"
          onConfirm={() => {
            setShowCommissionWarning(false);
            setEditRate(pendingRate);
            setCommissionOverridden(true);
            setPendingRate(null);
          }}
          onCancel={() => {
            setShowCommissionWarning(false);
            // Snap back to the tier rate; the override is cleared.
            setEditRate(tierRate);
            setCommissionOverridden(false);
            setPendingRate(null);
          }}
        />
      )}
    </div>
  );
}

function formatActivity(a, t) {
  switch (a.action) {
    case 'created': return t('referrals.act_created');
    case 'status_change': return `${t('referrals.act_status')}: ${STATUS_CONFIG[a.old_value]?.label || a.old_value} → ${STATUS_CONFIG[a.new_value]?.label || a.new_value}`;
    case 'value_updated': return t('referrals.act_value_updated', { value: fmt(a.new_value) });
    case 'engagement_updated': return t('referrals.act_engagement_updated', { value: a.new_value });
    case 'engagement_duration_set': return t('referrals.act_engagement_duration_set', { from: a.old_value || '—', to: a.new_value, defaultValue: 'Durée de la commission : {{from}} → {{to}}' });
    case 'commission_recalculated': return t('referrals.act_commission_recalculated', {
      from: a.old_value ? fmt(a.old_value) : '—',
      to: a.new_value ? fmt(a.new_value) : '—',
      detail: a.comment || '',
      defaultValue: 'Commission révisée : {{from}} → {{to}} TTC. {{detail}}',
    });
    case 'commission_cancelled_lost': return t('referrals.act_commission_cancelled_lost', {
      detail: a.comment || '',
      defaultValue: 'Commission annulée (deal perdu). {{detail}}',
    });
    case 'commission_last_cycle_authorized': return t('referrals.act_commission_last_cycle_authorized', 'Dernier cycle autorisé au paiement avant arrêt définitif.');
    case 'commission_cancellation_confirmed': return t('referrals.act_commission_cancellation_confirmed', 'Arrêt définitif confirmé — aucun versement supplémentaire.');
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

// ═══ Pipedrive push action on a single referral ═══
// Surfaces a green button on the referral's Info tab. Self-fetches
// /crm/pipedrive/status so it stays hidden for tenants that haven't
// connected Pipedrive (we don't want a blank button confusing
// non-CRM tenants). Label adapts:
//   - never pushed  → "Pousser vers Pipedrive"
//   - already linked → "Mettre à jour dans Pipedrive" + external link
function PipedrivePushButton({ referral, t }) {
  const [pdStatus, setPdStatus] = useState(null);
  const [pushing, setPushing] = useState(false);
  const [msg, setMsg] = useState(null); // { tone, text }

  useEffect(() => {
    let cancelled = false;
    api.getPipedriveStatus().then(s => { if (!cancelled) setPdStatus(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  if (!pdStatus || !pdStatus.connected) return null;

  const dealId = referral.pipedrive_deal_id || null;
  const apiDomain = pdStatus.api_domain || '';
  const dealUrl = dealId && apiDomain ? `${apiDomain.replace(/\/$/, '')}/deal/${dealId}` : null;

  const handleClick = async () => {
    if (pushing) return;
    setPushing(true);
    setMsg(null);
    try {
      const res = await api.syncReferralToPipedrive(referral.id);
      setMsg({ tone: 'success', text: t('pipedrive.push_one_ok', { dealId: res.deal_id || dealId || '?', defaultValue: 'Synchronisé avec Pipedrive · Deal #{{dealId}}' }) });
    } catch (err) {
      const detail = err?.data?.detail || err?.message || '';
      setMsg({ tone: 'error', text: t('pipedrive.push_one_error', { detail, defaultValue: 'Échec du push : {{detail}}' }) });
    } finally {
      setPushing(false);
    }
  };

  return (
    <div style={{ marginBottom: 14, padding: '12px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>Pipedrive</div>
          <div style={{ fontSize: 11, color: '#64748b' }}>
            {dealId
              ? t('pipedrive.push_one_linked', { dealId, defaultValue: 'Lié au deal #{{dealId}}' })
              : t('pipedrive.push_one_unlinked', 'Pas encore synchronisé')}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {dealUrl && (
            <a href={dealUrl} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{ fontSize: 12, color: '#0f172a', textDecoration: 'underline' }}>
              {t('pipedrive.push_one_open', 'Ouvrir')}
            </a>
          )}
          <button
            type="button" onClick={handleClick} disabled={pushing}
            style={{
              padding: '8px 14px', borderRadius: 8, border: 'none',
              background: '#059669', color: '#fff',
              fontSize: 13, fontWeight: 600, cursor: pushing ? 'wait' : 'pointer',
              fontFamily: 'inherit', opacity: pushing ? 0.7 : 1,
            }}
          >
            {pushing
              ? t('pipedrive.push_one_running', 'Synchronisation…')
              : dealId
                ? t('pipedrive.push_one_update', 'Mettre à jour dans Pipedrive')
                : t('pipedrive.push_one', 'Pousser vers Pipedrive')}
          </button>
        </div>
      </div>
      {msg && (
        <div style={{
          marginTop: 10, padding: '6px 10px', borderRadius: 8, fontSize: 12,
          background: msg.tone === 'success' ? '#ecfdf5' : '#fef2f2',
          border: '1px solid ' + (msg.tone === 'success' ? '#6ee7b7' : '#fecaca'),
          color: msg.tone === 'success' ? '#047857' : '#b91c1c',
        }}>{msg.text}</div>
      )}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (<div><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div></div>);
}

// Inline-editable variant of InfoRow. Click-to-edit, blur or Enter to
// save. Optimistic — the value updates in-place; on save error we
// revert and surface the message. Used on the Info tab of the
// referral detail modal so contact fields are correctable for both
// manual and form-sourced leads (étape 4 / item 6).
function EditableInfoRow({ label, value, onSave, type = 'text', required = false }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Keep draft in sync if the parent's value updates outside our edit
  // window (e.g. another save round-tripped a fresh row).
  useEffect(() => { if (!editing) setDraft(value || ''); }, [value, editing]);

  const commit = async () => {
    setError('');
    const next = (draft || '').trim();
    if (required && !next) {
      setError('Champ requis');
      setDraft(value || '');
      setEditing(false);
      return;
    }
    if (next === (value || '')) { setEditing(false); return; }
    setBusy(true);
    try {
      await onSave(next);
      setEditing(false);
    } catch (e) {
      setError(e?.message || 'Erreur');
      setDraft(value || '');
    } finally {
      setBusy(false);
    }
  };

  const cancel = () => {
    setDraft(value || '');
    setEditing(false);
    setError('');
  };

  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div>
      {editing ? (
        <input
          autoFocus
          type={type}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={e => { if (e.key === 'Enter') commit(); else if (e.key === 'Escape') cancel(); }}
          disabled={busy}
          style={{ marginTop: 2, padding: '4px 8px', borderRadius: 6, border: '1.5px solid var(--rb-primary, #059669)', fontSize: 14, color: '#0f172a', fontWeight: 500, fontFamily: 'inherit', outline: 'none', width: '100%', boxSizing: 'border-box', background: '#fff' }}
        />
      ) : (
        <div
          onClick={() => setEditing(true)}
          title="Cliquer pour modifier"
          style={{ marginTop: 2, padding: '3px 6px', marginLeft: -6, borderRadius: 6, color: '#0f172a', fontWeight: 500, fontSize: 14, cursor: 'pointer', transition: 'background 0.15s' }}
          onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
        >
          {value || <span style={{ color: '#cbd5e1' }}>—</span>}
        </div>
      )}
      {error && <div style={{ marginTop: 4, color: '#dc2626', fontSize: 11 }}>{error}</div>}
    </div>
  );
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
  const pipedriveLinked = !!referral.pipedrive_deal_id;
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
  if (pipedriveLinked) {
    badges.push(
      <span key="pd" title="Pipedrive synced" aria-label="Pipedrive synced"
        style={circle('#1a1a1a', '#fff', 'P')}>P</span>
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
