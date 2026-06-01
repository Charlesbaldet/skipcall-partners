import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { fmt, fmtDate, fmtDateTime } from '../lib/constants';
import { DollarSign, CheckCircle, Clock, CreditCard, AlertTriangle, Download, X, Building, User, Banknote, List, LayoutGrid, FileText, ShieldCheck, Send, RefreshCw, Trash2, Eye, BookOpen } from 'lucide-react';
import ConfirmModal from '../components/ConfirmModal.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import { showPrompt } from '../components/Dialogs.jsx';

// Map a payment_error column value (which the backend now stores as
// a SHORT code, not a JSON dump — but legacy rows might still hold
// the raw 428 body) to a structured banner descriptor: { tone:
// 'info'|'error', message, action }.
//
//   tone     — 'info' (amber) for SCA-pending, 'error' (red) for
//              actual failures.
//   action   — 'check' for SCA flows (the user clicks "J'ai déjà
//              approuvé"), 'retry' for everything else (the user
//              clicks "Réessayer le paiement"). The card surfaces
//              exactly the right action button so the admin is
//              never stuck staring at a "contact support" dead end.
//
// CRITICAL: every code path must return action='retry' or
// action='check' on a real failure — never the legacy "contactez
// le support" fallback. The admin IS the support.
function getPaymentErrorMessage(t, rawError) {
  if (!rawError) return null;

  const codeMessages = {
    sca_required: {
      tone: 'info',
      action: 'check',
      message: t('qonto.sca_pending_banner', '⏳ En attente de validation SCA — Approuvez le virement dans votre app Qonto'),
    },
    sca_replay_max_retries_exceeded: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_sca_max_retries', 'La validation SCA a échoué après plusieurs tentatives.'),
    },
    insufficient_funds: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_insufficient_funds', 'Solde insuffisant sur votre compte Qonto.'),
    },
    beneficiary_bic_invalid: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_bic_invalid_help', 'Le BIC du bénéficiaire est invalide. Vérifiez les informations bancaires du partenaire.'),
    },
    invalid_bic: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_bic_invalid_help', 'Le BIC du bénéficiaire est invalide. Vérifiez les informations bancaires du partenaire.'),
    },
    invalid_iban: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_invalid_iban', 'L\'IBAN du bénéficiaire est invalide.'),
    },
    amount_too_low: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_amount_too_low', 'Le montant est trop faible.'),
    },
    amount_too_high: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_amount_too_high', 'Le montant dépasse le plafond autorisé.'),
    },
    beneficiary_not_found: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_beneficiary_not_found', 'Bénéficiaire non trouvé.'),
    },
    transfer_declined: {
      tone: 'error',
      action: 'retry',
      message: t('qonto.error_transfer_declined', 'Virement refusé par Qonto.'),
    },
  };

  // Short-code path (after the v23 sanitizer): the column holds a
  // single code like "insufficient_funds".
  if (codeMessages[rawError]) return codeMessages[rawError];

  // Legacy paths: try JSON-parse, then substring scan.
  try {
    const parsed = JSON.parse(rawError);
    if (parsed && parsed.code && codeMessages[parsed.code]) return codeMessages[parsed.code];
  } catch { /* not JSON */ }
  for (const key of Object.keys(codeMessages)) {
    if (rawError.includes(key)) return codeMessages[key];
  }

  // Unknown error → generic "Le paiement a échoué" with retry. Never
  // "contactez le support" — the admin can always reset and try again.
  return {
    tone: 'error',
    action: 'retry',
    message: t('qonto.error_payment_failed', 'Le paiement a échoué.'),
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
  // F6 — état "SCA en cours". null = aucun paiement en vol.
  //   { phase: 'in-flight', message } = requête envoyée, attente Qonto
  //                                     (l'admin doit valider sur son
  //                                     téléphone). Boutons Payer/Tout
  //                                     payer disabled tant que != null.
  //   { phase: 'timeout', message }    = timeout 90s atteint. L'opération
  //                                     est probablement toujours en
  //                                     cours côté serveur (qonto
  //                                     idempotency_key F2a-FIX2
  //                                     protège contre les doublons).
  //                                     Auto-refresh dans 30s.
  const [paymentState, setPaymentState] = useState(null);
  const paymentTimeoutRef = useRef(null);
  useEffect(() => () => {
    if (paymentTimeoutRef.current) clearTimeout(paymentTimeoutRef.current);
  }, []);
  const [rejectModal, setRejectModal] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [qontoStatus, setQontoStatus] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [refreshingPolls, setRefreshingPolls] = useState(false);
  const [toast, setToast] = useState(null);
  // Invoice preview modal — opens when admin clicks "Voir la facture"
  // on a pending_validation card. Holds the blob URL + filename so
  // we can embed in an <iframe> and offer a Télécharger button. The
  // URL must be revoked on close to avoid leaking blobs.
  const [invoicePreview, setInvoicePreview] = useState(null);
  // qontoModal holds whatever the most recent Qonto pay action wants
  // to surface — initiated, bulk progress / summary, or a failure
  // with a French-mapped message. Shape:
  //   { kind: 'initiated' | 'bulk' | 'error', ...payload }
  const [qontoModal, setQontoModal] = useState(null);
  // F2b → F4 : la modale "Lancer la paie groupée" a été retirée en
  // F4 ; les batches se créent désormais automatiquement à l'approve
  // (cf. backend/routes/commissions.js handler /approve).
  // L'endpoint POST /api/payouts/create-batches reste accessible côté
  // backend pour rattrapage manuel mais n'est plus consommé ici.
  // F3b — batches du tenant (cadence != 'unitary'). Permet le banner
  // deadline, la 5e colonne "En retard", le regroupement automatique
  // dans les 4 colonnes existantes et la modale détail.
  const [batches, setBatches] = useState([]);
  // Modale détail batch : { loading, batch, commissions } pendant
  // le fetch puis avec la payload. null quand fermée.
  const [batchDetail, setBatchDetail] = useState(null);
  const [batchCanceling, setBatchCanceling] = useState(false);
  // J5-C2 — états modale détail batch : paiement Qonto en cours +
  // chargement/ouverture de la facture batch.
  const [batchPaying, setBatchPaying] = useState(false);
  const [batchInvoiceLoading, setBatchInvoiceLoading] = useState(false);
  // J5-C3 — Qonto SCA challenge en cours sur le batch. Allumé soit par
  // le premier pay-qonto qui répond requires_sca, soit en ouverture de
  // modale si le batch projette déjà sca_pending=true (cas refresh).
  const [batchScaPending, setBatchScaPending] = useState(false);
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
  // F2b — cadence batch tenant. 'unitary' (défaut F1) = comportement
  // historique inchangé : le bouton "Lancer la paie groupée" ne s'affiche
  // pas. 'monthly' / 'quarterly' = bouton visible dans le header.
  const payoutCadence = myTenant?.payout_cadence || 'unitary';
  const batchCadenceActive = payoutCadence !== 'unitary';

  // F3b — helpers batches : map id -> batch, sets dérivés, ouverture détail
  const batchesById = (() => { const m = new Map(); for (const b of batches) m.set(b.id, b); return m; })();
  // F5-FIX1 — seuil minimum à 2 commissions pour qu'un batch s'affiche
  // en carte agrégée. En dessous (= 1 commission), la commission est
  // rendue comme carte individuelle classique selon son propre status.
  // Cache le bug discrepancy DB (batch awaiting_invoice + commission
  // paid) et réexpose les UI controls par-commission (icon download
  // facture, tag "Jusqu'au DATE", compteur "0/12 versés").
  //
  // J5-C1 — un batch ACTIONNABLE doit rester visible même à 1 commission :
  // si une facture a été déposée (has_invoice / invoice_uploaded_at,
  // champs projetés par GET /payouts/batches) OU si le batch est en
  // état avancé (ready_to_pay / paid), il faut le rendre en carte
  // agrégée — sinon l'admin ne voit ni la facture ni le statut et ne
  // peut ni valider ni payer (cas Mooniz + Trait d'Union, batches à
  // 1 commission passés en ready_to_pay après upload partenaire). Le
  // seuil ≥2 reste appliqué uniquement aux batches awaiting_invoice
  // sans facture (où la carte agrégée n'apporte rien vs l'individuelle).
  const isAggregatedBatch = (b) => {
    if (!b) return false;
    if (b.has_invoice || b.invoice_uploaded_at) return true;
    if (b.status === 'ready_to_pay' || b.status === 'paid') return true;
    return (b.commission_count ?? 0) >= 2;
  };
  const lateBatches = batches.filter(b =>
    b.is_late === true && b.status === 'awaiting_invoice' && isAggregatedBatch(b)
  );
  const nearDeadlineBatches = batches.filter(b => {
    if (b.status !== 'awaiting_invoice' || b.is_late) return false;
    if (!b.created_at) return false;
    if (!isAggregatedBatch(b)) return false;
    const ageDays = (Date.now() - new Date(b.created_at).getTime()) / (24 * 60 * 60 * 1000);
    return ageDays > 7;
  });

  const openBatchDetail = async (batchId) => {
    setBatchDetail({ loading: true, batch: null, commissions: [] });
    // J5-C3 — reset puis hydrate selon le state DB projeté (sca_pending
    // est un booléen renvoyé par GET /batches/:id si qonto_sca_session_
    // token est non NULL en base).
    setBatchScaPending(false);
    try {
      const r = await api.getPayoutBatchDetail(batchId);
      setBatchDetail({ loading: false, batch: r.batch, commissions: r.commissions || [] });
      if (r.batch && r.batch.sca_pending) setBatchScaPending(true);
    } catch (e) {
      setBatchDetail(null);
      showToast(e.message || t('common.error', 'Erreur'), 'error');
    }
  };

  const handleCancelBatch = async () => {
    if (!batchDetail?.batch) return;
    const count = batchDetail.commissions.length;
    const ok = window.confirm(
      t('payouts.cancel_confirm', { count, defaultValue: 'Annuler ce batch ? Les {{count}} commissions seront détachées et redeviendront payables individuellement.' })
    );
    if (!ok) return;
    setBatchCanceling(true);
    try {
      await api.cancelPayoutBatch(batchDetail.batch.id, { confirm: true });
      showToast(t('payouts.cancel_toast', 'Batch annulé. Commissions détachées.'), 'success');
      setBatchDetail(null);
      await reload();
    } catch (e) {
      showToast(e.message || t('common.error', 'Erreur'), 'error');
    }
    setBatchCanceling(false);
  };

  // J5-C2 — ouvrir/télécharger la facture batch. Le data-URI base64
  // n'est jamais projeté dans le JSON détail (payload lourd) : on le
  // récupère à la demande via GET /payouts/batches/:id/invoice qui
  // streame le PDF, puis on ouvre l'object URL dans un nouvel onglet.
  const handleViewBatchInvoice = async () => {
    if (!batchDetail?.batch) return;
    setBatchInvoiceLoading(true);
    try {
      const { url } = await api.fetchPayoutBatchInvoiceObjectUrl(batchDetail.batch.id);
      window.open(url, '_blank', 'noopener,noreferrer');
      // Révoque l'object URL après un délai laissant le temps au navigateur d'ouvrir.
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60_000);
    } catch (e) {
      showToast(e.message || t('common.error', 'Erreur'), 'error');
    }
    setBatchInvoiceLoading(false);
  };

  // J5-C2/J5-C3 — valider + payer le batch via Qonto SEPA. Flow en 2
  // temps quand Qonto demande une SCA :
  //   1. handlePayBatch : déclenche le 1er appel pay-qonto. Si Qonto
  //      renvoie requires_sca=true, on reste sur la modale et on
  //      affiche le bandeau "Validez la SCA dans Qonto" + bouton
  //      "J'ai déjà approuvé".
  //   2. handleConfirmSCA : Charles a validé sur son téléphone, on
  //      appelle confirm-sca qui rejoue la transaction avec le token
  //      SCA stocké → Qonto crée le transfert, on ferme + reload.
  const handlePayBatch = async () => {
    if (!batchDetail?.batch) return;
    const b = batchDetail.batch;
    const ok = window.confirm(
      t('payouts.pay_confirm', { amount: fmt(b.total_amount_ttc), partner: b.partner_name, defaultValue: 'Valider et payer {{amount}} TTC à {{partner}} via Qonto ?' })
    );
    if (!ok) return;
    setBatchPaying(true);
    try {
      const res = await api.payPayoutBatchQonto(b.id);
      if (res && res.requires_sca) {
        setBatchScaPending(true);
        showToast(t('payouts.sca_pending_toast', 'Validez la SCA dans l\'app Qonto, puis cliquez "J\'ai déjà approuvé".'), 'info');
      } else {
        showToast(t('payouts.pay_toast', 'Paiement Qonto initié.'), 'success');
        setBatchDetail(null);
        await reload();
      }
    } catch (e) {
      showToast(e.message || t('common.error', 'Erreur'), 'error');
    }
    setBatchPaying(false);
  };

  // J5-C3 — Charles confirme avoir validé la SCA sur son téléphone.
  // confirm-sca rejoue la transaction côté backend ; si Qonto refuse
  // (SCA pas encore approuvée / expirée), le backend renvoie un payload
  // explicite et on garde la modale ouverte.
  const handleConfirmSCA = async () => {
    if (!batchDetail?.batch) return;
    const b = batchDetail.batch;
    setBatchPaying(true);
    try {
      const res = await api.confirmPayoutBatchSCA(b.id);
      if (res && res.ok) {
        showToast(t('payouts.sca_confirmed_toast', 'Paiement confirmé. Virement en cours.'), 'success');
        setBatchScaPending(false);
        setBatchDetail(null);
        await reload();
      } else if (res && res.needs_restart) {
        setBatchScaPending(false);
        showToast(res.message || t('payouts.sca_expired', 'SCA expirée — relancez le paiement.'), 'error');
        // reload : récupère le state propre (token nullifié côté backend)
        await reload();
        setBatchDetail(null);
      } else {
        // sca_still_pending : on reste sur la modale, message info
        showToast(res?.message || t('payouts.sca_still_pending', 'SCA pas encore approuvée — validez dans Qonto.'), 'info');
      }
    } catch (e) {
      showToast(e.message || t('common.error', 'Erreur'), 'error');
    }
    setBatchPaying(false);
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
    const tenant = mt && (mt.tenant || mt);
    setMyTenant(tenant);
    setSummary(s.summary); setCommissions(c.commissions);
    setTotals({ pending: c.totalPending, paid: c.totalPaid });
    setQontoStatus(q);
    // F3b — fetch batches uniquement si la cadence est non-unitary.
    // Pour les tenants 'unitary' (la majorité), on saute purement
    // pour économiser un round-trip et garder le comportement F2b
    // strictement inchangé.
    const cadence = tenant?.payout_cadence || 'unitary';
    if (cadence !== 'unitary') {
      try {
        const r = await api.listPayoutBatches();
        setBatches(r.batches || []);
      } catch (e) {
        console.warn('[commissions] listPayoutBatches failed:', e.message);
        setBatches([]);
      }
    } else {
      setBatches([]);
    }
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
    catch (err) { showToast(err.message || 'Error', 'error'); }
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
    catch (err) { showToast(err.message || 'Error', 'error'); }
  };

  // Opens the invoice preview modal. Falls back to a download toast
  // if the blob fetch fails (auth blip, missing file, etc.).
  const handlePreviewInvoice = async (commission) => {
    setInvoicePreview({ commissionId: commission.id, loading: true, partnerName: commission.partner_name });
    try {
      const { url, filename } = await api.fetchCommissionInvoiceObjectUrl(commission.id);
      setInvoicePreview({ commissionId: commission.id, url, filename, partnerName: commission.partner_name });
    } catch (err) {
      setInvoicePreview(null);
      showToast(err.message || t('commission.invoice_load_failed', 'Impossible de charger la facture.'), 'error');
    }
  };
  const closeInvoicePreview = () => {
    if (invoicePreview?.url) URL.revokeObjectURL(invoicePreview.url);
    setInvoicePreview(null);
  };

  // Hard-delete a commission with an optional motif. Backend refuses
  // paid + transfer-in-flight rows with a 409, which we surface as a
  // toast. The partner gets an email + in-app notification.
  const handleDeleteCommission = async (c) => {
    const reason = await showPrompt({
      title: t('commission.delete_title', 'Supprimer la commission'),
      message: t('commission.delete_message', {
        amount: fmt(c.amount),
        partner: c.partner_name || '',
        defaultValue: 'Êtes-vous sûr de vouloir supprimer la commission de {{amount}} pour {{partner}} ? Le partenaire sera informé par email.',
      }),
      label: t('commission.delete_reason_label', 'Motif de suppression (optionnel)'),
      placeholder: t('commission.delete_reason_placeholder', 'Ex : le client a annulé son contrat'),
      confirmLabel: t('common.delete', 'Supprimer'),
      cancelLabel: t('common.cancel', 'Annuler'),
      required: false,
      variant: 'danger',
    });
    if (reason === null) return; // user cancelled / pressed Escape
    setBusyId(c.id);
    try {
      await api.deleteCommission(c.id, reason ? reason : undefined);
      showToast(t('commission.delete_success', 'Commission supprimée. Le partenaire a été informé.'), 'success');
      await reload();
    } catch (err) {
      const code = err?.data?.error;
      const msg = code === 'commission_paid'
        ? t('commission.delete_blocked_paid', 'Une commission payée ne peut pas être supprimée.')
        : code === 'transfer_in_flight'
          ? t('commission.delete_blocked_transfer', 'Un virement est en cours pour cette commission. Annulez-le côté Qonto avant de la supprimer.')
          : (err?.message || 'Error');
      showToast(msg, 'error');
    }
    setBusyId(null);
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
      showToast(err.message || 'Error', 'error');
    }
    setRejecting(false);
  };

  const handleConfirmPay = async () => {
    setPaying(true);
    try { await api.updateCommission(payModal.commission.id, 'paid'); setPayModal(null); await reload(); }
    catch (err) { showToast(t('commissions.modal_error'), 'error'); }
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
    setPaymentState({
      phase: 'in-flight',
      message: t('qonto.in_flight', 'Paiement en cours, validez sur votre app Qonto si demandé. Ne fermez pas cette fenêtre.'),
    });
    try {
      const r = await api.payCommissionViaQonto(commission.id);
      setQontoModal({
        kind: 'initiated',
        amount: parseFloat(commission.amount) || 0,
        partnerName: commission.partner_name,
        reference: r.reference,
        requiresSca: !!r.requires_sca,
      });
      setPaymentState(null);
      await reload();
      // Background reconciliation — quietly polls Qonto every 30 s
      // (up to 10 min) so a successful SCA approval flips the card
      // to Payé without the admin having to click anything.
      startAutoPoll();
    } catch (err) {
      // F6 — timeout SCA (AbortError 90s) : on NE déclenche PAS le
      // modal d'erreur (Qonto a probablement reçu la requête et la
      // SCA est encore en cours côté téléphone). Message prudent +
      // auto-refresh dans 30s pour rattraper l'état effectif.
      if (err && err.name === 'AbortError') {
        setQontoModal(null);
        setPaymentState({
          phase: 'timeout',
          message: t('qonto.in_flight_timeout', 'Paiement en cours, le résultat apparaîtra dans quelques instants. N\'effectuez pas un nouveau paiement.'),
        });
        if (paymentTimeoutRef.current) clearTimeout(paymentTimeoutRef.current);
        paymentTimeoutRef.current = setTimeout(async () => {
          try { await reload(); } catch {}
          setPaymentState(null);
        }, 30_000);
      } else {
        setPaymentState(null);
        const code = err?.data?.error || err?.body?.code;
        const message = qontoErrorLabel(t, code, err?.message);
        setQontoModal({ kind: 'error', message });
      }
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
    setPaymentState({
      phase: 'in-flight',
      message: t('qonto.in_flight', 'Paiement en cours, validez sur votre app Qonto si demandé. Ne fermez pas cette fenêtre.'),
    });
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
      setPaymentState(null);
      clearSelection();
      await reload();
      startAutoPoll();
    } catch (err) {
      // F6 — symétrique avec executeSinglePay : AbortError = timeout
      // SCA, on attend et on auto-refresh plutôt que de crier au loup.
      if (err && err.name === 'AbortError') {
        setQontoModal(null);
        setPaymentState({
          phase: 'timeout',
          message: t('qonto.in_flight_timeout', 'Paiement en cours, le résultat apparaîtra dans quelques instants. N\'effectuez pas un nouveau paiement.'),
        });
        if (paymentTimeoutRef.current) clearTimeout(paymentTimeoutRef.current);
        paymentTimeoutRef.current = setTimeout(async () => {
          try { await reload(); } catch {}
          setPaymentState(null);
        }, 30_000);
      } else {
        setPaymentState(null);
        const code = err?.data?.error || err?.body?.code;
        const message = qontoErrorLabel(t, code, err?.message);
        setQontoModal({ kind: 'error', message });
      }
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

  const handleRefreshPolls = async (opts = {}) => {
    // `from = 'sca_confirmation'` flags a poll triggered by the
    // "J'ai déjà approuvé" button on a SCA-pending card. The empty-
    // state toast then says "Le virement est en cours de traitement
    // par Qonto…" instead of the generic "Aucun changement"
    // sent by the toolbar Actualiser button.
    const from = opts.from || 'manual';
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
      } else if (from === 'sca_confirmation') {
        showToast(t('qonto.toast_sca_confirmed_no_match', 'Le virement est en cours de traitement par Qonto. Le statut sera mis à jour automatiquement.'), 'info');
      } else {
        showToast(t('qonto.toast_no_change', 'Aucun changement détecté. Vérifiez directement sur app.qonto.com.'), 'info');
      }
    }
    catch (err) {
      showToast(err.message || t('qonto.error_generic', 'Une erreur est survenue. Veuillez réessayer.'), 'error');
    }
    setRefreshingPolls(false);
  };

  // SCA confirmation — replays the saved transfer body with the
  // X-Qonto-Sca-Session-Token header. Triggered by the "J'ai déjà
  // approuvé" button on a SCA-pending card.
  const [confirmingScaId, setConfirmingScaId] = useState(null);
  const handleConfirmSca = async (commissionId) => {
    setConfirmingScaId(commissionId);
    try {
      const r = await api.confirmCommissionSca(commissionId);
      await reload();
      if (r.ok && r.status === 'paid') {
        showToast(t('qonto.toast_sca_paid', 'Virement confirmé — Payé ✅'), 'success');
      } else if (r.ok) {
        showToast(t('qonto.toast_sca_initiated', 'Virement validé — Qonto traite la demande.'), 'success');
      } else if (r.needs_restart) {
        // 412 expired / 422 not_found / 401 vop_proof_token_missing
        // all funnel here: backend reset the row, reload pulled the
        // Payer button back, toast points the user at it.
        showToast(r.message || t('qonto.toast_sca_needs_restart', 'La validation SCA a expiré. Veuillez cliquer sur Payer pour relancer le virement.'), 'warning');
      } else if (r.sca_still_pending) {
        showToast(t('qonto.toast_sca_still_pending', 'Le virement attend toujours votre validation dans Qonto.'), 'info');
      } else {
        showToast(r.message || t('qonto.error_generic', 'Une erreur est survenue. Veuillez réessayer.'), 'error');
      }
    } catch (err) {
      const code = err?.data?.error || err?.message;
      showToast(qontoErrorLabel(t, code, err?.message) || err.message || 'Error', 'error');
    }
    setConfirmingScaId(null);
  };

  // Wipes the Qonto-side state on a single commission and re-arms
  // it for another Pay attempt. Bound to the "Réessayer le paiement"
  // button on the error banner; the next click on Payer mints a
  // fresh idempotency key automatically because the column is now
  // NULL.
  const [resettingId, setResettingId] = useState(null);
  const handleResetPayment = async (commissionId) => {
    setResettingId(commissionId);
    try {
      await api.resetCommissionPayment(commissionId);
      await reload();
      showToast(t('qonto.toast_reset_ok', 'Paiement réinitialisé. Vous pouvez réessayer.'), 'success');
    } catch (err) {
      showToast(err.message || t('qonto.error_generic', 'Une erreur est survenue. Veuillez réessayer.'), 'error');
    }
    setResettingId(null);
  };

  const exportCSV = () => {
    // VAT columns are emitted unconditionally so the same template
    // works for FR (assujetti) and intra-EU exports. Legacy rows
    // (no payout snapshot yet) fall back to amount for HT/TTC and
    // 0 for the VAT line, which matches what RefBoost actually
    // wired and stayed correct against the backfill in v31.
    const headers = [
      t('commissions.tbl_prospect'),
      t('referrals.company'),
      t('commissions.tbl_partner'),
      t('commissions.tbl_rate') + ' %',
      t('commissions.tbl_deal') + ' €',
      t('commissions.tbl_ht') + ' €',
      t('commissions.tbl_tva_rate') + ' %',
      t('commissions.tbl_tva') + ' €',
      t('commissions.tbl_ttc') + ' €',
      t('commissions.tbl_status'),
      t('referrals.created_at'),
      t('commissions.date_validated'),
      t('commissions.paid_on'),
    ];
    const rows = commissions.map(c => {
      const ht  = c.amount_ht  != null ? c.amount_ht  : c.amount;
      const ttc = c.amount_ttc != null ? c.amount_ttc : c.amount;
      const tax = parseFloat(c.amount_tax || 0);
      const taxRate = parseFloat(c.tax_rate_applied || 0);
      return [
        c.prospect_name,
        c.prospect_company,
        c.partner_name,
        c.rate,
        c.deal_value,
        ht,
        taxRate,
        tax,
        ttc,
        COM_STATUS[c.status]?.label || c.status,
        c.created_at?.split('T')[0] || '',
        c.approved_at?.split('T')[0] || '',
        c.paid_at?.split('T')[0] || '',
      ];
    });
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

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      <style>{`@keyframes rb-spin{to{transform:rotate(360deg)}}.rb-spin{animation:rb-spin 1s linear infinite}@keyframes rb-pulse{0%,100%{opacity:1}50%{opacity:.4}}.rb-pulse{animation:rb-pulse 1.4s ease-in-out infinite}`}</style>

      {/* F6 — Bandeau sticky "Paiement en cours" / timeout SCA. Visible
          tant que paymentState !== null. En phase 'in-flight' : pas de
          bouton "Fermer" (force l'attente). En phase 'timeout' : bouton
          "Actualiser maintenant" pour rattraper l'état effectif sans
          attendre l'auto-refresh 30s. */}
      {paymentState && (
        <div
          style={{
            position: 'sticky', top: 0, zIndex: 999,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 12, marginBottom: 12,
            background: paymentState.phase === 'in-flight' ? '#eff6ff' : '#fffbeb',
            border: '1px solid ' + (paymentState.phase === 'in-flight' ? '#bfdbfe' : '#fde68a'),
            color: paymentState.phase === 'in-flight' ? '#1d4ed8' : '#92400e',
            fontSize: 13, fontWeight: 600,
          }}
        >
          <Send size={16} className={paymentState.phase === 'in-flight' ? 'rb-pulse' : ''} />
          <span style={{ flex: 1 }}>{paymentState.message}</span>
          {paymentState.phase === 'timeout' && (
            <button
              onClick={async () => {
                if (paymentTimeoutRef.current) { clearTimeout(paymentTimeoutRef.current); paymentTimeoutRef.current = null; }
                try { await reload(); } catch {}
                setPaymentState(null);
              }}
              style={{
                padding: '6px 12px', borderRadius: 8,
                background: '#fff', border: '1px solid #fde68a', color: '#92400e',
                fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                whiteSpace: 'nowrap',
              }}
            >
              {t('qonto.refresh_now', 'Actualiser maintenant')}
            </button>
          )}
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.2, margin: 0 }}>{t('commissions.title')}</h1>
          <p style={{ color: '#64748b', fontSize: 13, margin: '4px 0 0' }}>
            {t('commissions.subtitle_counts', {
              pending: fmt(totals.pending),
              paid: fmt(totals.paid),
              defaultValue: '{{pending}} en cours, {{paid}} payées',
            })}
          </p>
        </div>
        <button onClick={exportCSV} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 10, background: '#fff', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          <Download size={14} /> {t('commissions.export')}
        </button>
      </div>

      {/* KPIs — HT only. The TVA breakdown lives on each card's
          gray banner; the tiles stay clean with a single number so
          the admin can scan totals at a glance. Backend already sums
          c.amount (HT) for totalAll / totals.pending / totals.paid. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <ComKPI icon={DollarSign}  label={t('commissions.kpi_total')}   value={fmt(totalAll)}       color="var(--rb-primary, #059669)" />
        <ComKPI icon={Clock}       label={t('commissions.kpi_pending')} value={fmt(totals.pending)} color="#f59e0b" />
        <ComKPI icon={CheckCircle} label={t('commissions.kpi_paid')}    value={fmt(totals.paid)}    color="#16a34a" />
      </div>

      {/* E4 — "Décisions à arbitrer" : commissions récurrentes
          annulées suite à un passage en lost et qui attendent une
          décision admin (payer le dernier cycle, ou confirmer
          l'arrêt). Bloc entièrement masqué quand la file est vide,
          donc invisible pour les tenants OFF et pour les pipelines
          sans commission cancelled. Statut = section additionnelle,
          pas un nouvel onglet (réutilisation de la page existante). */}
      <ArbitrageQueue commissions={visibleCommissions} t={t} api={api} onChanged={reload} />


      {/* Toolbar — tabs left, view toggle + actions right, separated
          from the body by a single bottom border. The right-side
          actions are pipeline-tab-only and the Qonto-bound buttons
          only appear when the integration is connected. */}
      {(() => {
        const payableCount = visibleCommissions.filter(c => c.status === 'pending_validation').length;
        return (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', marginBottom: 20 }}>
            <div style={{ display: 'flex' }}>
              {[
                { id: 'pipeline', label: t('commissions.pipeline') },
                { id: 'summary', label: t('commissions.by_partner') },
              ].map(tab_ => {
                const active = tab === tab_.id;
                return (
                  <button
                    key={tab_.id}
                    onClick={() => setTab(tab_.id)}
                    style={{
                      padding: '10px 16px', fontSize: 13, fontFamily: 'inherit',
                      background: 'transparent', border: 'none',
                      borderBottom: '2px solid ' + (active ? '#059669' : 'transparent'),
                      color: active ? '#059669' : '#64748b',
                      fontWeight: active ? 700 : 500,
                      cursor: 'pointer',
                      marginBottom: -1,
                    }}
                  >
                    {tab_.label}
                  </button>
                );
              })}
            </div>

            {tab === 'pipeline' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 6 }}>
                {/* Kanban / Table toggle (dark pill) */}
                <div style={{ display: 'flex', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
                  <button onClick={() => setViewMode('kanban')} style={{
                    padding: '6px 10px', fontSize: 12, fontWeight: 600, border: 'none',
                    background: viewMode === 'kanban' ? '#0f172a' : '#fff',
                    color: viewMode === 'kanban' ? '#fff' : '#64748b',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                  }}>
                    <LayoutGrid size={12} /> {t('commissions.kanban')}
                  </button>
                  <button onClick={() => setViewMode('table')} style={{
                    padding: '6px 10px', fontSize: 12, fontWeight: 600, border: 'none', borderLeft: '1px solid #e2e8f0',
                    background: viewMode === 'table' ? '#0f172a' : '#fff',
                    color: viewMode === 'table' ? '#fff' : '#64748b',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'inherit',
                  }}>
                    <List size={12} /> {t('commissions.table')}
                  </button>
                </div>

                {qontoStatus?.connected && (
                  <>
                    <div style={{ width: 1, height: 24, background: '#e2e8f0' }} />

                    <button
                      onClick={selectAllPayable}
                      disabled={payableCount === 0}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8,
                        border: '1px solid ' + (payableCount === 0 ? '#e2e8f0' : '#a7f3d0'),
                        background: payableCount === 0 ? '#fff' : '#f0fdf4',
                        color: payableCount === 0 ? '#94a3b8' : '#059669',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                        cursor: payableCount === 0 ? 'not-allowed' : 'pointer',
                        opacity: payableCount === 0 ? 0.5 : 1,
                      }}
                    >
                      {t('commissions.pay_all')} ({payableCount})
                    </button>

                    <button
                      onClick={handleRefreshPolls}
                      disabled={refreshingPolls}
                      title={t('qonto.refresh_status_tooltip', 'Rafraîchir les statuts Qonto')}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0',
                        background: '#fff', color: '#475569',
                        fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                        cursor: refreshingPolls ? 'wait' : 'pointer',
                        opacity: refreshingPolls ? 0.7 : 1,
                      }}
                    >
                      <RefreshCw size={12} className={refreshingPolls ? 'rb-spin' : ''} />
                      {refreshingPolls ? t('qonto.refreshing_status', 'Actualisation…') : t('commissions.refresh')}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })()}

      {tab === 'summary' && (() => {
        // Switch headline label + Total column to TTC when at least
        // one partner has VAT-tagged commissions. Tenants without
        // assujettis stay on the legacy single-amount layout, so
        // nothing changes for them visually.
        const anyVat = summary.some(p => parseFloat(p.total_tax || 0) > 0);
        const totalAllTtc = summary.reduce((s, p) => s + (parseFloat(p.total_ttc) || parseFloat(p.total_amount) || 0), 0);
        return (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, fontVariantNumeric: 'tabular-nums' }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {[t('commissions.tbl_partner'), t('commissions.tbl_rate'), t('commissions.tbl_deals'), `${rLabel} ${t('commissions.tbl_generated')}`, t('commissions.tbl_pending'), t('commissions.tbl_approved'), t('commissions.tbl_paid'), anyVat ? t('commissions.tbl_total') + ' TTC' : t('commissions.tbl_total')].map((h, i) => (
                <th
                  key={i}
                  style={{
                    padding: '13px 16px',
                    textAlign: i === 0 ? 'left' : 'right',
                    fontWeight: 600, color: '#64748b', fontSize: 11,
                    textTransform: 'uppercase', letterSpacing: 0.5,
                    borderBottom: '1px solid #e2e8f0',
                  }}
                >{h}</th>
              ))}
            </tr></thead>
            <tbody>{summary.map(p => {
              const partnerHasVat = parseFloat(p.total_tax || 0) > 0;
              const totalDisplay = anyVat
                ? (parseFloat(p.total_ttc) || parseFloat(p.total_amount) || 0)
                : (parseFloat(p.total_amount) || 0);
              return (
              <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '13px 16px', textAlign: 'left' }}><div style={{ fontWeight: 600, color: '#0f172a' }}>{p.name}</div><div style={{ color: '#94a3b8', fontSize: 12 }}>{p.contact_name}</div></td>
                <td style={{ padding: '13px 16px', textAlign: 'right' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 12 }}>{p.commission_rate}%</span></td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 600 }}>{p.total_commissions}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 600 }}>{fmt(p.total_deal_value)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', color: '#f59e0b', fontWeight: 600 }}>{fmt(p.pending_amount)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{fmt(p.approved_amount)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right', color: '#16a34a', fontWeight: 600 }}>{fmt(p.paid_amount)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'right' }}>
                  <div style={{ fontWeight: 800, fontSize: 16, color: '#0f172a', lineHeight: 1.2 }}>{fmt(totalDisplay)}</div>
                  {anyVat && partnerHasVat && (
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{fmt(p.total_ht)} HT</div>
                  )}
                </td>
              </tr>
            );})}</tbody>
            <tfoot><tr style={{ background: '#fefce8' }}>
              <td colSpan={7} style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 700, color: '#0f172a' }}>{t('commissions.total')}</td>
              <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 800, color: '#f59e0b', fontSize: 18 }}>
                {fmt(anyVat ? totalAllTtc : totalAll)}
                {anyVat && <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginLeft: 6 }}>TTC</span>}
              </td>
            </tr></tfoot>
          </table>
        </div>
        );
      })()}

      {/* Contextual bulk-pay action bar. "Tout payer" and "Actualiser"
          live in the toolbar above; this row only shows up while at
          least one pending_validation card is selected — Pay selection
          + Cancel. */}
      {tab === 'pipeline' && qontoStatus?.connected && selected.size > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
          <button onClick={handlePayBulk} disabled={bulkBusy || !!paymentState}
            style={{ padding: '9px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, opacity: (bulkBusy || !!paymentState) ? 0.7 : 1 }}>
            <Send size={14} /> {bulkBusy ? t('common.saving', 'Enregistrement…') : t('qonto.pay_selection', { count: selected.size, defaultValue: 'Payer la sélection ({{count}})' })}
          </button>
          <button onClick={clearSelection} disabled={bulkBusy}
            style={{ padding: '9px 14px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            {t('common.cancel', 'Annuler')}
          </button>
        </div>
      )}

      {/* F3b — bandeau deadline pour les batches awaiting_invoice.
          Rouge si au moins 1 batch dépasse les 10 jours (is_late=true),
          orange sinon si au moins 1 batch approche (>7j). Caché en
          cadence unitary (batches reste vide donc lateBatches +
          nearDeadlineBatches le sont aussi). */}
      {tab === 'pipeline' && batchCadenceActive && lateBatches.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', marginBottom: 12, fontSize: 13 }}>
          <AlertTriangle size={16} color="#dc2626" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontWeight: 600 }}>
            {t('payouts.banner_late', { count: lateBatches.length, defaultValue: '{{count}} batches en retard (facture non reçue depuis plus de 10 jours)' })}
          </span>
        </div>
      )}
      {tab === 'pipeline' && batchCadenceActive && lateBatches.length === 0 && nearDeadlineBatches.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', marginBottom: 12, fontSize: 13 }}>
          <Clock size={16} color="#d97706" style={{ flexShrink: 0 }} />
          <span style={{ flex: 1, fontWeight: 600 }}>
            {t('payouts.banner_near_deadline', { count: nearDeadlineBatches.length, defaultValue: '{{count}} batches approchent de la deadline facture (J-3 à J-1)' })}
          </span>
        </div>
      )}

      {tab === 'pipeline' && viewMode === 'kanban' && (
        <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 280px)', minHeight: 400 }}>
          {STATUS_KEYS.map(status => {
            const sc = COM_STATUS[status];
            // F5 — batch = unité visuelle. Position de la carte batch
            // dans le Kanban dérivée de batch.status (et NON de
            // commission.status). Mapping :
            //   batch.status='awaiting_invoice' → col 'awaiting_invoice'
            //   batch.status='ready_to_pay'     → col 'pending_validation'
            //   batch.status='paid'             → col 'paid'
            //   batch.status='cancelled'        → exclu (deleted_at filtré
            //                                   par F3a GET /batches déjà)
            // Les batches is_late vont exclusivement dans la 5e
            // colonne "En retard" (rendue plus bas), pas ici.
            const BATCH_COL_BY_STATUS = {
              awaiting_invoice: 'awaiting_invoice',
              ready_to_pay:     'pending_validation',
              paid:             'paid',
            };
            // F5-FIX1 : ne garder en carte agrégée que les batches
            // ≥ 2 commissions. Les batches à 1 commission sont
            // "désagrégés" et leur commission ré-apparaît en standalone
            // ci-dessous (placée dans la colonne selon commission.status,
            // pas batch.status — donc une commission paid sur un batch
            // awaiting_invoice s'affiche bien en "Payé").
            const colBatches = batches.filter(b =>
              BATCH_COL_BY_STATUS[b.status] === status && !b.is_late && isAggregatedBatch(b)
            );
            // Set des batches qui s'affichent comme cartes agrégées
            // (≥2). Inclut les batches is_late (cartes agrégées dans la
            // 5e colonne "En retard") pour que leurs commissions ne
            // soient pas dupliquées en standalone. Les commissions des
            // batches < 2 (ni En retard ni colonne classique) reviennent
            // en standalone.
            const aggregatedBatchIds = new Set(
              batches.filter(b => isAggregatedBatch(b)).map(b => b.id)
            );
            const standaloneCommissions = visibleCommissions.filter(c => {
              if (c.status !== status) return false;
              if (c.payout_batch_id && aggregatedBatchIds.has(c.payout_batch_id)) return false;
              return true;
            });
            // displayItems = batches (agrégées) + commissions standalone.
            // 1 batch = 1 item (peu importe le nombre de commissions).
            const displayItems = [
              ...colBatches.map(b => ({
                kind: 'aggregate',
                batch: b,
                commissions: visibleCommissions.filter(c => c.payout_batch_id === b.id),
              })),
              ...standaloneCommissions.map(c => ({ kind: 'commission', c })),
            ];
            const limit = comLimits[status] || 25;
            const cards = displayItems.slice(0, limit);
            const hasMore = displayItems.length > limit;
            return (
              <div key={status} style={{ flex: 1, background: '#f8fafc', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', border: '1px solid #e2e8f0' }}>
                {(() => {
                  // F5 — Column total + count = SOMME des unités visuelles
                  // affichées (1 carte batch = 1 unité, peu importe le
                  // nombre de commissions internes). Total HT = somme
                  // des commissions standalone + somme des batches
                  // agrégés de la colonne. Cohérence : le total
                  // correspond exactement à ce que l'admin voit.
                  const totalHt =
                    standaloneCommissions.reduce((s, c) => s + (parseFloat(c.amount_ht) || parseFloat(c.amount) || 0), 0)
                    + colBatches.reduce((s, b) => s + (parseFloat(b.total_amount_ht) || 0), 0);
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: sc.color }} />
                        <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{sc.label}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, color: sc.color }}>{fmt(totalHt)}</span>
                        <span style={{ background: sc.bg, color: sc.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{displayItems.length}</span>
                      </div>
                    </div>
                  );
                })()}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                  {cards.map(item => {
                    // F5 — carte agrégée violette pour CHAQUE batch
                    // (sans seuil minimum). 1 batch = 1 carte, position
                    // dans la colonne dérivée de batch.status.
                    if (item.kind === 'aggregate') {
                      const ab = item.batch;
                      const groupComs = item.commissions;
                      const totalCount = ab.commission_count != null
                        ? Number(ab.commission_count)
                        : groupComs.length;
                      const sortedPreview = [...groupComs]
                        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
                        .slice(0, 3);
                      const remaining = Math.max(0, totalCount - sortedPreview.length);
                      const hasVatGroup = parseFloat(ab.total_amount_tax || 0) > 0;
                      const batchStatusPill = {
                        awaiting_invoice: { label: t('payouts.status_awaiting_invoice', 'En attente de facture'), bg: '#fffbeb', color: '#92400e' },
                        ready_to_pay:     { label: t('payouts.status_ready_to_pay',     'Prêt à payer'),           bg: '#eff6ff', color: '#1d4ed8' },
                        paid:             { label: t('payouts.status_paid',             'Payé'),                    bg: '#f0fdf4', color: '#166534' },
                      }[ab.status] || null;
                      return (
                        <div
                          key={'aggregate-' + ab.id + '-' + status}
                          style={{
                            background: '#faf5ff', borderRadius: 12, padding: 14,
                            border: '1px solid #d8b4fe',
                            boxShadow: '0 1px 3px rgba(124,58,237,0.08)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, color: '#6b21a8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                                ▣ {ab.period}
                              </div>
                              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {ab.partner_name}
                              </div>
                            </div>
                            <span style={{ background: '#ede9fe', color: '#6b21a8', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10, flexShrink: 0 }}>
                              {totalCount} {totalCount > 1 ? t('payouts.aggregate_count_suffix', 'commissions') : t('payouts.aggregate_count_suffix_one', 'commission')}
                            </span>
                          </div>
                          <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed', letterSpacing: -0.5, marginBottom: hasVatGroup ? 2 : 8 }}>
                            {fmt(ab.total_amount_ttc)}{hasVatGroup ? ' TTC' : ''}
                          </div>
                          {hasVatGroup && (
                            <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
                              {fmt(ab.total_amount_ht)} HT · {fmt(ab.total_amount_tax)} TVA
                            </div>
                          )}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: 10 }}>
                            {sortedPreview.map(pc => {
                              const pcHasVat = parseFloat(pc.amount_tax || 0) > 0;
                              const pcHt = pcHasVat ? pc.amount_ht : pc.amount;
                              return (
                                <div key={pc.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, color: '#475569', fontSize: 11 }}>
                                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    · {pc.prospect_company || pc.prospect_name || '—'}
                                  </span>
                                  <span style={{ color: '#94a3b8', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                                    {fmt(pcHt)}
                                  </span>
                                </div>
                              );
                            })}
                            {remaining > 0 && (
                              <div style={{ color: '#94a3b8', fontSize: 11, fontStyle: 'italic' }}>
                                +{remaining} {t('payouts.aggregate_more', 'autres')}
                              </div>
                            )}
                          </div>
                          {batchStatusPill && (
                            <div style={{ marginBottom: 10 }}>
                              <span style={{ background: batchStatusPill.bg, color: batchStatusPill.color, fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 8 }}>
                                {batchStatusPill.label}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => openBatchDetail(ab.id)}
                            style={{
                              width: '100%', padding: '7px', borderRadius: 8,
                              background: '#7c3aed', border: 'none', color: '#fff',
                              fontWeight: 700, fontSize: 12, cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              fontFamily: 'inherit',
                            }}
                          >
                            {t('payouts.see_details', 'Voir le détail')} →
                          </button>
                        </div>
                      );
                    }
                    const c = item.c;
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
                      {/* Header: bulk-pay checkbox + partner / company
                          + trash icon. Company moved to a sub-line so
                          long names don't truncate the partner row. */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0, marginBottom: 8 }}>
                        {status === 'pending_validation' && qontoStatus?.connected && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => togglePick(c.id)}
                            style={{ cursor: 'pointer', flexShrink: 0, marginTop: 2 }}
                          />
                        )}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.partner_name}</div>
                          {(c.prospect_company || c.prospect_name) && (
                            <div style={{ color: '#94a3b8', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {c.prospect_company || c.prospect_name}
                            </div>
                          )}
                        </div>
                        {/* Delete button — hidden on paid + on rows
                            with an in-flight Qonto transfer. The
                            backend will 409 those cases anyway, but
                            the UI shouldn't tempt the click. */}
                        {status !== 'paid' && !(c.qonto_transfer_id && !c.payment_completed_at) && (
                          <button
                            onClick={() => handleDeleteCommission(c)}
                            disabled={busyId === c.id}
                            title={t('commission.delete_tooltip', 'Supprimer la commission')}
                            aria-label={t('commission.delete_tooltip', 'Supprimer la commission')}
                            style={{
                              flexShrink: 0,
                              padding: 5, borderRadius: 6, background: 'transparent',
                              border: '1px solid transparent', color: '#cbd5e1',
                              cursor: busyId === c.id ? 'wait' : 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              transition: 'background .15s, color .15s, border-color .15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.background = '#fef2f2'; e.currentTarget.style.color = '#dc2626'; e.currentTarget.style.borderColor = '#fecaca'; }}
                            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#cbd5e1'; e.currentTarget.style.borderColor = 'transparent'; }}
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>

                      {/* Amounts row (HT left, rate · MRR right) —
                          divided from the header by a thin top border
                          so the eye lands on the number first.
                          E5: for recurring rows the headline turns into
                          "<TTC> / <duration> · <N> versé(s)" — the TTC
                          is the FULL upfront amount of one cycle (never
                          divided), the duration is the cycle length in
                          months / years (raccourci /N ans si multiple
                          exact de 12). is_recurring=false → strictly
                          legacy "X € HT" display, untouched. */}
                      {(() => {
                        const hasVat = parseFloat(c.amount_tax || 0) > 0;
                        const headlineAmount = hasVat ? c.amount_ht : c.amount;
                        if (c.is_recurring) {
                          const PERIOD_MONTHS = { forfait: 1, mensuel: 1, trimestriel: 3, annuel: 12 };
                          const months = (parseInt(c.engagement_periods, 10) || 1)
                                       * (PERIOD_MONTHS[c.engagement_type] || 1);
                          const durationLabel = months % 12 === 0
                            ? `${months / 12} ${months / 12 > 1 ? t('commissions.years', 'ans') : t('commissions.year', 'an')}`
                            : `${months} ${t('commissions.months', 'mois')}`;
                          const paidCount = commissions.filter(o =>
                            o.referral_id === c.referral_id && o.status === 'paid'
                          ).length;
                          const cycleTtc = c.amount_ttc != null ? c.amount_ttc : c.amount;
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid #f1f5f9', marginBottom: hasVat ? 6 : 8, flexWrap: 'wrap', rowGap: 4 }}>
                              <div>
                                <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--rb-primary, #059669)' }}>{fmt(cycleTtc)}</span>
                                <span style={{ fontSize: 11, color: '#64748b', marginLeft: 6 }}>
                                  / {durationLabel} ·{' '}
                                  {t('commissions.card_paid_count', { count: paidCount, defaultValue: '{{count}} versé(s)' })}
                                </span>
                              </div>
                              <span style={{ color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>
                                {c.rate}% · {fmt(c.deal_value)}
                              </span>
                            </div>
                          );
                        }
                        return (
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '6px 0', borderTop: '1px solid #f1f5f9', marginBottom: hasVat ? 6 : 8 }}>
                            <div>
                              <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--rb-primary, #059669)' }}>{fmt(headlineAmount)}</span>
                              {hasVat && <span style={{ fontSize: 11, color: 'var(--rb-primary, #059669)', marginLeft: 4, fontWeight: 600 }}>HT</span>}
                            </div>
                            <span style={{ color: '#94a3b8', fontSize: 11, textAlign: 'right' }}>
                              {c.rate}% · {fmt(c.deal_value)}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Compact gray TVA banner. Drops out entirely
                          for non-subject rows so the card stays
                          minimal for tenants without assujettis. */}
                      {parseFloat(c.amount_tax || 0) > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', padding: '5px 8px', background: '#f8fafc', borderRadius: 6, marginBottom: 8, lineHeight: 1.3 }}>
                          <span>TVA {c.tax_rate_applied}% : {fmt(c.amount_tax)}</span>
                          <span style={{ fontWeight: 600, color: '#334155' }}>TTC : {fmt(c.amount_ttc)}</span>
                        </div>
                      )}

                      {/* Pills row: engagement + date. Engagement
                          omitted on `forfait` (default, no extra info
                          to convey). Date is the creation date — the
                          `paid_at` for paid rows is also surfaced via
                          the column itself + the ref banner below. */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                        {c.engagement_type && c.engagement_type !== 'forfait' && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontWeight: 600 }}>
                            {(c.engagement_type === 'mensuel' || c.engagement_type === 'monthly') &&
                              `${c.engagement_periods || 1} ${t('pipeline.months', 'mois')}`}
                            {(c.engagement_type === 'trimestriel' || c.engagement_type === 'quarterly') &&
                              `${c.engagement_periods || 1} ${t('pipeline.quarters', 'trim.')}`}
                            {(c.engagement_type === 'annuel' || c.engagement_type === 'yearly') &&
                              `${c.engagement_periods || 1} ${t('pipeline.years', 'an(s)')}`}
                          </span>
                        )}
                        {/* Recurring-billing longevity pill (E2-bis
                            SNAPSHOT-AT-WON model). Read DIRECTLY from
                            c.is_perpetual / c.engagement_until which
                            were frozen on the commission row at the
                            won transition. A later tier change on the
                            partner does NOT affect this pill — the
                            snapshot is the source of truth. The
                            previous-cut dynamic resolver is gone. */}
                        {c.is_recurring && (() => {
                          if (c.is_perpetual) {
                            return (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700 }}>
                                {t('commissions.duration_perpetual_badge', 'À vie')}
                              </span>
                            );
                          }
                          if (!c.engagement_until) {
                            return (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700 }}>
                                {t('commissions.duration_bounded_badge', 'Durée limitée')}
                              </span>
                            );
                          }
                          // "Terminé" when the snapshot end-date is
                          // strictly before today's calendar day.
                          // Same boundary semantics as the BE worker
                          // (end == today → still active).
                          const todayMs = new Date(new Date().toISOString().slice(0, 10)).getTime();
                          const endMs   = new Date(c.engagement_until).getTime();
                          if (endMs < todayMs) {
                            return (
                              <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#f1f5f9', color: '#64748b', fontWeight: 700 }}>
                                {t('commissions.duration_terminated_badge', 'Terminé')}
                              </span>
                            );
                          }
                          return (
                            <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 6, background: '#eef2ff', color: '#6366f1', fontWeight: 700 }}>
                              {t('commissions.duration_until_badge', { date: fmtDate(c.engagement_until), defaultValue: "Jusqu'au {{date}}" })}
                            </span>
                          );
                        })()}
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>{fmtDate(c.created_at)}</span>
                      </div>

                      {/* Compact monospace ref line for paid commissions.
                          Replaces the previous larger ref block + the
                          "Vérifier sur Qonto" link (redundant — admin
                          can paste the ref into Qonto search). */}
                      {status === 'paid' && c.payment_reference && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontFamily: 'monospace', color: '#94a3b8', padding: '4px 8px', background: '#f8fafc', borderRadius: 6, marginBottom: 8, wordBreak: 'break-all' }}>
                          <FileText size={10} />
                          <span style={{ flex: 1 }}>{c.payment_reference}</span>
                          {c.has_invoice && (
                            <button
                              onClick={() => handleDownloadInvoice(c.id)}
                              title={t('qonto.payment_proof', 'Preuve de virement')}
                              style={{ padding: 2, borderRadius: 4, background: 'transparent', border: 'none', color: '#16a34a', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                            >
                              <Download size={11} />
                            </button>
                          )}
                        </div>
                      )}

                      {/* Pennylane invoice pointer — shows on every
                          card that has a Pennylane invoice (created
                          on approve, marked paid on Qonto settle).
                          Purple to visually distinguish from the
                          green Qonto/RefBoost chrome. */}
                      {c.pennylane_invoice_id && (
                        <div style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, color: '#7c3aed',
                          padding: '2px 6px', marginBottom: 6,
                        }}>
                          <BookOpen size={10} />
                          Pennylane #{c.pennylane_invoice_id}
                        </div>
                      )}

                      {/* Qonto in-flight status block: only renders
                          once a payment has been initiated. Tells
                          the admin where the transfer stands and
                          links straight to app.qonto.com. */}
                      {(c.payment_initiated_at || c.qonto_transfer_id) && status !== 'paid' && (
                        <div style={{
                          padding: '8px 10px', borderRadius: 8,
                          background: scaPending ? '#fffbeb' : '#eff6ff',
                          border: `1px solid ${scaPending ? '#fde68a' : '#bfdbfe'}`,
                          color: scaPending ? '#92400e' : '#1e40af',
                          fontSize: 11, marginBottom: 8, lineHeight: 1.45,
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                            <Clock size={12} className={scaPending ? 'rb-pulse' : ''} />
                            <strong>
                              {scaPending
                                ? t('qonto.status_label_sca', 'Statut Qonto : En attente de validation SCA')
                                : t('qonto.status_label_processing', 'Statut Qonto : En cours de traitement')}
                            </strong>
                          </div>
                          {c.payment_initiated_at && (
                            <div>
                              {t('qonto.initiated_on', 'Virement initié le')} {fmtDateTime(c.payment_initiated_at)}
                            </div>
                          )}
                        </div>
                      )}
                      {!scaPending && errBanner && (
                        <div style={{
                          padding: '8px 10px', borderRadius: 8,
                          background: errBanner.tone === 'info' ? '#fffbeb' : '#fef2f2',
                          border: `1px solid ${errBanner.tone === 'info' ? '#fde68a' : '#fecaca'}`,
                          color: errBanner.tone === 'info' ? '#92400e' : '#b91c1c',
                          fontSize: 11, marginBottom: 8, lineHeight: 1.45,
                        }}>
                          <div style={{ marginBottom: errBanner.action === 'retry' ? 6 : 0 }}>
                            {errBanner.message}
                          </div>
                          {errBanner.action === 'retry' && (
                            <button
                              onClick={() => handleResetPayment(c.id)}
                              disabled={resettingId === c.id}
                              style={{
                                width: '100%', padding: '6px', borderRadius: 6,
                                background: '#fff', border: '1px solid #fecaca',
                                color: '#b91c1c', fontWeight: 700, fontSize: 11,
                                cursor: resettingId === c.id ? 'wait' : 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                opacity: resettingId === c.id ? 0.7 : 1,
                              }}
                            >
                              <RefreshCw size={11} className={resettingId === c.id ? 'rb-spin' : ''} />
                              {resettingId === c.id
                                ? t('qonto.resetting_payment', 'Réinitialisation…')
                                : t('qonto.retry_payment', 'Réessayer le paiement')}
                            </button>
                          )}
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
                            <button onClick={() => handlePreviewInvoice(c)}
                              style={{ width: '100%', padding: '7px', borderRadius: 8, background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Eye size={12} /> {t('commission.view_invoice', 'Voir la facture')}
                            </button>
                          )}
                          {scaPending ? (
                            <button onClick={() => handleConfirmSca(c.id)} disabled={confirmingScaId === c.id}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, background: '#fff', border: '1px solid #fde68a', color: '#92400e', fontWeight: 700, fontSize: 12, cursor: confirmingScaId === c.id ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: confirmingScaId === c.id ? 0.7 : 1 }}>
                              <CheckCircle size={12} className={confirmingScaId === c.id ? 'rb-spin' : ''} /> {confirmingScaId === c.id ? t('qonto.refreshing_status', 'Vérification…') : t('qonto.already_approved', 'J\'ai déjà approuvé')}
                            </button>
                          ) : isInitiated ? (
                            <div style={{ padding: '7px 10px', borderRadius: 8, background: '#eef2ff', color: '#4338ca', fontSize: 11, textAlign: 'center', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <Send size={12} /> {t('qonto.transfer_in_progress', 'Virement en cours')}
                            </div>
                          ) : c.payout_batch_id ? (
                            // F2b — anti-double-paiement : la commission
                            // est rattachée à un batch ; le bouton Payer
                            // individuel est masqué. Un badge discret
                            // signale l'état pour que l'admin sache que
                            // l'action passe par la modale "Lancer la
                            // paie groupée".
                            <div style={{
                              padding: '7px 10px', borderRadius: 8,
                              background: '#eef2ff', color: '#4338ca',
                              fontSize: 11, textAlign: 'center', fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            }}>
                              {t('payouts.in_batch_badge', 'Dans batch')}
                            </div>
                          ) : qontoStatus?.connected ? (
                            <button onClick={() => handlePayViaQonto(c)} disabled={busyId === c.id || !!paymentState}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: busyId === c.id ? 0.7 : 1 }}>
                              <Send size={12} /> {t('qonto.pay', 'Payer')}
                            </button>
                          ) : (
                            <button onClick={() => handlePayClick(c)} disabled={!!paymentState}
                              style={{ width: '100%', padding: '8px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, opacity: paymentState ? 0.7 : 1 }}>
                              <CreditCard size={12} /> {t('commission.validate_payment')}
                            </button>
                          )}
                        </div>
                      )}
                      {/* Paid status: nothing rendered here. The
                          compact ref line above (with the inline
                          download icon) replaces the previous large
                          "Réf. virement" block + "Preuve de virement"
                          button + "Payée le" text + "Vérifier sur
                          Qonto" link. The column itself conveys the
                          paid status; pasting the ref into Qonto
                          search is one keystroke away. */}
                    </div>
                    );
                  })}
                  {cards.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#cbd5e1', fontSize: 13 }}>{t('commissions.no_commission')}</div>}
                  {hasMore && (
                    <button onClick={() => setComLimits(prev => ({ ...prev, [status]: limit + 25 }))} style={{
                      padding: '10px', borderRadius: 10, border: '1px dashed #cbd5e1', background: 'transparent',
                      color: 'var(--rb-primary, #059669)', fontWeight: 600, fontSize: 12, cursor: 'pointer', textAlign: 'center',
                    }}>{t('commissions.see_more', { count: displayItems.length - limit })}</button>
                  )}
                </div>
              </div>
            );
          })}

          {/* F3b — 5e colonne "En retard". Affichée uniquement si au
              moins 1 batch est is_late=true (sinon le Kanban reste à
              4 colonnes). Rendu exclusivement en cartes agrégées —
              jamais de commission individuelle ici. */}
          {batchCadenceActive && lateBatches.length > 0 && (
            <div style={{ flex: 1, background: '#fef2f2', borderRadius: 16, padding: 12, display: 'flex', flexDirection: 'column', border: '1px solid #fecaca' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={14} color="#dc2626" />
                  <span style={{ fontWeight: 700, fontSize: 13, color: '#991b1b' }}>{t('payouts.column_late', 'En retard')}</span>
                </div>
                <span style={{ background: '#fee2e2', color: '#991b1b', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{lateBatches.length}</span>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                {lateBatches.map(lb => {
                  const hasVatLb = parseFloat(lb.total_amount_tax || 0) > 0;
                  return (
                    <div
                      key={'late-' + lb.id}
                      style={{
                        background: '#fff', borderRadius: 12, padding: 14,
                        border: '1px solid #fecaca',
                        boxShadow: '0 1px 3px rgba(220,38,38,0.08)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                        <div style={{ minWidth: 0, flex: 1 }}>
                          <div style={{ fontWeight: 600, color: '#991b1b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                            {lb.period}
                          </div>
                          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {lb.partner_name}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: '#dc2626', letterSpacing: -0.5, marginBottom: hasVatLb ? 2 : 8 }}>
                        {fmt(lb.total_amount_ttc)}{hasVatLb ? ' TTC' : ''}
                      </div>
                      {hasVatLb && (
                        <div style={{ color: '#64748b', fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>
                          {fmt(lb.total_amount_ht)} HT · {fmt(lb.total_amount_tax)} TVA
                        </div>
                      )}
                      <button
                        onClick={() => openBatchDetail(lb.id)}
                        style={{
                          width: '100%', padding: '7px', borderRadius: 8,
                          background: '#fee2e2', border: '1px solid #fecaca', color: '#991b1b',
                          fontWeight: 700, fontSize: 12, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                          fontFamily: 'inherit', marginBottom: 6,
                        }}
                      >
                        {lb.commission_count} {t('payouts.aggregate_count_suffix', 'commissions')}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
                {[
                  t('commissions.tbl_prospect'),
                  t('commissions.tbl_partner'),
                  t('commissions.tbl_rate'),
                  t('commissions.tbl_deal'),
                  t('commissions.tbl_ht'),
                  t('commissions.tbl_tva'),
                  t('commissions.tbl_ttc'),
                  t('commissions.tbl_status'),
                  t('commissions.tbl_approved_at'),
                  t('commissions.tbl_due'),
                  t('commissions.tbl_action'),
                ].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{filtered.map(c => {
                const cs = COM_STATUS[c.status] || COM_STATUS.pending_approval;
                // Legacy rows have NULL amount_ht / amount_ttc until
                // they hit /pay-qonto. Fall back to amount so the
                // table stays usable for unpaid commissions too.
                const ht  = c.amount_ht  != null ? c.amount_ht  : c.amount;
                const ttc = c.amount_ttc != null ? c.amount_ttc : c.amount;
                const tax = parseFloat(c.amount_tax || 0);
                return (
                  <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                    <td style={{ padding: '13px 16px' }}><div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name}</div><div style={{ color: '#94a3b8', fontSize: 12 }}>{c.prospect_company}</div></td>
                    <td style={{ padding: '13px 16px', color: '#475569' }}>{c.partner_name}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 12 }}>{c.rate}%</span></td>
                    <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(c.deal_value)}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 600, color: '#0f172a' }}>{fmt(ht)}</td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontSize: 12, color: '#94a3b8' }}>
                      {tax > 0 ? `${c.tax_rate_applied}% · ${fmt(tax)}` : '—'}
                    </td>
                    <td style={{ padding: '13px 16px', textAlign: 'right', fontWeight: 800, color: '#f59e0b', fontSize: 16 }}>{fmt(ttc)}</td>
                    <td style={{ padding: '13px 16px' }}><span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: cs.bg, color: cs.color }}>{cs.label}</span></td>
                    <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 12 }}>{c.approved_at ? fmtDate(c.approved_at) : '—'}</td>
                    <td style={{ padding: '13px 16px', fontSize: 12 }}>
                      {c.payment_due_date ? (<span style={{ display: 'flex', alignItems: 'center', gap: 4, color: c.is_late ? '#dc2626' : '#64748b', fontWeight: c.is_late ? 700 : 400 }}>{c.is_late && <AlertTriangle size={14} />}{fmtDate(c.payment_due_date)}</span>) : '—'}
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      {c.status === 'pending_approval' && <button onClick={() => handleApprove(c.id)} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>{t('commission.approve')}</button>}
                      {c.status === 'awaiting_invoice' && <span style={{ color: '#94a3b8', fontSize: 12 }}>{t('commission.waiting_for_partner_invoice')}</span>}
                      {c.status === 'pending_validation' && !c.payout_batch_id && <button onClick={() => handlePayClick(c)} disabled={!!paymentState} style={{ padding: '6px 12px', borderRadius: 8, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 600, fontSize: 12, cursor: 'pointer', opacity: paymentState ? 0.7 : 1 }}>{t('commission.validate_payment')}</button>}
                      {c.status === 'pending_validation' && c.payout_batch_id && <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#eef2ff', color: '#4338ca' }}>{t('payouts.in_batch_badge', 'Dans batch')}</span>}
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

      {toast && (() => {
        const palette = toast.type === 'error'
          ? { bg: '#fef2f2', color: '#b91c1c', border: '#fecaca' }
          : toast.type === 'info'
            ? { bg: '#f0f9ff', color: '#075985', border: '#bae6fd' }
            : toast.type === 'warning'
              ? { bg: '#fffbeb', color: '#92400e', border: '#fde68a' }
              : { bg: '#f0fdf4', color: '#166534', border: '#bbf7d0' };
        return (
          <div role="status" style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 2000,
            padding: '14px 18px', borderRadius: 12,
            background: palette.bg, color: palette.color,
            border: `1px solid ${palette.border}`,
            fontSize: 13, fontWeight: 600,
            boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
            maxWidth: 420,
          }}>
            {toast.text}
          </div>
        );
      })()}

      {invoicePreview && (
        <div
          onClick={closeInvoicePreview}
          style={{
            position: 'fixed', inset: 0, zIndex: 3000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 16, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            style={{
              background: '#fff', borderRadius: 16,
              width: '100%', maxWidth: 800, maxHeight: '80vh',
              display: 'flex', flexDirection: 'column',
              boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
              overflow: 'hidden',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: '1px solid #e2e8f0',
            }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>
                {t('commission.invoice_modal_title', { name: invoicePreview.partnerName || '', defaultValue: 'Facture — {{name}}' })}
              </div>
              <button
                onClick={closeInvoicePreview}
                aria-label={t('common.close', 'Fermer')}
                style={{
                  padding: 6, borderRadius: 8, background: 'transparent',
                  border: '1px solid transparent', color: '#64748b',
                  cursor: 'pointer', display: 'flex',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <X size={18} />
              </button>
            </div>
            <div style={{ flex: 1, minHeight: 320, background: '#f8fafc' }}>
              {invoicePreview.loading ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontSize: 13 }}>
                  {t('common.loading', 'Chargement…')}
                </div>
              ) : invoicePreview.url ? (
                <iframe
                  src={invoicePreview.url}
                  title={invoicePreview.filename || 'invoice'}
                  style={{ width: '100%', height: '100%', minHeight: 'calc(80vh - 130px)', border: 'none', background: '#fff' }}
                />
              ) : (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: '#64748b', fontSize: 13, padding: 24, textAlign: 'center' }}>
                  {t('commission.invoice_preview_failed', 'Impossible de prévisualiser la facture. Téléchargez-la pour la consulter.')}
                </div>
              )}
            </div>
            <div style={{
              display: 'flex', gap: 10, justifyContent: 'flex-end',
              padding: '14px 20px', borderTop: '1px solid #e2e8f0', background: '#fff',
            }}>
              <button
                onClick={closeInvoicePreview}
                style={{
                  padding: '10px 18px', borderRadius: 10,
                  border: '1.5px solid #e2e8f0', background: '#fff',
                  color: '#0f172a', fontSize: 14, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {t('common.close', 'Fermer')}
              </button>
              <button
                onClick={() => handleDownloadInvoice(invoicePreview.commissionId)}
                style={{
                  padding: '10px 18px', borderRadius: 10,
                  border: 'none', background: 'var(--rb-primary, #059669)',
                  color: '#fff', fontSize: 14, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                  boxShadow: '0 6px 18px rgba(5,150,105,0.25)',
                }}
              >
                <Download size={14} /> {t('common.download', 'Télécharger')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* F3b — Modale détail batch (au click sur "Voir le détail"
          d'une carte agrégée ou sur une carte de la colonne "En retard").
          Liste les commissions du batch avec lien "Voir le deal →"
          et permet l'annulation. */}
      {batchDetail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => !batchCanceling && setBatchDetail(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 640, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            {batchDetail.loading && (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                {t('common.loading', 'Chargement…')}
              </div>
            )}
            {!batchDetail.loading && batchDetail.batch && (() => {
              const bd = batchDetail.batch;
              const list = batchDetail.commissions || [];
              const hasVatBd = parseFloat(bd.total_amount_tax || 0) > 0;
              const statusBadge = {
                awaiting_invoice:   { label: t('payouts.status_awaiting_invoice', 'En attente de facture'), bg: '#fffbeb', color: '#92400e' },
                ready_to_pay:      { label: t('payouts.status_ready_to_pay', 'Prêt à payer'),               bg: '#eff6ff', color: '#1d4ed8' },
                paid:              { label: t('payouts.status_paid', 'Payé'),                                bg: '#f0fdf4', color: '#166534' },
                cancelled:         { label: t('payouts.status_cancelled', 'Annulé'),                         bg: '#f1f5f9', color: '#475569' },
              }[bd.status] || { label: bd.status, bg: '#f1f5f9', color: '#475569' };
              return (
                <>
                  <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {t('payouts.detail_title', { partner: bd.partner_name, period: bd.period, defaultValue: 'Batch {{partner}} — {{period}}' })}
                          </h2>
                          <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: statusBadge.bg, color: statusBadge.color }}>
                            {statusBadge.label}
                          </span>
                          {bd.is_late && (
                            <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: '#fee2e2', color: '#991b1b', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <AlertTriangle size={11} /> {t('payouts.is_late_badge', 'En retard')}
                            </span>
                          )}
                        </div>
                        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                          {list.length} {t('payouts.aggregate_count_suffix', 'commissions')}
                          {' · '}{fmt(bd.total_amount_ttc)} TTC
                          {hasVatBd && <span style={{ color: '#94a3b8' }}> ({fmt(bd.total_amount_ht)} HT + {fmt(bd.total_amount_tax)} TVA)</span>}
                        </p>
                      </div>
                      <button onClick={() => !batchCanceling && setBatchDetail(null)} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: batchCanceling ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <X size={16} color="#475569" />
                      </button>
                    </div>
                  </div>

                  <div style={{ flex: 1, overflowY: 'auto', padding: '16px 28px' }}>
                    {list.length === 0 ? (
                      <div style={{ textAlign: 'center', color: '#94a3b8', padding: 24, fontSize: 13 }}>
                        {t('payouts.detail_empty', 'Aucune commission dans ce batch.')}
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {list.map(dc => {
                          const dcHasVat = parseFloat(dc.amount_tax || 0) > 0;
                          return (
                            <div key={dc.id} style={{ padding: 12, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                                <div style={{ minWidth: 0, flex: 1 }}>
                                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {dc.prospect_company || dc.prospect_name || '—'}
                                  </div>
                                  {dc.prospect_company && dc.prospect_name && dc.prospect_company !== dc.prospect_name && (
                                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 1 }}>{dc.prospect_name}</div>
                                  )}
                                  <div style={{ color: '#64748b', fontSize: 11, marginTop: 4 }}>
                                    {dc.rate}% · {fmt(dc.deal_value)}
                                  </div>
                                </div>
                                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                  <div style={{ fontWeight: 700, fontSize: 14, color: '#0f172a' }}>
                                    {fmt(dcHasVat ? dc.amount_ttc : dc.amount)}{dcHasVat ? ' TTC' : ''}
                                  </div>
                                  {dc.referral_id && (
                                    <a
                                      href={'/referrals?open=' + dc.referral_id}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      style={{ color: 'var(--rb-primary, #059669)', fontSize: 11, fontWeight: 600, textDecoration: 'none', marginTop: 4, display: 'inline-block' }}
                                    >
                                      {t('payouts.see_deal_link', 'Voir le deal →')}
                                    </a>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* J5-C2 — section facture batch + statut paiement.
                      Visible dès qu'une facture est déposée (has_invoice
                      ou invoice_uploaded_at). Le PDF base64 n'est pas
                      dans ce payload : on le récupère à la demande via
                      handleViewBatchInvoice. */}
                  {(bd.has_invoice || bd.invoice_uploaded_at) && (
                    <div style={{ padding: '14px 28px', borderTop: '1px solid #f1f5f9', background: '#fafbfc' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#64748b', marginBottom: 8 }}>
                        {t('payouts.invoice_section_title', 'Facture déposée')}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 12, background: '#fff', borderRadius: 10, border: '1px solid #e2e8f0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <FileText size={20} color="#dc2626" style={{ flexShrink: 0 }} />
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {bd.invoice_filename || t('payouts.invoice_default_name', 'Facture batch')}
                            </div>
                            {bd.invoice_uploaded_at && (
                              <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 1 }}>
                                {t('payouts.invoice_uploaded_on', { date: fmtDateTime(bd.invoice_uploaded_at), defaultValue: 'Déposée le {{date}}' })}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleViewBatchInvoice}
                          disabled={batchInvoiceLoading}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, background: '#eef2ff', border: 'none', color: '#4338ca', fontWeight: 600, fontSize: 12, cursor: batchInvoiceLoading ? 'wait' : 'pointer', fontFamily: 'inherit', flexShrink: 0 }}
                        >
                          <Download size={14} />
                          {batchInvoiceLoading ? t('common.loading', 'Chargement…') : t('payouts.invoice_view', 'Voir')}
                        </button>
                      </div>
                      {bd.status === 'paid' && (
                        <div style={{ marginTop: 8, fontSize: 12, color: '#166534', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                          <CheckCircle size={14} />
                          {t('payouts.paid_on', { date: bd.paid_at ? fmtDate(bd.paid_at) : '', defaultValue: 'Payé le {{date}}' })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* J5-C3 — bandeau SCA en attente. Affiché quand un
                      pay-qonto a renvoyé requires_sca ou si le batch
                      a sca_pending=true en DB. Charles valide sur son
                      tél → bouton "J'ai déjà approuvé" en footer. */}
                  {batchScaPending && bd.status === 'ready_to_pay' && (
                    <div style={{ margin: '0 28px 16px', padding: 14, borderRadius: 10, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <ShieldCheck size={20} color="#b45309" style={{ flexShrink: 0, marginTop: 1 }} />
                      <div style={{ minWidth: 0, fontSize: 13, color: '#78350f', lineHeight: 1.5 }}>
                        <div style={{ fontWeight: 700, marginBottom: 4 }}>
                          {t('payouts.sca_banner_title', 'Validation SCA requise')}
                        </div>
                        <div>
                          {t('payouts.sca_banner_body', { amount: fmt(bd.total_amount_ttc), partner: bd.partner_name, defaultValue: 'Approuvez le virement de {{amount}} à {{partner}} dans votre app Qonto, puis cliquez "J\'ai déjà approuvé" ci-dessous pour finaliser.' })}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    {bd.status !== 'paid' && bd.status !== 'cancelled' ? (
                      <button
                        onClick={handleCancelBatch}
                        disabled={batchCanceling || batchPaying}
                        style={{
                          padding: '9px 16px', borderRadius: 10,
                          background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b',
                          fontWeight: 700, fontSize: 13,
                          cursor: (batchCanceling || batchPaying) ? 'wait' : 'pointer', fontFamily: 'inherit',
                        }}
                      >
                        {batchCanceling ? t('common.saving', 'Enregistrement…') : t('payouts.cancel_batch_button', 'Annuler le batch')}
                      </button>
                    ) : <div />}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        onClick={() => !(batchCanceling || batchPaying) && setBatchDetail(null)}
                        disabled={batchCanceling || batchPaying}
                        style={{ padding: '9px 16px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: (batchCanceling || batchPaying) ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                      >
                        {t('common.close', 'Fermer')}
                      </button>
                      {/* J5-C2 / J5-C3 — bouton paiement conditionnel.
                          Quand batchScaPending=true (SCA challenge en
                          attente côté Qonto), affiche "J'ai déjà
                          approuvé" qui appelle confirm-sca. Sinon
                          bouton standard "Valider et payer le batch". */}
                      {bd.status === 'ready_to_pay' && !batchScaPending && (
                        <button
                          onClick={handlePayBatch}
                          disabled={batchPaying || batchCanceling}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: (batchPaying || batchCanceling) ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                        >
                          <Banknote size={15} />
                          {batchPaying ? t('payouts.pay_in_progress', 'Paiement…') : t('payouts.pay_button', 'Valider et payer le batch')}
                        </button>
                      )}
                      {bd.status === 'ready_to_pay' && batchScaPending && (
                        <button
                          onClick={handleConfirmSCA}
                          disabled={batchPaying || batchCanceling}
                          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 10, background: '#f59e0b', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: (batchPaying || batchCanceling) ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                        >
                          <ShieldCheck size={15} />
                          {batchPaying ? t('payouts.sca_confirming', 'Confirmation…') : t('payouts.sca_confirm_button', 'J\'ai déjà approuvé')}
                        </button>
                      )}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
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
    // Wired amount is TTC. Fallback to `amount` for pre-v31 rows where
    // the VAT snapshot hasn't been backfilled (legacy: amount == HT == TTC,
    // no VAT applied).
    const rowTtc = (c) => parseFloat(c.amount_ttc != null ? c.amount_ttc : c.amount) || 0;
    const total = list.reduce((s, c) => s + rowTtc(c), 0);
    const isBulk = modal.mode === 'bulk';
    const totalLabel = fmt(total);
    return (
      <Wrap width={560}>
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
            display: 'grid', gridTemplateColumns: '1.3fr 1.1fr 1.2fr',
            background: '#f8fafc', padding: '10px 14px',
            fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5,
          }}>
            <div>{t('commissions.tbl_partner', 'Partenaire')}</div>
            <div>{t('commissions.tbl_deal', 'Deal')}</div>
            <div style={{ textAlign: 'right' }}>{t('qonto.confirm_amount_label', 'Montant viré (TTC)')}</div>
          </div>
          <div style={{ maxHeight: 280, overflowY: 'auto' }}>
            {list.map((c, i) => {
              const taxRate = parseFloat(c.tax_rate_applied || 0);
              const hasVat = c.amount_ttc != null && taxRate > 0;
              const ttc = rowTtc(c);
              const ht  = parseFloat(c.amount_ht  != null ? c.amount_ht  : c.amount) || 0;
              const tax = parseFloat(c.amount_tax || 0);
              return (
                <div key={c.id} style={{
                  display: 'grid', gridTemplateColumns: '1.3fr 1.1fr 1.2fr',
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
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{fmt(ttc)}</div>
                    {hasVat && (
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 2, lineHeight: 1.4 }}>
                        {t('qonto.confirm_row_ht', 'HT')} {fmt(ht)} · {t('qonto.confirm_row_tva', 'TVA')} {taxRate}% {fmt(tax)}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
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
              {t('qonto.confirm_total_label_ttc', 'Montant total (TTC)')}
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

// E4: arbitrage queue. Lists commissions that were cancelled
// because their parent deal moved to lost, and that the admin
// hasn't yet decided on. Two actions per row: "pay last cycle"
// (re-enters the existing pay-qonto flow) or "confirm cessation"
// (marks the cancellation final). Hidden entirely when the queue
// is empty — non-opted tenants and tidy pipelines see nothing.
function ArbitrageQueue({ commissions, t, api, onChanged }) {
  const [busyId, setBusyId] = useState(null);
  const queue = (commissions || []).filter(c => c.status === 'cancelled' && !c.cancelled_resolved);
  if (queue.length === 0) return null;

  const resume = async (c) => {
    setBusyId(c.id);
    try { await api.resumeCommissionLastCycle(c.id); await onChanged(); }
    catch (e) { alert(e?.data?.message || e.message || 'Erreur'); }
    setBusyId(null);
  };
  const confirmStop = async (c) => {
    setBusyId(c.id);
    try { await api.confirmCommissionCancellation(c.id); await onChanged(); }
    catch (e) { alert(e?.data?.message || e.message || 'Erreur'); }
    setBusyId(null);
  };

  return (
    <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, border: '1px solid #fde68a', background: '#fffbeb' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <AlertTriangle size={16} color="#92400e" />
        <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
          {t('commissions.arbitrage_title', { count: queue.length, defaultValue: 'Décisions à arbitrer ({{count}})' })}
        </div>
      </div>
      <div style={{ fontSize: 12, color: '#92400e', marginBottom: 14 }}>
        {t('commissions.arbitrage_subtitle', 'Ces commissions récurrentes ont été annulées suite à la perte du deal. Choisissez de payer le dernier cycle dû ou de confirmer l\'arrêt définitif.')}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {queue.map(c => (
          <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, background: '#fff', borderRadius: 10, border: '1px solid #fde68a', flexWrap: 'wrap' }}>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.partner_name || '—'}
                <span style={{ color: '#64748b', fontWeight: 500, marginLeft: 6 }}>· {c.prospect_company || c.prospect_name || '—'}</span>
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
                {c.cancelled_reason
                  ? t('commissions.arbitrage_reason', { reason: c.cancelled_reason, defaultValue: 'Motif : {{reason}}' })
                  : t('commissions.arbitrage_no_reason', 'Aucun motif renseigné')}
                {c.cancelled_at && <> · {fmtDate(c.cancelled_at)}</>}
              </div>
            </div>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, fontFamily: 'tabular-nums', minWidth: 110, textAlign: 'right' }}>
              {fmt(c.amount_ttc != null ? c.amount_ttc : c.amount)} TTC
            </div>
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button
                onClick={() => resume(c)}
                disabled={busyId === c.id}
                style={{ padding: '8px 14px', borderRadius: 8, background: '#059669', color: '#fff', border: 'none', fontWeight: 600, fontSize: 12, cursor: busyId === c.id ? 'wait' : 'pointer', opacity: busyId === c.id ? 0.7 : 1 }}
              >
                {t('commissions.arbitrage_pay_last', 'Payer le dernier cycle')}
              </button>
              <button
                onClick={() => confirmStop(c)}
                disabled={busyId === c.id}
                style={{ padding: '8px 14px', borderRadius: 8, background: '#fff', color: '#475569', border: '1px solid #e2e8f0', fontWeight: 600, fontSize: 12, cursor: busyId === c.id ? 'wait' : 'pointer' }}
              >
                {t('commissions.arbitrage_confirm_stop', 'Confirmer l\'arrêt')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComKPI({ icon: Icon, label, value, sub, suffix, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1 }}>
            {value}
            {suffix && <span style={{ fontSize: 13, fontWeight: 700, marginLeft: 6, color: '#94a3b8' }}>{suffix}</span>}
          </div>
          {sub && <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500, marginTop: 4 }}>{sub}</div>}
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={color} /></div>
      </div>
    </div>
  );
}
