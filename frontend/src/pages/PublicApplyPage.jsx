import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { loadThemeBySlug } from '../lib/theme';
import { Send, CheckCircle, Building, User, Mail, Phone, Globe, Users, FileText } from 'lucide-react';

export default function PublicApplyPage() {
  const { t } = useTranslation();

  const { slug } = useParams();
  const [tenant, setTenant] = useState(null);

  const [tenantLoading, setTenantLoading] = useState(true);
  const [tenantNotFound, setTenantNotFound] = useState(false);
  useEffect(() => {
    if (!slug) { setTenantLoading(false); return; }
    loadThemeBySlug(slug).then(t => {
      if (t) setTenant(t);
      else setTenantNotFound(true);
    }).finally(() => setTenantLoading(false));
  }, [slug]);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({
    company_name: '', contact_name: '', email: '', phone: '',
    company_website: '', company_size: '', motivation: '', category_id: '',
  });

  // Fetch partner categories for this tenant so applicants pick a
  // partnership type. The default category is pre-selected so the
  // "required" gate doesn't flag a fresh form.
  useEffect(() => {
    if (!slug) return;
    fetch('/api/partner-categories/public?tenant=' + encodeURIComponent(slug))
      .then(r => r.ok ? r.json() : { categories: [] })
      .then(d => setCategories(d.categories || []))
      .catch(() => {});
  }, [slug]);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const canSubmit = form.company_name && form.contact_name && form.email && form.category_id;

  const handleSubmit = async () => {
    if (!form.category_id) {
      setError(t('partner_category.required'));
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/applications/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, tenant_slug: slug }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      setSubmitted(true);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  if (submitted) {
    return (
      <Page>
        
        <div style={{ textAlign: 'center', maxWidth: 520, margin: '0 auto', padding: '60px 24px' }}>
          <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 28px', boxShadow: '0 8px 30px rgba(34,197,94,0.3)' }}>
            <CheckCircle size={36} color="#fff" />
          </div>
          <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginBottom: 12 }}>{t("publicApply.sent_title")}</h2>
          <p style={{ color: '#94a3b8', fontSize: 17, lineHeight: 1.7, marginBottom: 32 }}>
            {t("publicApply.sent_text")}
          </p>
          <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            {t("publicApply.already")} {t("publicApply.login_link")}
          </a>
        </div>
      </Page>
    );
  }

  // Never render a form branded as someone else's tenant. If the
  // slug lookup is still in flight, show a neutral spinner; if it
  // failed (404 / unknown slug), show an explicit error instead of
  // falling back to a hardcoded brand.
  if (tenantLoading) {
    return (
      <Page>
        <div style={{ color: '#94a3b8', padding: 48 }}>…</div>
      </Page>
    );
  }
  if (tenantNotFound || !tenant) {
    return (
      <Page>
        <div style={{ textAlign: 'center', maxWidth: 420, margin: '0 auto', padding: '60px 24px' }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: 'rgba(239,68,68,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: '#fca5a5', fontSize: 28 }}>⚠</div>
          <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 800, marginBottom: 8 }}>Lien invalide</h2>
          <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6 }}>
            Aucun programme partenaire n'a été trouvé pour ce lien. Vérifiez l'URL auprès de la personne qui vous l'a partagé.
          </p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <div style={{ maxWidth: 560, margin: '0 auto', padding: '40px 24px' }}>
        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt={tenant.name} style={{ height: 44, maxWidth: 160, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--rb-primary, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', boxShadow: '0 0 30px rgba(5,150,105,0.4)' }}>{(tenant.name || '?').charAt(0).toUpperCase()}</div>
              )}
              <span style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{tenant.name}</span>
            </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>{t("publicApply.title")}</h1>
          <p style={{ color: '#94a3b8', fontSize: 15 }}>{t("publicApply.subtitle")}</p>
        <div style={{ display:"flex", justifyContent:"center", marginTop:16, marginBottom:8 }}><LanguageSwitcher dark={true} /></div>
        <p style={{ display:"none" }}></p>
        </div>

        {/* Progress */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 36 }}>
          {[1, 2].map(s => (
            <div key={s} style={{ flex: 1, height: 4, borderRadius: 2, background: s <= step ? 'linear-gradient(90deg,#6366f1,#a855f7)' : 'rgba(255,255,255,0.1)', transition: 'all .3s' }} />
          ))}
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: '12px 16px', color: '#fca5a5', fontSize: 14, marginBottom: 20 }}>{error}</div>
        )}

        <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 20, padding: 32 }}>
          {step === 1 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 24 }}>{t("publicApply.step1")}</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Field icon={Building} label={t("publicApply.field_company")} value={form.company_name} onChange={set('company_name')} placeholder={t("publicApply.company_ph")} />
                <Field icon={User} label={t("publicApply.field_contact")} value={form.contact_name} onChange={set('contact_name')} placeholder={t("publicApply.name_ph")} />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field icon={Mail} label={t("publicApply.field_email")} value={form.email} onChange={set('email')} placeholder={t("publicApply.email_ph")} type="email" />
                  <Field icon={Phone} label={t("publicApply.phone")} value={form.phone} onChange={set('phone')} placeholder={t("partnerSubmit.phone_short_ph")} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field icon={Globe} label={t("publicApply.field_website")} value={form.company_website} onChange={set('company_website')} placeholder="https://..." />
                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t("publicApply.size")}</label>
                    <select value={form.company_size} onChange={set('company_size')} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, color: '#fff', boxSizing: 'border-box', appearance: 'none' }}>
                      <option value="" style={{ background: '#1e293b' }}>{t("publicApply.size_ph")}</option>
                      <option value="1-10" style={{ background: '#1e293b' }}>{t("publicApply.size_1")}</option>
                      <option value="11-50" style={{ background: '#1e293b' }}>{t("publicApply.size_2")}</option>
                      <option value="51-200" style={{ background: '#1e293b' }}>{t("publicApply.size_3")}</option>
                      <option value="200+" style={{ background: '#1e293b' }}>{t("publicApply.size_4")}</option>
                    </select>
                  </div>
                </div>
              </div>
              {categories.length > 0 && (
                <div style={{ marginTop: 24 }}>
                  <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
                    {t('partner_category.select_type')} *
                  </label>
                  <div style={{ position: 'relative' }}>
                    <select
                      required
                      value={form.category_id}
                      onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))}
                      style={{
                        width: '100%', padding: '12px 44px 12px 16px', borderRadius: 12,
                        border: '1px solid rgba(255,255,255,0.12)',
                        background: 'rgba(255,255,255,0.06)',
                        fontSize: 15, color: '#fff', boxSizing: 'border-box',
                        appearance: 'none', fontFamily: 'inherit', cursor: 'pointer',
                      }}
                    >
                      <option value="" disabled style={{ background: '#1e293b' }}>
                        {t('partner_category.select_placeholder')}
                      </option>
                      {categories.map(c => {
                        // Translate any slug that has a matching key;
                        // fall back to the raw DB name otherwise. Works
                        // for the 3 defaults AND any custom slug the
                        // admin ships a translation for (e.g. `client`).
                        const label = c.slug ? t('partner_category.' + c.slug, { defaultValue: c.name || '' }) : (c.name || '');
                        return (
                          <option key={c.id} value={c.id} style={{ background: '#1e293b' }}>{label}</option>
                        );
                      })}
                    </select>
                    {/* Visible down-arrow — appearance:none strips the
                        native one, so add it manually. Pointer-events
                        none so it doesn't steal clicks from the select. */}
                    <span aria-hidden="true" style={{
                      position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                      color: '#94a3b8', fontSize: 12, pointerEvents: 'none',
                    }}>▼</span>
                  </div>
                </div>
              )}
              <button disabled={!canSubmit} onClick={() => setStep(2)} style={{
                marginTop: 28, width: '100%', padding: '14px', borderRadius: 12,
                background: canSubmit ? 'var(--rb-primary, #059669)' : 'rgba(255,255,255,0.06)',
                color: canSubmit ? '#fff' : '#64748b', border: 'none', fontWeight: 600, fontSize: 15,
                cursor: canSubmit ? 'pointer' : 'default', boxShadow: canSubmit ? '0 4px 15px rgba(5,150,105,0.3)' : 'none',
              }}>{t("publicApply.continue")}</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 24 }}>{t("publicApply.why_title")}</h2>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t("publicApply.motivation")}</label>
                <textarea value={form.motivation} onChange={set('motivation')} rows={5}
                  placeholder={t("publicApply.motivation_ph")}
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', color: '#fff', boxSizing: 'border-box' }} />
              </div>

              {/* Recap */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 14 }}>{t("publicApply.step_summary")}</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 14 }}>
                  <RecapRow label={t("publicApply.company")} value={form.company_name} />
                  <RecapRow label="Contact" value={form.contact_name} />
                  <RecapRow label="Email" value={form.email} />
                  <RecapRow label={t("publicApply.phone")} value={form.phone || '—'} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>{t("publicApply.sent_back")}</button>
                <button onClick={handleSubmit} disabled={saving} style={{
                  flex: 2, padding: '14px', borderRadius: 12,
                  background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
                  border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(34,197,94,0.3)', opacity: saving ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Send size={16} /> {saving ? t("publicApply.submitting") : t("publicApply.submit")}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/login" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
            {t("publicApply.already")} ? <span style={{ color: '#818cf8' }}>{t("publicApply.login_link")}</span>
          </a>
        </div>
      </div>
    </Page>
  );
}

function Page({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(168deg, #0a0a0f 0%, #111827 50%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {children}
    </div>
  );
}

function Field({ icon: Icon, label, value, onChange, placeholder, type = 'text' }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        {Icon && <Icon size={16} color="#64748b" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />}
        <input type={type} value={value} onChange={onChange} placeholder={placeholder}
          style={{ width: '100%', padding: `12px ${Icon ? '16px' : '16px'} 12px ${Icon ? '40px' : '16px'}`, borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, color: '#fff', boxSizing: 'border-box' }} />
      </div>
    </div>
  );
}

function RecapRow({ label, value }) {
  return (
    <div>
      <div style={{ color: '#64748b', fontSize: 12 }}>{label}</div>
      <div style={{ color: '#fff', fontWeight: 600 }}>{value}</div>
    </div>
  );
}
