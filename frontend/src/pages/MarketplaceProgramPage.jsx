import { useEffect, useState } from 'react';
import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import LandingLayout from '../components/LandingLayout';

// Public read-only marketplace program page. Visual sibling of
// /cas-dusage/* and /integrations/* — same dark hero, same green
// uppercase labels, same big-card-plus-tiles ROI section. Sections
// only render if their block id is in page_blocks AND the underlying
// content is non-empty.

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#fafbfc', border: '#e2e8f0' };
const SITE = 'https://refboost.io';
const HREF_LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt'];
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

function SectionHeader({ label, title }) {
  return (
    <div style={{ textAlign: 'center', marginBottom: 32 }}>
      {label && (
        <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>
          {label}
        </p>
      )}
      {title && (
        <h2 style={{ margin: 0, fontSize: 'clamp(24px, 4vw, 32px)', fontWeight: 800, color: C.s, letterSpacing: -0.5 }}>{title}</h2>
      )}
    </div>
  );
}

function HeroSection({ program, t }) {
  return (
    <section style={{
      background: g(C.s, '#1e293b'),
      padding: '80px 24px 64px', textAlign: 'center',
    }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <nav aria-label="Breadcrumb" style={{ marginBottom: 20, fontSize: 13, color: 'rgba(255,255,255,0.55)' }}>
          <a href="/marketplace" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>Marketplace</a>
          <span style={{ margin: '0 8px', color: 'rgba(255,255,255,0.35)' }}>›</span>
          <span style={{ color: '#fff', fontWeight: 600 }}>{program.company_name}</span>
        </nav>

        <span style={{ display: 'inline-block', color: C.pl, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 20 }}>
          {t('marketplace.public.partner_program', 'Programme partenaire')}
        </span>

        {program.logo_url && (
          <div style={{
            width: 84, height: 84, borderRadius: 20, background: '#fff',
            margin: '0 auto 24px', display: 'flex', alignItems: 'center',
            justifyContent: 'center', padding: 14,
            boxShadow: '0 12px 32px rgba(0,0,0,0.25)',
          }}>
            <img src={program.logo_url} alt={program.company_name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        )}

        <h1 style={{ margin: '0 0 16px', fontSize: 'clamp(32px,5vw,48px)', fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -1 }}>
          {program.company_name}
        </h1>
        {program.short_description && (
          <p style={{ margin: '0 auto 28px', fontSize: 17, color: '#cbd5e1', lineHeight: 1.6, maxWidth: 640 }}>
            {program.short_description}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
          {program.sector && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(16,185,129,0.15)', color: '#34d399' }}>
              {program.sector}
            </span>
          )}
          {program.icp && (
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, background: 'rgba(255,255,255,0.08)', color: '#cbd5e1' }}>
              {program.icp}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
          <a
            href={'/apply/' + program.slug}
            style={{
              padding: '14px 28px', borderRadius: 12,
              background: g(C.p, C.pl), color: '#fff', textDecoration: 'none',
              fontWeight: 700, fontSize: 15, boxShadow: `0 8px 30px ${C.p}40`,
            }}
          >
            {t('marketplace.public.apply', 'Postuler au programme')} →
          </a>
          {program.website && (
            <a
              href={program.website}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '14px 28px', borderRadius: 12,
                background: 'transparent', color: '#fff', textDecoration: 'none',
                fontWeight: 600, fontSize: 15, border: '1.5px solid rgba(255,255,255,0.25)',
              }}
            >
              {t('marketplace.public.visit_site', 'Voir le site')}
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

function ConditionsSection({ blocks, t }) {
  if (!blocks?.length) return null;
  const primary = blocks.find(b => b.is_primary) || blocks[0];
  const others = blocks.filter(b => b.id !== primary?.id);
  return (
    <section style={{ background: '#fff', padding: '64px 24px', borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SectionHeader label={t('marketplace.public.conditions_title', 'Conditions du programme')} />
        {primary && (
          <div style={{
            padding: 56, borderRadius: 24, background: g(C.s, '#1e293b'),
            color: '#fff', textAlign: 'center', marginBottom: 16,
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -80, right: -80, width: 240, height: 240, borderRadius: '50%', background: `${C.p}18` }} />
            <div style={{ position: 'relative', zIndex: 1 }}>
              <div style={{ fontSize: 'clamp(48px,9vw,96px)', fontWeight: 900, lineHeight: 1, letterSpacing: -3, background: g(C.pl, '#6ee7b7'), WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', marginBottom: 16 }}>
                {primary.metric}
              </div>
              {primary.label && <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{primary.label}</div>}
              {primary.description && <p style={{ margin: '0 auto', fontSize: 17, color: '#cbd5e1', lineHeight: 1.5, maxWidth: 620 }}>{primary.description}</p>}
            </div>
          </div>
        )}
        {others.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fit, minmax(220px, 1fr))`, gap: 16 }}>
            {others.map(b => (
              <div key={b.id} style={{ padding: 32, borderRadius: 20, background: '#fff', border: `1px solid ${C.border}`, boxShadow: '0 2px 10px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: 36, fontWeight: 900, color: C.p, letterSpacing: -1, marginBottom: 8 }}>{b.metric}</div>
                {b.label && <div style={{ fontSize: 14, fontWeight: 700, color: C.s, marginBottom: 4 }}>{b.label}</div>}
                {b.description && <p style={{ margin: 0, fontSize: 13, color: C.m, lineHeight: 1.55 }}>{b.description}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function AboutSection({ program, t }) {
  if (!program.page_description) return null;
  return (
    <section style={{ background: C.bg, padding: '72px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <SectionHeader
          label={t('marketplace.public.about_title', 'À propos')}
          title={t('marketplace.public.discover', { company: program.company_name, defaultValue: 'Découvrez {{company}}' })}
        />
        <div style={{ color: C.m, fontSize: 16, lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
          {program.page_description}
        </div>
      </div>
    </section>
  );
}

function IdealClientSection({ program, t }) {
  const tags = program.ideal_client_tags || [];
  if (!program.ideal_client && !tags.length) return null;
  return (
    <section style={{ background: '#fff', padding: '72px 24px' }}>
      <div style={{ maxWidth: 800, margin: '0 auto', textAlign: 'center' }}>
        <SectionHeader label={t('marketplace.public.ideal_client', 'Client idéal')} />
        {program.ideal_client && (
          <p style={{ color: C.m, fontSize: 16, lineHeight: 1.75, marginBottom: 24 }}>{program.ideal_client}</p>
        )}
        {tags.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            {tags.map((t, i) => (
              <span key={i} style={{
                padding: '6px 14px', borderRadius: 999,
                background: '#f0fdf4', border: `1px solid #bbf7d0`,
                color: '#059669', fontSize: 13, fontWeight: 600,
              }}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function WhyJoinSection({ items, t }) {
  if (!items?.length) return null;
  return (
    <section style={{ background: C.bg, padding: '72px 24px' }}>
      <div style={{ maxWidth: 1000, margin: '0 auto' }}>
        <SectionHeader label={t('marketplace.public.why_join', 'Pourquoi devenir partenaire')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {items.map((it, i) => (
            <div key={it.id || i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 14,
              padding: 20, borderRadius: 14,
              background: '#fff', border: `1px solid ${C.border}`,
            }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%',
                background: `${C.p}15`, color: C.p, flexShrink: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 800, fontSize: 16,
              }}>✓</div>
              <p style={{ margin: 0, color: C.s, fontSize: 15, lineHeight: 1.6 }}>{it.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ReferencesSection({ items, t }) {
  if (!items?.length) return null;
  return (
    <section style={{ background: '#fff', padding: '72px 24px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SectionHeader label={t('marketplace.public.references', 'Ils nous font confiance')} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 18 }}>
          {items.map((r, i) => (
            <div key={r.id || i} style={{
              padding: 24, borderRadius: 16, background: '#fff', border: `1px solid ${C.border}`,
              textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
            }}>
              <div style={{
                width: 64, height: 64, borderRadius: 14, background: C.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: 10, overflow: 'hidden',
              }}>
                {r.logo_url ? (
                  <img src={r.logo_url} alt={r.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                ) : (
                  <span style={{ color: C.m, fontWeight: 800, fontSize: 22 }}>{(r.name || '?').charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div style={{ fontWeight: 700, fontSize: 15, color: C.s }}>{r.name}</div>
              {r.description && <p style={{ margin: 0, fontSize: 13, color: C.m, lineHeight: 1.5 }}>{r.description}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AdditionalInfoSection({ items, t }) {
  if (!items?.length) return null;
  return (
    <section style={{ background: C.bg, padding: '64px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <SectionHeader label={t('marketplace.public.additional_info', 'Informations complémentaires')} />
        <div style={{ background: '#fff', borderRadius: 16, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
          {items.map((it, i) => (
            <div key={it.id || i} style={{
              display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 16,
              padding: '14px 20px',
              borderTop: i === 0 ? 'none' : `1px solid ${C.border}`,
            }}>
              <div style={{ fontWeight: 700, color: C.s, fontSize: 14 }}>{it.label}</div>
              <div style={{ color: C.m, fontSize: 14 }}>{it.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CtaSection({ program, t }) {
  return (
    <section style={{
      background: g(C.s, '#1e293b'),
      padding: '80px 24px', textAlign: 'center', position: 'relative', overflow: 'hidden',
    }}>
      <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: `${C.p}10` }} />
      <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', zIndex: 1 }}>
        <h2 style={{ margin: '0 0 16px', fontSize: 'clamp(26px,4vw,36px)', fontWeight: 800, color: '#fff', letterSpacing: -1 }}>
          Rejoindre le programme {program.company_name}
        </h2>
        <p style={{ margin: '0 0 28px', fontSize: 17, color: '#cbd5e1', lineHeight: 1.6 }}>
          Postulez en quelques clics et démarrez à votre rythme.
        </p>
        <a
          href={'/apply/' + program.slug}
          style={{
            display: 'inline-block', padding: '15px 32px', borderRadius: 14,
            background: g(C.p, C.pl), color: '#fff', textDecoration: 'none',
            fontWeight: 700, fontSize: 16, boxShadow: `0 8px 30px ${C.p}40`,
          }}
        >
          {t('marketplace.public.apply_now', 'Postuler maintenant')} →
        </a>
      </div>
    </section>
  );
}

function SimilarSection({ similar, t }) {
  if (!similar?.length) return null;
  return (
    <section style={{ background: C.bg, padding: '64px 24px', borderTop: `1px solid ${C.border}` }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <SectionHeader label={t('marketplace.public.similar', 'Programmes similaires')} title="Découvrez aussi" />
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(similar.length, 3)},1fr)`, gap: 16 }}>
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
              <span style={{ color: C.p, fontSize: 13, fontWeight: 700 }}>Découvrir →</span>
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
  const navigate = useNavigate();
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

  if (notFound) return <Navigate to="/marketplace" replace />;
  if (loading) {
    return (
      <LandingLayout>
        <div style={{ padding: 80, textAlign: 'center', color: C.m, fontSize: 14 }}>Chargement…</div>
      </LandingLayout>
    );
  }
  if (!program) return null;

  const blocks = Array.isArray(program.page_blocks) && program.page_blocks.length
    ? program.page_blocks
    : ['hero', 'tiers', 'conditions', 'about', 'ideal_client', 'why_join', 'references', 'additional_info', 'cta'];
  const isVisible = (id) => blocks.includes(id);

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
        {/* Single x-default — every locale on this site is served from
            the same URL, so emitting per-lang hreflang tags pointing
            at the same href triggers Ahrefs' "page referenced for more
            than one language" warning. */}
        <link rel="alternate" hrefLang="x-default" href={url} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {isVisible('hero') && <HeroSection program={program} t={t} />}
      {/* Tiers omitted for now — admin spec marks it as read-only with a Programme link.
          When tier listing gets a public-facing API we'll plug it in here. */}
      {isVisible('conditions') && <ConditionsSection blocks={program.commission_blocks} t={t} />}
      {isVisible('about') && <AboutSection program={program} t={t} />}
      {isVisible('ideal_client') && <IdealClientSection program={program} t={t} />}
      {isVisible('why_join') && <WhyJoinSection items={program.why_join} t={t} />}
      {isVisible('references') && <ReferencesSection items={program.client_references} t={t} />}
      {isVisible('additional_info') && <AdditionalInfoSection items={program.additional_info} t={t} />}
      {isVisible('cta') && <CtaSection program={program} t={t} />}
      <SimilarSection similar={similar} t={t} />
    </LandingLayout>
  );
}
