import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingLayout from './LandingLayout';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

// Master list of personas — kept in the same order as the nav and
// footer so "related" cards stay deterministic.
const ALL_PERSONAS = [
  { slug: 'saas-b2b',               labelKey: 'useCases.nav.saas',         descKey: 'useCases.nav.saasDesc' },
  { slug: 'cabinet-conseil',        labelKey: 'useCases.nav.conseil',      descKey: 'useCases.nav.conseilDesc' },
  { slug: 'startup',                labelKey: 'useCases.nav.startup',      descKey: 'useCases.nav.startupDesc' },
  { slug: 'reseau-distribution',    labelKey: 'useCases.nav.distribution', descKey: 'useCases.nav.distributionDesc' },
  { slug: 'marketplace-plateforme', labelKey: 'useCases.nav.marketplace',  descKey: 'useCases.nav.marketplaceDesc' },
  { slug: 'agence-marketing',       labelKey: 'useCases.nav.agence',       descKey: 'useCases.nav.agenceDesc' },
];

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

export default function UseCasePageTemplate({
  slug,
  personaLabel,
  helmet,
  h1,
  subtitle,
  roiMain,
  roiMainDesc,
  roi1,
  roi1Desc,
  roi2,
  roi2Desc,
  features,
  steps,
  // Hand-curated 2–3 sibling persona slugs for the "Découvrez aussi"
  // section. Falls back to the first 3 non-current personas so a
  // caller that forgets the prop still gets useful cross-links.
  relatedSlugs,
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();

  const canonical = `https://refboost.io/cas-dusage/${slug}`;

  // WebPage schema (per Ahrefs/Google recommendations for use-case
  // landing pages) with the BreadcrumbList as a nested property. The
  // trailing ListItem deliberately omits `item` — it's the current
  // page so Google treats it as the leaf label.
  const pageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: helmet.title,
    description: helmet.description,
    url: canonical,
    inLanguage: (i18n?.language || 'fr').slice(0, 2),
    isPartOf: {
      '@type': 'WebSite',
      name: 'RefBoost',
      url: 'https://refboost.io/',
    },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('useCases.breadcrumb.home'), item: 'https://refboost.io/' },
        { '@type': 'ListItem', position: 2, name: t('useCases.breadcrumb.useCases'), item: 'https://refboost.io/cas-dusage' },
        { '@type': 'ListItem', position: 3, name: personaLabel },
      ],
    },
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>{helmet.title}</title>
        <meta name="description" content={helmet.description} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={helmet.title} />
        <meta property="og:description" content={helmet.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={helmet.title} />
        <meta name="twitter:description" content={helmet.description} />
        <script type="application/ld+json">{JSON.stringify(pageLd)}</script>
      </Helmet>

      {/* Hero — matches /blog and /marketplace pages */}
      <section style={{ background: `linear-gradient(135deg, ${C.s} 0%, #1e293b 100%)`, padding: mobile ? '56px 20px 48px' : '80px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <nav aria-label="Breadcrumb" style={{ marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            <a href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{t('useCases.breadcrumb.home')}</a>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.35)' }}>›</span>
            <span style={{ color: 'rgba(255,255,255,0.55)' }}>{t('useCases.breadcrumb.useCases')}</span>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.35)' }}>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{personaLabel}</span>
          </nav>
          <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            {t('useCases.hero.badge')}
          </span>
          <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>{h1}</h1>
          <p style={{ margin: '0 auto 32px', fontSize: mobile ? 16 : 18, color: '#94a3b8', lineHeight: 1.6, maxWidth: 620 }}>{subtitle}</p>
          <button onClick={() => navigate('/signup')} style={{ padding: mobile ? '13px 26px' : '15px 32px', borderRadius: 12, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: mobile ? 15 : 16, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}40`, fontFamily: 'inherit' }}>
            {t('useCases.hero.cta')} →
          </button>
        </div>
      </section>

      {/* ROI section */}
      <section style={{ background: '#fff', padding: mobile ? '40px 20px' : '64px 48px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 32 : 40 }}>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>{t('useCases.roi.label')}</p>
          </div>
          <div style={{ padding: mobile ? 32 : 56, borderRadius: 24, background: g(C.s, '#1e293b'), color: '#fff', textAlign: 'center', marginBottom: 24, position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: `${C.p}18` }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: mobile ? 64 : 96, fontWeight: 900, lineHeight: 1, letterSpacing: -3, background: g(C.pl, '#6ee7b7'), WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>{roiMain}</div>
              <p style={{ margin: '0 auto', fontSize: mobile ? 16 : 20, color: '#cbd5e1', lineHeight: 1.5, maxWidth: 620 }}>{roiMainDesc}</p>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(2,1fr)', gap: 16 }}>
            {[{ stat: roi1, desc: roi1Desc }, { stat: roi2, desc: roi2Desc }].map((item, i) => (
              <div key={i} style={{ padding: 32, borderRadius: 20, background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: mobile ? 36 : 44, fontWeight: 900, color: C.p, letterSpacing: -1, marginBottom: 8 }}>{item.stat}</div>
                <p style={{ margin: 0, fontSize: 15, color: C.m, lineHeight: 1.5 }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ background: C.bg, padding: mobile ? '56px 20px' : '96px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 40 : 64 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>{t('useCases.features.label')}</p>
            <h2 style={{ margin: 0, fontSize: mobile ? 28 : 38, fontWeight: 800, color: C.s, letterSpacing: -1 }}>{t('useCases.features.title')}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 24 }}>
            {features.map((f, i) => (
              <div key={i} style={{ padding: 32, borderRadius: 20, background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', transition: 'transform .25s, box-shadow .25s', cursor: 'default' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(5,150,105,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 2px 10px rgba(0,0,0,0.04)'; }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: `${C.p}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                  {f.icon}
                </div>
                <h3 style={{ margin: '0 0 12px', fontSize: 19, fontWeight: 800, color: C.s, lineHeight: 1.3 }}>{f.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: C.m, lineHeight: 1.7 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* How it works */}
      <section style={{ background: '#fff', padding: mobile ? '56px 20px' : '96px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 40 : 64 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>{t('useCases.how.label')}</p>
            <h2 style={{ margin: 0, fontSize: mobile ? 28 : 38, fontWeight: 800, color: C.s, letterSpacing: -1 }}>{t('useCases.how.title')}</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(3,1fr)', gap: 32 }}>
            {steps.map((st, i) => (
              <div key={i} style={{ position: 'relative', padding: 28, borderRadius: 20, background: C.bg, border: `1px solid ${C.border}` }}>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: g(C.p, C.pl), display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 16 }}>0{i + 1}</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 17, fontWeight: 800, color: C.s, lineHeight: 1.3 }}>{st.title}</h3>
                <p style={{ margin: 0, fontSize: 14, color: C.m, lineHeight: 1.7 }}>{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Related use cases — 3 other personas + link back home.
          Gives crawlers real <a href> internal-link signal into every
          sibling page, which is what Ahrefs was flagging as missing. */}
      <section style={{ background: C.bg, padding: mobile ? '48px 20px' : '72px 48px', borderTop: `1px solid ${C.border}` }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: mobile ? 32 : 40 }}>
            <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>{t('useCases.related.label')}</p>
            <h2 style={{ margin: 0, fontSize: mobile ? 22 : 28, fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>{t('useCases.related.title')}</h2>
          </div>
          {(() => {
            const pool = Array.isArray(relatedSlugs) && relatedSlugs.length
              ? relatedSlugs.map(s => ALL_PERSONAS.find(p => p.slug === s)).filter(Boolean)
              : ALL_PERSONAS.filter(p => p.slug !== slug).slice(0, 3);
            return (
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : `repeat(${Math.min(pool.length, 3)},1fr)`, gap: 16, maxWidth: pool.length === 2 ? 760 : 'none', margin: pool.length === 2 ? '0 auto' : undefined }}>
                {pool.map(p => (
              <a key={p.slug} href={`/cas-dusage/${p.slug}`}
                style={{ display: 'block', padding: 20, borderRadius: 14, background: '#fff', border: `1px solid ${C.border}`, textDecoration: 'none', color: 'inherit', transition: 'transform .2s, box-shadow .2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(5,150,105,0.10)'; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                <h3 style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 700, color: C.s }}>{t(p.labelKey)}</h3>
                <p style={{ margin: '0 0 10px', fontSize: 13, color: C.m, lineHeight: 1.5 }}>{t(p.descKey)}</p>
                <span style={{ color: C.p, fontSize: 13, fontWeight: 700 }}>{t('useCases.cardCta')} →</span>
              </a>
                ))}
              </div>
            );
          })()}
          <div style={{ textAlign: 'center', marginTop: mobile ? 24 : 32 }}>
            <a href="/cas-dusage" style={{ color: C.p, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginRight: 20 }}>{t('useCases.related.seeAll')} →</a>
            <a href="/" style={{ color: C.m, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>← {t('useCases.related.backHome')}</a>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section style={{ background: g(C.s, '#1e293b'), padding: mobile ? '56px 20px' : '96px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: `${C.p}10` }} />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', zIndex: 1 }}>
          <h2 style={{ margin: '0 0 16px', fontSize: mobile ? 28 : 38, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
            {t('useCases.bottomCta.title')}
          </h2>
          <p style={{ margin: '0 0 32px', fontSize: mobile ? 16 : 18, color: '#cbd5e1', lineHeight: 1.6 }}>
            {t('useCases.bottomCta.subtitle')}
          </p>
          <button onClick={() => navigate('/signup')} style={{ padding: mobile ? '14px 28px' : '16px 36px', borderRadius: 14, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: mobile ? 16 : 18, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}40`, fontFamily: 'inherit' }}>
            {t('useCases.bottomCta.cta')} →
          </button>
          <p style={{ marginTop: 14, fontSize: 13, color: '#94a3b8' }}>{t('useCases.bottomCta.note')}</p>
        </div>
      </section>
    </LandingLayout>
  );
}
