import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';
import { fmt, fmtDate } from '../lib/constants';
import { CreditCard, Clock, CheckCircle, DollarSign, XCircle, Upload, Download, FileText, ShieldCheck, AlertTriangle, Building, X } from 'lucide-react';

// 4-column lifecycle, ordered left → right.
const STATUS_KEYS = ['pending_approval', 'awaiting_invoice', 'pending_validation', 'paid'];
const PAY_STATUS_META = {
  pending_approval:   { color: '#f59e0b', bg: '#fffbeb', icon: Clock },
  awaiting_invoice:   { color: '#6366f1', bg: '#eef2ff', icon: FileText },
  pending_validation: { color: '#0284c7', bg: '#eff6ff', icon: ShieldCheck },
  paid:               { color: '#16a34a', bg: '#f0fdf4', icon: CreditCard },
};

export default function PartnerPaymentsPage() {
  const { t } = useTranslation();
  const [commissions, setCommissions] = useState([]);
  const [totals, setTotals] = useState({ pending: 0, paid: 0 });
  const [loading, setLoading] = useState(true);
  const [bankInfo, setBankInfo] = useState(null);
  const [billingInfo, setBillingInfo] = useState(null);
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  // F3c — pendingUploadRef typé : { kind: 'commission' | 'batch', id }.
  // L'input file caché est partagé pour les deux flux d'upload (commission
  // unitaire historique + batch nouveau) ; on branche dans handleFileSelected
  // sur kind pour appeler le bon endpoint.
  const pendingUploadRef = useRef(null);
  // F3c — surface batches côté partenaire. tenantCadence = lecture seule
  // (api.getMyTenant). batchesById = Map(batch_id → batch) chargée
  // uniquement en cadence != 'unitary' ET seulement pour les batches
  // référencés par au moins une commission du partenaire (économie).
  const [tenantCadence, setTenantCadence] = useState('unitary');
  const [batchesById, setBatchesById] = useState(new Map());
  const [batchDetail, setBatchDetail] = useState(null); // { loading, batch, commissions }
  const [batchUploadingId, setBatchUploadingId] = useState(null);

  const PAY_STATUS = {
    pending_approval:   { label: t('commission.status.pending_approval'), ...PAY_STATUS_META.pending_approval },
    awaiting_invoice:   { label: t('commission.status.awaiting_invoice'), ...PAY_STATUS_META.awaiting_invoice },
    pending_validation: { label: t('commission.status.pending_validation'), ...PAY_STATUS_META.pending_validation },
    paid:               { label: t('commission.status.paid'), ...PAY_STATUS_META.paid },
  };

  const reload = async () => {
    const [c, b, bi, mt] = await Promise.all([
      api.getCommissions(),
      api.getMyBankInfo().catch(() => ({ bank_info: null })),
      // Tenant billing info — used to render the "Informations de
      // facturation" card at the top so the partner has the legal
      // entity, SIRET, and address to put on their invoice. Failure
      // is silent; the card simply doesn't render.
      api.getBillingInfo().catch(() => ({ billing: null })),
      // F3c — tenant.payout_cadence pour décider si on fetch les
      // batches. Silent failure : on tombe sur 'unitary' par défaut
      // donc zéro régression côté partenaire en cas de souci API.
      api.getMyTenant().catch(() => null),
    ]);
    setCommissions(c.commissions);
    setTotals({ pending: c.totalPending, paid: c.totalPaid });
    setBankInfo(b && b.bank_info ? b.bank_info : null);
    setBillingInfo(bi && bi.billing && bi.billing.billing_company_name ? bi.billing : null);
    const tenant = mt && (mt.tenant || mt);
    const cadence = tenant?.payout_cadence || 'unitary';
    setTenantCadence(cadence);

    // F3c — fetch les détails des batches uniquement quand la cadence
    // est non-unitary ET que le partenaire a au moins 1 commission
    // batchée. N requêtes parallèles (N borné par le nombre de batches
    // actifs du partenaire, typiquement < 5). Pas de nouvel endpoint
    // backend : on consomme GET /api/payouts/batches/:id qui supporte
    // déjà partnerScope (F3a).
    if (cadence !== 'unitary') {
      const ids = [...new Set((c.commissions || []).filter(x => x.payout_batch_id).map(x => x.payout_batch_id))];
      if (ids.length > 0) {
        try {
          const details = await Promise.all(ids.map(id => api.getPayoutBatchDetail(id).catch(() => null)));
          const m = new Map();
          for (const d of details) if (d && d.batch) m.set(d.batch.id, d.batch);
          setBatchesById(m);
        } catch (e) {
          console.warn('[partner-payments] batches fetch failed:', e.message);
          setBatchesById(new Map());
        }
      } else {
        setBatchesById(new Map());
      }
    } else {
      setBatchesById(new Map());
    }
  };

  useEffect(() => {
    reload().catch(console.error).finally(() => setLoading(false));
  }, []);

  const triggerUpload = (commissionId) => {
    pendingUploadRef.current = { kind: 'commission', id: commissionId };
    fileInputRef.current && fileInputRef.current.click();
  };

  const triggerBatchUpload = (batchId) => {
    pendingUploadRef.current = { kind: 'batch', id: batchId };
    fileInputRef.current && fileInputRef.current.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    const pending = pendingUploadRef.current;
    pendingUploadRef.current = null;
    if (!file || !pending) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast.error(t('commission.invoice_too_large'));
      return;
    }
    if (pending.kind === 'commission') setUploadingId(pending.id);
    else setBatchUploadingId(pending.id);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      if (pending.kind === 'commission') {
        await api.uploadCommissionInvoice(pending.id, { filename: file.name, dataUrl });
      } else {
        // F3c — upload facture batch. Réutilise l'endpoint F2a
        // POST /api/payouts/batches/:id/upload-invoice qui accepte
        // déjà partnerScope. À la confirmation, le batch passe à
        // ready_to_pay ; les commissions du batch restent en
        // awaiting_invoice (propagation α bornée par CHECK v3 —
        // décision F2a documentée côté backend).
        await api.uploadPayoutBatchInvoice(pending.id, { filename: file.name, dataUrl });
        showToast.success(t('payouts.upload_toast', 'Facture déposée. Le batch est en attente de paiement.'));
        // Si la modale détail est ouverte sur ce batch, refresh sa payload
        // pour refléter le nouveau statut + invoice_uploaded_at.
        if (batchDetail?.batch?.id === pending.id) {
          try {
            const r = await api.getPayoutBatchDetail(pending.id);
            setBatchDetail({ loading: false, batch: r.batch, commissions: r.commissions || [] });
          } catch {}
        }
      }
      await reload();
    } catch (err) {
      showToast.error(err.message || "Error");
    }
    setUploadingId(null);
    setBatchUploadingId(null);
  };

  const openBatchDetail = async (batchId) => {
    setBatchDetail({ loading: true, batch: null, commissions: [] });
    try {
      const r = await api.getPayoutBatchDetail(batchId);
      setBatchDetail({ loading: false, batch: r.batch, commissions: r.commissions || [] });
    } catch (e) {
      setBatchDetail(null);
      showToast.error(e.message || t('common.error', 'Erreur'));
    }
  };

  const handleDownload = async (id) => {
    try { await api.downloadCommissionInvoice(id); }
    catch (err) { showToast.error(err.message || "Error"); }
  };

  const totalAll = commissions.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const rejectedRows = commissions.filter(c => c.approval_status === 'rejected');
  const visibleRows = commissions.filter(c => c.approval_status !== 'rejected');
  const bankIncomplete = !bankInfo || !bankInfo.iban;

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={handleFileSelected} />
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('partnerPayments.title')}</h1>
      <p style={{ color: '#64748b', marginBottom: 20 }}>{t('partnerPayments.subtitle')}</p>

      {/* Bank-info banner: only when the partner hasn't filled the new
          settings tab yet. Linking to /settings?tab=bank lands directly
          on the right tab. */}
      {bankIncomplete && (
        <Link
          to="/settings?tab=bank"
          style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 16px', borderRadius: 12, marginBottom: 20,
            background: '#fffbeb', border: '1px solid #fcd34d',
            color: '#92400e', textDecoration: 'none',
          }}
        >
          <AlertTriangle size={18} />
          <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>
            {t('partnerPayments.bank_incomplete_banner', 'Complétez vos informations bancaires dans les paramètres pour recevoir vos paiements.')}
          </span>
          <span style={{ fontWeight: 700, fontSize: 13 }}>
            {t('common.go_to_settings', 'Ouvrir les paramètres')} →
          </span>
        </Link>
      )}

      {/* Billing card. Renders only when the tenant admin has filled
          in Settings → Entreprise. Gives the partner the legal entity
          + SIRET + address they need to address their invoice to. */}
      {billingInfo && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 600, color: '#0f172a', marginBottom: 12 }}>
            <Building size={16} color="#94a3b8" />
            {t('partner_payments.billing_info_title', 'Informations de facturation')}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, fontSize: 13 }}>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                {t('settings.billing_company_name', 'Nom de la structure')}
              </div>
              <div style={{ fontWeight: 600, color: '#0f172a' }}>{billingInfo.billing_company_name}</div>
            </div>
            <div>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                {t('settings.billing_siret', 'N° SIRET')}
              </div>
              <div style={{ fontWeight: 600, color: '#0f172a', fontFamily: 'monospace', fontSize: 12 }}>
                {billingInfo.billing_siret || '—'}
              </div>
            </div>
          </div>
          {(billingInfo.billing_address || billingInfo.billing_city || billingInfo.billing_postal_code) && (
            <div style={{ borderTop: '1px solid #f1f5f9', marginTop: 12, paddingTop: 12 }}>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
                {t('settings.billing_address', 'Adresse')}
              </div>
              <div style={{ color: '#0f172a', fontSize: 13, lineHeight: 1.5 }}>
                {billingInfo.billing_address && <>{billingInfo.billing_address}<br/></>}
                {billingInfo.billing_postal_code} {billingInfo.billing_city}
                {billingInfo.billing_country ? `, ${billingInfo.billing_country}` : ''}
              </div>
            </div>
          )}
        </div>
      )}

      {/* KPIs — HT only. Mirrors the admin /commissions tile design.
          The TVA breakdown lives on each individual card; tile shows
          one number for at-a-glance scanning. */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <PayKPI icon={DollarSign}  label={t('commissions.kpi_total')}        value={fmt(totalAll)}       color="#6366f1" />
        <PayKPI icon={Clock}       label={t('partnerPayments.kpi_pending')}  value={fmt(totals.pending)} color="#f59e0b" />
        <PayKPI icon={CheckCircle} label={t('commissions.kpi_paid')}         value={fmt(totals.paid)}    color="#16a34a" />
      </div>

      {/* Rejected rows surfaced before the kanban so partners actually see them */}
      {rejectedRows.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #fecaca', padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontWeight: 700, marginBottom: 12 }}>
            <XCircle size={16} /> {t('commission.rejected')} ({rejectedRows.length})
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {rejectedRows.map(c => {
              const hasVat = parseFloat(c.amount_tax || 0) > 0;
              const headlineAmount = hasVat ? c.amount_ttc : c.amount;
              return (
                <div key={c.id} style={{ padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_company || c.prospect_name}</div>
                    <div style={{ fontWeight: 700, color: '#dc2626', textAlign: 'right', lineHeight: 1.15 }}>
                      <div>{fmt(headlineAmount)}{hasVat ? ' TTC' : ''}</div>
                      {hasVat && <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{fmt(c.amount_ht)} HT</div>}
                    </div>
                  </div>
                  {c.rejection_reason && (
                    <div style={{ color: '#991b1b', fontSize: 12 }}>
                      <strong>{t('commission.rejection_reason_label')}:</strong> {c.rejection_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Kanban — columns flex to fill width, matching the admin
          /commissions Pipeline tab. */}
      <div style={{ display: 'flex', gap: 12, height: 'calc(100vh - 280px)', minHeight: 420 }}>
        {STATUS_KEYS.map(statusKey => {
            const st = PAY_STATUS[statusKey];
            // F5 — batch = unité visuelle. Position dérivée de
            // batch.status (et NON commission.status). 1 batch = 1
            // carte agrégée, peu importe le nombre de commissions
            // internes. Les commissions standalone (sans batch
            // résolu) gardent leur rendu individuel (cas unitary
            // ou batch fetch indisponible).
            const BATCH_COL_BY_STATUS = {
              awaiting_invoice: 'awaiting_invoice',
              ready_to_pay:     'pending_validation',
              paid:             'paid',
            };
            const colBatches = [...batchesById.values()].filter(b => BATCH_COL_BY_STATUS[b.status] === statusKey);
            const standaloneCommissions = visibleRows.filter(c => {
              if (c.status !== statusKey) return false;
              if (c.payout_batch_id && batchesById.has(c.payout_batch_id)) return false;
              return true;
            });
            const displayItems = [
              ...colBatches.map(b => ({
                kind: 'aggregate',
                batch: b,
                commissions: visibleRows.filter(c => c.payout_batch_id === b.id),
              })),
              ...standaloneCommissions.map(c => ({ kind: 'commission', c })),
            ];
            const cards = displayItems;
            // F5 — total HT colonne = somme des commissions standalone
            // + somme des batches agrégés présents. 1 batch contribue
            // pour son total_amount_ht, peu importe le nombre de
            // commissions internes.
            const colTotalHt =
              standaloneCommissions.reduce((s, c) => s + (parseFloat(c.amount_ht) || parseFloat(c.amount) || 0), 0)
              + colBatches.reduce((s, b) => s + (parseFloat(b.total_amount_ht) || 0), 0);
            return (
              <div
                key={statusKey}
                style={{
                  flex: 1, minWidth: 0, background: '#f8fafc', borderRadius: 16,
                  padding: 12, display: 'flex', flexDirection: 'column',
                  border: '1px solid #e2e8f0',
                  borderTop: `3px solid ${st.color}`,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', marginBottom: 10, borderRadius: 10, background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: st.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 700, fontSize: 13, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{st.label}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {colTotalHt > 0 && <span style={{ fontWeight: 700, fontSize: 13, color: st.color }}>{fmt(colTotalHt)}</span>}
                    <span style={{ background: st.color + '15', color: st.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>{displayItems.length}</span>
                  </div>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                  {cards.map(item => {
                    // F5 — carte agrégée violette pour chaque batch.
                    // Pas de partner_name (le partenaire est lui-même).
                    // Sub-header "Versée par {tenant_name}" pour clarifier
                    // l'origine. Bouton "Déposer la facture du mois"
                    // sur batch.status === 'awaiting_invoice'.
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
                      const canUploadInvoice = ab.status === 'awaiting_invoice';
                      const invoiceReceived = ab.status === 'ready_to_pay';
                      return (
                        <div
                          key={'aggregate-' + ab.id + '-' + statusKey}
                          style={{
                            background: '#faf5ff', borderRadius: 12, padding: 14,
                            border: '1px solid #d8b4fe',
                            boxShadow: '0 1px 3px rgba(124,58,237,0.08)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                            <div style={{ minWidth: 0, flex: 1 }}>
                              <div style={{ fontWeight: 600, color: '#6b21a8', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>
                                ▣ {t('payouts.partner_period_prefix', 'Votre paie de')} {ab.period}
                              </div>
                              {ab.tenant_name && (
                                <div style={{ color: '#64748b', fontSize: 11 }}>
                                  {t('payouts.paid_by', { tenant: ab.tenant_name, defaultValue: 'Versée par {{tenant}}' })}
                                </div>
                              )}
                            </div>
                            <span style={{ background: '#ede9fe', color: '#6b21a8', fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 10, flexShrink: 0 }}>
                              {totalCount} {totalCount > 1 ? t('payouts.deals_plural', 'deals') : t('payouts.deals_one', 'deal')}
                            </span>
                          </div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: '#7c3aed', letterSpacing: -0.5, marginBottom: hasVatGroup ? 2 : 8 }}>
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
                          {canUploadInvoice && (
                            <button
                              onClick={() => triggerBatchUpload(ab.id)}
                              disabled={batchUploadingId === ab.id}
                              style={{
                                width: '100%', padding: '8px', borderRadius: 8,
                                background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff',
                                fontWeight: 700, fontSize: 12, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                                fontFamily: 'inherit', marginBottom: 6,
                                opacity: batchUploadingId === ab.id ? 0.7 : 1,
                              }}
                            >
                              <Upload size={12} /> {batchUploadingId === ab.id ? t('commission.uploading') : t('payouts.upload_batch_invoice', 'Déposer la facture du mois')}
                            </button>
                          )}
                          {invoiceReceived && (
                            <div style={{
                              padding: '7px 10px', borderRadius: 8,
                              background: '#eff6ff', color: '#0284c7',
                              fontSize: 11, textAlign: 'center', fontWeight: 600,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              marginBottom: 6,
                            }}>
                              <ShieldCheck size={12} /> {t('payouts.invoice_received_waiting_payment', 'Facture déposée, en attente du paiement')}
                            </div>
                          )}
                          <button
                            onClick={() => openBatchDetail(ab.id)}
                            style={{
                              width: '100%', padding: '7px', borderRadius: 8,
                              background: '#ede9fe', border: '1px solid #d8b4fe', color: '#6b21a8',
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
                    // F3c — badge "Dans batch" sur les cartes individuelles
                    // dont la commission appartient à un batch (< 3 du même
                    // batch dans cette colonne, donc pas regroupé en
                    // aggregate). Le bouton "Déposer la facture" individuel
                    // est masqué dans ce cas : le partenaire doit utiliser
                    // la modale détail batch pour uploader la facture
                    // groupée.
                    const inBatch = !!c.payout_batch_id && batchesById.has(c.payout_batch_id);
                    return (
                    <div
                      key={c.id}
                      style={{
                        background: '#fff', borderRadius: 12, padding: 14,
                        border: '1px solid #e2e8f0',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      }}
                    >
                      {/* Status pill removed — the column header
                          already conveys the lifecycle stage. */}
                      <div style={{ marginBottom: 6, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.prospect_company || c.prospect_name || '—'}
                        </div>
                        {inBatch && (
                          <span style={{ background: '#ede9fe', color: '#6b21a8', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 8, flexShrink: 0 }}>
                            {t('payouts.in_batch_badge', 'Dans batch')}
                          </span>
                        )}
                      </div>

                      {c.prospect_company && c.prospect_name && c.prospect_company !== c.prospect_name && (
                        <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 8 }}>{c.prospect_name}</div>
                      )}

                      {(() => {
                        // VAT-subject row: headline is HT, subline
                        // shows "TVA Y% : Z € · TTC : W €" so the
                        // partner has the numbers they need to put
                        // on their invoice (TTC = what Qonto will
                        // wire). Non-VAT rows keep the legacy
                        // single-line layout for partners who aren't
                        // assujettis.
                        const hasVat = parseFloat(c.amount_tax || 0) > 0;
                        const headline = hasVat ? c.amount_ht : c.amount;
                        return (
                          <>
                            <div style={{ fontSize: 22, fontWeight: 800, color: st.color, letterSpacing: -0.5, marginBottom: hasVat ? 2 : 4 }}>
                              {fmt(headline)}{hasVat ? ' HT' : ''}
                            </div>
                            {hasVat && (
                              <div style={{ color: '#64748b', fontSize: 11, marginBottom: 6, lineHeight: 1.4 }}>
                                TVA {c.tax_rate_applied}% : {fmt(c.amount_tax)} · <strong style={{ color: '#0f172a' }}>TTC : {fmt(c.amount_ttc)}</strong>
                              </div>
                            )}
                          </>
                        );
                      })()}
                      <div style={{ color: '#94a3b8', fontSize: 11, marginBottom: 10 }}>
                        {c.rate}% · {fmt(c.deal_value)} · {fmtDate(c.created_at)}
                      </div>

                      {/* F4 — En cadence non-unitary, une commission
                          approved sans payout_batch_id signifie qu'elle
                          attend son inclusion dans le prochain batch
                          (cas rare post-F4 : auto-batch à l'approve la
                          rattacherait normalement immédiatement. Le badge
                          est défensif pour les commissions historiques
                          pré-F4 ou un tenant qui vient de flip cadence).
                          Le bouton upload individuel est masqué. */}
                      {statusKey === 'awaiting_invoice' && !inBatch && tenantCadence !== 'unitary' && (
                        <div style={{
                          padding: '7px 10px', borderRadius: 8,
                          background: '#f1f5f9', color: '#64748b',
                          fontSize: 11, textAlign: 'center', fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}>
                          <Clock size={12} /> {t('payouts.awaiting_batch_inclusion', 'En attente d\'inclusion dans le batch mensuel')}
                        </div>
                      )}
                      {statusKey === 'awaiting_invoice' && !inBatch && tenantCadence === 'unitary' && (
                        <button
                          onClick={() => triggerUpload(c.id)}
                          disabled={uploadingId === c.id}
                          style={{
                            width: '100%', padding: '8px 12px', borderRadius: 10,
                            background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                            opacity: uploadingId === c.id ? 0.7 : 1,
                          }}
                        >
                          <Upload size={12} /> {uploadingId === c.id ? t('commission.uploading') : t('commission.upload_invoice')}
                        </button>
                      )}
                      {/* F3c — Si la commission est batchée (<3 dans
                          cette colonne donc pas regroupée en aggregate),
                          l'upload se fait au niveau batch via la modale
                          détail, pas individuellement. */}
                      {statusKey === 'awaiting_invoice' && inBatch && (
                        <button
                          onClick={() => openBatchDetail(c.payout_batch_id)}
                          style={{
                            width: '100%', padding: '8px', borderRadius: 8,
                            background: '#ede9fe', border: '1px solid #d8b4fe', color: '#6b21a8',
                            fontWeight: 700, fontSize: 12, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                            fontFamily: 'inherit',
                          }}
                        >
                          {t('payouts.see_details', 'Voir le détail')}
                        </button>
                      )}
                      {statusKey === 'pending_validation' && (
                        <div style={{
                          padding: '7px 10px', borderRadius: 8,
                          background: '#eff6ff', color: '#0284c7',
                          fontSize: 11, textAlign: 'center', fontWeight: 600,
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}>
                          <ShieldCheck size={12} /> {t('commission.invoice_under_review')}
                        </div>
                      )}
                      {statusKey === 'paid' && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {c.has_invoice && (
                            <button
                              onClick={() => handleDownload(c.id)}
                              style={{
                                width: '100%', padding: '7px', borderRadius: 8,
                                background: '#f0fdf4', border: '1px solid #bbf7d0',
                                color: '#166534', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                              }}
                            >
                              <Download size={12} /> {t('commission.download_receipt')}
                            </button>
                          )}
                          {c.paid_at && (
                            <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 11 }}>
                              {t('commissions.paid_on')} {fmtDate(c.paid_at)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                  })}
                  {cards.length === 0 && (
                    <div style={{ color: '#cbd5e1', fontSize: 12, textAlign: 'center', padding: 16 }}>
                      {t('partnerPayments.empty_col', 'Aucune commission')}
                    </div>
                  )}
                </div>
              </div>
            );
        })}
      </div>

      {commissions.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0', marginTop: 16 }}>
          {t('partnerPayments.no_payments')}
        </div>
      )}

      {/* F3c — Modale détail batch partenaire. Pas de partner_name
          (c'est le partenaire lui-même). Lien "Voir le deal →" vers
          la fiche referral partenaire. Bouton "Déposer la facture"
          en bas si batch.status === 'awaiting_invoice'. */}
      {batchDetail && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => batchUploadingId === null && setBatchDetail(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 600, maxWidth: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            {batchDetail.loading && (
              <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                {t('common.loading', 'Chargement…')}
              </div>
            )}
            {!batchDetail.loading && batchDetail.batch && (() => {
              const bd = batchDetail.batch;
              const list = batchDetail.commissions || [];
              const hasVatBd = parseFloat(bd.total_amount_tax || 0) > 0;
              const canUploadBd = bd.status === 'awaiting_invoice';
              const statusBadge = {
                awaiting_invoice:  { label: t('payouts.status_awaiting_invoice', 'En attente de facture'), bg: '#fffbeb', color: '#92400e' },
                ready_to_pay:      { label: t('payouts.status_ready_to_pay', 'Prêt à payer'),               bg: '#eff6ff', color: '#1d4ed8' },
                paid:              { label: t('payouts.status_paid', 'Payé'),                                bg: '#f0fdf4', color: '#166534' },
                cancelled:         { label: t('payouts.status_cancelled', 'Annulé'),                         bg: '#f1f5f9', color: '#475569' },
              }[bd.status] || { label: bd.status, bg: '#f1f5f9', color: '#475569' };
              return (
                <>
                  <div style={{ padding: '24px 28px 16px', borderBottom: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                          <h2 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0 }}>
                            {t('payouts.partner_detail_title', { period: bd.period, defaultValue: 'Batch — {{period}}' })}
                          </h2>
                          <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 700, background: statusBadge.bg, color: statusBadge.color }}>
                            {statusBadge.label}
                          </span>
                        </div>
                        <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
                          {list.length} {t('payouts.aggregate_count_suffix', 'commissions')}
                          {' · '}{fmt(bd.total_amount_ttc)} TTC
                          {hasVatBd && <span style={{ color: '#94a3b8' }}> ({fmt(bd.total_amount_ht)} HT + {fmt(bd.total_amount_tax)} TVA)</span>}
                        </p>
                        {bd.invoice_uploaded_at && (
                          <p style={{ color: '#0284c7', fontSize: 12, margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <CheckCircle size={12} /> {t('payouts.invoice_deposited_on', { date: fmtDate(bd.invoice_uploaded_at), defaultValue: 'Facture déposée le {{date}}' })}
                          </p>
                        )}
                      </div>
                      <button onClick={() => batchUploadingId === null && setBatchDetail(null)} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: batchUploadingId !== null ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
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
                                      href={'/partner/referrals?open=' + dc.referral_id}
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

                  <div style={{ padding: '16px 28px 24px', borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    {canUploadBd ? (
                      <button
                        onClick={() => triggerBatchUpload(bd.id)}
                        disabled={batchUploadingId === bd.id}
                        style={{
                          padding: '9px 16px', borderRadius: 10,
                          background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff',
                          fontWeight: 700, fontSize: 13,
                          cursor: batchUploadingId === bd.id ? 'wait' : 'pointer', fontFamily: 'inherit',
                          display: 'flex', alignItems: 'center', gap: 6,
                          opacity: batchUploadingId === bd.id ? 0.7 : 1,
                        }}
                      >
                        <Upload size={14} /> {batchUploadingId === bd.id ? t('commission.uploading') : t('payouts.upload_batch_invoice', 'Déposer la facture du mois')}
                      </button>
                    ) : <div />}
                    <button
                      onClick={() => batchUploadingId === null && setBatchDetail(null)}
                      disabled={batchUploadingId !== null}
                      style={{ padding: '9px 16px', borderRadius: 10, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: batchUploadingId !== null ? 'wait' : 'pointer', fontFamily: 'inherit' }}
                    >
                      {t('common.close', 'Fermer')}
                    </button>
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

function PayKPI({ icon: Icon, label, value, sub, suffix, color }) {
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
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}
