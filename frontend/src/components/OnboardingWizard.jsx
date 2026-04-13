import { useState, useEffect } from 'react';
import { X, Users, UserPlus, Palette, Link2, Sparkles, Rocket, Copy, Check, Store } from 'lucide-react';
import api from '../lib/api';

const C = { p: 'var(--rb-primary, #059669)', pl: 'var(--rb-primary-light, #10b981)', s: '#0f172a', m: '#64748b', a: 'var(--rb-accent, #f97316)' };
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

const STEPS = [
  { id: 'welcome',       icon: Sparkles,  title: 'Bienvenue sur RefBoost 🎉' },
  { id: 'createUser',    icon: Users,     title: 'Crée ton équipe' },
  { id: 'createPartner', icon: UserPlus,  title: 'Invite ton premier partenaire' },
  { id: 'customize',     icon: Palette,   title: 'Personnalise ton espace' },
  { id: 'publicLink',    icon: Link2,     title: 'Ton lien d\'inscription public' },
  { id: 'marketplace',  icon: Store,     title: 'Votre programme sur la marketplace' },
  { id: 'done',          icon: Rocket,    title: 'Tout est prêt 🚀' },
];

export default function OnboardingWizard({ onClose }) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [userForm, setUserForm] = useState({ email: '', full_name: '', role: 'commercial' });
  const [createdUser, setCreatedUser] = useState(null);

  const [partnerForm, setPartnerForm] = useState({ name: '', contact_name: '', email: '', commission_rate: 10 });
  const [createdPartner, setCreatedPartner] = useState(null);

  const [customizeForm, setCustomizeForm] = useState({ name: '', primary_color: C.p, accent_color: C.a, revenue_model: 'MRR' });
  const [customized, setCustomized] = useState(false);
  const [marketplaceForm, setMarketplaceForm] = useState({ sector: '', website: '', icp: '', short_description: '', marketplace_visible: false });
  const setMkt = (k, v) => setMarketplaceForm(f => ({ ...f, [k]: v }));

  const [copied, setCopied] = useState(false);
  const [tenantSlug, setTenantSlug] = useState('');

  useEffect(() => {
    api.getMyTenant().then(d => { if (d && d.tenant) setTenantSlug(d.tenant.slug || ''); }).catch(() => {});
  }, []);

  const goNext = () => { setError(''); if (step < STEPS.length - 1) setStep(step + 1); else handleClose(); };
  const goBack = () => { setError(''); if (step > 0) setStep(step - 1); };
  const handleClose = () => { localStorage.removeItem('refboost_onboarding_pending'); onClose(); };

  const submitUser = async () => {
    if (!userForm.email || !userForm.full_name) { setError('Email et nom requis'); return; }
    setSubmitting(true); setError('');
    try { const r = await api.inviteUser(userForm); setCreatedUser(r); }
    catch (e) { setError(e.message || 'Erreur'); }
    finally { setSubmitting(false); }
  };

  const submitPartner = async () => {
    if (!partnerForm.name || !partnerForm.contact_name || !partnerForm.email) { setError('Tous les champs requis'); return; }
    setSubmitting(true); setError('');
    try { const r = await api.createPartner(partnerForm); setCreatedPartner(r); }
    catch (e) { setError(e.message || 'Erreur'); }
    finally { setSubmitting(false); }
  };

  const submitCustomize = async () => {
    setSubmitting(true); setError('');
    try {
      const payload = {};
      if (customizeForm.name) payload.name = customizeForm.name;
      if (customizeForm.primary_color) payload.primary_color = customizeForm.primary_color;
      if (customizeForm.accent_color) payload.accent_color = customizeForm.accent_color;
      if (customizeForm.revenue_model) payload.revenue_model = customizeForm.revenue_model;
      await api.updateMyTenant(payload);
      setCustomized(true);
      if (typeof window !== 'undefined' && window.__rbLoadTheme) window.__rbLoadTheme();
    } catch (e) { setError(e.message || 'Erreur'); }
    finally { setSubmitting(false); }
  };

  const publicLink = typeof window !== 'undefined' ? window.location.origin + (tenantSlug ? '/r/' + tenantSlug : '/apply') : '';
  const copyLink = () => { navigator.clipboard.writeText(publicLink); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const submitMarketplace = async () => {
    if (marketplaceForm.sector || marketplaceForm.website || marketplaceForm.short_description) {
      try { await api.updateMarketplaceSettings(marketplaceForm); } catch(e) { console.warn('[mkt]', e.message); }
    }
    goNext();
  };

  const cur = STEPS[step];
  const Icon = cur.icon;
  const isLast = step === STEPS.length - 1;
  const canSkip = step > 0 && step < STEPS.length - 1;

  // Determine what the primary button should do
  const primaryAction = () => {
    if (step === 1 && !createdUser) return submitUser();
    if (step === 2 && !createdPartner) return submitPartner();
    if (step === 3 && !customized) return submitCustomize();
    if (step === 5) return submitMarketplace();
    return goNext();
  };

  const primaryLabel = () => {
    if (submitting) return 'En cours...';
    if (step === 1 && !createdUser) return 'Créer l\'utilisateur →';
    if (step === 1 && createdUser) return 'Continuer →';
    if (step === 2 && !createdPartner) return 'Créer le partenaire →';
    if (step === 2 && createdPartner) return 'Continuer →';
    if (step === 3 && !customized) return 'Sauvegarder →';
    if (step === 3 && customized) return 'Continuer →';
    if (isLast) return 'C\'est parti !';
    return 'Continuer →';
  };

  return (
    <div onClick={handleClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 20,
      animation: 'rbFadeIn 0.2s ease-out',
    }}>
      <style>{`@keyframes rbFadeIn{from{opacity:0}to{opacity:1}}@keyframes rbSlideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:none}}`}</style>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 540, background: '#fff', borderRadius: 24, padding: 36,
        boxShadow: '0 30px 80px rgba(15,23,42,0.25)', position: 'relative',
        animation: 'rbSlideUp 0.3s ease-out',
      }}>
        <button onClick={handleClose} aria-label="Fermer" style={{
          position: 'absolute', top: 16, right: 16, width: 32, height: 32, borderRadius: 8,
          background: '#f1f5f9', border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.m,
        }}><X size={16} /></button>

        {/* Progress bar (below the X close button) */}
        <div style={{ display: 'flex', gap: 6, marginTop: 32, marginBottom: 28 }}>
          {STEPS.map((s, i) => (
            <div key={s.id} style={{
              flex: 1, height: 4, borderRadius: 2,
              background: i <= step ? '#059669' : '#e2e8f0',
              transition: 'background 0.3s',
            }} />
          ))}
        </div>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{
            width: 64, height: 64, borderRadius: 18, margin: '0 auto 16px',
            background: '#059669',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 8px 30px rgba(5,150,105,0.3)',
          }}><Icon size={28} color="#fff" /></div>
          <h2 style={{ fontSize: 24, fontWeight: 800, color: C.s, margin: '0 0 8px', letterSpacing: -0.5 }}>{cur.title}</h2>
          <p style={{ color: C.m, fontSize: 14, margin: 0 }}>Étape {step + 1} sur {STEPS.length}</p>
        </div>

        {/* Step body */}
        <div style={{ marginBottom: 24 }}>
          {step === 0 && (
            <div style={{ textAlign: 'center', color: C.m, fontSize: 15, lineHeight: 1.7 }}>
              On va configurer ton espace en quelques étapes : créer ton équipe, inviter un premier partenaire, personnaliser tes couleurs, et récupérer ton lien public d'inscription. Ça prend 3 minutes maximum, et tu peux passer chaque étape si tu veux.
            </div>
          )}

          {step === 1 && !createdUser && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ color: C.m, fontSize: 14, margin: 0 }}>Ajoute un membre de ton équipe (admin ou commercial). Il recevra un email avec ses identifiants.</p>
              <Field label="Email"><Input type="email" value={userForm.email} onChange={v => setUserForm({...userForm, email: v})} placeholder="jean@entreprise.com" /></Field>
              <Field label="Nom complet"><Input value={userForm.full_name} onChange={v => setUserForm({...userForm, full_name: v})} placeholder="Jean Dupont" /></Field>
              <Field label="Rôle">
                <select value={userForm.role} onChange={e => setUserForm({...userForm, role: e.target.value})} style={inputStyle}>
                  <option value="commercial">Commercial</option>
                  <option value="admin">Admin</option>
                </select>
              </Field>
            </div>
          )}
          {step === 1 && createdUser && (
            <SuccessBox text={'Utilisateur créé !'} code={'✓ Identifiants envoyés par email à ' + createdUser.email} />
          )}

          {step === 2 && !createdPartner && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ color: C.m, fontSize: 14, margin: 0 }}>Ajoute un partenaire (apporteur d'affaires). Il aura accès à son propre espace pour soumettre des leads.</p>
              <Field label="Nom de l'entreprise"><Input value={partnerForm.name} onChange={v => setPartnerForm({...partnerForm, name: v})} placeholder="Acme Consulting" /></Field>
              <Field label="Contact (nom complet)"><Input value={partnerForm.contact_name} onChange={v => setPartnerForm({...partnerForm, contact_name: v})} placeholder="Marie Dupont" /></Field>
              <Field label="Email"><Input type="email" value={partnerForm.email} onChange={v => setPartnerForm({...partnerForm, email: v})} placeholder="marie@acme.com" /></Field>
              <Field label="Taux de commission (%)">
                <input type="number" min="0" max="50" value={partnerForm.commission_rate}
                  onChange={e => setPartnerForm({...partnerForm, commission_rate: parseFloat(e.target.value) || 0})}
                  style={inputStyle} />
              </Field>
            </div>
          )}
          {step === 2 && createdPartner && (
            <SuccessBox text={'Partenaire créé !'} code={'✓ Identifiants envoyés par email à ' + createdPartner.email} />
          )}

          {step === 3 && !customized && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <p style={{ color: C.m, fontSize: 14, margin: 0 }}>Adapte les couleurs à ta marque (optionnel — tu pourras changer plus tard dans Paramètres).</p>
              <Field label="Nom de l'entreprise affiché"><Input value={customizeForm.name} onChange={v => setCustomizeForm({...customizeForm, name: v})} placeholder="Ton entreprise" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Couleur principale">
                  <input type="color" value={customizeForm.primary_color}
                    onChange={e => setCustomizeForm({...customizeForm, primary_color: e.target.value})}
                    style={{ ...inputStyle, height: 44, padding: 4 }} />
                </Field>
                <Field label="Couleur d'accent">
                  <input type="color" value={customizeForm.accent_color}
                    onChange={e => setCustomizeForm({...customizeForm, accent_color: e.target.value})}
                    style={{ ...inputStyle, height: 44, padding: 4 }} />
                </Field>
              </div>
              <Field label="Modèle de revenus"><select value={customizeForm.revenue_model} onChange={e => setCustomizeForm({...customizeForm, revenue_model: e.target.value})} style={inputStyle}><option value="MRR">MRR — Revenu mensuel récurrent</option><option value="ARR">ARR — Revenu annuel récurrent</option><option value="CA">CA — Chiffre d'affaires</option><option value="Other">Autre</option></select></Field>
            </div>
          )}
          {step === 3 && customized && (
            <div style={{ textAlign: 'center', padding: 20, background: '#f0fdf4', borderRadius: 12, color: '#166534' }}>
              ✓ Ton espace est personnalisé !
            </div>
          )}

          {step === 4 && (
            <div>
              <p style={{ color: C.m, fontSize: 14, marginTop: 0, marginBottom: 14 }}>Voici le lien à partager avec tes apporteurs d'affaires. Ils pourront s'inscrire eux-mêmes et tu valideras leurs candidatures.</p>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <code style={{ flex: 1, fontSize: 13, color: C.s, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{publicLink}</code>
                <button onClick={copyLink} style={{
                  padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: copied ? '#dcfce7' : '#059669', color: copied ? '#166534' : '#fff',
                  fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  {copied ? <><Check size={14}/> Copié</> : <><Copy size={14}/> Copier</>}
                </button>
              </div>
            </div>
          )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: C.m, fontSize: 14, marginTop: 0 }}>
              Renseignez vos informations pour apparaitre sur la marketplace. Modifiable a tout moment dans Settings.
            </p>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.s, display: 'block', marginBottom: 6 }}>Secteur *</label>
              <select value={marketplaceForm.sector} onChange={e => setMkt('sector', e.target.value)} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }}>
                <option value=''>-- Choisir --</option>
                {['SaaS / Logiciel','Conseil & Services','Finance & Fintech','RH & Recrutement','Marketing & Communication','Immobilier','Commerce','Formation','Juridique','Industrie','Autre'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.s, display: 'block', marginBottom: 6 }}>Site web *</label>
              <input type='url' value={marketplaceForm.website} onChange={e => setMkt('website', e.target.value)} placeholder='https://votre-site.com' style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.s, display: 'block', marginBottom: 6 }}>ICP principal <span style={{ fontWeight: 400, color: C.m }}>(optionnel)</span></label>
              <input value={marketplaceForm.icp} onChange={e => setMkt('icp', e.target.value)} placeholder='Ex: PME, startups B2B...' style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: C.s, display: 'block', marginBottom: 6 }}>Description courte *</label>
              <textarea value={marketplaceForm.short_description} onChange={e => setMkt('short_description', e.target.value)} placeholder='Decrivez votre service en 2-3 phrases...' rows={3} style={{ ...{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 14, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box' }, resize: 'vertical' }} />
            </div>
            <div onClick={() => setMkt('marketplace_visible', !marketplaceForm.marketplace_visible)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: marketplaceForm.marketplace_visible ? '#ecfdf5' : '#f8fafc', border: '1.5px solid ' + (marketplaceForm.marketplace_visible ? '#059669' : '#e2e8f0'), borderRadius: 12, padding: '12px 16px', cursor: 'pointer', transition: 'all .3s' }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 13, color: C.s }}>Apparaitre sur la marketplace</div>
                <div style={{ fontSize: 12, color: C.m }}>{marketplaceForm.marketplace_visible ? 'Actif' : 'Inactif'}</div>
              </div>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: marketplaceForm.marketplace_visible ? '#059669' : '#cbd5e1', position: 'relative', flexShrink: 0 }}>
                <div style={{ position: 'absolute', top: 2, left: marketplaceForm.marketplace_visible ? 20 : 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.2)', transition: 'left .3s' }} />
              </div>
            </div>
          </div>
        )}

          {step === 5 && (
          )}
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: 12, background: '#fef2f2', color: '#b91c1c', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
            {error}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'stretch' }}>
            {step < STEPS.length - 1 && (
              <button onClick={goBack} disabled={submitting || step === 0} style={{
                padding: '14px 18px', borderRadius: 12, border: '1.5px solid #e2e8f0',
                background: '#fff', color: C.m, fontWeight: 600, fontSize: 14,
                cursor: submitting ? 'wait' : 'pointer',
              }}>← Précédent</button>
            )}
            <button onClick={primaryAction} disabled={submitting} style={{
              flex: 1, padding: '14px 24px', borderRadius: 12, border: 'none',
              background: submitting ? '#047857' : '#059669', color: '#fff',
              fontWeight: 700, fontSize: 15, cursor: submitting ? 'wait' : 'pointer',
              boxShadow: submitting ? 'none' : '0 8px 24px rgba(5,150,105,0.3)',
            }}>{primaryLabel()}</button>
          </div>
          {canSkip && (
            <button onClick={goNext} disabled={submitting} style={{
              padding: '12px 18px', borderRadius: 12, border: 'none',
              background: 'transparent', color: C.m, fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}>Passer cette étape</button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0',
  fontSize: 14, fontFamily: 'inherit', outline: 'none', background: '#fafbfc',
  color: '#0f172a', boxSizing: 'border-box',
};

function Field({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#0f172a', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

function Input({ value, onChange, placeholder, type = 'text' }) {
  return <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />;
}

function SuccessBox({ text, code }) {
  return (
    <div style={{ padding: 16, background: '#f0fdf4', borderRadius: 12, border: '1px solid #bbf7d0', textAlign: 'center' }}>
      <div style={{ color: '#166534', fontSize: 14, marginBottom: 8 }}>✓ {text}</div>
      <code style={{ display: 'inline-block', padding: '8px 14px', background: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 700, color: '#0f172a', border: '1px solid #bbf7d0' }}>{code}</code>
    </div>
  );
}
