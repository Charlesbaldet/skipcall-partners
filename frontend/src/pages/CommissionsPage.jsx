import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { DollarSign, CheckCircle, Clock, CreditCard, AlertTriangle, Download, X, Building, User, Banknote, List, LayoutGrid, FileText, ShieldCheck, Send, RefreshCw } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal.jsx';

// Map a payment_error column value (which the backend now stores as
// a SHORT code, not a JSON dump — but legacy rows might still hold
// the raw 428 body) to a structured banner descriptor: { tone:
// 'info'|'error', message }. SCA renders as info (yellow), real
// failures render as error (red), unparseable rows fall through to a
// generic "contactez le support" tone-error string.
function getPaymentErrorMessage(t, rawError) {
  if (!rawError) return null;
  const tryCode = (code) => {
    if (!code) return null;
    if (code === 'sca_required') {
      return {
        tone: 'info',
        message: t('qonto.sca_pending_banner', '⏳ En attente de validation SCA — Approuvez le virement dans votre app Qonto'),
      };
    }
    return { tone: 'error', message: qontoErrorLabel(t, code, code) };
  };
  // Short-code path (the common case after the v23 sanitizer): the
  // column already holds something like "insufficient_funds".
  const shortPath = tryCode(rawError);
  if (shortPath && shortPath.message !== t('qonto.error_generic', 'Une erreur est survenue. Veuillez réessayer.')) {
    return shortPath;
  }
  // Legacy path: parse JSON or scan-for-substring.
  try {
    const parsed = JSON.parse(rawError);
    if (parsed && parsed.code) {
      const r = tryCode(parsed.code);
      if (r) return r;
    }
  } catch { /* not JSON */ }
  for (const code of ['sca_required', 'insufficient_funds', 'beneficiary_bic_invalid', 'invalid_bic', 'invalid_iban', 'amount_too_low', 'amount_too_high', 'beneficiary_not_found']) {
    if (rawError.includes(code)) {
      const r = tryCode(code);
      if (r) return r;
    }
  }
  return {
    tone: 'error',
    message: t('qonto.error_generic_contact', 'Erreur de paiement — contactez le support.'),
  };
}

// Translate the structured backend error codes (qonto_not_connected,
// partner_iban_missing, …) and the Qonto-side error strings
// (insufficient_funds, beneficiary_bic_invalid, …) into a single
// human-readable French label. Falls back to a generic "Une erreur
// est survenue" so the user never sees raw JSON.
function qontoErrorLabel(t, code, rawMessage) {
  const map = {
    qonto_not_connected: t('qonto.error_not_connected', 'Connectez Qonto dans Paramètres → Intégrations.'),
    qonto_bank_account_missing: t('qonto.error_bank_account_missing', 'Choisissez le compte Qonto à débiter.'),
    qonto_reconnect_required: t('qonto.error_reconnect_required', 'Reconnectez Qonto — la session a expiré.'),
    partner_iban_missing: t('qonto.error_partner_iban_missing', 'Ce partenaire n\'a pas renseigné ses informations bancaires.'),
    amount_zero: t('qonto.error_amount_zero', 'Montant nul, virement impossible.'),
    commission_not_payable: t('qonto.error_not_payable', 'Cette commission n\'est pas dans le statut À valider.'),
    no_eligible_commissions: t('qonto.error_no_eligible', 'Aucune commission éligible au paiement.'),
    insufficient_funds: t('qonto.error_insufficient_funds', 'Solde insuffisant sur votre compte Qonto.'),
    beneficiary_bic_invalid: t('qonto.error_bic_invalid', 'Le BIC du bénéficiaire est invalide.'),
    invalid_iban: t('qonto.error_invalid_iban', 'L\'IBAN du bénéficiaire est invalide.'),
    invalid_bic: t('qonto.error_bic_invalid', 'Le BIC du bénéficiaire est invalide.'),
    amount_too_low: t('qonto.error_amount_too_low', 'Le montant est trop faible.'),
    amount_too_high: t('qonto.error_amount_too_high', 'Le montant dépasse le plafond autorisé.'),
    beneficiary_not_found: t('qonto.error_beneficiary_not_found', 'Bénéficiaire non trouvé.'),
    transfer_declined: t('qonto.error_transfer_declined', 'Virement refusé par Qonto.'),
  };
  if (code && map[code]) return map[code];
  // Last-ditch: scan the raw message for a known substring before
  // surrendering to the generic fallback.
  const haystack = (rawMessage || code || '').toLowerCase();
  for (const key of Object.keys(map)) {
    if (haystack.includes(key)) return map[key];
  }
  return t('qonto.error_generic', 'Une erreur est survenue. Veuillez réessayer.');
}

// New 4-stage lifecycle. Order matters — drives the kanban column order.
const STATUS_KEYS = ['pending_approval', 'awaiting_invoice', 'pending_validation', 'paid'];
const COM_STATUS_META = {
  pending_approval:   { color: '#f59e0b', bg: '#fffbeb', icon: Clock },
  awaiting_invoice:   { color: '#6366f1', bg: '#eef2ff', icon: FileText },
  pending_validation: { color: '#0284c7', bg: '#eff6ff', icon: ShieldCheck },
  paid:               { color: '#16a34a', bg: '#f0fdf4', icon: CreditCard },
};

