import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { Send, CheckCircle, ArrowLeft, ArrowRight } from 'lucide-react';

// Lead temperature — matches the backend CHECK constraint on
// referrals.recommendation_level (hot / warm / cold). These are the
// original Chaud / Tiède / Froid options, not the program tier levels.
const TEMPERATURES = [
  { key: 'hot',  emoji: '', label: 'Chaud',  desc: 'Prêt à signer',         color: '#dc2626', bg: '#fef2f2', border: '#fecaca' },
  { key: 'warm', emoji: '', label: 'Tiède',  desc: 'Intéressé, à relancer', color: '#f59e0b', bg: '#fffbeb', border: '#fde68a' },
  { key: 'cold', emoji: '', label: 'Froid',  desc: 'À qualifier',            color: '#0284c7', bg: '#eff6ff', border: '#bfdbfe' },
];
const tempByKey = Object.fromEntries(TEMPERATURES.map(t => [t.key, t]));

export default function PartnerSubmitPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [tenantName, setTenantName] = useState('');
  const [form, setForm] = useState({
    prospect_name: '', prospect_email: '', prospect_phone: '',
    prospect_company: '', prospect_role: '',
    contact_first_name: '', contact_last_name: '',
    recommendation_level: 'warm', notes: '',
    lead_handling: 'partner_managed',
  });

  // Resolve the program name from the partner's JWT-scoped tenant so
  // we can stop hardcoding "Skipcall" in the subtitle + confirmation.
  useEffect(() => {
    api.getMyTenant()
      .then(d => { const tt = d && (d.tenant || d); if (tt?.name) setTenantName(tt.name); })
      .catch(() => {});
  }, []);

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
      setError(err.message || 'Erreur lors de la soumission');
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
          <h2 style={{ fontSize: 28, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Recommandation envoyée !</h2>
          <p style={{ color: '#64748b', fontSize: 16, lineHeight: 1.6, marginBottom: 32 }}>
            Merci pour votre recommandation. {tenantName ? `L'équipe ${tenantName}` : "L'équipe"} va prendre contact avec le prospect rapidement. Vous serez notifié des mises à jour par email.
          </p>
          <button onClick={() => { setForm({ prospect_name: '', prospect_email: '', prospect_phone: '', prospect_company: '', prospect_role: '', contact_first_name: '', contact_last_name: '', recommendation_level: 'warm', notes: '', lead_handling: 'partner_managed' }); setStep(1); setSubmitted(false); }}
            style={{ padding: '12px 28px', borderRadius: 12, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            <Send size={14} style={{ marginRight: 8, verticalAlign: -2 }} />
            Nouvelle recommandation
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-in" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 4 }}>Nouvelle recommandation</h1>
      <p style={{ color: '#64748b', marginBottom: 32 }}>
        {tenantName ? `Recommandez un prospect à l'équipe ${tenantName}` : 'Recommandez un prospect'}
      </p>

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
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>Informations du prospect</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Deal identification — what shows on the Kanban card and
                what maps to the Notion Transactions Title. "Nom du deal"
                is the header; the actual contact person's name goes in
                the Contact section below. */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Nom du deal / Entreprise *" value={form.prospect_name} onChange={set('prospect_name')} placeholder="Ex: Acme Corp" />
              <Field label="Entreprise *" value={form.prospect_company} onChange={set('prospect_company')} placeholder="Nom de la société" />
            </div>
            {/* Contact person — optional, split into first/last so Notion
                Contacts + HubSpot Contacts can sync a clean
                { firstname, lastname } pair. */}
            <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4, marginTop: 4 }}>Contact</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Prénom" value={form.contact_first_name} onChange={set('contact_first_name')} placeholder="Jean" />
              <Field label="Nom" value={form.contact_last_name} onChange={set('contact_last_name')} placeholder="Dupont" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <Field label="Email *" value={form.prospect_email} onChange={set('prospect_email')} placeholder="email@entreprise.fr" type="email" />
              <Field label="Téléphone" value={form.prospect_phone} onChange={set('prospect_phone')} placeholder="+33 6 ..." />
            </div>
            <Field label="Fonction / Rôle" value={form.prospect_role} onChange={set('prospect_role')} placeholder="Ex: Directeur IT, CEO..." />
          </div>
          <button disabled={!canNext1} onClick={() => setStep(2)} style={{
            marginTop: 32, width: '100%', padding: '14px', borderRadius: 12,
            background: canNext1 ? 'var(--rb-primary, #059669)' : '#e2e8f0',
            color: canNext1 ? '#fff' : '#94a3b8', border: 'none', fontWeight: 600, fontSize: 15,
            cursor: canNext1 ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>Continuer <ArrowRight size={16} /></button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>Niveau & contexte</h2>

          {/* Lead temperature selector (hot / warm / cold) */}
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 10 }}>Température du lead</label>
            <div style={{ display: 'flex', gap: 12 }}>
              {TEMPERATURES.map(tp => {
                const selected = form.recommendation_level === tp.key;
                return (
                  <div key={tp.key} onClick={() => setForm(f => ({ ...f, recommendation_level: tp.key }))} style={{
                    flex: 1, padding: '20px 16px', borderRadius: 16, textAlign: 'center', cursor: 'pointer',
                    border: selected ? `2px solid ${tp.color}` : '2px solid #e2e8f0',
                    background: selected ? tp.bg : '#fff', transition: 'all .2s',
                  }}>
                    <div style={{ fontSize: 28, marginBottom: 8 }}>{tp.emoji}</div>
                    <div style={{ fontWeight: 600, color: tp.color, fontSize: 14 }}>{tp.label}</div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>{tp.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 8 }}>Notes & contexte</label>
            <textarea value={form.notes} onChange={set('notes')} rows={4}
              placeholder="Contexte de la recommandation, besoins identifiés, timing, budget..."
              style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 15, resize: 'vertical', fontFamily: 'inherit', color: '#0f172a', boxSizing: 'border-box' }} />
          </div>

          {/* Lead handling — who drives this lead */}
          <div style={{ marginBottom: 32 }}>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 14, marginBottom: 12 }}>
              {t('referral.lead_handling_label')}
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
              {[
                { value: 'partner_managed', icon: '', title: t('referral.partner_managed'), helper: t('referral.partner_managed_helper') },
                { value: 'client_prospect', icon: '', title: t('referral.client_prospect'), helper: t('referral.client_prospect_helper') },
              ].map(opt => {
                const active = form.lead_handling === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, lead_handling: opt.value }))}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: 12,
                      border: active ? '2px solid #059669' : '2px solid #e2e8f0',
                      background: active ? 'rgba(5,150,105,0.06)' : '#fff',
                      color: '#0f172a',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      transition: 'all .15s',
                    }}
                  >
                    <div style={{ fontSize: 22, marginBottom: 6 }}>{opt.icon}</div>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{opt.title}</div>
                    <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>{opt.helper}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recap */}
          <div style={{ background: '#f8fafc', borderRadius: 16, padding: 24, marginBottom: 28, border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15, marginBottom: 16 }}> Récapitulatif</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 24px', fontSize: 14 }}>
              <RecapRow label="Deal" value={form.prospect_name} />
              <RecapRow label="Entreprise" value={form.prospect_company} />
              <RecapRow label="Contact" value={[form.contact_first_name, form.contact_last_name].filter(Boolean).join(' ') || '—'} />
              <RecapRow label="Email" value={form.prospect_email} />
              <RecapRow label="Téléphone" value={form.prospect_phone || '—'} />
              <RecapRow label="Rôle" value={form.prospect_role || '—'} />
              <RecapRow label="Température" value={`${tempByKey[form.recommendation_level]?.emoji || ''} ${tempByKey[form.recommendation_level]?.label || ''}`.trim()} />
            </div>
          </div>

          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setStep(1)} style={{ flex: 1, padding: '14px', borderRadius: 12, background: '#f1f5f9', color: '#475569', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <ArrowLeft size={16} /> Retour
            </button>
            <button onClick={handleSubmit} disabled={saving} style={{
              flex: 2, padding: '14px', borderRadius: 12,
              background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff',
              border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
              boxShadow: '0 4px 15px rgba(34,197,94,0.3)', opacity: saving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <CheckCircle size={16} /> {saving ? 'Envoi...' : 'Envoyer la recommandation'}
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
