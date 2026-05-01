import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import LandingLayout from '../components/LandingLayout';
import { BLOCK_COMPONENTS, DEFAULT_BLOCKS } from './marketplaceBlocks/MarketplaceEditorBlocks.jsx';

// Public read-only marketplace program page. Shares its block
// components with the WYSIWYG editor (/marketplace-admin) — same
// hero, same tier cards, same conditions, same references — by
// reusing BLOCK_COMPONENTS with `editable={false}`. The editor and
// public page therefore can never visually drift.
//
// ─── SEO checklist for marketplace detail pages ───────────────────
// Whenever you touch this file or the rendering pipeline, walk the
// list. Missing any one of these has historically dropped the page
// out of the index or tripped Ahrefs' orphan-page audit.
//
//   1. /marketplace listing cards link here via real <a href>
//      (not <button onClick={navigate}>). Confirmed in
//      MarketplacePage.jsx — the company name AND the green "En
//      savoir plus" CTA both render as anchor tags.
//   2. This page links OUT to other programs via the "Programmes
//      similaires" SimilarSection at the bottom. Real <a href>
//      again — gives crawlers a graph instead of leaf nodes.
//   3. Edge middleware on /marketplace renders a <noscript> list of
//      every published program with <a href="/marketplace/:slug">
//      so non-JS crawlers (Ahrefs is one) discover detail pages.
//      Without that block these pages were "Orphan page (no
//      incoming internal links)" even though the SPA renders the
//      cards perfectly.
//   4. Every detail page is in /sitemap.xml at exactly the same URL
//      shape as the internal links (/marketplace/{slug}, no
//      trailing slash, no query string). A mismatch is silent and
//      lethal for indexing.
//   5. Edge middleware injects WebPage JSON-LD + the noscript hero/
//      conditions/references body for crawlers — the static SPA
//      shell would otherwise have an empty <div id="root">.
//   6. Exactly one <h1> per page (the hero h1). The noscript body
//      uses <h2> for sub-section headings — having two h1s tripped
//      Ahrefs' "Multiple H1 tags" audit twice already.
//   7. <link rel="canonical"> + ONE <link rel="alternate"
//      hrefLang="x-default"> only. Per-locale hreflang tags
//      pointing at the same URL trigger Ahrefs' "page referenced
//      for more than one language" warning.
// ──────────────────────────────────────────────────────────────────

const C = { p: '#059669', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };
const SITE = 'https://refboost.io';

