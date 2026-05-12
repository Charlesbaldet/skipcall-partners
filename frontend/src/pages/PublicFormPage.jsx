import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ChevronRight } from 'lucide-react';
import api from '../lib/api';

// Public partner-registration form. Rendered at /f/:formId?p=<token>.
// Branding stays neutral RefBoost (green primary, dark slate text)
// regardless of which tenant owns the form — the partner embeds this
// on their own site and isn't trying to look like the underlying
// client. Multi-step UX follows the brief: progress bar, "Prend 30
// secondes" reassurance kept visible all the way through, per-step
// validation, "Suivant" only (no Back — the brief opts for autosave
// in local state rather than navigation history).

const C = {
  primary: '#059669',
  dark: '#0f172a',
  muted: '#64748b',
  border: '#e2e8f0',
  bg: '#f8fafc',
  danger: '#dc2626',
};

export default function PublicFormPage() {
  const { t } = useTranslation();
  const { formId } = useParams();
  const [search] = useSearchParams();
  const token = search.get('p') || '';

  const [state, setState] = useState({ phase: 'loading', payload: null, error: null });
  const [stepIdx, setStepIdx] = useState(0);     // 0-based; UI shows stepIdx+1 / step_count
  const [answers, setAnswers] = useState({});    // fieldId -> value (string or string[])
  const [touched, setTouched] = useState({});    // fieldId -> bool
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(null); // { thank_you_message, appointmentField } once done
  const [website, setWebsite] = useState('');    // honeypot

  useEffect(() => {
    if (!formId) { setState({ phase: 'error', error: 'invalid_link' }); return; }
    api.getPublicForm(formId, token)
      .then(data => setState({ phase: 'ok', payload: data, error: null }))
      .catch(err => {
        const code = err?.data?.error || 'server_error';
        setState({ phase: 'error', error: code });
      });
  }, [formId, token]);

  // Derive form metadata + fields defensively (payload is null while
  // loading / on error). Done BEFORE any early return so the useMemo
  // below sees a consistent hook count across phase transitions —
  // React error #310 fires the moment a hook is conditionally
  // skipped, which the original draft tripped by placing useMemo
  // after the loading/error returns.
  const payload = state.payload;
  const form = payload?.form || null;
  const fields = payload?.fields || [];
  const stepCount = form?.step_count || 3;

  const fieldsByStep = useMemo(() => {
    const buckets = Array.from({ length: stepCount }, () => []);
    for (const f of fields) {
      const idx = Math.max(0, Math.min(stepCount - 1, (f.step || 1) - 1));
      buckets[idx].push(f);
    }
    for (const b of buckets) b.sort((a, b) => a.order_index - b.order_index);
    return buckets;
  }, [fields, stepCount]);

  // ─── Loading / error screens ─────────────────────────────────────
  if (state.phase === 'loading') {
    return <CenteredCard><p style={{ color: C.muted }}>{t('public_form.loading', 'Chargement…')}</p></CenteredCard>;
  }
  if (state.phase === 'error') {
    const msg = state.error === 'invalid_link'    ? t('public_form.error_invalid_link', 'Lien invalide ou expiré.')
             : state.error === 'form_not_available' ? t('public_form.error_not_available', 'Ce formulaire n\'est pas disponible.')
             : state.error === 'form_not_found'  ? t('public_form.error_not_found', 'Ce formulaire est introuvable.')
             : t('public_form.error_generic', 'Une erreur est survenue.');
    return (
      <CenteredCard>
        <div style={{ width: 48, height: 48, borderRadius: 12, background: '#fef2f2', color: C.danger, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <AlertTriangle size={24} />
        </div>
        <h2 style={{ margin: '0 0 8px', fontSize: 20, color: C.dark }}>{t('public_form.error_title', 'Oups')}</h2>
        <p style={{ color: C.muted, fontSize: 14 }}>{msg}</p>
      </CenteredCard>
    );
  }

  // ─── Thank-you screen ────────────────────────────────────────────
  if (submitted) {
    return (
      <ShellChrome>
        <div style={{ textAlign: 'center', padding: '8px 0 16px' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#f0fdf4', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Check size={28} />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, color: C.dark, fontWeight: 800 }}>
            {t('public_form.thanks_title', 'Merci !')}
          </h2>
          <p style={{ margin: '10px 0 24px', color: C.muted, fontSize: 14, whiteSpace: 'pre-wrap' }}>
            {submitted.thank_you_message || t('public_form.thanks_default', 'Nous avons bien reçu votre demande. Nous vous recontactons rapidement.')}
          </p>
          {submitted.appointmentField && (
            <div style={{ marginTop: 24 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: C.dark, marginBottom: 8 }}>
                {submitted.appointmentField.label}
              </h3>
              <iframe
                src={submitted.appointmentField.config?.appointment_url}
                title="Appointment booking"
                style={{ width: '100%', minHeight: 640, border: '1px solid ' + C.border, borderRadius: 12 }}
                loading="lazy"
              />
            </div>
          )}
        </div>
      </ShellChrome>
    );
  }

  // ─── Step validation ─────────────────────────────────────────────
  const currentFields = fieldsByStep[stepIdx] || [];
  const missingRequired = currentFields.filter(f => {
    if (!f.required) return false;
    if (f.type === 'appointment') return false;
    const v = answers[f.id];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  const canAdvance = missingRequired.length === 0;
  const isLastStep = stepIdx === stepCount - 1;

  const handleNext = () => {
    if (!canAdvance) {
      // Mark every required field as touched so error messages show.
      setTouched(prev => ({
        ...prev,
        ...Object.fromEntries(missingRequired.map(f => [f.id, true])),
      }));
      return;
    }
    setStepIdx(i => Math.min(stepCount - 1, i + 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!canAdvance) {
      setTouched(prev => ({
        ...prev,
        ...Object.fromEntries(missingRequired.map(f => [f.id, true])),
      }));
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        partnerToken: token,
        website,
        answers: Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value })),
      };
      await api.submitPublicForm(formId, payload);
      // Find the first appointment field across the whole form so we
      // can render the booking iframe on the confirmation screen.
      const appointmentField = fields.find(f => f.type === 'appointment') || null;
      setSubmitted({
        thank_you_message: form.thank_you_message,
        appointmentField,
      });
    } catch (err) {
      const code = err?.data?.error;
      const msg = code === 'rate_limited' ? t('public_form.error_rate_limited', 'Trop de soumissions. Réessayez dans une heure.')
               : code === 'invalid_link' ? t('public_form.error_invalid_link', 'Lien invalide ou expiré.')
               : code === 'form_not_available' ? t('public_form.error_not_available', 'Ce formulaire n\'est pas disponible.')
               : t('public_form.error_submit', 'L\'envoi a échoué. Veuillez réessayer.');
      setState(s => ({ ...s, error: msg }));
      setSubmitting(false);
    }
  };

  return (
    <ShellChrome>
      <ProgressBar current={stepIdx + 1} total={stepCount} t={t} />

      <h1 style={{ margin: '0 0 6px', fontSize: 24, fontWeight: 800, color: C.dark, letterSpacing: -0.3 }}>
        {form.title}
      </h1>
      {form.description && (
        <p style={{ margin: '0 0 24px', color: C.muted, fontSize: 14, whiteSpace: 'pre-wrap' }}>{form.description}</p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {currentFields.length === 0 ? (
          <p style={{ color: C.muted, fontSize: 13 }}>{t('public_form.no_fields_step', 'Cette étape ne contient aucun champ.')}</p>
        ) : currentFields.map(f => (
          <FieldRow
            key={f.id}
            field={f}
            value={answers[f.id]}
            touched={!!touched[f.id]}
            onChange={(val) => setAnswers(a => ({ ...a, [f.id]: val }))}
            onBlur={() => setTouched(p => ({ ...p, [f.id]: true }))}
            t={t}
          />
        ))}
      </div>

      {/* Honeypot — visually hidden but accessible to bots. Real
          users never see/fill it; if it gets a value the BE silently
          200s without creating a referral. */}
      <input
        type="text"
        name="website"
        value={website}
        onChange={e => setWebsite(e.target.value)}
        tabIndex={-1}
        autoComplete="off"
        aria-hidden="true"
        style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
      />

      {state.error && typeof state.error === 'string' && (
        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: C.danger, fontSize: 13 }}>
          {state.error}
        </div>
      )}

      <div style={{ marginTop: 28, display: 'flex', justifyContent: 'flex-end' }}>
        {isLastStep ? (
          <button onClick={handleSubmit} disabled={submitting || !canAdvance}
            style={{ padding: '12px 24px', borderRadius: 12, background: canAdvance ? C.primary : C.border, color: canAdvance ? '#fff' : C.muted, border: 'none', cursor: canAdvance && !submitting ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {submitting ? t('public_form.submitting', 'Envoi…') : t('public_form.submit', 'Envoyer')}
          </button>
        ) : (
          <button onClick={handleNext} disabled={!canAdvance}
            style={{ padding: '12px 24px', borderRadius: 12, background: canAdvance ? C.primary : C.border, color: canAdvance ? '#fff' : C.muted, border: 'none', cursor: canAdvance ? 'pointer' : 'not-allowed', fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {t('public_form.next', 'Suivant')} <ChevronRight size={16} />
          </button>
        )}
      </div>
    </ShellChrome>
  );
}

// ─── Chrome wrappers ───────────────────────────────────────────────
function ShellChrome({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 20px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 640, background: '#fff', borderRadius: 16, padding: '32px 28px', boxShadow: '0 1px 3px rgba(15,23,42,0.06), 0 8px 32px rgba(15,23,42,0.04)' }}>
        {children}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: '1px solid ' + C.border, textAlign: 'center', fontSize: 11, color: C.muted }}>
          <a href="https://refboost.io" target="_blank" rel="noopener" style={{ color: C.muted, textDecoration: 'none' }}>
            Propulsé par <span style={{ color: C.primary, fontWeight: 700 }}>RefBoost</span>
          </a>
        </div>
      </div>
    </div>
  );
}

function CenteredCard({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 20px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 16, padding: '32px 28px', textAlign: 'center', boxShadow: '0 1px 3px rgba(15,23,42,0.06)' }}>
        {children}
      </div>
    </div>
  );
}

function ProgressBar({ current, total, t }) {
  const pct = Math.round((current / total) * 100);
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 600 }}>
          {t('public_form.step_label', 'Étape')} {current}/{total}
        </span>
        <span style={{ fontSize: 11, color: C.primary, fontWeight: 700 }}>
          {t('public_form.takes_30s', 'Prend 30 secondes')}
        </span>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: C.primary, transition: 'width 0.3s ease' }} />
      </div>
    </div>
  );
}

