import { useTranslation } from 'react-i18next';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { CreditCard, Clock, CheckCircle, DollarSign, Edit3, Save, X, Building, XCircle, Upload, Download, FileText, ShieldCheck } from 'lucide-react';

const PAY_STATUS_META = {
  pending_approval:   { color: '#f59e0b', bg: '#fffbeb', icon: Clock },
  awaiting_invoice:   { color: '#6366f1', bg: '#eef2ff', icon: FileText },
  pending_validation: { color: '#0284c7', bg: '#eff6ff', icon: ShieldCheck },
  paid:               { color: '#16a34a', bg: '#f0fdf4', icon: CreditCard },
};

const STATUS_ORDER = ['pending_approval', 'awaiting_invoice', 'pending_validation', 'paid'];

export default function PartnerPaymentsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [commissions, setCommissions] = useState([]);
  const [totals, setTotals] = useState({ pending: 0, paid: 0 });
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);
  const [editIban, setEditIban] = useState(false);
  const [ibanForm, setIbanForm] = useState({ iban: '', bic: '', account_holder: '' });
  const [savingIban, setSavingIban] = useState(false);
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
    api.getMyPartnerProfile(),
  ]).then(([c, p]) => {
    setCommissions(c.commissions);
    setTotals({ pending: c.totalPending, paid: c.totalPaid });
    setProfile(p.partner);
    setIbanForm({
      iban: p.partner.iban || '',
      bic: p.partner.bic || '',
      account_holder: p.partner.account_holder || '',
    });
  });

  useEffect(() => {
    reload().catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSaveIban = async () => {
    setSavingIban(true);
    try {
      await api.updateMyIban(user.partnerId, ibanForm);
      setProfile(prev => ({ ...prev, ...ibanForm }));
      setEditIban(false);
    } catch (err) {
      alert(err.message);
    }
    setSavingIban(false);
  };

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
      alert(t('commission.invoice_too_large'));
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
      alert(err.message || 'Error');
    }
    setUploadingId(null);
  };

  const handleDownload = async (id) => {
    try { await api.downloadCommissionInvoice(id); }
    catch (err) { alert(err.message || 'Error'); }
  };

  const totalAll = commissions.reduce((s, c) => s + parseFloat(c.amount || 0), 0);

  // Group commissions by status so partners see their workflow at a
  // glance. Rejected rows surface separately at the top via the badge
  // path below.
  const byStatus = {};
  for (const k of STATUS_ORDER) byStatus[k] = [];
  for (const c of commissions) {
    if (c.approval_status === 'rejected') continue;
    if (byStatus[c.status]) byStatus[c.status].push(c);
  }
  const rejectedRows = commissions.filter(c => c.approval_status === 'rejected');

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partnerPayments.loading')}</div>;

  return (
    <div className="fade-in">
      <input ref={fileInputRef} type="file" accept="application/pdf,image/*" style={{ display: 'none' }} onChange={handleFileSelected} />
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('partnerPayments.title')}</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>{t('partnerPayments.subtitle')}</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <PayKPI icon={DollarSign} label={t('commissions.kpi_total')} value={fmt(totalAll)} color="#6366f1" />
        <PayKPI icon={Clock} label={t('partnerPayments.kpi_pending')} value={fmt(totals.pending)} color="#f59e0b" />
        <PayKPI icon={CheckCircle} label={t('commissions.kpi_paid')} value={fmt(totals.paid)} color="#16a34a" />
      </div>

      {/* Workflow legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, padding: 14, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, flexWrap: 'wrap' }}>
        {STATUS_ORDER.map((k, i) => {
          const st = PAY_STATUS[k];
          const Icon = st.icon;
          return (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: st.color, fontWeight: 600 }}>
              <Icon size={14} /> {st.label}
              {i < STATUS_ORDER.length - 1 && <span style={{ color: '#cbd5e1', margin: '0 4px' }}>→</span>}
            </span>
          );
        })}
      </div>

      {/* IBAN Section */}
      <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginBottom: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: '#eef2ff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Building size={18} color="#6366f1" />
            </div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>{t('partnerPayments.bank_info')}</h3>
          </div>
          {!editIban ? (
            <button onClick={() => setEditIban(true)} style={{
              display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
              background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            }}>
              <Edit3 size={14} />
              {profile?.iban ? t('common.edit') : t('settings.add')}
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setEditIban(false)} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px', borderRadius: 10,
                background: '#f1f5f9', border: 'none', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
              }}><X size={14} /> {t('common.cancel')}</button>
              <button onClick={handleSaveIban} disabled={savingIban} style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '8px 14px', borderRadius: 10,
                background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff',
                fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: savingIban ? 0.7 : 1,
              }}><Save size={14} /> {savingIban ? t('partnerPayments.saving') : t('partnerPayments.iban_save')}</button>
            </div>
          )}
        </div>

        {editIban ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>{t('partnerPayments.holder_label_long')}</label>
              <input value={ibanForm.account_holder} onChange={e => setIbanForm(f => ({ ...f, account_holder: e.target.value }))}
                placeholder={t('partnerPayments.holder_ph')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>{t('partnerPayments.iban_label')}</label>
              <input value={ibanForm.iban} onChange={e => setIbanForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
                placeholder={t('partnerPayments.iban_ph')}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>{t('partnerPayments.bic_label')}</label>
              <input value={ibanForm.bic} onChange={e => setIbanForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
                placeholder="BNPAFRPP"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, fontFamily: 'monospace', boxSizing: 'border-box' }} />
            </div>
          </div>
        ) : (
          profile?.iban ? (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{t('partnerPayments.holder_label')}</div>
                <div style={{ color: '#0f172a', fontWeight: 600, marginTop: 4 }}>{profile.account_holder || '—'}</div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{t('partnerPayments.iban_label')}</div>
                <div style={{ color: '#0f172a', fontWeight: 600, marginTop: 4, fontFamily: 'monospace', letterSpacing: 1 }}>
                  {profile.iban.replace(/(.{4})/g, '$1 ').trim()}
                </div>
              </div>
              <div>
                <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{t('partnerPayments.bic_label')}</div>
                <div style={{ color: '#0f172a', fontWeight: 600, marginTop: 4, fontFamily: 'monospace' }}>{profile.bic || '—'}</div>
              </div>
            </div>
          ) : (
            <div style={{ background: '#fffbeb', borderRadius: 10, padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
              <Clock size={16} color="#f59e0b" />
              <span style={{ color: '#92400e', fontSize: 14 }}>
                {t('partnerPayments.iban_hint')}
              </span>
            </div>
          )
        )}
      </div>

      {/* Rejected commissions surfaced first so the partner sees them */}
      {rejectedRows.length > 0 && (
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #fecaca', padding: 16, marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontWeight: 700, marginBottom: 12 }}>
            <XCircle size={16} /> {t('commission.rejected')} ({rejectedRows.length})
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {rejectedRows.map(c => (
              <div key={c.id} style={{ padding: 12, background: '#fef2f2', borderRadius: 10, border: '1px solid #fecaca' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name || c.prospect_company}</div>
                  <div style={{ fontWeight: 700, color: '#dc2626' }}>{fmt(c.amount)}</div>
                </div>
                {c.rejection_reason && (
                  <div style={{ color: '#991b1b', fontSize: 12 }}>
                    <strong>{t('commission.rejection_reason_label')}:</strong> {c.rejection_reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Commissions grouped by status */}
      <div style={{ display: 'grid', gap: 16 }}>
        {STATUS_ORDER.map(statusKey => {
          const rows = byStatus[statusKey];
          const st = PAY_STATUS[statusKey];
          if (rows.length === 0) return null;
          return (
            <div key={statusKey} style={{ background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: st.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: st.color, fontWeight: 700 }}>
                  <st.icon size={16} /> {st.label}
                </div>
                <div style={{ color: st.color, fontWeight: 700, fontSize: 14 }}>
                  {rows.length} · {fmt(rows.reduce((s, r) => s + parseFloat(r.amount || 0), 0))}
                </div>
              </div>
              <div style={{ padding: 8 }}>
                {rows.map(c => (
                  <div key={c.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr', gap: 12, alignItems: 'center', padding: '12px 14px', borderRadius: 10 }}>
                    <div>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>{c.prospect_company}</div>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{t('partnerPayments.tbl_commission')}</div>
                      <div style={{ fontWeight: 700, color: '#0f172a' }}>{fmt(c.amount)} <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>· {c.rate}%</span></div>
                    </div>
                    <div>
                      <div style={{ color: '#94a3b8', fontSize: 11 }}>{statusKey === 'paid' ? t('commissions.paid_on') : t('partnerPayments.tbl_date')}</div>
                      <div style={{ color: '#475569', fontSize: 13 }}>
                        {statusKey === 'paid' ? (c.paid_at ? fmtDate(c.paid_at) : '—') : fmtDate(c.created_at)}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {statusKey === 'awaiting_invoice' && (
                        <button onClick={() => triggerUpload(c.id)} disabled={uploadingId === c.id}
                          style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--rb-primary, #059669)', border: 'none', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: uploadingId === c.id ? 0.7 : 1 }}>
                          <Upload size={13} /> {uploadingId === c.id ? t('commission.uploading') : t('commission.upload_invoice')}
                        </button>
                      )}
                      {statusKey === 'pending_validation' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#eff6ff', color: '#0284c7', fontWeight: 600, fontSize: 12 }}>
                          <ShieldCheck size={13} /> {t('commission.invoice_under_review')}
                        </span>
                      )}
                      {statusKey === 'paid' && c.has_invoice && (
                        <button onClick={() => handleDownload(c.id)}
                          style={{ padding: '8px 14px', borderRadius: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Download size={13} /> {t('commission.download_receipt')}
                        </button>
                      )}
                      {statusKey === 'pending_approval' && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, background: '#fffbeb', color: '#d97706', fontWeight: 600, fontSize: 12 }}>
                          <Clock size={13} /> {t('commission.status.pending_approval')}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {commissions.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', color: '#94a3b8', border: '1px solid #e2e8f0' }}>
            {t('partnerPayments.no_payments')}
          </div>
        )}
      </div>
    </div>
  );
}

function PayKPI({ icon: Icon, label, value, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} color={color} />
        </div>
      </div>
    </div>
  );
}
