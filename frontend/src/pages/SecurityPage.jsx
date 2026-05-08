import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingLayout from '../components/LandingLayout';

// Public security page mounted at /security. Mirrors the layout
// language of the integration / use-case detail pages — dark hero,
// alternating section bands, icon-led cards — without pulling
// IntegrationPageTemplate which is wired to per-slug i18n. All copy
// flows through the security.* i18n namespace (7 locales).

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

// Inline SVG icons — one per section. Single-stroke lucide-style
// glyphs sit inside a 52×52 rounded badge in the section header.
function Icon({ name }) {
  const common = { width: 26, height: 26, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'lock':
      return (<svg {...common}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>);
    case 'shield':
      return (<svg {...common}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
    case 'key':
      return (<svg {...common}><circle cx="7.5" cy="15.5" r="3.5"/><path d="M10 13l9-9"/><path d="M14 8l3 3"/><path d="M18 4l3 3"/></svg>);
    case 'server':
      return (<svg {...common}><rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><line x1="6" y1="7" x2="6.01" y2="7"/><line x1="6" y1="17" x2="6.01" y2="17"/></svg>);
    case 'check':
      return (<svg {...common}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>);
    case 'alert':
      return (<svg {...common}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>);
    default:
      return null;
  }
}

export default function SecurityPage() {
  const { t } = useTranslation();
  const mobile = useMobile();
  const canonical = 'https://refboost.io/security';

  // Each section: i18n title + bullet keys. Order is meaningful
  // (alternates white / off-white bands below).
  const sections = [
    {
      key: 'encryption',
      icon: 'lock',
      bullets: ['bullet1', 'bullet2', 'bullet3'],
    },
    {
      key: 'isolation',
      icon: 'shield',
      bullets: ['bullet1', 'bullet2', 'bullet3'],
    },
    {
      key: 'auth',
      icon: 'key',
      bullets: ['bullet1', 'bullet2', 'bullet3'],
    },
    {
      key: 'infra',
      icon: 'server',
      bullets: ['bullet1', 'bullet2', 'bullet3'],
    },
    {
      key: 'compliance',
      icon: 'check',
      bullets: ['bullet1', 'bullet2', 'bullet3', 'bullet4'],
    },
    {
      key: 'incident',
      icon: 'alert',
      bullets: ['bullet1', 'bullet2', 'bullet3'],
    },
  ];

  const pageLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('security.hero_title'),
    description: t('security.hero_subtitle'),
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'RefBoost', url: 'https://refboost.io/' },
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>{t('security.hero_title')} — RefBoost</title>
        <meta name="description" content={t('security.hero_subtitle')} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={t('security.hero_title')} />
        <meta property="og:description" content={t('security.hero_subtitle')} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(pageLd)}</script>
      </Helmet>

      {/* Hero */}
      <section style={{ background: `linear-gradient(135deg, ${C.s} 0%, #1e293b 100%)`, padding: mobile ? '56px 20px 48px' : '80px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{
            width: 72, height: 72, borderRadius: 18, background: g(C.p, C.pl),
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            margin: '0 auto 24px', color: '#fff',
            boxShadow: '0 12px 32px rgba(5,150,105,0.35)',
          }}>
            <Icon name="shield" />
          </div>
          <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            RefBoost Security
          </span>
          <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>
            {t('security.hero_title')}
          </h1>
          <p style={{ margin: '0 auto', fontSize: mobile ? 16 : 18, color: '#94a3b8', lineHeight: 1.6, maxWidth: 620 }}>
            {t('security.hero_subtitle')}
          </p>
        </div>
      </section>

      {/* Sections — alternating bands */}
      {sections.map((sec, idx) => {
        const altBg = idx % 2 === 0 ? '#fff' : C.bg;
        return (
          <section key={sec.key} style={{ background: altBg, padding: mobile ? '48px 20px' : '72px 48px', borderTop: `1px solid ${C.border}` }}>
            <div style={{ maxWidth: 880, margin: '0 auto', display: 'grid', gridTemplateColumns: mobile ? '1fr' : '120px 1fr', gap: mobile ? 20 : 40, alignItems: 'flex-start' }}>
              <div style={{
                width: 72, height: 72, borderRadius: 18,
                background: `${C.p}15`, color: C.p,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon name={sec.icon} />
              </div>
              <div>
                <h2 style={{ margin: '0 0 18px', fontSize: mobile ? 22 : 28, fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>
                  {t(`security.section.${sec.key}.title`)}
                </h2>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {sec.bullets.map(b => (
                    <li key={b} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, color: C.m, fontSize: 15, lineHeight: 1.6 }}>
                      <span style={{ flexShrink: 0, marginTop: 6, width: 8, height: 8, borderRadius: '50%', background: C.p }} />
                      <span>{t(`security.section.${sec.key}.${b}`)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        );
      })}

      {/* Bottom CTA */}
      <section style={{ background: g(C.s, '#1e293b'), padding: mobile ? '56px 20px' : '96px 48px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: `${C.p}10` }} />
        <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', zIndex: 1 }}>
          <h2 style={{ margin: '0 0 32px', fontSize: mobile ? 24 : 32, fontWeight: 800, color: '#fff', letterSpacing: -0.5, lineHeight: 1.3 }}>
            {t('security.cta_title')}
          </h2>
          <a
            href="mailto:security@refboost.io"
            style={{
              display: 'inline-block',
              padding: mobile ? '14px 28px' : '16px 36px',
              borderRadius: 14, border: 'none',
              background: g(C.p, C.pl), color: '#fff',
              fontWeight: 700, fontSize: mobile ? 16 : 18,
              cursor: 'pointer',
              boxShadow: `0 8px 30px ${C.p}40`,
              textDecoration: 'none',
              fontFamily: 'inherit',
            }}
          >
            {t('security.cta_button')} →
          </a>
        </div>
      </section>
    </LandingLayout>
  );
}
