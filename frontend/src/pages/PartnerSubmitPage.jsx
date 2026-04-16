import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { LEVEL_CONFIG } from '../lib/constants';
import { Send, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react';

export default function PartnerSubmitPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    prospect_name: '', prospect_email: '', prospect_phone: '',
    prospect_company: '', prospect_role: '', recommendation_level: 'warm', notes: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const canNext1 = form.prospect_name && form.prospect_email && form.prospect_company;

  const handleSubmit = async () => {
    setSaving(true);
    setError('');
    try {
      await api.createReferral({
        ...form,
        partner_id: user.partnerId || user.partner_id,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err.message || t('partnerSubmit.submission_error'));
    }
    setSaving(false);
  };

  if (submitted) {
    return (
      <div className="fade-in" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 500 }}>
        <div style={{ textAlign: 'center', maxWidth: 480 }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px', boxShadow: '0 8px 30px rgba(34,197,94,0.3)' }}>
            <CheckCircle size={36} color="#fff" />
          </div>
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>{t('partnerSubmit.sent_title')}</h2>
          <p style={{ color: '#64748b', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
            {t('partnerSubmit.sent_text_long')}
          </p>
          <button onClick={() => { setForm({ prospect_name: '', prospect_email: '', prospect_phone: '', prospect_company: '', prospect_role: '', recommendation_level: 'warm', notes: '' }); setStep(1); setSubmitted(false); }}
            style={{ padding: '12px 28px', borderRadius: 12, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            <Send size={14} style={{ marginRight: 8, verticalAlign: -2 }} />
            {t('partnerSubmit.new_recommend')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>{t('partnerSubmit.title')}</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>{t('partnerSubmit.subtitle')}</p>

      {/* Progress */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
        {[1, 2].map(s => (
          <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? 'linear-gradient(90deg,#6366f1,#8b5cf6)' : '#e2e8f0', transition: 'all .3s' }} />
        ))}
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 12, padding: '12px 16px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>{error}</div>
      )}

      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>{t('partnerSubmit.prospect_info')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label={t('partnerSubmit.contact_name')} value={form.prospect_name} onChange={set('prospect_name')} placeholder={t('partnerSubmit.name_ph')} />
              <Field label={t('partnerSubmit.company_required')} value={form.prospect_company} onChange={set('prospect_company')} placeholder={t('partnerSubmit.company_short_ph')} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label={t('partnerSubmit.email_required')} value={form.prospect_email} onChange={set('prospect_email')} placeholder={t('partnerSubmit.email_ph')} type="email" />
              <Field label={t('partnerSubmit.phone')} value={form.prospect_phone} onChange={set('prospect_phone')} placeholder={t('partnerSubmit.phone_short_ph')} />
            </div>
            <Field label={t('partnerSubmit.role_function')} value={form.prospect_role} onChange={set('prospect_role')} placeholder={t('partnerSubmit.role_ph')} />
          </div>
          <button disabled={!canNext1} onClick={() => setStep(2)} style={{
            marginTop: 32, width: '100%', padding: '14px', borderRadius: 12,
            background: canNext1 ? 'var(--rb-primary, #059669)' : '#e2e8f0',
            color: canNext1 ? '#fff' : '#94a3b8', border: 'none', fontWeight: 600, fontSize: 15,
            cursor: canNext1 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('partnerSubmit.continue_short')} <ArrowRight size={16} /></button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>{t('partnerSubmit.level_context')}</h2>

          {/* Level selector */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 10 }}>{t('partnerSubmit.level_label')}</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {Object.entries(LEVEL_CONFIG).map(([k, v]) => (
                <div key={k} onClick={() => setForm(f => ({ ...f, recommendation_level: k }))} style={{
                  flex: 1, padding: '20px 16px', borderRadius: 16, textAlign: 'center', cursor: 'pointer',
                  border: form.recommendation_level === k ? `2px solid ${v.color}` : '2px solid #e2e8f0',
                  background: form.recommendation_level === k ? v.bg : '#fff', transition: 'all .2s',
                }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>{v.label.split(' ')[0]}</div>
                  <div style={{ fontWeight: 600, color: v.color, fontSize: 14 }}>{v.label.split(' ')[1]}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 8 }}>{t('partnerSubmit.notes_label')}</label>
            <textarea value={form.notes} onChange={set('notes')} rows={4}
              placeholder={t('partnerSubmit.notes_ph_long')}
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', color: '#0f172a', boxSizing: 'border-box' }} />
          </div>

          {/* Recap */}
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 24, marginBottom: 28, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, marginBottom: 16 }}>📋 {t('partnerSubmit.recap_title')}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 14 }}>
              <RecapRow label={t('partnerSubmit.recap_contact')} value={form.prospect_name} />
              <RecapRow label={t('partnerSubmit.company')} value={form.prospect_company} />
              <RecapRow label={t('partnerSubmit.email')} value={form.prospect_email} />
              <RecapRow label={t('partnerSubmit.phone')} value={form.prospect_phone || '—'} />
              <RecapRow label={t('partnerSubmit.role')} value={form.prospect_role || '—'} />
              <RecapRow label={t('partnerSubmit.recap_level')} value={LEVEL_CONFIG[form.recommendation_level]?.label} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', borderRadius: 12, background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ArrowLeft size={16} /> {t('partnerSubmit.back_short')}
            </button>
            <button onClick={handleSubmit} disabled={saving} style={{
              flex: 2, padding: '14px', borderRadius: 12,
              background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
              border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(34,197,94,0.3)', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <CheckCircle size={16} /> {saving ? t('partnerSubmit.submitting') : t('partnerSubmit.submit_recommendation')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 8 }}>{label}</label>
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 15, fontFamily: 'inherit', color: '#0f172a', boxSizing: 'border-box' }} />
    </div>
  );
}

function RecapRow({ label, value }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 600 }}>{value}</div>
    </div>
  );
}