// ─── Field row ─────────────────────────────────────────────────────
function FieldRow({ field, value, touched, onChange, onBlur, t }) {
  const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  const showError = touched && field.required && isEmpty && field.type !== 'appointment';

  const labelEl = (
    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: C.dark, marginBottom: 6 }}>
      {field.label}
      {field.required && <span style={{ color: C.danger, marginLeft: 4 }}>*</span>}
    </label>
  );

  const inputBase = {
    width: '100%', padding: '11px 14px', borderRadius: 10,
    border: '1.5px solid ' + (showError ? C.danger : C.border),
    fontSize: 14, color: C.dark, fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none', background: '#fff',
  };
  const onFocus = (e) => { e.target.style.borderColor = C.primary; };
  const onBlurFocus = (e) => { e.target.style.borderColor = showError ? C.danger : C.border; if (onBlur) onBlur(); };

  let control = null;
  switch (field.type) {
    case 'text_short':
    case 'email':
    case 'phone':
    case 'number':
      control = (
        <input
          type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : field.type === 'number' ? 'number' : 'text'}
          value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          onFocus={onFocus} onBlur={onBlurFocus}
          style={inputBase}
        />
      );
      break;
    case 'text_long':
      control = (
        <textarea rows={4} value={value || ''} onChange={e => onChange(e.target.value)}
          placeholder={field.placeholder || ''}
          onFocus={onFocus} onBlur={onBlurFocus}
          style={{ ...inputBase, resize: 'vertical' }} />
      );
      break;
    case 'date':
      control = (
        <input type="date" value={value || ''} onChange={e => onChange(e.target.value)}
          onFocus={onFocus} onBlur={onBlurFocus} style={inputBase} />
      );
      break;
    case 'dropdown':
      control = (
        <select value={value || ''} onChange={e => onChange(e.target.value)}
          onFocus={onFocus} onBlur={onBlurFocus} style={inputBase}>
          <option value="">{t('public_form.choose', 'Choisir…')}</option>
          {(field.options || []).map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
      break;
    case 'radio':
      control = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(field.options || []).map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid ' + (value === o ? C.primary : C.border), borderRadius: 10, cursor: 'pointer', background: value === o ? '#f0fdf4' : '#fff' }}>
              <input type="radio" name={field.id} checked={value === o} onChange={() => { onChange(o); onBlur?.(); }} style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: 14, color: C.dark }}>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    case 'multi_select':
      const arr = Array.isArray(value) ? value : [];
      const toggle = (o) => {
        const next = arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o];
        onChange(next);
      };
      control = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(field.options || []).map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1.5px solid ' + (arr.includes(o) ? C.primary : C.border), borderRadius: 10, cursor: 'pointer', background: arr.includes(o) ? '#f0fdf4' : '#fff' }}>
              <input type="checkbox" checked={arr.includes(o)} onChange={() => { toggle(o); onBlur?.(); }} style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: 14, color: C.dark }}>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    case 'appointment':
      // Render the booking iframe inline. We don't capture an answer
      // (the prospect books directly on Calendly/Google's side); the
      // BE skips this field type in mapping + required checks.
      control = (
        <iframe
          src={field.config?.appointment_url}
          title={field.label || 'Appointment booking'}
          style={{ width: '100%', minHeight: 560, border: '1px solid ' + C.border, borderRadius: 12 }}
          loading="lazy"
        />
      );
      break;
    default:
      control = <p style={{ color: C.muted, fontSize: 12 }}>Unknown field type: {field.type}</p>;
  }

  return (
    <div>
      {labelEl}
      {control}
      {showError && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.danger }}>
          {t('public_form.required_error', 'Ce champ est obligatoire.')}
        </p>
      )}
    </div>
  );
}
