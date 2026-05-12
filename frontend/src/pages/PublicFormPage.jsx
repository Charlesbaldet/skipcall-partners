import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, Clock, ArrowRight } from 'lucide-react';
import api from '../lib/api';

// Public partner-registration form. Rendered at /f/:formId?p=<token>.
//
// The public page is split into two:
//   - PublicFormPage  (this default export): fetch + error handling +
//     submission wiring.
//   - FormPreview     (named export): pure visual component, also
//     consumed by the builder's preview mode. Takes form + fields +
//     optional onSubmit.
//
// Branding stays neutral RefBoost (green primary, dark slate text)
// regardless of which tenant owns the form — the partner embeds this
// on their own site and isn't trying to look like the underlying
// client.

const C = {
  primary: '#059669',
  dark: '#0f172a',
  muted: '#64748b',
  mutedLight: '#94a3b8',
  border: '#e2e8f0',
  borderLight: '#f1f5f9',
  bg: '#f8fafc',
  danger: '#e24b4a',
  white: '#ffffff',
};

export default function PublicFormPage() {
  const { t } = useTranslation();
  const { formId } = useParams();
  const [search] = useSearchParams();
  const token = search.get('p') || '';
  // ?embed=1 flips two things: the "Propulsé par RefBoost" footer
  // is dropped (partner is integrating, branding stays discreet) and
  // the page posts its document height to the parent window so the
  // embed.js script can resize the iframe to match.
  const embed = search.get('embed') === '1';

  const [state, setState] = useState({ phase: 'loading', payload: null, error: null });

  useEffect(() => {
    if (!formId) { setState({ phase: 'error', error: 'invalid_link' }); return; }
    api.getPublicForm(formId, token)
      .then(data => setState({ phase: 'ok', payload: data, error: null }))
      .catch(err => setState({ phase: 'error', error: err?.data?.error || 'server_error' }));
  }, [formId, token]);

  // Iframe height autosync. Sends { type: 'refboost-resize', height }
  // to window.parent on first paint, then on every ResizeObserver
  // tick so step transitions and field-error messages also reflow.
  // No-op outside embed mode so non-iframed loads don't spam
  // messages into nothing.
  useEffect(() => {
    if (!embed || typeof window === 'undefined') return;
    const post = () => {
      try {
        const h = Math.max(
          document.documentElement.scrollHeight,
          document.body?.scrollHeight || 0
        );
        window.parent && window.parent.postMessage({ type: 'refboost-resize', height: h }, '*');
      } catch {}
    };
    post();
    const ro = new ResizeObserver(post);
    if (document.body) ro.observe(document.body);
    window.addEventListener('load', post);
    return () => { ro.disconnect(); window.removeEventListener('load', post); };
  }, [embed, state.phase, state.payload]);

  const handleSubmit = async (answers, website) => {
    try {
      await api.submitPublicForm(formId, {
        partnerToken: token,
        website,
        answers: Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value })),
      });
      return { ok: true };
    } catch (err) {
      const code = err?.data?.error;
      const message = code === 'rate_limited' ? t('public_form.error_rate_limited', 'Trop de soumissions. Réessayez dans une heure.')
                   : code === 'invalid_link' ? t('public_form.error_invalid_link', 'Lien invalide ou expiré.')
                   : code === 'form_not_available' ? t('public_form.error_not_available', 'Ce formulaire n\'est pas disponible.')
                   : t('public_form.error_submit', 'L\'envoi a échoué. Veuillez réessayer.');
      return { ok: false, message };
    }
  };

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

  return (
    <PageShell embed={embed}>
      <FormPreview form={state.payload.form} fields={state.payload.fields} onSubmit={handleSubmit} t={t} embed={embed} />
    </PageShell>
  );
}

// ─── Page chrome ───────────────────────────────────────────────────
// Gray background with the white card centered vertically + footer
// outside the card. Used by the public route. Builder preview mode
// renders FormPreview directly without this wrapper (the builder
// already has its own page chrome).
function PageShell({ children, embed = false }) {
  // Embed mode: skip the outer gray frame + the "Propulsé par"
  // footer so the partner controls the surrounding chrome on their
  // own page. The iframe height is driven by document height, so a
  // transparent background and zero padding hand control back.
  if (embed) {
    return (
      <div style={{ background: 'transparent', padding: 0 }}>
        <div style={{ width: '100%', maxWidth: 480, margin: '0 auto' }}>
          {children}
        </div>
      </div>
    );
  }
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        {children}
        <div style={{ marginTop: 16, textAlign: 'center', fontSize: 11, color: C.mutedLight }}>
          <span>{t_('Propulsé par')} <span style={{ color: C.muted, fontWeight: 500 }}>RefBoost</span></span>
        </div>
      </div>
    </div>
  );
}
// Locale-agnostic copy fallback used by the footer (i18n is via
// react-i18next inside the components, but PageShell is presentational
// and doesn't take t as a prop).
function t_(s) { return s; }

