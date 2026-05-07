import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, CheckCircle2 } from 'lucide-react';
import api from '../lib/api';

// Full-page version of the onboarding checklist. Same data shape
// as the popup (OnboardingChecklist.jsx) — same /api/onboarding/
// status endpoint — but shown inline as a normal page so the admin
// can return to it anytime via the sidebar's "Progression" entry.

const C = {
  p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b',
  border: '#e2e8f0', bg: '#fafbfc',
  greenBg: '#f0fdf4', greenBorder: '#bbf7d0',
};

export default function ProgressionPage() {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getOnboardingStatus()
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: 32, color: C.m, fontSize: 14 }}>{t('common.loading', 'Chargement…')}</div>;
  if (!data) return <div style={{ padding: 32, color: C.m, fontSize: 14 }}>{t('common.error', 'Erreur')}</div>;

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '32px 24px 64px' }}>
      <h1 style={{ fontSize: 24, fontWeight: 600, color: C.s, margin: 0 }}>
        {t('onboarding.page_title', 'Configuration de votre programme')}
      </h1>
      <p style={{ fontSize: 14, color: C.m, margin: '6px 0 32px' }}>
        {t('onboarding.page_subtitle', 'Suivez ces étapes pour tirer le meilleur parti de RefBoost.')}
      </p>

      {/* Large progress bar */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 13, color: C.m }}>
            {data.completedCount} / {data.totalCount} {t('onboarding.completed', 'terminées')}
          </span>
          <span style={{ fontSize: 26, fontWeight: 600, color: C.p }}>{data.percentage}%</span>
        </div>
        <div style={{ height: 12, background: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
          <div style={{
            height: '100%', background: C.p,
            width: data.percentage + '%',
            transition: 'width 500ms ease',
          }} />
        </div>
      </div>

      {/* Steps */}
      {data.steps.map(step => (
        <a
          key={step.id}
          href={step.link}
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
            padding: 16, borderRadius: 12, marginBottom: 12,
            border: '1px solid ' + (step.completed ? C.greenBorder : C.border),
            background: step.completed ? C.greenBg : '#fff',
            textDecoration: 'none',
          }}
        >
          <div style={{
            width: 32, height: 32, borderRadius: '50%',
            border: '2px solid ' + (step.completed ? C.p : '#cbd5e1'),
            background: step.completed ? C.p : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            {step.completed
              ? <Check size={16} color="#fff" strokeWidth={3} />
              : <span style={{ fontSize: 12, color: C.m, fontWeight: 600 }}>{step.order}</span>}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 14, fontWeight: 600,
              color: step.completed ? '#15803d' : C.s,
            }}>
              {t('onboarding.step_' + step.id, step.id)}
            </div>
            <div style={{ fontSize: 12, color: C.m, marginTop: 2 }}>
              {t('onboarding.step_' + step.id + '_desc', '')}
            </div>
          </div>
          {step.completed ? (
            <CheckCircle2 size={20} color={C.p} />
          ) : (
            <span style={{
              fontSize: 12, padding: '6px 14px',
              background: C.p, color: '#fff',
              borderRadius: 8, fontWeight: 600, whiteSpace: 'nowrap',
            }}>
              {t('onboarding.configure', 'Configurer')}
            </span>
          )}
        </a>
      ))}
    </div>
  );
}
