import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import { UserPlus, CheckCircle, XCircle, Clock, Building, Mail, Phone, Globe, Users, User, X } from 'lucide-react';
import UpgradeModal from '../components/UpgradeModal.jsx';
import PageSkeleton from '../components/PageSkeleton.jsx';

export default function AdminApplicationsPage() {
  const { t } = useTranslation();
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(t('admin.fmt_locale'), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString(t('admin.fmt_locale'), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const STATUS_BADGE = {
    pending: { label: t('admin.app_status_pending'), color: '#b4791f', bg: '#f6efda' },
    approved: { label: t('admin.app_status_approved'), color: '#157a4c', bg: '#e9f1ea' },
    rejected: { label: t('admin.app_status_rejected'), color: '#b23b2e', bg: '#f7e9e6' },
  };
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');
  const [selected, setSelected] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [commissionRate, setCommissionRate] = useState(10);
  const [rejectReason, setRejectReason] = useState('');
  const [approvedEmail, setApprovedEmail] = useState(null);
  const [upgradePrompt, setUpgradePrompt] = useState(null);

  const load = async () => {
    try {
      const data = await api.getApplications(filter);
      setApplications(data.applications);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, [filter]);

  const handleApprove = async (id) => {
    setProcessing(true);
    try {
      const data = await api.approveApplication(id, commissionRate);
      setApprovedEmail(true);
      load();
    } catch (err) {
      if (err?.data?.error === 'partner_limit_reached') {
        setSelected(null);
        setUpgradePrompt({ limit: err.data.limit, plan: err.data.plan, upgradeTo: err.data.upgradeTo });
      } else {
        showToast.error(err.message);
      }
    }
    setProcessing(false);
  };

  const handleReject = async (id) => {
    setProcessing(true);
    try {
      await api.rejectApplication(id, rejectReason);
      setSelected(null);
      load();
    } catch (err) { showToast.error(err.message); }
    setProcessing(false);
  };

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) return <PageSkeleton />;

  return (
    <div className="fade-in">
      {upgradePrompt && (
        <UpgradeModal
          limit={upgradePrompt.limit}
          plan={upgradePrompt.plan}
          upgradeTo={upgradePrompt.upgradeTo}
          onClose={() => setUpgradePrompt(null)}
        />
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0e1f18', letterSpacing: -0.5 }}>{t('admin.applications_title')}</h1>
          <p style={{ color: '#6e756c', marginTop: 4 }}>
            {pendingCount > 0 ? t(pendingCount > 1 ? 'admin.applications_pending_plural' : 'admin.applications_pending', { count: pendingCount }) : t('admin.applications_none_pending')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#ece7db', borderRadius: 10, padding: 3 }}>
          {[{ id: 'pending', label: t('admin.app_filter_pending') }, { id: 'all', label: t('admin.app_filter_all') }, { id: 'approved', label: t('admin.app_filter_approved') }, { id: 'rejected', label: t('admin.app_filter_rejected') }].map(tab => (
            <button key={tab.id} onClick={() => setFilter(tab.id)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: filter === tab.id ? '#fff' : 'transparent', color: filter === tab.id ? '#0e1f18' : '#6e756c',
              boxShadow: filter === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {applications.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #ded8cb' }}>
          <UserPlus size={40} color="#99a09a" style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ color: '#99a09a', fontSize: 15 }}>{t('admin.app_none')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {applications.map(app => {
            const badge = STATUS_BADGE[app.status];
            return (
              <div key={app.id} onClick={() => { setSelected(app); setApprovedEmail(null); setRejectReason(''); setCommissionRate(10); }}
                style={{
                  background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #ded8cb', cursor: 'pointer',
                  borderLeft: app.status === 'pending' ? '4px solid #b4791f' : '4px solid transparent',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--rb-primary, #0e7a54)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#ded8cb'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, color: '#0e1f18', fontSize: 17 }}>{app.company_name}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </div>
                    <div style={{ color: '#6e756c', fontSize: 13, marginTop: 4 }}>
                      {app.contact_name} · {app.email} · {fmtDate(app.created_at)}
                    </div>
                  </div>
                  {app.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); setSelected(app); }} style={{
                        padding: '8px 16px', borderRadius: 10, background: '#e9f1ea', border: 'none',
                        color: '#157a4c', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                      }}><CheckCircle size={14} /> {t('admin.app_review')}</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Detail modal */}
      {selected && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => setSelected(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 580, maxWidth: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', padding: 32 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0e1f18' }}>{selected.company_name}</h2>
                <p style={{ color: '#6e756c', fontSize: 14, marginTop: 4 }}>{t('admin.app_submitted_on', { date: fmtDate(selected.created_at) })}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#ece7db', border: 'none', width: 38, height: 38, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color="#33433b" />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
              <InfoRow icon={User} label={t('admin.app_field_contact')} value={selected.contact_name} />
              <InfoRow icon={Mail} label={t('admin.app_field_email')} value={selected.email} />
              <InfoRow icon={Phone} label={t('admin.app_field_phone')} value={selected.phone || '—'} />
              <InfoRow icon={Globe} label={t('admin.app_field_website')} value={selected.company_website || '—'} />
              <InfoRow icon={Users} label={t('admin.app_field_size')} value={selected.company_size || '—'} />
              <InfoRow icon={Clock} label={t('admin.app_field_submitted_on')} value={fmtDateTime(selected.created_at)} />
            </div>

            {selected.motivation && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ fontWeight: 600, color: '#2b3a32', fontSize: 13, marginBottom: 8 }}>{t('admin.app_motivation')}</div>
                <div style={{ background: '#f6f2e9', borderRadius: 12, padding: 16, color: '#2b3a32', fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid var(--rb-primary, #0e7a54)' }}>{selected.motivation}</div>
              </div>
            )}

            {approvedEmail && (
              <div style={{ background: '#e9f1ea', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #cfe6d6', textAlign: 'center' }}>
                <CheckCircle size={24} color="#157a4c" style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: '#157a4c', marginBottom: 4 }}>{t('admin.app_partner_created')}</div>
                <div style={{ color: '#0e7a54', fontSize: 13 }}>{t('admin.app_credentials_sent', { email: selected?.email })}</div>
              </div>
            )}

            {selected.status === 'pending' && !approvedEmail && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontWeight: 600, color: '#2b3a32', fontSize: 13, marginBottom: 8 }}>{t('admin.app_commission_rate')}</label>
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} min="0" max="50"
                    style={{ width: 120, padding: '10px 14px', borderRadius: 10, border: '2px solid #ded8cb', fontSize: 16, fontWeight: 600, color: '#0e1f18', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => handleApprove(selected.id)} disabled={processing} style={{
                    flex: 1, padding: '14px', borderRadius: 12,
                    background: 'var(--rb-primary, #0e7a54)', color: '#fff',
                    border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: processing ? 0.7 : 1,
                  }}>
                    <CheckCircle size={18} /> {t('admin.app_accept')}
                  </button>
                  <button onClick={() => handleReject(selected.id)} disabled={processing} style={{
                    flex: 1, padding: '14px', borderRadius: 12,
                    background: '#f7e9e6', color: '#b23b2e', border: '1px solid #edc4bd',
                    fontWeight: 600, fontSize: 15, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: processing ? 0.7 : 1,
                  }}>
                    <XCircle size={18} /> {t('admin.app_reject')}
                  </button>
                </div>
              </div>
            )}

            {selected.status === 'rejected' && selected.rejection_reason && (
              <div style={{ background: '#f7e9e6', borderRadius: 12, padding: 16, borderLeft: '3px solid #b23b2e' }}>
                <div style={{ fontWeight: 600, color: '#b23b2e', fontSize: 13, marginBottom: 4 }}>{t('admin.app_rejection_reason')}</div>
                <div style={{ color: '#991b1b', fontSize: 14 }}>{selected.rejection_reason}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ece7db', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color="#6e756c" />
      </div>
      <div>
        <div style={{ color: '#99a09a', fontSize: 11, fontWeight: 500 }}>{label}</div>
        <div style={{ color: '#0e1f18', fontWeight: 500, marginTop: 1, fontSize: 14 }}>{value}</div>
      </div>
    </div>
  );
}
