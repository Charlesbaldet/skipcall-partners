import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import { fmt, fmtDate } from '../lib/constants';
import { CreditCard, Clock, CheckCircle, DollarSign, XCircle, Upload, Download, FileText, ShieldCheck, AlertTriangle } from 'lucide-react';

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
  const [uploadingId, setUploadingId] = useState(null);
  const fileInputRef = useRef(null);
  const pendingUploadIdRef = useRef(null);

  const PAY_STATUS = {
    pending_approval:   { label: t('commission.status.pending_approval'), ...PAY_STATUS_META.pending_approval },
    awaiting_invoice:   { label: t('commission.status.awaiting_invoice'), ...PAY_STATUS_META.awaiting_invoice },
    pending_validation: { label: t('commission.status.pending_validation'), ...PAY_STATUS_META.pending_validation },
    paid:               { label: t('commission.status.paid'), ...PAY_STATUS_META.paid },
  };

  const reload = () => Promise.all([
    api.getCommissions(),
    api.getMyBankInfo().catch(() => ({ bank_info: null })),
  ]).then(([c, b]) => {
    setCommissions(c.commissions);
    setTotals({ pending: c.totalPending, paid: c.totalPaid });
    setBankInfo(b && b.bank_info ? b.bank_info : null);
  });

  useEffect(() => {
    reload().catch(console.error).finally(() => setLoading(false));
  }, []);

  const triggerUpload = (commissionId) => {
    pendingUploadIdRef.current = commissionId;
    fileInputRef.current && fileInputRef.current.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    const id = pendingUploadIdRef.current;
    pendingUploadIdRef.current = null;
    if (!file || !id) return;
    if (file.size > 10 * 1024 * 1024) {
      showToast.error(t('commission.invoice_too_large'));
      return;
    }
    setUploadingId(id);
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      await api.uploadCommissionInvoice(id, { filename: file.name, dataUrl });
      await reload();
    } catch (err) {
      showToast.error(err.message || "Error");
    }
    setUploadingId(null);
  };

  const handleDownload = async (id) => {
    try { await api.downloadCommissionInvoice(id); }
    catch (err) { showToast.error(err.message || "Error"); }
  };

  const totalAll = commissions.reduce((s, c) => s + parseFloat(c.amount || 0), 0);
  const rejectedRows = commissions.filter(c => c.approval_status === 'rejected');
  const visibleRows = commissions.filter(c => c.approval_status !== 'rejected');
  const bankIncomplete = !bankInfo || !bankInfo.iban;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partnerPayments.loading')}</div>;

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

      {/* KPIs.
          Backend `totals.pending/paid` and `totalAll` sum c.amount
          (HT). When any commission carries VAT we additionally derive
          TTC sums client-side from the loaded list so the partner
          sees the gross amount they actually receive on Qonto. Legacy
          / non-subject rows have amount_ttc == amount, so the TTC
          sum equals HT and we keep the single-line UI for partners
          who aren't assujettis. */}
      {(() => {
        const sum = (filterFn, key) => commissions.filter(filterFn).reduce((s, c) => s + (parseFloat(c[key]) || 0), 0);
        const isPending = (c) => c.status === 'pending_approval' || c.status === 'awaiting_invoice' || c.status === 'pending_validation';
        const isPaid    = (c) => c.status === 'paid';
        const totalTtcAll     = commissions.reduce((s, c) => s + (parseFloat(c.amount_ttc) || parseFloat(c.amount) || 0), 0);
        const totalTtcPending = sum(isPending, 'amount_ttc') || sum(isPending, 'amount');
        const totalTtcPaid    = sum(isPaid,    'amount_ttc') || sum(isPaid,    'amount');
        const anyVat = commissions.some(c => parseFloat(c.amount_tax || 0) > 0);
        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
            <PayKPI icon={DollarSign}  label={t('commissions.kpi_total')}        value={fmt(anyVat ? totalTtcAll     : totalAll)}        sub={anyVat ? `${fmt(totalAll)} HT`        : null} suffix={anyVat ? 'TTC' : null} color="#6366f1" />
            <PayKPI icon={Clock}       label={t('partnerPayments.kpi_pending')}  value={fmt(anyVat ? totalTtcPending : totals.pending)}  sub={anyVat ? `${fmt(totals.pending)} HT` : null} suffix={anyVat ? 'TTC' : null} color="#f59e0b" />
            <PayKPI icon={CheckCircle} label={t('commissions.kpi_paid')}         value={fmt(anyVat ? totalTtcPaid    : totals.paid)}     sub={anyVat ? `${fmt(totals.paid)} HT`    : null} suffix={anyVat ? 'TTC' : null} color="#16a34a" />
          </div>
        );
      })()}

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
            const cards = visibleRows.filter(c => c.status === statusKey);
            // Column total. Sum TTC when amount_ttc exists, fall back
            // to amount for legacy rows. The HT total renders only
            // when at least one card in the column carries VAT —
            // partners who aren't subject keep the compact header.
            const colTotalTtc = cards.reduce((s, c) => s + (parseFloat(c.amount_ttc) || parseFloat(c.amount) || 0), 0);
            const colTotalHt  = cards.reduce((s, c) => s + (parseFloat(c.amount_ht)  || parseFloat(c.amount) || 0), 0);
            const colHasVat = cards.some(c => parseFloat(c.amount_tax || 0) > 0);
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
                  <span style={{ background: st.color + '15', color: st.color, fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>{cards.length}</span>
                </div>

                {colTotalTtc > 0 && (
                  <div style={{ padding: '4px 10px 8px', fontSize: 11, fontWeight: 700, color: st.color, lineHeight: 1.2 }}>
                    {fmt(colTotalTtc)}{colHasVat ? ' TTC' : ''}
                    {colHasVat && (
                      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{fmt(colTotalHt)} HT</div>
                    )}
                  </div>
                )}

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', minHeight: 0 }}>
                  {cards.map(c => (
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
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {c.prospect_company || c.prospect_name || '—'}
                        </div>
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

                      {statusKey === 'awaiting_invoice' && (
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
                  ))}
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
