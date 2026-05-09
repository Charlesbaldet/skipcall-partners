import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronRight, X as XIcon } from 'lucide-react';
import api from '../lib/api';

// First-login onboarding popup. Layout decides when to show this
// (admin role + not dismissed + percentage < 100); the component
// only owns its own fetch + render. The same checklist renders as
// a full page at /progression — see ProgressionPage.jsx.
//
// Inline styles only (project convention). Greens match the
// sidebar (#059669 / #10b981 / #f0fdf4).

const C = {
  p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b',
  border: '#e2e8f0', bg: '#fafbfc',
  greenBg: '#f0fdf4', greenBorder: '#bbf7d0',
};

export default function OnboardingChecklist({ onClose }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);

  // Plain <a href> on each step did a full-page reload, so the popup
  // remounted on the destination page and "closed on click" felt
  // inconsistent (it stayed visible whenever Layout re-rendered it
  // there). useNavigate keeps the React tree alive: close the popup
  // synchronously, then SPA-navigate.
  const handleStepClick = (e, link) => {
    e.preventDefault();
    if (!link) return;
    onClose && onClose();
    navigate(link);
  };

  useEffect(() => {
    let cancelled = false;
    api.getOnboardingStatus()
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const handleDismiss = async () => {
    try { await api.dismissOnboarding(); } catch {}
    onClose();
  };

  if (error) {
    // Don't render the modal at all on a fetch failure — better to
    // hide than to show a half-broken popup blocking the dashboard.
    onClose && onClose();
    return null;
  }
  if (!data) return null;

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div style={{
        background: '#fff', borderRadius: 16,
        width: 520, maxWidth: '100%', maxHeight: '90vh',
        overflowY: 'auto',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2 style={{ fontSize: 18, fontWeight: 600, color: C.s, margin: 0 }}>
                {t('onboarding.title', 'Bienvenue sur RefBoost !')}
              </h2>
              <p style={{ fontSize: 13, color: C.m, margin: '4px 0 0' }}>
                {t('onboarding.subtitle', 'Complétez ces étapes pour configurer votre programme partenaires.')}
              </p>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              style={{
                background: 'transparent', border: 'none', color: C.m,
                cursor: 'pointer', padding: 4, display: 'flex',
              }}
            >
              <XIcon size={20} />
            </button>
          </div>

          {/* Progress bar */}
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
              <span style={{ color: C.m }}>
                {data.completedCount}/{data.totalCount} {t('onboarding.completed', 'terminées')}
              </span>
              <span style={{ fontWeight: 600, color: C.p }}>{data.percentage}%</span>
            </div>
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
              <div style={{
                height: '100%', background: C.p,
                width: data.percentage + '%',
                transition: 'width 500ms ease',
              }} />
            </div>
          </div>
        </div>

        {/* Steps */}
        <div style={{ padding: '0 24px 8px' }}>
          {data.steps.map(step => (
            <a
              key={step.id}
              href={step.link}
              onClick={(e) => handleStepClick(e, step.link)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 12,
                padding: 12, borderRadius: 12, marginBottom: 8,
                border: '1px solid ' + (step.completed ? C.greenBorder : C.border),
                background: step.completed ? C.greenBg : '#fff',
                textDecoration: 'none',
              }}
            >
              <div style={{
                width: 24, height: 24, borderRadius: '50%',
                border: '2px solid ' + (step.completed ? C.p : '#cbd5e1'),
                background: step.completed ? C.p : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, marginTop: 2,
              }}>
                {step.completed && <Check size={14} color="#fff" strokeWidth={3} />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                  fontSize: 13, fontWeight: 600,
                  color: step.completed ? '#15803d' : C.s,
                  textDecoration: step.completed ? 'line-through' : 'none',
                }}>
                  {t('onboarding.step_' + step.id, step.id)}
                </div>
                <div style={{ fontSize: 11, color: C.m, marginTop: 2 }}>
                  {t('onboarding.step_' + step.id + '_desc', '')}
                </div>
              </div>
              {!step.completed && (
                <ChevronRight size={16} color="#cbd5e1" style={{ marginTop: 4, flexShrink: 0 }} />
              )}
            </a>
          ))}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 24px 24px', borderTop: '1px solid #f1f5f9' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
            <input
              type="checkbox"
              onChange={handleDismiss}
              style={{ width: 14, height: 14, cursor: 'pointer', accentColor: C.p }}
            />
            <span style={{ fontSize: 12, color: C.m }}>
              {t('onboarding.dont_show_again', 'Ne plus afficher au démarrage')}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}