function CenteredCard({ children }) {
  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '32px 16px', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: C.white, border: '0.5px solid ' + C.border, borderRadius: 16, padding: 32, textAlign: 'center' }}>
        {children}
      </div>
    </div>
  );
}

// ─── FormPreview ───────────────────────────────────────────────────
// Pure visual form. Used both on /f/:id (real submission via the
// onSubmit prop) and inside the builder's preview tab (onSubmit
// omitted → button is a visual no-op and shows a toast-style hint on
// click).
export function FormPreview({ form, fields, onSubmit, t }) {
  const stepCount = form?.step_count || 1;

  const fieldsByStep = useMemo(() => {
    const buckets = Array.from({ length: stepCount }, () => []);
    for (const f of (fields || [])) {
      const idx = Math.max(0, Math.min(stepCount - 1, (f.step || 1) - 1));
      buckets[idx].push(f);
    }
    for (const b of buckets) b.sort((a, b) => a.order_index - b.order_index);
    return buckets;
  }, [fields, stepCount]);

  const [stepIdx, setStepIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [touched, setTouched] = useState({});
  const [website, setWebsite] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [previewToast, setPreviewToast] = useState(false);

  // Reset whenever the underlying form changes (preview tab toggles,
  // builder swaps the active form).
  useEffect(() => {
    setStepIdx(0); setAnswers({}); setTouched({});
    setWebsite(''); setSubmitError(''); setSubmitted(false);
  }, [form?.id]);

  const isPreviewMode = !onSubmit;

  if (submitted) {
    return (
      <Card>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: '#f0fdf4', color: C.primary, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px' }}>
            <Check size={28} />
          </div>
          <h2 style={{ margin: 0, fontSize: 22, color: C.dark, fontWeight: 500 }}>
            {t('public_form.thanks_title', 'Merci !')}
          </h2>
          <p style={{ margin: '10px 0 0', color: C.muted, fontSize: 14, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
            {form.thank_you_message || t('public_form.thanks_default', 'Nous avons bien reçu votre demande. Nous vous recontactons rapidement.')}
          </p>
          {form.appointment_enabled && form.appointment_url && (
            <div style={{ marginTop: 24 }}>
              <iframe
                src={form.appointment_url}
                title="Appointment booking"
                style={{ width: '100%', minHeight: 600, border: 0, borderRadius: 12 }}
                loading="lazy"
              />
            </div>
          )}
        </div>
      </Card>
    );
  }

  const currentFields = fieldsByStep[stepIdx] || [];
  const missingRequired = currentFields.filter(f => {
    if (!f.required) return false;
    const v = answers[f.id];
    return v == null || v === '' || (Array.isArray(v) && v.length === 0);
  });
  const canAdvance = missingRequired.length === 0;
  const isLastStep = stepIdx === stepCount - 1;

  const handleNext = () => {
    if (!canAdvance) {
      setTouched(p => ({ ...p, ...Object.fromEntries(missingRequired.map(f => [f.id, true])) }));
      return;
    }
    setStepIdx(i => Math.min(stepCount - 1, i + 1));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFinalSubmit = async () => {
    if (!canAdvance) {
      setTouched(p => ({ ...p, ...Object.fromEntries(missingRequired.map(f => [f.id, true])) }));
      return;
    }
    if (isPreviewMode) {
      setPreviewToast(true);
      setTimeout(() => setPreviewToast(false), 2000);
      return;
    }
    setSubmitting(true);
    setSubmitError('');
    const res = await onSubmit(answers, website);
    if (res.ok) {
      setSubmitted(true);
    } else {
      setSubmitError(res.message || '');
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <h1 style={{ margin: '0 0 6px', fontSize: 22, fontWeight: 500, color: C.dark, letterSpacing: -0.2 }}>
        {form.title}
      </h1>
      {form.description && (
        <p style={{ margin: '0 0 24px', color: C.muted, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{form.description}</p>
      )}

      <ProgressBar current={stepIdx + 1} total={stepCount} t={t} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 4 }}>
        {currentFields.length === 0 ? (
          <p style={{ color: C.mutedLight, fontSize: 13 }}>
            {t('public_form.no_fields_step', 'Cette étape ne contient aucun champ.')}
          </p>
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

      {/* Honeypot — visually hidden, real users never see it. */}
      <input
        type="text" name="website" value={website} onChange={e => setWebsite(e.target.value)}
        tabIndex={-1} autoComplete="off" aria-hidden="true"
        style={{ position: 'absolute', left: -10000, top: 'auto', width: 1, height: 1, overflow: 'hidden' }}
      />

      {submitError && (
        <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: C.danger, fontSize: 13 }}>
          {submitError}
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <button onClick={isLastStep ? handleFinalSubmit : handleNext}
          disabled={submitting}
          style={{ width: '100%', padding: '12px 16px', borderRadius: 8, background: canAdvance ? C.primary : '#d1d5db', color: C.white, border: 'none', cursor: submitting ? 'wait' : (canAdvance ? 'pointer' : 'not-allowed'), fontWeight: 500, fontSize: 15, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: 'inherit' }}>
          {isLastStep
            ? (submitting ? t('public_form.submitting', 'Envoi…') : t('public_form.submit', 'Envoyer'))
            : <>{t('public_form.next', 'Suivant')} <ArrowRight size={16} /></>
          }
        </button>
        {previewToast && (
          <p style={{ marginTop: 10, fontSize: 12, color: C.mutedLight, textAlign: 'center' }}>
            {t('public_form.preview_toast', 'Mode aperçu — soumission désactivée')}
          </p>
        )}
      </div>
    </Card>
  );
}

function Card({ children }) {
  return (
    <div style={{ background: C.white, border: '0.5px solid ' + C.border, borderRadius: 16, padding: 32, position: 'relative' }}>
      {children}
    </div>
  );
}

function ProgressBar({ current, total, t }) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <div style={{ marginTop: 4, marginBottom: 28 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 12, color: C.muted, fontWeight: 500 }}>
          {t('public_form.step_of', { current, total, defaultValue: 'Étape {{current}} sur {{total}}' })}
        </span>
        <span style={{ fontSize: 12, color: C.mutedLight, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={12} /> {t('public_form.takes_30s_pretty', 'environ 30 secondes')}
        </span>
      </div>
      <div style={{ height: 4, background: C.borderLight, borderRadius: 999, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: pct + '%', background: C.primary, transition: 'width 0.3s ease', borderRadius: 999 }} />
      </div>
    </div>
  );
}

// ─── Field row ─────────────────────────────────────────────────────
function FieldRow({ field, value, touched, onChange, onBlur, t }) {
  const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
  const showError = touched && field.required && isEmpty;

  const inputBase = {
    width: '100%', padding: '10px 14px', borderRadius: 8,
    border: '1px solid ' + (showError ? C.danger : C.border),
    fontSize: 14, color: C.dark, fontFamily: 'inherit',
    boxSizing: 'border-box', outline: 'none', background: C.white,
    transition: 'border-color 0.15s',
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
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid ' + (value === o ? C.primary : C.border), borderRadius: 8, cursor: 'pointer', background: value === o ? '#f0fdf4' : C.white }}>
              <input type="radio" name={field.id} checked={value === o} onChange={() => { onChange(o); onBlur?.(); }} style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: 14, color: C.dark }}>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    case 'multi_select': {
      const arr = Array.isArray(value) ? value : [];
      const toggle = (o) => {
        const next = arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o];
        onChange(next);
      };
      control = (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {(field.options || []).map(o => (
            <label key={o} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: '1px solid ' + (arr.includes(o) ? C.primary : C.border), borderRadius: 8, cursor: 'pointer', background: arr.includes(o) ? '#f0fdf4' : C.white }}>
              <input type="checkbox" checked={arr.includes(o)} onChange={() => { toggle(o); onBlur?.(); }} style={{ cursor: 'pointer' }} />
              <span style={{ fontSize: 14, color: C.dark }}>{o}</span>
            </label>
          ))}
        </div>
      );
      break;
    }
    default:
      control = <p style={{ color: C.mutedLight, fontSize: 12 }}>Unknown field type: {field.type}</p>;
  }

  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 500, color: C.dark, marginBottom: 6 }}>
        {field.label}
        {field.required && <span style={{ color: C.danger, marginLeft: 4 }}>*</span>}
      </label>
      {control}
      {showError && (
        <p style={{ margin: '6px 0 0', fontSize: 12, color: C.danger }}>
          {t('public_form.required_error', 'Ce champ est obligatoire.')}
        </p>
      )}
    </div>
  );
}
