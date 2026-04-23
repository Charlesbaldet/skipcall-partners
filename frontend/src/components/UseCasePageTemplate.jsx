import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingLayout from './LandingLayout';

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
  icon,
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();

  const canonical = `https://refboost.io/cas-dusage/${slug}`;

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: t('useCases.breadcrumb.home'), item: 'https://refboost.io/' },
      { '@type': 'ListItem', position: 2, name: t('useCases.breadcrumb.useCases'), item: 'https://refboost.io/cas-dusage' },
      { '@type': 'ListItem', position: 3, name: personaLabel, item: canonical },
    ],
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
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
      </Helmet>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(180deg,#f8fafc 0%,#fff 100%)', padding: mobile ? '32px 20px 48px' : '48px 48px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {/* Breadcrumb */}
          <nav aria-label="Breadcrumb" style={{ marginBottom: 24, fontSize: 13, color: C.m }}>
            <a href="/" style={{ color: C.m, textDecoration: 'none' }}>{t('useCases.breadcrumb.home')}</a>
            <span style={{ margin: '0 8px', color: '#cbd5e1' }}>›</span>
            <span style={{ color: C.m }}>{t('useCases.breadcrumb.useCases')}</span>
            <span style={{ margin: '0 8px', color: '#cbd5e1' }}>›</span>
            <span style={{ color: C.s, fontWeight: 600 }}>{personaLabel}</span>
          </nav>

          <div style={{ display: mobile ? 'block' : 'grid', gridTemplateColumns: '1fr auto', gap: 32, alignItems: 'flex-start' }}>
            <div>
              <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: `${C.p}15`, border: `1px solid ${C.p}30`, fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 }}>
                {t('useCases.hero.badge')}
              </span>
              <h1 style={{ margin: '0 0 20px', fontSize: mobile ? 30 : 48, fontWeight: 900, color: C.s, lineHeight: 1.1, letterSpacing: -1.5 }}>{h1}</h1>
              <p style={{ margin: '0 0 32px', fontSize: mobile ? 17 : 20, color: C.m, lineHeight: 1.6, maxWidth: 680 }}>{subtitle}</p>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button onClick={() => navigate('/signup')} style={{ padding: mobile ? '13px 24px' : '15px 32px', borderRadius: 12, border: 'none', background: g(C.p, C.pl), color: '#fff', fontWeight: 700, fontSize: mobile ? 15 : 16, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}30`, fontFamily: 'inherit' }}>
                  {t('useCases.hero.cta')} →
                </button>
              </div>
            </div>
            {!mobile && (
              <div style={{ width: 140, height: 140, borderRadius: 28, background: g(`${C.p}15`, `${C.pl}10`), display: 'flex', alignItems: 'center', justifyContent: 'center', border: `1px solid ${C.p}25` }}>
                {icon}
              </div>
            )}
          </div>
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
