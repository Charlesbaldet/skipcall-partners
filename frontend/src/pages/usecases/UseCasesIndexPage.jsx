import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingLayout from '../../components/LandingLayout';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

const ICONS = {
  saas: (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke={C.p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/><path d="M7 10l2 2 4-4" stroke={C.pl}/></svg>
  ),
  conseil: (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke={C.p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 21v-7a4 4 0 014-4h8a4 4 0 014 4v7"/><circle cx="12" cy="6" r="3"/><path d="M9 14h6" stroke={C.pl}/></svg>
  ),
  startup: (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke={C.p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4.5 16.5c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M12 15l-3-3a11 11 0 017-7 11 11 0 014 4 11 11 0 01-7 7z"/><circle cx="15.5" cy="8.5" r="1.5" stroke={C.pl}/></svg>
  ),
  distribution: (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke={C.p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2" stroke={C.pl}/><circle cx="19" cy="5" r="2" stroke={C.pl}/><circle cx="5" cy="19" r="2" stroke={C.pl}/><circle cx="19" cy="19" r="2" stroke={C.pl}/><path d="M7 6l3 4M17 6l-3 4M7 18l3-4M17 18l-3-4"/></svg>
  ),
  marketplace: (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke={C.p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l1.5-5h15L21 9"/><path d="M3 9v10a2 2 0 002 2h14a2 2 0 002-2V9"/><path d="M3 9h18" stroke={C.pl}/><path d="M9 13h6"/></svg>
  ),
  agence: (
    <svg viewBox="0 0 24 24" width={28} height={28} fill="none" stroke={C.p} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z"/></svg>
  ),
};

export default function UseCasesIndexPage() {
  const { t, i18n } = useTranslation();
  const mobile = useMobile();

  const canonical = 'https://refboost.io/cas-dusage';
  const metaTitle = t('useCases.index.metaTitle');
  const metaDescription = t('useCases.index.metaDescription');

  const cards = [
    { slug: 'saas-b2b', label: t('useCases.nav.saas'), desc: t('useCases.nav.saasDesc'), icon: ICONS.saas },
    { slug: 'cabinet-conseil', label: t('useCases.nav.conseil'), desc: t('useCases.nav.conseilDesc'), icon: ICONS.conseil },
    { slug: 'startup', label: t('useCases.nav.startup'), desc: t('useCases.nav.startupDesc'), icon: ICONS.startup },
    { slug: 'reseau-distribution', label: t('useCases.nav.distribution'), desc: t('useCases.nav.distributionDesc'), icon: ICONS.distribution },
    { slug: 'marketplace-plateforme', label: t('useCases.nav.marketplace'), desc: t('useCases.nav.marketplaceDesc'), icon: ICONS.marketplace },
    { slug: 'agence-marketing', label: t('useCases.nav.agence'), desc: t('useCases.nav.agenceDesc'), icon: ICONS.agence },
  ];

  const pageLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: metaTitle,
    description: metaDescription,
    url: canonical,
    inLanguage: (i18n?.language || 'fr').slice(0, 2),
    isPartOf: { '@type': 'WebSite', name: 'RefBoost', url: 'https://refboost.io/' },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: t('useCases.breadcrumb.home'), item: 'https://refboost.io/' },
        { '@type': 'ListItem', position: 2, name: t('useCases.breadcrumb.useCases') },
      ],
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: cards.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: c.label,
        url: `https://refboost.io/cas-dusage/${c.slug}`,
      })),
    },
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={canonical} />
        <meta property="og:type" content="website" />
        <script type="application/ld+json">{JSON.stringify(pageLd)}</script>
      </Helmet>

      <section style={{ background: `linear-gradient(135deg, ${C.s} 0%, #1e293b 100%)`, padding: mobile ? '56px 20px 48px' : '80px 24px 64px', textAlign: 'center' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <nav aria-label="Breadcrumb" style={{ marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
            <a href="/" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>{t('useCases.breadcrumb.home')}</a>
            <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.35)' }}>›</span>
            <span style={{ color: '#fff', fontWeight: 600 }}>{t('useCases.breadcrumb.useCases')}</span>
          </nav>
          <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            {t('useCases.sectionLabel')}
          </span>
          <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>{t('useCases.index.h1')}</h1>
          <p style={{ margin: '0 auto', fontSize: mobile ? 16 : 18, color: '#94a3b8', lineHeight: 1.6, maxWidth: 620 }}>{t('useCases.sectionSubtitle')}</p>
        </div>
      </section>

      <section style={{ background: C.bg, padding: mobile ? '48px 20px' : '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'repeat(auto-fit,minmax(300px,1fr))', gap: 20 }}>
          {cards.map(card => (
            <a key={card.slug} href={`/cas-dusage/${card.slug}`} style={{ display: 'block', padding: 28, borderRadius: 20, background: '#fff', border: `1px solid #f1f5f9`, boxShadow: '0 4px 20px rgba(0,0,0,.03)', textDecoration: 'none', color: 'inherit', transition: 'transform .25s,box-shadow .25s' }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 16px 40px rgba(5,150,105,.10)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,.03)'; }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: `${C.p}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}>
                {card.icon}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 8px', color: C.s }}>{card.label}</h2>
              <p style={{ color: C.m, fontSize: 14, lineHeight: 1.6, margin: '0 0 16px' }}>{card.desc}</p>
              <span style={{ color: C.p, fontSize: 14, fontWeight: 700 }}>{t('useCases.cardCta')} →</span>
            </a>
          ))}
        </div>
      </section>
    </LandingLayout>
  );
}