export default function CommissionsPage() {
  const { t } = useTranslation();
  const COM_STATUS = {
    pending_approval:   { label: t('commission.status.pending_approval'), ...COM_STATUS_META.pending_approval },
    awaiting_invoice:   { label: t('commission.status.awaiting_invoice'), ...COM_STATUS_META.awaiting_invoice },
    pending_validation: { label: t('commission.status.pending_validation'), ...COM_STATUS_META.pending_validation },
    paid:               { label: t('commission.status.paid'), ...COM_STATUS_META.paid },
  };
  const [summary, setSummary] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [totals, setTotals] = useState({ pending: 0, paid: 0 });
  const [filterStatus, setFilterStatus] = useState('all');
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('pipeline');
  const [viewMode, setViewMode] = useState('kanban');
  const [payModal, setPayModal] = useState(null);
  const [paying, setPaying] = useState(false);
  const [comLimits, setComLimits] = useState({});
  const [myTenant, setMyTenant] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [qontoStatus, setQontoStatus] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshingPolls, setRefreshingPolls] = useState(false);
  const [toast, setToast] = useState(null);
  // qontoModal holds whatever the most recent Qonto pay action wants
  // to surface — initiated, bulk progress / summary, or a failure
  // with a French-mapped message. Shape:
  //   { kind: 'initiated' | 'bulk' | 'error', ...payload }
  const [qontoModal, setQontoModal] = useState(null);
  // Auto-poll loop after a Payer action: tick every 30 s, max 10 min.
  // Refs so we can cancel from a different render without a stale
  // closure.
  const autoPollIntervalRef = useRef(null);
  const autoPollStopperRef = useRef(null);

  const showToast = (text, type = 'success') => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 4500);
  };

  const clearAutoPoll = () => {
    if (autoPollIntervalRef.current) clearInterval(autoPollIntervalRef.current);
    if (autoPollStopperRef.current) clearTimeout(autoPollStopperRef.current);
    autoPollIntervalRef.current = null;
    autoPollStopperRef.current = null;
  };

  // Cleanup on unmount.
  useEffect(() => () => clearAutoPoll(), []);

  const startAutoPoll = () => {
    clearAutoPoll();
    const tick = async () => {
      try {
        const r = await api.pollQontoTransfers();
        const updates = (r && r.updates) || [];
        const meaningful = updates.filter(u => u && u.status !== 'sca_pending' && u.status !== 'orphan_no_match');
        if (meaningful.length > 0) {
          clearAutoPoll();
          await reload();
          const paid = meaningful.find(u => u.status === 'paid');
          showToast(
            paid
              ? t('qonto.toast_auto_poll_paid', 'Virement confirmé !')
              : t('qonto.toast_auto_poll_progress', 'Statut Qonto mis à jour.'),
            'success'
          );
        }
      } catch { /* swallow — keep polling */ }
    };
    autoPollIntervalRef.current = setInterval(tick, 30_000);
    autoPollStopperRef.current = setTimeout(clearAutoPoll, 600_000); // 10 min cap
  };
  const rModel = myTenant?.revenue_model || 'CA';
  const rLabel = rModel === 'ARR' ? 'ARR' : rModel === 'CA' ? t('common.revenue') : rModel === 'Other' ? t('common.revenue') : 'MRR';

  const reload = async () => {
    const [s, c, mt, q] = await Promise.all([
      api.getCommissionsSummary(),
      api.getCommissions(),
      api.getMyTenant(),
      api.getQontoStatus().catch(() => ({ connected: false })),
    ]);
    setMyTenant(mt && (mt.tenant || mt));
    setSummary(s.summary); setCommissions(c.commissions);
    setTotals({ pending: c.totalPending, paid: c.totalPaid });
    setQontoStatus(q);
  };

  useEffect(() => { reload().catch(console.error).finally(() => setLoading(false)); }, []);

  // Deep-link from /search: scroll the matching commission card
  // into view, focus it, and briefly highlight it. We don't have a
  // per-commission detail modal yet — surfacing the card on the
  // Pipeline kanban is the closest equivalent. Honours the param
  // once and strips it so reloads don't re-trigger the highlight.
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(null);
  const openIdRef = useRef(null);
  useEffect(() => {
    const openId = searchParams.get('open');
    if (!openId || openIdRef.current === openId) return;
    if (loading) return;
    openIdRef.current = openId;
    setTab('pipeline');
    setHighlightId(openId);
    setTimeout(() => {
      const el = document.getElementById('commission-' + openId);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    setTimeout(() => setHighlightId(null), 4000);
    const next = new URLSearchParams(searchParams);
    next.delete('open');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, loading]);

  const handleApprove = async (id) => {
    setBusyId(id);
    try { await api.approveCommission(id); await reload(); }
    catch (err) { alert(err.message || 'Error'); }
    setBusyId(null);
  };

  const handlePayClick = async (commission) => {
    try {
      const partnerData = await api.getPartner(commission.partner_id);
      setPayModal({ commission, partner: partnerData.partner || partnerData });
    } catch (err) {
      setPayModal({ commission, partner: { name: commission.partner_name, contact_name: commission.partner_contact } });
    }
  };

  const handleDownloadInvoice = async (id) => {
    try { await api.downloadCommissionInvoice(id); }
    catch (err) { alert(err.message || 'Error'); }
  };

  const openReject = (commission) => {
    setRejectReason('');
    setRejectModal(commission);
  };

  const handleConfirmReject = async () => {
    if (!rejectModal) return;
    setRejecting(true);
    try {
      await api.rejectCommission(rejectModal.id, rejectReason.trim() || undefined);
      setRejectModal(null);
      setRejectReason('');
      await reload();
    } catch (err) {
      alert(err.message || 'Error');
    }
    setRejecting(false);
  };

  const handleConfirmPay = async () => {
    setPaying(true);
    try { await api.updateCommission(payModal.commission.id, 'paid'); setPayModal(null); await reload(); }
    catch (err) { alert(t('commissions.modal_error')); }
    setPaying(false);
  };

  // Qonto pay flow — initiate the SEPA transfer via the connected
  // Qonto account. Two-phase modal: confirm → run. handlePayViaQonto
  // and handlePayBulk now just OPEN the confirm modal; the actual
  // executor is executeConfirmedPay (called from the modal's
  // "Confirmer" button) so the user always gets a branded recap +
  // total before any money moves.
  const handlePayViaQonto = (commission) => {
    if (!qontoStatus?.connected) {
      setQontoModal({
        kind: 'error',
        message: t('qonto.error_not_connected', 'Connectez Qonto dans Paramètres → Intégrations.'),
      });
      return;
    }
    setQontoModal({
      kind: 'confirm',
      mode: 'single',
      commissions: [commission],
    });
  };

  const executeSinglePay = async (commission) => {
    setBusyId(commission.id);
    setQontoModal(prev => prev ? { ...prev, executing: true } : prev);
    try {
      const r = await api.payCommissionViaQonto(commission.id);
      setQontoModal({
        kind: 'initiated',
        amount: parseFloat(commission.amount) || 0,
        partnerName: commission.partner_name,
        reference: r.reference,
        requiresSca: !!r.requires_sca,
      });
      await reload();
      // Background reconciliation — quietly polls Qonto every 30 s
      // (up to 10 min) so a successful SCA approval flips the card
      // to Payé without the admin having to click anything.
      startAutoPoll();
    } catch (err) {
      const code = err?.data?.error || err?.body?.code;
      const message = qontoErrorLabel(t, code, err?.message);
      setQontoModal({ kind: 'error', message });
    }
    setBusyId(null);
  };

  const togglePick = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllPayable = () => {
    const ids = visibleCommissions
      .filter(c => c.status === 'pending_validation')
      .map(c => c.id);
    setSelected(new Set(ids));
  };

  const clearSelection = () => setSelected(new Set());

  const handlePayBulk = () => {
    if (!qontoStatus?.connected) {
      setQontoModal({
        kind: 'error',
        message: t('qonto.error_not_connected', 'Connectez Qonto dans Paramètres → Intégrations.'),
      });
      return;
    }
    const ids = Array.from(selected);
    if (!ids.length) return;
    const list = visibleCommissions.filter(c => ids.includes(c.id));
    setQontoModal({
      kind: 'confirm',
      mode: 'bulk',
      commissions: list,
    });
  };

  const executeBulkPay = async (commissions) => {
    const ids = commissions.map(c => c.id);
    setBulkBusy(true);
    setQontoModal({ kind: 'bulk', phase: 'running', total: ids.length });
    try {
      const r = await api.payCommissionsBulk(ids);
      const transfers = r.transfers || [];
      const okCount = transfers.filter(t => !!t.transfer_id).length;
      const failed = transfers.filter(t => !t.transfer_id).map(t => ({ id: t.commission_id, reason: t.error || 'unknown' }));
      // Total amount of the successfully-initiated transfers — pull
      // it out of the recap list so we don't have to wait for reload().
      const okIds = new Set(transfers.filter(t => !!t.transfer_id).map(t => t.commission_id));
      const totalAmount = commissions
        .filter(c => okIds.has(c.id))
        .reduce((s, c) => s + parseFloat(c.amount || 0), 0);
      setQontoModal({
        kind: 'bulk',
        phase: 'done',
        okCount,
        totalCount: ids.length,
        totalAmount,
        requiresSca: !!r.requires_sca,
        skipped: r.skipped || [],
        failed,
      });
      clearSelection();
      await reload();
      startAutoPoll();
    } catch (err) {
      const code = err?.data?.error || err?.body?.code;
      const message = qontoErrorLabel(t, code, err?.message);
      setQontoModal({ kind: 'error', message });
    }
    setBulkBusy(false);
  };

  // Bridge from the confirm modal's "Confirmer le paiement" button to
  // the right executor (single or bulk).
  const confirmAndPay = () => {
    const m = qontoModal;
    if (!m || m.kind !== 'confirm') return;
    if (m.mode === 'single') executeSinglePay(m.commissions[0]);
    else executeBulkPay(m.commissions);
  };

  const handleRefreshPolls = async () => {
    setRefreshingPolls(true);
    try {
      const r = await api.pollQontoTransfers();
      const updates = (r && r.updates) || [];
      await reload();
      // Status semantics from the backend reconcile worker:
      //   paid                   → commission moved to Payé
      //   matched_by_reference   → adopted a Qonto transfer_id
      //   initiated_after_sca    → SCA approved, transfer in flight
      //   sca_pending            → still waiting on the admin's phone
      //   declined / failed / canceled → transfer failed
      //   orphan_no_match        → couldn't find anything yet
      const paid = updates.filter(u => u.status === 'paid');
      const adopted = updates.filter(u => u.status === 'matched_by_reference' || u.status === 'initiated_after_sca');
      const declined = updates.filter(u => ['declined', 'failed', 'canceled', 'cancelled'].includes(u.status));
      if (paid.length > 0) {
        showToast(t('qonto.toast_paid', { count: paid.length, defaultValue: '{{count}} virement(s) confirmé(s) — Payé ✅' }), 'success');
      } else if (adopted.length > 0) {
        showToast(t('qonto.toast_adopted', { count: adopted.length, defaultValue: '{{count}} virement(s) retrouvé(s) — Qonto traite la demande.' }), 'success');
      } else if (declined.length > 0) {
        showToast(t('qonto.toast_declined', { count: declined.length, defaultValue: '{{count}} virement(s) refusé(s) par Qonto.' }), 'error');
      } else {
        showToast(t('qonto.toast_no_change', 'Aucun changement détecté. Le virement est peut-être encore en cours de traitement par Qonto.'), 'info');
      }
    }
    catch (err) {
      showToast(err.message || t('qonto.error_generic', 'Une erreur est survenue. Veuillez réessayer.'), 'error');
    }
    setRefreshingPolls(false);
  };

  const exportCSV = () => {
    const headers = [t('commissions.tbl_prospect'), t('referrals.company'), t('commissions.tbl_partner'), t('commissions.tbl_rate') + ' %', t('commissions.tbl_deal') + ' €', t('commissions.tbl_commission') + ' €', t('commissions.tbl_status'), t('referrals.created_at'), t('commissions.date_validated'), t('commissions.paid_on')];
    const rows = commissions.map(c => [c.prospect_name, c.prospect_company, c.partner_name, c.rate, c.deal_value, c.amount, COM_STATUS[c.status]?.label || c.status, c.created_at?.split('T')[0] || '', c.approved_at?.split('T')[0] || '', c.paid_at?.split('T')[0] || '']);
    const csv = [headers, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `commissions_${new Date().toISOString().split('T')[0]}.csv`; a.click();
  };

  const totalAll = summary.reduce((s, p) => s + parseFloat(p.total_amount || 0), 0);
  // 'pipeline' tab shows ALL commissions across the 4 lifecycle columns,
  // including those that are awaiting admin approval. Rejected rows are
  // surfaced via the rejection_reason banner inside their card and not
  // duplicated in their own column — the reject action is still
  // available next to Approuver in the pending_approval column.
  const visibleCommissions = commissions.filter(c => c.approval_status !== 'rejected');
  const filtered = filterStatus === 'all'
    ? visibleCommissions
    : visibleCommissions.filter(c => c.status === filterStatus);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('commissions.loading')}</div>;

  return (
    <div className="fade-in">
      <style>{`@keyframes rb-spin{to{transform:rotate(360deg)}}.rb-spin{animation:rb-spin 1s linear infinite}@keyframes rb-pulse{0%,100%{opacity:1}50%{opacity:.4}}.rb-pulse{animation:rb-pulse 1.4s ease-in-out infinite}`}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('commissions.title')}</h1>
          <p style={{ color: '#64748b', marginBottom: 24 }}>{t('commissions.subtitle')}</p>
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Download size={14} /> {t('commissions.export_csv')}
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <ComKPI icon={DollarSign} label={t('commissions.kpi_total')} value={fmt(totalAll)} color="var(--rb-primary, #059669)" />
        <ComKPI icon={Clock} label={t('commissions.kpi_pending')} value={fmt(totals.pending)} color="#f59e0b" />
        <ComKPI icon={CheckCircle} label={t('commissions.kpi_paid')} value={fmt(totals.paid)} color="#16a34a" />
      </div>

      {/* Tabs + view toggle */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {[
            { id: 'summary', label: t('commissions.tab_by_partner') },
            { id: 'pipeline', label: t('commissions.tab_pipeline') },
          ].map(tab_ => (
            <button key={tab_.id} onClick={() => setTab(tab_.id)} style={{
              padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 8,
              background: tab === tab_.id ? '#fff' : 'transparent', color: tab === tab_.id ? '#0f172a' : '#64748b',
              boxShadow: tab === tab_.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>
              {tab_.label}
            </button>
          ))}
        </div>

        {tab === 'pipeline' && (
          <div style={{ display: 'flex', gap: 2, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
            <button onClick={() => setViewMode('kanban')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'kanban' ? '#fff' : 'transparent', color: viewMode === 'kanban' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><LayoutGrid size={14} /> {t('commissions.kanban')}</button>
            <button onClick={() => setViewMode('table')} style={{
              padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
              background: viewMode === 'table' ? '#fff' : 'transparent', color: viewMode === 'table' ? '#0f172a' : '#94a3b8',
              fontWeight: 600, fontSize: 12, boxShadow: viewMode === 'table' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}><List size={14} /> {t('commissions.table')}</button>
          </div>
        )}
      </div>

      {tab === 'summary' && (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {[t('commissions.tbl_partner'), t('commissions.tbl_rate'), t('commissions.tbl_deals'), `${rLabel} ${t('commissions.tbl_generated')}`, t('commissions.tbl_pending'), t('commissions.tbl_approved'), t('commissions.tbl_paid'), t('commissions.tbl_total')].map((h, i) => (
                <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{summary.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '13px 16px' }}><div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div><div style={{ color: '#94a3b8', fontSize: 12 }}>{p.contact_name}</div></td>
                <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 12 }}>{p.commission_rate}%</span></td>
                <td style={{ padding: '13px 16px', fontWeight: 600 }}>{p.total_commissions}</td>
                <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(p.total_deal_value)}</td>
                <td style={{ padding: '13px 16px', color: '#f59e0b', fontWeight: 600 }}>{fmt(p.pending_amount)}</td>
                <td style={{ padding: '13px 16px', color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{fmt(p.approved_amount)}</td>
                <td style={{ padding: '13px 16px', color: '#16a34a', fontWeight: 600 }}>{fmt(p.paid_amount)}</td>
                <td style={{ padding: '13px 16px', fontWeight: 800, fontSize: 16, color: '#0f172a' }}>{fmt(p.total_amount)}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr style={{ background: '#fefce8' }}>
              <td colSpan={7} style={{ padding: '13px 16px', fontWeight: 700, color: '#0f172a' }}>{t('commissions.total')}</td>
              <td style={{ padding: '13px 16px', fontWeight: 800, color: '#f59e0b', fontSize: 18 }}>{fmt(totalAll)}</td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {/* Bulk-pay action bar — only renders when at least one
          pending_validation card is checked. The "Tout payer" button
          shows independently so the admin can one-click select every
          payable card. */}
      {tab === 'pipeline' && qontoStatus?.connected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          {selected.size > 0 ? (
            <>
              <button onClick={handlePayBulk} disabled={bulkBusy}
                style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: bulkBusy ? 0.7 : 1 }}>
                <Send size={14} /> {bulkBusy ? t('common.saving', 'Enregistrement…') : t('qonto.pay_selection', { count: selected.size, defaultValue: 'Payer la sélection ({{count}})' })}
              </button>
              <button onClick={clearSelection} disabled={bulkBusy}
                style={{ padding: '9px 14px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
                {t('common.cancel', 'Annuler')}
              </button>
            </>
          ) : (
            <button onClick={selectAllPayable}
              style={{ padding: '9px 14px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
              {t('qonto.pay_all', 'Tout payer (À valider)')}
            </button>
          )}
          <button onClick={handleRefreshPolls} disabled={refreshingPolls}
            style={{
              marginLeft: 'auto',
              padding: '9px 16px', borderRadius: 10,
              background: '#fff', border: '1px solid #e2e8f0',
              color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              opacity: refreshingPolls ? 0.7 : 1,
            }}
            title={t('qonto.refresh_status_tooltip', 'Rafraîchir les statuts Qonto')}>
            <RefreshCw size={14} className={refreshingPolls ? 'rb-spin' : ''} />
            {refreshingPolls
              ? t('qonto.refreshing_status', 'Actualisation…')
              : t('qonto.refresh_status_full', 'Actualiser les statuts')}
          </button>
        </div>
      )}

      {tab === 'pipeline' && viewMode === 'kanban' && (
        <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 280px)', minHeight: 400 }}>
          {STATUS_KEYS.map(status => {
            const sc = COM_STATUS[status];
            const allCards = visibleCommissions.filter(c => c.status === status);
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
                  {cards.map(c => {
                    const isSelected = selected.has(c.id);
                    // SCA-pending: backend stamped payment_initiated_at + a
                    // qonto_sca_session_token but no transfer ID yet.
                    const scaPending = !!c.sca_pending;
                    const isInitiated = (!!c.qonto_transfer_id || !!c.payment_initiated_at) && !c.payment_completed_at;
                    const errBanner = getPaymentErrorMessage(t, c.payment_error);
                    return (
                    <div
                      key={c.id}
                      id={'commission-' + c.id}
                      style={{
                        background: '#fff', borderRadius: 12, padding: 14,
                        border: highlightId === c.id
                          ? `2px solid ${sc.color}`
                          : isSelected
                            ? `2px solid ${sc.color}`
                            : '1px solid #e2e8f0',
                        boxShadow: highlightId === c.id
                          ? `0 0 0 4px ${sc.color}25`
                          : '0 1px 3px rgba(0,0,0,0.04)',
                        transition: 'box-shadow .3s, border-color .3s',
                      }}
                    >
                      {/* Status pill removed from kanban cards — the
                          column header already conveys it. Card top
                          row keeps just the partner name + the
                          bulk-pay checkbox. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, marginBottom: 4 }}>
                        {status === 'pending_validation' && qontoStatus?.connected && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePick(c.id)}
                            style={{ cursor: 'pointer', flexShrink: 0 }}
                          />
                        )}
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.partner_name}</div>
                      </div>
                      {c.prospect_name && <div style={{ color: '#475569', fontSize: 12, marginBottom: 8 }}>{c.prospect_name}{c.prospect_company ? ' · ' + c.prospect_company : ''}</div>}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <span style={{ fontWeight: 800, color: sc.color, fontSize: 16 }}>{fmt(c.amount)}</span>
                        <span style={{ color: '#94a3b8', fontSize: 11 }}>{c.rate}% · {fmt(c.deal_value)}</span>
                      </div>
                      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 10 }}>{fmtDate(c.created_at)}</div>

                      {scaPending && (
                        <div style={{
                          padding: '8px 10px', borderRadius: 8,
                          background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e',
                          fontSize: 11, marginBottom: 8, lineHeight: 1.45,
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}>
                          <Clock size={12} className="rb-pulse" />
                          {t('qonto.sca_pending_card', 'Approuvez le virement dans votre app Qonto')}
                        </div>
                      )}
                      {!scaPending && errBanner && (
                        <div style={{
                          padding: '6px 10px', borderRadius: 8,
                          background: errBanner.tone === 'info' ? '#fffbeb' : '#fef2f2',
                          border: `1px solid ${errBanner.tone === 'info' ? '#fde68a' : '#fecaca'}`,
                          color: errBanner.tone === 'info' ? '#92400e' : '#b91c1c',
                          fontSize: 11, marginBottom: 8, lineHeight: 1.45,
                        }}>
                          {errBanner.message}
                        </div>
                      )}

                      {status === 'pending_approval' && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={() => handleApprove(c.id)} disabled={busyId === c.id}
                            style={{ flex: 2, padding: '8px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: busyId === c.id ? 0.7 : 1 }}>
                            <CheckCircle size={12} /> {t('commission.approve')}
                          </button>
                          <button onClick={() => openReject(c)}
                            style={{ flex: 1, padding: '8px', borderRadius: 8, background: '#fff', border: '1px solid #fecaca', color: '#dc2626', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                            {t('commission.reject')}
                          </button>
                        </div>
                      )}
                      {status === 'awaiting_invoice' && (
                        <div style={{ padding: '7px 10px', borderRadius: 8, background: '#fffbeb', color: '#92400e', fontSize: 11, textAlign: 'center', fontWeight: 600 }}>
                          {t('commission.waiting_for_partner_invoice')}
                        </div>
                      )}
                      {status === 'pending_validation' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {c.has_invoice && (
                            <button onClick={() => handleDownloadInvoice(c.id)}
                              style={{ width: '100%', padding: '7px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Download size={12} /> {t('commission.view_invoice', 'Voir la facture')}
                            </button>
                          )}
                          {scaPending ? (
                            <button onClick={handleRefreshPolls} disabled={refreshingPolls}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', color: '#92400e', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: refreshingPolls ? 0.7 : 1 }}>
                              <RefreshCw size={12} className={refreshingPolls ? 'rb-spin' : ''} /> {t('qonto.check_status', 'Vérifier le statut')}
                            </button>
                          ) : isInitiated ? (
                            <div style={{ padding: '7px 10px', borderRadius: 8, background: '#eef2ff', color: '#4338ca', fontSize: 11, textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Send size={12} /> {t('qonto.transfer_in_progress', 'Virement en cours')}
                            </div>
                          ) : qontoStatus?.connected ? (
                            <button onClick={() => handlePayViaQonto(c)} disabled={busyId === c.id}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: busyId === c.id ? 0.7 : 1 }}>
                              <Send size={12} /> {t('qonto.pay', 'Payer')}
                            </button>
                          ) : (
                            <button onClick={() => handlePayClick(c)}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <CreditCard size={12} /> {t('commission.validate_payment')}
                            </button>
                          )}
                        </div>
                      )}
                      {status === 'paid' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {c.payment_reference && (
                            <div style={{ padding: '6px 10px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 11, color: '#475569' }}>
                              <div style={{ color: '#94a3b8', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('qonto.transfer_reference', 'Réf. virement')}</div>
                              <div style={{ fontFamily: 'monospace', color: '#0f172a', wordBreak: 'break-all' }}>{c.payment_reference}</div>
                            </div>
                          )}
                          {c.has_invoice && (
                            <button onClick={() => handleDownloadInvoice(c.id)}
                              style={{ width: '100%', padding: '7px', borderRadius: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Download size={12} /> {t('qonto.payment_proof', 'Preuve de virement')}
                            </button>
                          )}
                          {c.paid_at && (
                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>{t('commissions.paid_on')} {fmtDate(c.paid_at)}</div>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {cards.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#cbd5e1', fontSize: 13 }}>{t('commissions.no_commission')}</div>}
                  {hasMore && (
                    <button onClick={() => setComLimits(prev => ({ ...prev, [status]: limit + 25 }))} style={{
                      padding: '10px', borderRadius: 10, border: '1px dashed #cbd5e1', background: 'transparent',
                      color: 'var(--rb-primary, #059669)', fontWeight: 600, fontSize: 12, cursor: 'pointer', textAlign: 'center',
                    }}>{t('commissions.see_more', { count: allCards.length - limit })}</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {tab === 'pipeline' && viewMode === 'table' && (
        <>
          <div style={{ marginBottom: 16 }}>
            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: '8px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#334155', background: '#fff', cursor: 'pointer' }}>
              <option value="all">{t('commissions.all_statuses')}</option>
              {STATUS_KEYS.map(k => <option key={k} value={k}>{COM_STATUS[k].label}</option>)}
            </select>
          </div>
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {[t('commissions.tbl_prospect'), t('commissions.tbl_partner'), t('commissions.tbl_rate'), t('commissions.tbl_deal'), t('commissions.tbl_commission'), t('commissions.tbl_status'), t('commissions.tbl_approved_at'), t('commissions.tbl_due'), t('commissions.tbl_action')].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{filtered.map(c => {
                const cs = COM_STATUS[c.status] || COM_STATUS.pending_approval;
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '13px 16px' }}><div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name}</div><div style={{ color: '#94a3b8', fontSize: 12 }}>{c.prospect_company}</div></td>
                    <td style={{ padding: '13px 16px', color: '#475569' }}>{c.partner_name}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 12 }}>{c.rate}%</span></td>
                    <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(c.deal_value)}</td>
                    <td style={{ padding: '13px 16px', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{fmt(c.amount)}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: cs.bg, color: cs.color }}>{cs.label}</span></td>
                    <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 12 }}>{c.approved_at ? fmtDate(c.approved_at) : '—'}</td>
                    <td style={{ padding: '13px 16px', fontSize: 12 }}>
                      {c.payment_due_date ? (<span style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.is_late ? '#dc2626' : '#64748b', fontWeight: c.is_late ? 700 : 400 }}>{c.is_late && <AlertTriangle size={14} />}{fmtDate(c.payment_due_date)}</span>) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {c.status === 'pending_approval' && <button onClick={() => handleApprove(c.id)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{t('commission.approve')}</button>}
                      {c.status === 'awaiting_invoice' && <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('commission.waiting_for_partner_invoice')}</span>}
                      {c.status === 'pending_validation' && <button onClick={() => handlePayClick(c)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{t('commission.validate_payment')}</button>}
                      {c.status === 'paid' && <span style={{ color: '#94a3b8', fontSize: 12 }}>{fmtDate(c.paid_at)}</span>}
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
            {filtered.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('commissions.no_commission')}</div>}
          </div>
        </>
      )}

      <ConfirmModal
        isOpen={!!rejectModal}
        title={t('commission.reject')}
        message={
          <div>
            <div style={{ marginBottom: 12, color: '#475569' }}>
              {rejectModal && (<>
                <strong style={{ color: '#0f172a' }}>{rejectModal.prospect_name}</strong> — {fmt(rejectModal.amount)}
              </>)}
            </div>
            <div style={{ color: '#334155', fontWeight: 600, fontSize: 13, marginBottom: 6 }}>{t('commission.reject_reason')}</div>
            <textarea
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder={t('commission.reject_reason_placeholder')}
              rows={3}
              style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', color: '#0f172a', resize: 'vertical', boxSizing: 'border-box' }}
            />
          </div>
        }
        confirmLabel={t('commission.reject')}
        cancelLabel={t('commissions.modal_cancel')}
        variant="danger"
        loading={rejecting}
        onConfirm={handleConfirmReject}
        onCancel={() => { setRejectModal(null); setRejectReason(''); }}
      />

      {payModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => setPayModal(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 480, maxWidth: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div><h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{t('commissions.modal_title')}</h2><p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>{t('commissions.modal_subtitle')}</p></div>
              <button onClick={() => setPayModal(null)} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} color="#475569" /></button>
            </div>
            <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><Building size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: '#94a3b8', fontSize: 11 }}>{t('commissions.modal_partner')}</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{payModal.partner.name || payModal.commission.partner_name}</div></div></div>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}><User size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: '#94a3b8', fontSize: 11 }}>{t('commissions.modal_contact')}</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{payModal.partner.contact_name || payModal.commission.partner_contact}</div></div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 16 }}><Banknote size={16} color="#64748b" style={{ marginTop: 2, flexShrink: 0 }} /><div><div style={{ color: '#94a3b8', fontSize: 11 }}>{t('commissions.modal_iban')}</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, fontFamily: 'monospace' }}>{payModal.partner.iban || t('commissions.modal_iban_missing')}</div></div></div>
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div><div style={{ color: '#94a3b8', fontSize: 11 }}>{t('commissions.modal_prospect')}</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{payModal.commission.prospect_name}</div></div>
                <div><div style={{ color: '#94a3b8', fontSize: 11 }}>{t('commissions.modal_deal')}</div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13 }}>{fmt(payModal.commission.deal_value)}</div></div>
                <div><div style={{ color: '#94a3b8', fontSize: 11 }}>{t('commissions.modal_rate')}</div><div style={{ fontWeight: 600, color: 'var(--rb-primary, #059669)', fontSize: 13 }}>{payModal.commission.rate}%</div></div>
              </div>
            </div>
            <div style={{ background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)', borderRadius: 14, padding: 20, textAlign: 'center', marginBottom: 24, border: '1px solid #bbf7d0' }}>
              <div style={{ color: '#16a34a', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t('commissions.modal_amount')}</div>
              <div style={{ fontSize: 36, fontWeight: 800, color: '#16a34a', letterSpacing: -1 }}>{fmt(payModal.commission.amount)}</div>
            </div>
            {!payModal.partner.iban && (<div style={{ background: '#fffbeb', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 12, color: '#92400e', display: 'flex', alignItems: 'center', gap: 6, border: '1px solid #fde68a' }}><AlertTriangle size={14} /> {t('commissions.modal_iban_missing')}</div>)}
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setPayModal(null)} style={{ flex: 1, padding: '13px', borderRadius: 12, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>{t('commissions.modal_cancel')}</button>
              <button onClick={handleConfirmPay} disabled={paying} style={{ flex: 2, padding: '13px', borderRadius: 12, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: paying ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, boxShadow: '0 4px 15px rgba(34,197,94,0.3)' }}>
                <CreditCard size={16} /> {paying ? t('commissions.modal_confirming') : t('commissions.modal_confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {qontoModal && (
        <QontoResultModal
          modal={qontoModal}
          onClose={() => setQontoModal(null)}
          onConfirm={confirmAndPay}
          t={t}
        />
      )}

      {toast && (
        <div role="status" style={{
          position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
          padding: '14px 18px', borderRadius: 12,
          background: toast.type === 'error' ? '#fef2f2' : toast.type === 'info' ? '#f0f9ff' : '#f0fdf4',
          color:      toast.type === 'error' ? '#b91c1c' : toast.type === 'info' ? '#075985' : '#166534',
          border: `1px solid ${toast.type === 'error' ? '#fecaca' : toast.type === 'info' ? '#bae6fd' : '#bbf7d0'}`,
          fontSize: 13, fontWeight: 600,
          boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
          maxWidth: 420,
        }}>
          {toast.text}
        </div>
      )}
    </div>
  );
}

function QontoResultModal({ modal, onClose, onConfirm, t }) {
  const Wrap = ({ children, width = 480 }) => (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={modal.executing ? undefined : onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 20, width, maxWidth: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: 28 }}>
        {children}
      </div>
    </div>
  );

  if (modal.kind === 'confirm') {
    const list = modal.commissions || [];
    const total = list.reduce((s, c) => s + (parseFloat(c.amount) || 0), 0);
    const isBulk = modal.mode === 'bulk';
    const totalLabel = fmt(total);
    return (
      <Wrap width={520}>
        <div style={{ marginBottom: 18 }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>
            {t('qonto.confirm_title', 'Confirmer le paiement')}
          </h2>
          <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
            {t('qonto.confirm_subtitle', 'Vous êtes sur le point de lancer des virements via Qonto.')}
          </p>
        </div>

        <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{
            display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 0.8fr',
            background: '#f8fafc', padding: '10px 14px',
            fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <div>{t('commissions.tbl_partner', 'Partenaire')}</div>
            <div>{t('commissions.tbl_deal', 'Deal')}</div>
            <div style={{ textAlign: 'right' }}>{t('commissions.tbl_commission', 'Montant')}</div>
          </div>
          <div style={{ maxHeight: 260, overflowY: 'auto' }}>
            {list.map((c, i) => (
              <div key={c.id} style={{
                display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 0.8fr',
                padding: '10px 14px', fontSize: 13,
                background: i % 2 === 0 ? '#fff' : '#fafbfc',
                borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
                alignItems: 'center',
              }}>
                <div style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.partner_name || '—'}
                </div>
                <div style={{ color: '#475569', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {c.prospect_company || c.prospect_name || '—'}
                </div>
                <div style={{ textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>
                  {fmt(c.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px', borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0',
          marginBottom: 12,
        }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('qonto.confirm_count_label', 'Nombre d\'opérations')}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#166534', marginTop: 2 }}>
              {t('qonto.confirm_count_value', { count: list.length, defaultValue: '{{count}} virement(s)' })}
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {t('qonto.confirm_total_label', 'Montant total')}
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#16A34A', letterSpacing: -0.5, marginTop: 2 }}>
              {totalLabel}
            </div>
          </div>
        </div>

        <div style={{
          padding: '10px 14px', borderRadius: 10,
          background: '#fffbeb', border: '1px solid #fde68a',
          color: '#92400e', fontSize: 12, fontWeight: 500, marginBottom: 18,
        }}>
          {t('qonto.confirm_sca_hint', 'Chaque virement nécessitera une validation SCA dans votre application Qonto.')}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button
            onClick={onClose}
            disabled={modal.executing}
            style={{
              padding: '11px 18px', borderRadius: 10,
              background: '#fff', border: '1px solid #e2e8f0',
              color: '#475569', fontWeight: 600, fontSize: 14, cursor: modal.executing ? 'not-allowed' : 'pointer',
            }}
          >
            {t('common.cancel', 'Annuler')}
          </button>
          <button
            onClick={onConfirm}
            disabled={modal.executing || list.length === 0}
            style={{
              padding: '11px 22px', borderRadius: 10,
              background: '#16A34A', border: 'none', color: '#fff',
              fontWeight: 700, fontSize: 14, cursor: modal.executing ? 'wait' : 'pointer',
              opacity: modal.executing ? 0.75 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 8,
              boxShadow: '0 4px 14px rgba(22,163,74,0.25)',
            }}
          >
            {modal.executing
              ? t('qonto.confirm_running', 'Paiement en cours…')
              : isBulk
                ? t('qonto.confirm_button_bulk', { total: totalLabel, defaultValue: 'Confirmer le paiement — {{total}}' })
                : t('qonto.confirm_button_single', { total: totalLabel, defaultValue: 'Confirmer le paiement — {{total}}' })}
          </button>
        </div>
      </Wrap>
    );
  }

  if (modal.kind === 'initiated') {
    return (
      <Wrap>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', border: '2px solid #bbf7d0', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <CheckCircle size={32} color="#16a34a" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
            {t('qonto.modal_initiated_title', 'Virement initié')}
          </h2>
          <p style={{ color: '#475569', fontSize: 15, margin: '0 0 6px' }}>
            {t('qonto.modal_initiated_message', 'Un virement de {{amount}} € vers {{partner}} a été envoyé à Qonto.', {
              amount: fmt(modal.amount).replace(/\s?€/, ''),
              partner: modal.partnerName || '—',
            })}
          </p>
          {modal.requiresSca && (
            <p style={{ color: '#92400e', fontSize: 13, fontWeight: 600, margin: '4px 0 0' }}>
              {t('qonto.modal_initiated_sca_hint', 'Validez le virement dans votre application Qonto (notification SCA).')}
            </p>
          )}
          {modal.reference && (
            <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: '#f8fafc', border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}>
              <span style={{ color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('qonto.transfer_reference', 'Référence')}</span>
              <span style={{ marginLeft: 8, fontFamily: 'monospace', color: '#0f172a' }}>{modal.reference}</span>
            </div>
          )}
          <button onClick={onClose} style={{ marginTop: 22, padding: '11px 32px', borderRadius: 10, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {t('common.understood', 'Compris')}
          </button>
        </div>
      </Wrap>
    );
  }

  if (modal.kind === 'error') {
    return (
      <Wrap>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#fef2f2', border: '2px solid #fecaca', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            <X size={32} color="#dc2626" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
            {t('qonto.modal_error_title', 'Échec du virement')}
          </h2>
          <p style={{ color: '#475569', fontSize: 15, margin: '0 0 6px' }}>{modal.message}</p>
          <button onClick={onClose} style={{ marginTop: 22, padding: '11px 32px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {t('common.close', 'Fermer')}
          </button>
        </div>
      </Wrap>
    );
  }

  // bulk
  if (modal.kind === 'bulk') {
    if (modal.phase === 'running') {
      return (
        <Wrap>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#eef2ff', border: '2px solid #c7d2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
              <Send size={32} color="#4f46e5" />
            </div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
              {t('qonto.modal_bulk_running_title', 'Paiement en cours…')}
            </h2>
            <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>
              {t('qonto.modal_bulk_running_message', { count: modal.total, defaultValue: 'Envoi de {{count}} virement(s) à Qonto…' })}
            </p>
          </div>
        </Wrap>
      );
    }
    const partial = modal.failed && modal.failed.length > 0;
    return (
      <Wrap>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: partial ? '#fffbeb' : '#f0fdf4', border: `2px solid ${partial ? '#fde68a' : '#bbf7d0'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
            {partial ? <AlertTriangle size={32} color="#d97706" /> : <CheckCircle size={32} color="#16a34a" />}
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
            {partial
              ? t('qonto.modal_bulk_partial_title', 'Paiement partiel')
              : t('qonto.modal_bulk_done_title', 'Virements initiés')}
          </h2>
          <p style={{ color: '#475569', fontSize: 15, margin: '0 0 6px' }}>
            {partial
              ? t('qonto.modal_bulk_partial_summary', { ok: modal.okCount, fail: modal.failed.length, defaultValue: '{{ok}} virement(s) initié(s), {{fail}} en erreur.' })
              : t('qonto.modal_bulk_done_summary', { count: modal.okCount, total: fmt(modal.totalAmount).replace(/\s?€/, ''), defaultValue: '{{count}} virement(s) initié(s) pour un total de {{total}} €.' })
            }
          </p>
          {modal.requiresSca && modal.okCount > 0 && (
            <p style={{ color: '#92400e', fontSize: 13, fontWeight: 600, margin: '6px 0 0' }}>
              {t('qonto.modal_bulk_sca_hint', 'Validez les virements dans votre application Qonto.')}
            </p>
          )}
          {modal.skipped && modal.skipped.length > 0 && (
            <div style={{ marginTop: 14, alignSelf: 'stretch', textAlign: 'left', padding: '10px 14px', borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', fontSize: 12, color: '#92400e' }}>
              <strong>{t('qonto.skipped', { count: modal.skipped.length, defaultValue: '{{count}} ignorée(s)' })}</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {modal.skipped.slice(0, 5).map((s, i) => (
                  <li key={i}>{qontoErrorLabel(t, s.reason)}</li>
                ))}
              </ul>
            </div>
          )}
          {partial && (
            <div style={{ marginTop: 12, alignSelf: 'stretch', textAlign: 'left', padding: '10px 14px', borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, color: '#b91c1c' }}>
              <strong>{t('qonto.modal_bulk_failed_label', 'En erreur')}</strong>
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {modal.failed.slice(0, 5).map((f, i) => (
                  <li key={i}>{qontoErrorLabel(t, f.reason, f.reason)}</li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={onClose} style={{ marginTop: 22, padding: '11px 32px', borderRadius: 10, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
            {t('common.understood', 'Compris')}
          </button>
        </div>
      </Wrap>
    );
  }

  return null;
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
