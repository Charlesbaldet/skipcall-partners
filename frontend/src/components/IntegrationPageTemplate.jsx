import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingLayout from './LandingLayout';
import { INTEGRATIONS } from '../pages/integrations/integrationsData';

// Mirror of UseCasePageTemplate so /integrations/:slug pages match the
// /cas-dusage/:slug layout 1:1. Adjustments specific to integrations:
//   * Hero shows the integration's logo + category-specific badge.
//   * Optional plan badge (Qonto = Business).
//   * Features grid is 2 columns (4 features per integration; 3 columns
//     orphaned the 4th tile).
//   * FAQ section sits between Steps and Related — kept here because
//     it's high-value SEO content for integration queries.
//   * Related cards link to OTHER integrations, not personas.
//   * Breadcrumb leaf is "Intégrations" + integration name.
//
// i18n: section chrome reuses useCases.* keys (already translated in
// all 7 locales). Per-integration body comes from integrations.<slug>.*
// and reads array fields via { returnObjects: true }.

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

function tArr(t, key) {
  const v = t(key, { returnObjects: true });
  return Array.isArray(v) ? v : [];
}

export default function IntegrationPageTemplate({ integration }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();
  const i = integration;

  const tk = (k, opts) => t(`integrations.${i.slug}.${k}`, opts);
  const name = tk('name');
  const categoryLabel = t(`integrations.shared.categories.${i.category}`);
  const canonical = `https://refboost.io/integrations/${i.slug}`;

  const features = tArr(t, `integrations.${i.slug}.features`);
  const steps = tArr(t, `integrations.${i.slug}.steps`);
  const faqs = tArr(t, `integrations.${i.slug}.faqs`);
  const roi = tArr(t, `integrations.${i.slug}.roi`);
  const roiMain = roi[0] || {};
  const roiSmall = roi.slice(1, 3);

  // Related: hand-curated sibling integration slugs from the data
  // file's crossLinks; fallback to first 3 non-current slugs.
  const relatedSlugs = (i.crossLinks && i.crossLinks.length)
    ? i.crossLinks
    : INTEGRATIONS.filter(x => x.slug !== i.slug).slice(0, 3).map(x => x.slug);
  const related = relatedSlugs
    .map(s => INTEGRATIONS.find(x => x.slug === s))
    .filter(Boolean)
    .slice(0, 3);

  const pageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: i.seoTitle,
    description: i.seoDescription,
    url: canonical,
    inLanguage: (i18n?.language || 'fr').slice(0, 2),
    isPartOf: { '@type': 'WebSite', name: 'RefBoost', url: 'https://refboost.io/' },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('useCases.breadcrumb.home'), item: 'https://refboost.io/' },
        { '@type': 'ListItem', position: 2, name: t('integrations.index.label'), item: 'https://refboost.io/integrations' },
        { '@type': 'ListItem', position: 3, name },
      ],
    },
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>{i.seoTitle}</title>
        <meta name="description" content={i.seoDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={i.seoTitle} />
        <meta property="og:description" content={i.seoDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta property="og:image" content="https://refboost.io/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={i.seoTitle} />
        <meta name="twitter:description" content={i.seoDescription} />
        <script type="application/ld+json">{JSON.stringify(pageLd)}</script>
      </Helmet>

      {/* ─── Hero ─────────────────────────────────────────── */}
      <section style={{ background: `linear-gradient(135deg, ${C.s} 0%, #1e293b 100%)`, padding: mobile ? '56px 20px 48px' : '80px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <nav aria-label="Breadcrumb" style={{ marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            <a href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{t('useCases.breadcrumb.home')}</a>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.35)' }}>›</span>
            <a href="/integrations" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{t('integrations.index.label')}</a>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.35)' }}>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{name}</span>
          </nav>

          <div style={{
            width: 72, height: 72, borderRadius: 18, background: '#fff',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', padding: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          }}>
            <img src={i.logoSrc} alt={name} width={48} height={48} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>

          <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            {t('integrations.shared.hero_label', { category: categoryLabel })}
          </span>
          <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>
            RefBoost + {name}
          </h1>
          <p style={{ margin: '0 auto 22px', fontSize: mobile ? 16 : 18, color: '#94a3b8', lineHeight: 1.6, maxWidth: 620 }}>
            {tk('heroSubtitle')}
          </p>

          {i.plan === 'business' && (
            <div style={{ display: 'inline-block', marginBottom: 24 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '5px 12px', borderRadius: 999, background: 'rgba(99,102,241,0.18)', color: '#a5b4fc' }}>
                {t('integrations.shared.business_plan')}
              </span>
            </div>
          )}

          <div>
            <button onClick={() => navigate('/signup')} style={{ padding: mobile ? '13px 26px' : '15px 32px', borderRadius: 12, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: mobile ? 15 : 16, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}40`, fontFamily: 'inherit' }}>
              {t('useCases.hero.cta')} →
            </button>
          </div>
        </div>
      </section>

      {/* ─── ROI ─────────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: mobile ? '40px 20px' : '64px 48px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 32 : 40 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
              {t('useCases.roi.label')}
            </p>
          </div>
          <div style={{ padding: mobile ? 32 : 56, borderRadius: 24, background: g(C.s, '#1e293b'), color: '#fff', textAlign: 'center', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: `${C.p}18` }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: mobile ? 64 : 96, fontWeight: 900, lineHeight: 1, letterSpacing: -3, background: g(C.pl, '#6ee7b7'), WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>
                {roiMain.metric || ''}
              </div>
              <p style={{ margin: '0 auto', fontSize: mobile ? 16 : 20, color: '#cbd5e1', lineHeight: 1.5, maxWidth: 620 }}>
                {roiMain.description || ''}
              </p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2,1fr)', gap: 16 }}>
            {roiSmall.map((item, idx) => (
              <div key={idx} style={{ padding: 32, borderRadius: 20, background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: mobile ? 36 : 44, fontWeight: 900, color: C.p, letterSpacing: -1, marginBottom: 8 }}>{item.metric}</div>
                <p style={{ margin: 0, fontSize: 15, color: C.m, lineHeight: 1.5 }}>{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Features (2x2) ─────────────────────────────── */}
      <section style={{ background: C.bg, padding: mobile ? '56px 20px' : '96px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 40 : 64 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
              {t('useCases.features.label')}
            </p>
            <h2 style={{ margin: 0, fontSize: mobile ? 28 : 38, fontWeight: 800, color: C.s, letterSpacing: -1 }}>
              {t('useCases.features.title')}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2,1fr)', gap: 24 }}>
            {features.map((f, idx) => (
              <div key={idx} style={{ padding: 32, borderRadius: 20, background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', transition: 'transform .25s, box-shadow .25s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(5,150,105,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.04)'; }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${C.p}15`, color: C.p, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20, fontWeight: 800, fontSize: 22 }}>
                  ✓
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: 19, fontWeight: 800, color: C.s, lineHeight: 1.3 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: C.m, lineHeight: 1.7 }}>{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Steps ──────────────────────────────────────── */}
      <section style={{ background: '#fff', padding: mobile ? '56px 20px' : '96px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 40 : 64 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
              {t('useCases.how.label')}
            </p>
            <h2 style={{ margin: 0, fontSize: mobile ? 28 : 38, fontWeight: 800, color: C.s, letterSpacing: -1 }}>
              {t('integrations.shared.steps_title', { name })}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 32 }}>
            {steps.map((st, idx) => (
              <div key={idx} style={{ position: 'relative', padding: 28, borderRadius: 20, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: g(C.p, C.pl), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 16 }}>
                  {String(idx + 1).padStart(2, '0')}
                </div>
                <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: C.s, lineHeight: 1.3 }}>{st.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: C.m, lineHeight: 1.7 }}>{st.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FAQ ────────────────────────────────────────── */}
      <section style={{ background: C.bg, padding: mobile ? '48px 20px' : '72px 48px' }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 32 : 40 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
              {t('integrations.shared.faq_label')}
            </p>
            <h2 style={{ margin: 0, fontSize: mobile ? 26 : 32, fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>
              {t('integrations.shared.faq_title')}
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faqs.map((faq, idx) => (
              <details key={idx} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, padding: '14px 18px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 700, fontSize: 15, color: C.s, listStyle: 'none', outline: 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span>{faq.q}</span>
                  <span style={{ color: C.m, fontSize: 18, lineHeight: 1, flexShrink: 0 }}>+</span>
                </summary>
                <div style={{ color: C.m, fontSize: 14, lineHeight: 1.6, marginTop: 12 }}>{faq.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Related integrations ──────────────────────── */}
      <section style={{ background: C.bg, padding: mobile ? '48px 20px' : '72px 48px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 32 : 40 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
              {t('useCases.related.label')}
            </p>
            <h2 style={{ margin: 0, fontSize: mobile ? 22 : 28, fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>
              {t('useCases.related.title')}
            </h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : `repeat(${Math.min(related.length, 3)},1fr)`, gap: 16, maxWidth: related.length === 2 ? 760 : 'none', margin: related.length === 2 ? '0 auto' : undefined }}>
            {related.map(o => (
              <a key={o.slug} href={`/integrations/${o.slug}`}
                style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 20, borderRadius: 14, background: '#fff', border: `1px solid ${C.border}`, textDecoration: 'none', color: 'inherit', transition: 'transform .2s, box-shadow .2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(5,150,105,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: '#fff', border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 4, flexShrink: 0 }}>
                    <img src={o.logoSrc} alt={t(`integrations.${o.slug}.name`)} width={24} height={24} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: C.s }}>{t(`integrations.${o.slug}.name`)}</h3>
                </div>
                <p style={{ margin: 0, fontSize: 13, color: C.m, lineHeight: 1.5 }}>{t(`integrations.${o.slug}.shortDescription`)}</p>
                <span style={{ color: C.p, fontSize: 13, fontWeight: 700 }}>{t('useCases.cardCta')} →</span>
              </a>
            ))}
          </div>
          <div style={{ textAlign: 'center', marginTop: mobile ? 24 : 32 }}>
            <a href="/integrations" style={{ color: C.p, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginRight: 20 }}>
              {t('integrations.shared.see_all')} →
            </a>
            <a href="/" style={{ color: C.m, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
              ← {t('useCases.related.backHome')}
            </a>
          </div>
        </div>
      </section>

      {/* ─── Bottom CTA ─────────────────────────────────── */}
      <section style={{ background: g(C.s, '#1e293b'), padding: mobile ? '56px 20px' : '96px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: `${C.p}10` }} />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', zIndex: 1 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: mobile ? 28 : 38, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
            {t('integrations.shared.cta_title', { name })}
          </h2>
          <p style={{ margin: '0 0 32px', fontSize: mobile ? 16 : 18, color: '#cbd5e1', lineHeight: 1.6 }}>
            {t('integrations.shared.cta_subtitle')}
          </p>
          <button onClick={() => navigate('/signup')} style={{ padding: mobile ? '14px 28px' : '16px 36px', borderRadius: 14, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: mobile ? 16 : 18, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}40`, fontFamily: 'inherit' }}>
            {t('integrations.shared.cta_signup')} →
          </button>
          <p style={{ marginTop: 14, fontSize: 13, color: '#94a3b8' }}>{t('useCases.bottomCta.note')}</p>
        </div>
      </section>
    </LandingLayout>
  );
}
