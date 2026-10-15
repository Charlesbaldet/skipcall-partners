import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle, Send, AlertTriangle } from 'lucide-react';
import { showToast } from '../components/Dialogs.jsx';

export default function PublicTrackingPage() {
  const { t } = useTranslation();
  const { code } = useParams();
  const [partner, setPartner] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitted, setSubmitted] = useState(false);
  const [sending, setSending] = useState(false);
  const [form, setForm] = useState({
    prospect_name: '', prospect_email: '', prospect_phone: '',
    prospect_company: '', prospect_role: '', notes: '',
  });

  useEffect(() => {
    fetch(`/api/track/${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.partner) {
          setPartner(d.partner);
          // Unification: if the tenant has the new referral-links
          // feature enabled, redirect to the canonical /r/:slug flow
          // so /ref/:code old links don't diverge from the rest of
          // the app. Falls through to the legacy in-app submission
          // form when the feature is off.
          const slug = d.partner.tenant_slug || d.tenant_slug;
          const featureOn = d.feature_referral_links || d.partner.feature_referral_links;
          if (featureOn && slug) {
            window.location.replace(`/r/${encodeURIComponent(slug)}?ref=${encodeURIComponent(code)}`);
            return;
          }
        } else {
          setError(t('publicTracking.invalid_link'));
        }
      })
      .catch(() => setError(t('publicTracking.connection_error')))
      .finally(() => setLoading(false));
  }, [code]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.prospect_name || !form.prospect_email) return;
    setSending(true);
    try {
      const res = await fetch(`/api/track/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (res.ok) { setSubmitted(true); } else { showToast.error(data.error || t('common.error')); }
    } catch { showToast.error(t('publicTracking.connection_error')); }
    setSending(false);
  };

  const inputStyle = { width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #ded8cb', fontSize: 15, boxSizing: 'border-box', transition: 'border 0.2s' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#2b3a32', fontSize: 14, marginBottom: 6 };

  if (loading) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f2e9' }}><div style={{ color: '#99a09a' }}>{t('publicTracking.loading')}</div></div>;

  if (error) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f2e9' }}>
      <div style={{ textAlign: 'center' }}>
        <AlertTriangle size={48} color="#b4791f" />
        <h2 style={{ color: '#0e1f18', marginTop: 16 }}>{error}</h2>
        <p style={{ color: '#6e756c' }}>{t('publicTracking.invalid')}</p>
      </div>
    </div>
  );

  if (submitted) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f6f2e9' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }} className="fade-in">
        <div style={{ width: 80, height: 80, borderRadius: '50%', background: '#e9f1ea', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={40} color="#157a4c" />
        </div>
        <h2 style={{ color: '#0e1f18', fontSize: 24, fontWeight: 800, marginBottom: 8 }}>{t('publicTracking.thanks_short')}</h2>
        <p style={{ color: '#6e756c', lineHeight: 1.6 }}>{t('publicTracking.contact_soon_prefix')} <strong>{partner.name}</strong> {t('publicTracking.contact_soon_suffix')}</p>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0e1f18 0%, #1a2c24 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#fff', borderRadius: 28, maxWidth: 520, width: '100%', padding: 40, boxShadow: '0 25px 80px rgba(0,0,0,0.3)' }} className="fade-in">
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--rb-primary, #0e7a54)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', boxShadow: '0 0 30px rgba(5,150,105,0.3)' }}>
            <span style={{ color: '#fff', fontWeight: 800, fontSize: 22 }}>S</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0e1f18', marginBottom: 6 }}>{t('publicTracking.recommended_by')} {partner.name}</h1>
          <p style={{ color: '#6e756c', fontSize: 15 }}>{t('publicTracking.form_intro')}</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('publicTracking.field_name')}</label>
              <input value={form.prospect_name} onChange={e => setForm(f => ({ ...f, prospect_name: e.target.value }))} placeholder={t('publicTracking.name_ph')} required style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t('publicTracking.field_email')}</label>
              <input type="email" value={form.prospect_email} onChange={e => setForm(f => ({ ...f, prospect_email: e.target.value }))} placeholder={t('publicTracking.email_ph')} required style={inputStyle} />
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={labelStyle}>{t('publicTracking.phone')}</label>
              <input value={form.prospect_phone} onChange={e => setForm(f => ({ ...f, prospect_phone: e.target.value }))} placeholder={t('publicTracking.phone_ph')} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>{t('publicTracking.company')}</label>
              <input value={form.prospect_company} onChange={e => setForm(f => ({ ...f, prospect_company: e.target.value }))} placeholder={t('publicTracking.company_name_ph')} style={inputStyle} />
            </div>
          </div>
          <div>
            <label style={labelStyle}>{t('publicTracking.role_long')}</label>
            <input value={form.prospect_role} onChange={e => setForm(f => ({ ...f, prospect_role: e.target.value }))} placeholder={t('publicTracking.role_long_ph')} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('publicTracking.message')}</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder={t('publicTracking.message_ph_long')} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          <button type="submit" disabled={sending || !form.prospect_name || !form.prospect_email} style={{
            padding: '14px', borderRadius: 14, fontSize: 16, fontWeight: 700, border: 'none', cursor: 'pointer',
            background: 'var(--rb-primary, #0e7a54)', color: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            opacity: sending ? 0.7 : 1, boxShadow: '0 4px 20px rgba(5,150,105,0.3)',
          }}>
            <Send size={18} /> {sending ? t('publicTracking.submitting') : t('publicTracking.submit_request')}
          </button>
        </form>

        <p style={{ textAlign: 'center', color: '#99a09a', fontSize: 12, marginTop: 20 }}>
          {t('publicTracking.powered_by')} <strong style={{ color: 'var(--rb-primary, #0e7a54)' }}>Skipcall</strong>
        </p>
      </div>
    </div>
  );
}
