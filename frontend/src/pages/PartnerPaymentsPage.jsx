import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { CreditCard, Clock, CheckCircle, DollarSign, Edit3, Save, X, Building, XCircle } from 'lucide-react';

const PAY_STATUS_META = {
  pending: { color: '#f59e0b', bg: '#fffbeb', icon: Clock },
  approved: { color: 'var(--rb-primary, #059669)', bg: '#eef2ff', icon: CheckCircle },
  paid: { color: '#16a34a', bg: '#f0fdf4', icon: CreditCard },
};

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

  const PAY_STATUS = {
    pending: { label: t('partnerPayments.pending'), ...PAY_STATUS_META.pending },
    approved: { label: t('commissions.approved'), ...PAY_STATUS_META.approved },
    paid: { label: t('partnerPayments.paid'), ...PAY_STATUS_META.paid },
  };

  useEffect(() => {
    Promise.all([
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
    }).catch(console.error).finally(() => setLoading(false));
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

  const totalAll = commissions.reduce((s, c) => s + parseFloat(c.amount || 0), 0);

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partnerPayments.loading')}</div>;

  return (
    <div className="fade-in">
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('partnerPayments.title')}</h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>{t('partnerPayments.subtitle')}</p>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <PayKPI icon={DollarSign} label={t('commissions.kpi_total')} value={fmt(totalAll)} color="#6366f1" />
        <PayKPI icon={Clock} label={t('partnerPayments.kpi_pending')} value={fmt(totals.pending)} color="#f59e0b" />
        <PayKPI icon={CheckCircle} label={t('commissions.kpi_paid')} value={fmt(totals.paid)} color="#16a34a" />
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

      {/* Payments list */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {[t('partnerPayments.tbl_prospect'), t('partnerPayments.tbl_deal'), t('partnerPayments.tbl_rate'), t('partnerPayments.tbl_commission'), t('partnerPayments.tbl_status'), t('partnerPayments.tbl_date'), t('commissions.paid_on')].map((h, i) => (
                <th key={i} style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {commissions.length === 0 ? (
              <tr><td colSpan={7} style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('partnerPayments.no_payments')}</td></tr>
            ) : commissions.map(c => {
              // Approval state (pending_approval / rejected) takes priority
              // over the payment-status badge — partners need to see
              // "waiting on approval" or "rejected" before the payment
              // lifecycle starts.
              let badgeBg, badgeColor, badgeLabel, BadgeIcon, amountColor;
              if (c.approval_status === 'pending_approval') {
                badgeBg = '#fffbeb'; badgeColor = '#d97706'; badgeLabel = t('commission.pending_approval'); BadgeIcon = Clock; amountColor = '#d97706';
              } else if (c.approval_status === 'rejected') {
                badgeBg = '#fef2f2'; badgeColor = '#dc2626'; badgeLabel = t('commission.rejected'); BadgeIcon = XCircle; amountColor = '#dc2626';
              } else {
                const st = PAY_STATUS[c.status] || PAY_STATUS.pending;
                badgeBg = st.bg; badgeColor = st.color; badgeLabel = st.label; BadgeIcon = st.icon; amountColor = st.color;
              }
              return (
                <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                  <td style={{ padding: '13px 16px' }}>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{c.prospect_name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{c.prospect_company}</div>
                    {c.approval_status === 'rejected' && c.rejection_reason && (
                      <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', fontSize: 11, lineHeight: 1.4 }}>
                        <strong>{t('commission.rejection_reason_label')}:</strong> {c.rejection_reason}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: '13px 16px', fontWeight: 600 }}>{fmt(c.deal_value)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ padding: '3px 8px', borderRadius: 6, background: '#eef2ff', color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 12 }}>{c.rate}%</span>
                  </td>
                  <td style={{ padding: '13px 16px', fontWeight: 800, color: amountColor, fontSize: 16 }}>{fmt(c.amount)}</td>
                  <td style={{ padding: '13px 16px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: badgeBg, color: badgeColor }}>
                      <BadgeIcon size={13} />
                      {badgeLabel}
                    </span>
                  </td>
                  <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 13 }}>{fmtDate(c.created_at)}</td>
                  <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 13 }}>{c.paid_at ? fmtDate(c.paid_at) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
          {commissions.length > 0 && (
            <tfoot>
              <tr style={{ background: '#f8fafc' }}>
                <td colSpan={3} style={{ padding: '13px 16px', fontWeight: 700, color: '#0f172a' }}>{t('commissions.total')}</td>
                <td style={{ padding: '13px 16px', fontWeight: 800, color: 'var(--rb-primary, #059669)', fontSize: 18 }}>{fmt(totalAll)}</td>
                <td colSpan={3}></td>
              </tr>
            </tfoot>
          )}
        </table>
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
