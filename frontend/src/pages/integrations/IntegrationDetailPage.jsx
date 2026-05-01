import { useParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';
import { INTEGRATIONS, getIntegration } from './integrationsData';
import { ILLUSTRATION_BY_SLUG } from './IntegrationIllustrations.jsx';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b' };
const SITE = 'https://refboost.io';
const HREF_LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt'];

function HeroLogo({ letter }) {
  return (
    <div style={{
      width: 56, height: 56, borderRadius: 14, background: '#fff',
      color: C.s, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: 26, margin: '0 auto 20px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
    }}>{letter}</div>
  );
}

// Helper: pull a translated array via returnObjects, with a safe
// fallback to an empty array if the key is missing in the active
// locale (avoids `.map of undefined` crashes during a partial
// translation rollout).
function tArr(t, key) {
  const v = t(key, { returnObjects: true });
  return Array.isArray(v) ? v : [];
}

export default function IntegrationDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams();
  const integration = getIntegration(slug);

  if (!integration) return <Navigate to="/integrations" replace />;

  const i = integration;
  const url = SITE + '/integrations/' + i.slug;
  const tk = (k) => t(`integrations.${i.slug}.${k}`);
  const Illustration = ILLUSTRATION_BY_SLUG[i.slug] || null;
  const categoryLabel = t(`integrations.shared.categories.${i.category}`);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: i.seoTitle,
    description: i.seoDescription,
    url,
  };

  const others = i.crossLinks
    .map(s => INTEGRATIONS.find(x => x.slug === s))
    .filter(Boolean);

  return (
    <LandingLayout>
      <Helmet>
        <title>{i.seoTitle}</title>
        <meta name="description" content={i.seoDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={i.seoTitle} />
        <meta property="og:description" content={i.seoDescription} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={url} />
        <meta property="og:image" content={SITE + '/og-image.png'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={i.seoTitle} />
        <meta name="twitter:description" content={i.seoDescription} />
        {HREF_LANGS.map(l => (
          <link key={l} rel="alternate" hrefLang={l} href={url} />
        ))}
        <link rel="alternate" hrefLang="x-default" href={url} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px 0', fontSize: 13, color: C.m }}>
        <a href="/integrations" style={{ color: C.m, textDecoration: 'none' }}>
          {t('integrations.shared.breadcrumb', 'Intégrations')}
        </a>
        <span style={{ margin: '0 8px' }}>/</span>
        <span style={{ color: C.s, fontWeight: 600 }}>{tk('name')}</span>
      </div>

      <div style={{
        background: 'linear-gradient(135deg, ' + C.s + ' 0%, #1e293b 100%)',
        padding: '60px 24px 64px', textAlign: 'center',
        marginTop: 20,
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', color: C.p, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            {t('integrations.shared.hero_label', { category: categoryLabel, defaultValue: 'Intégration {{category}}' })}
          </span>
          <HeroLogo letter={i.logo.letter} />
          <h1 style={{ fontSize: 'clamp(28px,5vw,44px)', fontWeight: 900, color: '#fff', margin: '0 0 14px', lineHeight: 1.15 }}>
            {tk('name')}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 17, margin: '0 auto 22px', lineHeight: 1.6, maxWidth: 620 }}>
            {tk('heroSubtitle')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              {t('integrations.shared.available')}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>
              {categoryLabel}
            </span>
            {i.plan === 'business' && (
              <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                {t('integrations.shared.business_plan')}
              </span>
            )}
          </div>
        </div>
      </div>

      <section style={{ padding: '64px 24px 32px', background: '#fff' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.s, margin: '0 0 32px', textAlign: 'center' }}>
            {t('integrations.shared.features_title', 'Ce que vous pouvez faire')}
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
            gap: 18,
          }}>
            {tArr(t, `integrations.${i.slug}.features`).map((f, idx) => (
              <div key={idx} style={{
                padding: 22, borderRadius: 14,
                background: '#f8fafc', border: '1px solid #e2e8f0',
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ecfdf5', color: C.p, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12, fontWeight: 800 }}>
                  ✓
                </div>
                <div style={{ fontWeight: 700, fontSize: 16, color: C.s, marginBottom: 6 }}>
                  {f.title}
                </div>
                <div style={{ color: C.m, fontSize: 14, lineHeight: 1.55 }}>
                  {f.description}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '48px 24px', background: '#fff' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.s, margin: '0 0 36px', textAlign: 'center' }}>
            {t('integrations.shared.steps_title', 'Comment ça marche')}
          </h2>
          <div style={{ position: 'relative' }}>
            {tArr(t, `integrations.${i.slug}.steps`).map((step, idx, arr) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginBottom: idx === arr.length - 1 ? 0 : 24, position: 'relative' }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'linear-gradient(135deg, ' + C.p + ', ' + C.pl + ')',
                  color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 16, flexShrink: 0,
                  boxShadow: '0 6px 16px rgba(5,150,105,0.25)', zIndex: 1,
                }}>
                  {idx + 1}
                </div>
                {idx !== arr.length - 1 && (
                  <div style={{
                    position: 'absolute', left: 19, top: 40,
                    width: 2, height: 'calc(100% - 24px)',
                    background: '#e2e8f0',
                  }} />
                )}
                <div style={{ flex: 1, paddingTop: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: 16, color: C.s, marginBottom: 4 }}>
                    {step.title}
                  </div>
                  <div style={{ color: C.m, fontSize: 14, lineHeight: 1.55 }}>
                    {step.description}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section style={{ padding: '48px 24px', background: '#fafbfc' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.s, margin: '0 0 24px', textAlign: 'center' }}>
            {t('integrations.shared.preview_title', 'Aperçu')}
          </h2>
          <div style={{
            borderRadius: 16, overflow: 'hidden',
            background: '#fff', border: '1px solid #e2e8f0',
            padding: 24,
          }}>
            {Illustration ? <Illustration height={300} /> : (
              <div style={{ padding: 60, textAlign: 'center', color: C.m, fontSize: 14 }}>
                {t('integrations.shared.preview_placeholder', "Capture d'écran à venir.")}
              </div>
            )}
          </div>
        </div>
      </section>

      <section style={{ padding: '48px 24px 64px', background: '#fafbfc' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: C.s, margin: '0 0 28px', textAlign: 'center' }}>
            {t('integrations.shared.faq_title', 'Questions fréquentes')}
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {tArr(t, `integrations.${i.slug}.faqs`).map((faq, idx) => (
              <details key={idx} style={{
                background: '#fff', borderRadius: 12,
                border: '1px solid #e2e8f0', padding: '14px 18px',
              }}>
                <summary style={{
                  cursor: 'pointer', fontWeight: 700, fontSize: 15,
                  color: C.s, listStyle: 'none', outline: 'none',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                }}>
                  <span>{faq.q}</span>
                  <span style={{ color: C.m, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>+</span>
                </summary>
                <div style={{ color: C.m, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>
                  {faq.a}
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section style={{
        padding: '56px 24px',
        background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ fontSize: 26, fontWeight: 800, color: C.s, margin: '0 0 12px' }}>
            {t('integrations.shared.cta_title', { name: tk('name'), defaultValue: 'Prêt à connecter {{name}} ?' })}
          </h2>
          <p style={{ color: C.m, fontSize: 15, margin: '0 0 22px', lineHeight: 1.55 }}>
            {t('integrations.shared.cta_subtitle', "Créez votre compte RefBoost et activez l'intégration depuis Settings → Intégrations en moins de 5 minutes.")}
          </p>
          <a
            href="/signup"
            style={{
              display: 'inline-block', padding: '13px 30px', borderRadius: 12,
              background: C.s, color: '#fff', textDecoration: 'none',
              fontWeight: 700, fontSize: 14,
            }}
          >
            {t('integrations.shared.cta_signup', 'Commencer gratuitement')} →
          </a>
        </div>
      </section>

      <section style={{ padding: '56px 24px 80px', background: '#fafbfc' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: C.s, margin: '0 0 24px', textAlign: 'center' }}>
            {t('integrations.shared.cross_links_title', 'Autres intégrations')}
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 16,
          }}>
            {others.map(o => (
              <a
                key={o.slug}
                href={'/integrations/' + o.slug}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14,
                  padding: 18, borderRadius: 12,
                  background: '#fff', border: '1px solid #e2e8f0',
                  textDecoration: 'none',
                  transition: 'border-color .15s, transform .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = '#cbd5e1'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#e2e8f0'; e.currentTarget.style.transform = 'none'; }}
              >
                <div style={{
                  width: 40, height: 40, borderRadius: 10,
                  background: o.logo.bg, color: o.logo.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 800, fontSize: 18, flexShrink: 0,
                }}>{o.logo.letter}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, color: C.s }}>{t(`integrations.${o.slug}.name`)}</div>
                  <div style={{ fontSize: 12, color: C.m }}>{t(`integrations.shared.categories.${o.category}`)}</div>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