function SimilarSection({ similar, t }) {
  if (!similar?.length) return null;
  return (
    <section style={{ background: C.bg, padding: '64px 24px', borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
            {t('marketplace.public.similar', 'Programmes similaires')}
          </p>
          <h2 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>
            {t('marketplace.public.discover_more', 'Découvrez aussi')}
          </h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(260px, 1fr))`, gap: 16 }}>
          {similar.map(p => (
            <a
              key={p.slug}
              href={'/marketplace/' + p.slug}
              style={{
                display: 'block', padding: 24, borderRadius: 16,
                background: '#fff', border: `1px solid ${C.border}`,
                textDecoration: 'none', color: 'inherit',
                transition: 'transform .2s, box-shadow .2s',
              }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 12px 30px rgba(5,150,105,0.10)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                {p.logo_url && (
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: C.bg, padding: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <img src={p.logo_url} alt={p.company_name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  </div>
                )}
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: C.s }}>{p.company_name}</h3>
              </div>
              <p style={{ margin: '0 0 12px', fontSize: 13, color: C.m, lineHeight: 1.5 }}>{p.short_description}</p>
              <span style={{ color: C.p, fontSize: 13, fontWeight: 700 }}>{t('marketplace.learn_more', 'En savoir plus')} →</span>
            </a>
          ))}
        </div>
        <div style={{ textAlign: 'center', marginTop: 32 }}>
          <a href="/marketplace" style={{ color: C.p, fontSize: 14, fontWeight: 700, textDecoration: 'none', marginRight: 20 }}>
            {t('marketplace.public.view_all', 'Voir tous les programmes')} →
          </a>
          <a href="/" style={{ color: C.m, fontSize: 14, fontWeight: 600, textDecoration: 'none' }}>
            ← {t('marketplace.public.back_home', 'Retour à l\'accueil')}
          </a>
        </div>
      </div>
    </section>
  );
}

export default function MarketplaceProgramPage() {
  const { t, i18n } = useTranslation();
  const { slug } = useParams();
  const [loading, setLoading] = useState(true);
  const [program, setProgram] = useState(null);
  const [similar, setSimilar] = useState([]);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getMarketplaceProgram(slug).then(d => d.program).catch(err => { if (err?.status === 404) setNotFound(true); return null; }),
      api.getMarketplaceProgramSimilar(slug).then(d => d.programs || []).catch(() => []),
    ]).then(([p, s]) => {
      setProgram(p); setSimilar(s);
    }).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, i18n.language]);

  if (loading) {
    return (
      <LandingLayout>
        <div style={{ padding: 80, textAlign: 'center', color: C.m, fontSize: 14 }}>{t('common.loading', 'Chargement…')}</div>
      </LandingLayout>
    );
  }
  if (notFound || !program) {
    return (
      <LandingLayout>
        <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 800, color: C.s }}>
            {t('marketplace.not_found_title', 'Programme introuvable')}
          </h1>
          <p style={{ margin: 0, color: C.m, fontSize: 15, maxWidth: 480, textAlign: 'center', lineHeight: 1.55 }}>
            {t('marketplace.not_found_body', "Ce programme n'est pas (encore) publié sur la marketplace, ou son URL a changé.")}
          </p>
          <a href="/marketplace" style={{ marginTop: 8, color: C.p, fontSize: 14, fontWeight: 700, textDecoration: 'none' }}>
            ← {t('marketplace.see_all', 'Voir tous les programmes')}
          </a>
        </div>
      </LandingLayout>
    );
  }

  // Pack the flat program payload into the { tenant, page } shape the
  // shared blocks expect. revenue_model + threshold_type + tiers ride
  // on the tenant prop so TiersBlock can render without re-fetching.
  const tenant = {
    id: program.id,
    company_name: program.company_name,
    slug: program.slug,
    logo_url: program.logo_url,
    sector: program.sector,
    website: program.website,
    icp: program.icp,
    short_description: program.short_description,
    revenue_model: program.revenue_model,
    threshold_type: program.threshold_type,
    tiers: program.tiers,
  };
  const page = {
    page_description: program.page_description,
    ideal_client: program.ideal_client,
    ideal_client_tags: program.ideal_client_tags,
    why_join: program.why_join,
    commission_blocks: program.commission_blocks,
    client_references: program.client_references,
    additional_info: program.additional_info,
    page_blocks: program.page_blocks,
  };

  const blockOrder = Array.isArray(page.page_blocks) && page.page_blocks.length
    ? page.page_blocks
    : DEFAULT_BLOCKS;
  const noop = () => {};

  const url = SITE + '/marketplace/' + program.slug;
  const seoTitle = `Programme partenaire ${program.company_name} | RefBoost`.slice(0, 60);
  const seoDesc = (program.page_description || program.short_description || '').slice(0, 160);
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: seoTitle,
    description: seoDesc,
    url,
    inLanguage: (i18n?.language || 'fr').slice(0, 2),
    isPartOf: { '@type': 'WebSite', name: 'RefBoost', url: SITE + '/' },
    breadcrumb: {
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
        { '@type': 'ListItem', position: 2, name: 'Marketplace', item: SITE + '/marketplace' },
        { '@type': 'ListItem', position: 3, name: program.company_name },
      ],
    },
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>{seoTitle}</title>
        <meta name="description" content={seoDesc} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={seoTitle} />
        <meta property="og:description" content={seoDesc} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
        {program.logo_url && <meta property="og:image" content={program.logo_url} />}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={seoTitle} />
        <meta name="twitter:description" content={seoDesc} />
        <link rel="alternate" hrefLang="x-default" href={url} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div style={{ background: C.bg, padding: '32px 16px 48px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {blockOrder.map(id => {
            const Block = BLOCK_COMPONENTS[id];
            if (!Block) return null;
            return <Block key={id} tenant={tenant} page={page} onPatch={noop} t={t} editable={false} />;
          })}
        </div>
      </div>

      <SimilarSection similar={similar} t={t} />
    </LandingLayout>
  );
}
