import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import api from '../lib/api';
import { UserPlus, CheckCircle, XCircle, Clock, Building, Mail, Phone, Globe, Users, User, X } from 'lucide-react';
import UpgradeModal from '../components/UpgradeModal.jsx';

export default function AdminApplicationsPage() {
  const { t } = useTranslation();
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(t('admin.fmt_locale'), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleString(t('admin.fmt_locale'), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  const STATUS_BADGE = {
    pending: { label: t('admin.app_status_pending'), color: '#f59e0b', bg: '#fffbeb' },
    approved: { label: t('admin.app_status_approved'), color: '#16a34a', bg: '#f0fdf4' },
    rejected: { label: t('admin.app_status_rejected'), color: '#dc2626', bg: '#fef2f2' },
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
        alert(err.message);
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
    } catch (err) { alert(err.message); }
    setProcessing(false);
  };

  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('admin.loading')}</div>;

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
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>{t('admin.applications_title')}</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>
            {pendingCount > 0 ? t(pendingCount > 1 ? 'admin.applications_pending_plural' : 'admin.applications_pending', { count: pendingCount }) : t('admin.applications_none_pending')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3 }}>
          {[{ id: 'pending', label: t('admin.app_filter_pending') }, { id: 'all', label: t('admin.app_filter_all') }, { id: 'approved', label: t('admin.app_filter_approved') }, { id: 'rejected', label: t('admin.app_filter_rejected') }].map(tab => (
            <button key={tab.id} onClick={() => setFilter(tab.id)} style={{
              padding: '8px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              background: filter === tab.id ? '#fff' : 'transparent', color: filter === tab.id ? '#0f172a' : '#64748b',
              boxShadow: filter === tab.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
            }}>{tab.label}</button>
          ))}
        </div>
      </div>

      {applications.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <UserPlus size={40} color="#94a3b8" style={{ marginBottom: 16, opacity: 0.3 }} />
          <p style={{ color: '#94a3b8', fontSize: 15 }}>{t('admin.app_none')}</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {applications.map(app => {
            const badge = STATUS_BADGE[app.status];
            return (
              <div key={app.id} onClick={() => { setSelected(app); setApprovedEmail(null); setRejectReason(''); setCommissionRate(10); }}
                style={{
                  background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', cursor: 'pointer',
                  borderLeft: app.status === 'pending' ? '4px solid #f59e0b' : '4px solid transparent',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--rb-primary, #059669)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 17 }}>{app.company_name}</span>
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: badge.bg, color: badge.color }}>{badge.label}</span>
                    </div>
                    <div style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>
                      {app.contact_name} · {app.email} · {fmtDate(app.created_at)}
                    </div>
                  </div>
                  {app.status === 'pending' && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={(e) => { e.stopPropagation(); setSelected(app); }} style={{
                        padding: '8px 16px', borderRadius: 10, background: '#f0fdf4', border: 'none',
                        color: '#16a34a', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
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
                <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a' }}>{selected.company_name}</h2>
                <p style={{ color: '#64748b', fontSize: 14, marginTop: 4 }}>{t('admin.app_submitted_on', { date: fmtDate(selected.created_at) })}</p>
              </div>
              <button onClick={() => setSelected(null)} style={{ background: '#f1f5f9', border: 'none', width: 38, height: 38, borderRadius: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <X size={18} color="#475569" />
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
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>{t('admin.app_motivation')}</div>
                <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, color: '#334155', fontSize: 14, lineHeight: 1.6, borderLeft: '3px solid var(--rb-primary, #059669)' }}>{selected.motivation}</div>
              </div>
            )}

            {approvedEmail && (
              <div style={{ background: '#f0fdf4', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid #bbf7d0', textAlign: 'center' }}>
                <CheckCircle size={24} color="#16a34a" style={{ marginBottom: 8 }} />
                <div style={{ fontWeight: 700, color: '#16a34a', marginBottom: 4 }}>{t('admin.app_partner_created')}</div>
                <div style={{ color: '#059669', fontSize: 13 }}>{t('admin.app_credentials_sent', { email: selected?.email })}</div>
              </div>
            )}

            {selected.status === 'pending' && !approvedEmail && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 8 }}>{t('admin.app_commission_rate')}</label>
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} min="0" max="50"
                    style={{ width: 120, padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 16, fontWeight: 600, color: '#0f172a', boxSizing: 'border-box' }} />
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={() => handleApprove(selected.id)} disabled={processing} style={{
                    flex: 1, padding: '14px', borderRadius: 12,
                    background: 'var(--rb-primary, #059669)', color: '#fff',
                    border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    opacity: processing ? 0.7 : 1,
                  }}>
                    <CheckCircle size={18} /> {t('admin.app_accept')}
                  </button>
                  <button onClick={() => handleReject(selected.id)} disabled={processing} style={{
                    flex: 1, padding: '14px', borderRadius: 12,
                    background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca',
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
              <div style={{ background: '#fef2f2', borderRadius: 12, padding: 16, borderLeft: '3px solid #dc2626' }}>
                <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 13, marginBottom: 4 }}>{t('admin.app_rejection_reason')}</div>
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
      <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={15} color="#64748b" />
      </div>
      <div>
        <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div>
        <div style={{ color: '#0f172a', fontWeight: 500, marginTop: 1, fontSize: 14 }}>{value}</div>
      </div>
    </div>
  );
}
