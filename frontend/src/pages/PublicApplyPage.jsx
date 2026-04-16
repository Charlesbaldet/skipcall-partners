import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { loadThemeBySlug } from '../lib/theme';
import { Send, CheckCircle, Building, User, Mail, Phone, Globe, Users, FileText } from 'lucide-react';

export default function PublicApplyPage() {
  const { slug } = useParams();
  const [tenant, setTenant] = useState(null);

  useEffect(() => {
    if (slug) {
      loadThemeBySlug(slug).then(t => {
        if (t) setTenant(t);
      });
    }
  }, [slug]);
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    company_name: '', contact_name: '', email: '', phone: '',
    company_website: '', company_size: '', motivation: '',
  });

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));
  const canSubmit = form.company_name && form.contact_name && form.email;

  const handleSubmit = async () => {
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
          <h2 style={{ fontSize: 30, fontWeight: 800, color: '#fff', marginBottom: 12 }}>Candidature envoyée !</h2>
          <p style={{ color: '#94a3b8', fontSize: 17, lineHeight: 1.7, marginBottom: 32 }}>
            Merci pour votre intérêt. Notre équipe va examiner votre candidature et vous recevrez un email de confirmation dans les 48 heures.
          </p>
          <a href="/login" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 28px', borderRadius: 12, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontWeight: 600, fontSize: 15, textDecoration: 'none' }}>
            Déjà partenaire ? Se connecter
          </a>
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
              {tenant?.logo_url ? (
                <img src={tenant.logo_url} alt="Logo" style={{ height: 44, maxWidth: 160, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--rb-primary, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', boxShadow: '0 0 30px rgba(5,150,105,0.4)' }}>{(tenant?.name || 'S').charAt(0).toUpperCase()}</div>
              )}
              <span style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>{tenant?.name || 'Skipcall'}</span>
            </div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#fff', marginBottom: 8 }}>Devenir partenaire</h1>
          <p style={{ color: '#94a3b8', fontSize: 15 }}>Rejoignez notre programme et générez des revenus récurrents</p>
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
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 24 }}>Vos informations</h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <Field icon={Building} label="Nom de la société *" value={form.company_name} onChange={set('company_name')} placeholder="Ex: TechConseil SAS" />
                <Field icon={User} label="Votre nom *" value={form.contact_name} onChange={set('contact_name')} placeholder="Prénom Nom" />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field icon={Mail} label="Email *" value={form.email} onChange={set('email')} placeholder="vous@entreprise.com" type="email" />
                  <Field icon={Phone} label="Téléphone" value={form.phone} onChange={set('phone')} placeholder="+33 6 ..." />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <Field icon={Globe} label="Site web" value={form.company_website} onChange={set('company_website')} placeholder="https://..." />
                  <div>
                    <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Taille de l'entreprise</label>
                    <select value={form.company_size} onChange={set('company_size')} style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, color: '#fff', boxSizing: 'border-box', appearance: 'none' }}>
                      <option value="" style={{ background: '#1e293b' }}>Sélectionner</option>
                      <option value="1-10" style={{ background: '#1e293b' }}>1-10 employés</option>
                      <option value="11-50" style={{ background: '#1e293b' }}>11-50 employés</option>
                      <option value="51-200" style={{ background: '#1e293b' }}>51-200 employés</option>
                      <option value="200+" style={{ background: '#1e293b' }}>200+ employés</option>
                    </select>
                  </div>
                </div>
              </div>
              <button disabled={!canSubmit} onClick={() => setStep(2)} style={{
                marginTop: 28, width: '100%', padding: '14px', borderRadius: 12,
                background: canSubmit ? 'var(--rb-primary, #059669)' : 'rgba(255,255,255,0.06)',
                color: canSubmit ? '#fff' : '#64748b', border: 'none', fontWeight: 600, fontSize: 15,
                cursor: canSubmit ? 'pointer' : 'default', boxShadow: canSubmit ? '0 4px 15px rgba(5,150,105,0.3)' : 'none',
              }}>Continuer</button>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 24 }}>Pourquoi devenir partenaire ?</h2>
              <div style={{ marginBottom: 24 }}>
                <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Parlez-nous de votre activité et de votre motivation</label>
                <textarea value={form.motivation} onChange={set('motivation')} rows={5}
                  placeholder="Décrivez votre activité, votre réseau de clients, et ce qui vous motive à rejoindre notre programme partenaires..."
                  style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', color: '#fff', boxSizing: 'border-box' }} />
              </div>

              {/* Recap */}
              <div style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 14, padding: 20, marginBottom: 24, border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ fontWeight: 700, color: '#fff', fontSize: 14, marginBottom: 14 }}>Récapitulatif</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px 24px', fontSize: 14 }}>
                  <RecapRow label="Société" value={form.company_name} />
                  <RecapRow label="Contact" value={form.contact_name} />
                  <RecapRow label="Email" value={form.email} />
                  <RecapRow label="Téléphone" value={form.phone || '—'} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12 }}>
                <button onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#94a3b8', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>Retour</button>
                <button onClick={handleSubmit} disabled={saving} style={{
                  flex: 2, padding: '14px', borderRadius: 12,
                  background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
                  border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
                  boxShadow: '0 4px 15px rgba(34,197,94,0.3)', opacity: saving ? 0.7 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}>
                  <Send size={16} /> {saving ? 'Envoi...' : 'Envoyer ma candidature'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ textAlign: 'center', marginTop: 24 }}>
          <a href="/login" style={{ color: '#64748b', fontSize: 14, textDecoration: 'none' }}>
            Déjà partenaire ? <span style={{ color: '#818cf8' }}>Se connecter</span>
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
