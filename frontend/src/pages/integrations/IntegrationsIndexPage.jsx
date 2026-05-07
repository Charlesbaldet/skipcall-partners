import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';
import { INTEGRATIONS, CATEGORY_KEYS } from './integrationsData';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b' };
const SITE = 'https://refboost.io';
const HREF_LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt'];

function Logo({ src, alt, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10,
      background: '#fff', border: '1px solid #e2e8f0',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, padding: 6,
    }}>
      <img
        src={src}
        alt={alt}
        width={size - 12}
        height={size - 12}
        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
      />
    </div>
  );
}

function IntegrationCard({ integration, t }) {
  const i = integration;
  const tk = (k) => t(`integrations.${i.slug}.${k}`);
  return (
    <a
      href={`/integrations/${i.slug}`}
      style={{
        display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: 16, padding: 24,
        border: '1px solid #e2e8f0', textDecoration: 'none',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
        transition: 'transform .15s, box-shadow .15s, border-color .15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 12px 30px rgba(15,23,42,0.08)';
        e.currentTarget.style.borderColor = '#cbd5e1';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.04)';
        e.currentTarget.style.borderColor = '#e2e8f0';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <Logo src={i.logoSrc} alt={tk('name')} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: C.s }}>{tk('name')}</div>
          <div style={{ fontSize: 11, color: C.m, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            {t(`integrations.shared.categories.${i.category}`)}
          </div>
        </div>
      </div>
      <p style={{ color: C.m, fontSize: 14, lineHeight: 1.55, margin: '0 0 18px', flex: 1 }}>
        {tk('shortDescription')}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          background: '#f0fdf4', color: '#059669',
        }}>{t('integrations.shared.available')}</span>
        {i.plan === 'business' && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            background: '#eef2ff', color: '#4338ca',
          }}>{t('integrations.shared.business_plan')}</span>
        )}
      </div>
      <span style={{ color: C.p, fontSize: 13, fontWeight: 700 }}>
        {t('integrations.shared.learn_more')} →
      </span>
    </a>
  );
}

function ComingSoonCard({ t }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: '#fafbfc', borderRadius: 16, padding: 28,
      border: '2px dashed #cbd5e1', minHeight: 220,
      textAlign: 'center',
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.s, marginBottom: 8 }}>
        {t('integrations.shared.soon_title')}
      </div>
      <div style={{ color: C.m, fontSize: 13, lineHeight: 1.55 }}>
        {t('integrations.shared.soon_body')}
      </div>
    </div>
  );
}

export default function IntegrationsIndexPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all'
    ? INTEGRATIONS
    : INTEGRATIONS.filter(i => i.category === filter);

  const counts = {
    all: INTEGRATIONS.length,
    crm: INTEGRATIONS.filter(i => i.category === 'crm').length,
    payments: INTEGRATIONS.filter(i => i.category === 'payments').length,
    accounting: INTEGRATIONS.filter(i => i.category === 'accounting').length,
    auth: INTEGRATIONS.filter(i => i.category === 'auth').length,
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: t('integrations.index.seoTitle', 'Intégrations RefBoost'),
    description: t('integrations.index.seoDescription', "Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Pennylane, Google SSO."),
    url: SITE + '/integrations',
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>Intégrations — RefBoost</title>
        <meta name="description" content="Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Pennylane, Google SSO. Synchronisez votre pipeline et automatisez les paiements partenaires." />
        <link rel="canonical" href={SITE + '/integrations'} />
        <meta property="og:title" content="Intégrations — RefBoost" />
        <meta property="og:description" content="Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Pennylane, Google SSO." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE + '/integrations'} />
        <meta property="og:image" content={SITE + '/og-image.png'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Intégrations — RefBoost" />
        <meta name="twitter:description" content="Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Pennylane, Google SSO." />
        {/* Single x-default — every locale on this site is served from
            the same URL (no /en/* / /es/* paths), so emitting per-lang
            hreflang tags pointing at the same href triggers Ahrefs'
            "page referenced for more than one language" warning. */}
        <link rel="alternate" hrefLang="x-default" href={SITE + '/integrations'} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      <div style={{ background: 'linear-gradient(135deg, ' + C.s + ' 0%, #1e293b 100%)', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', color: C.p, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            {t('integrations.index.label', 'Intégrations')}
          </span>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', margin: '0 0 16px', lineHeight: 1.1 }}>
            {t('integrations.index.title', 'Connectez vos outils')}
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 17, margin: '0 auto', lineHeight: 1.6, maxWidth: 600 }}>
            {t('integrations.index.subtitle', "RefBoost s'intègre avec vos CRM, outils de paiement et d'authentification pour automatiser votre programme partenaires.")}
          </p>
        </div>
      </div>

      <div style={{ background: '#fafbfc', padding: '60px 24px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36, justifyContent: 'center' }}>
            {CATEGORY_KEYS.map(catKey => {
              const active = filter === catKey;
              return (
                <button
                  key={catKey}
                  onClick={() => setFilter(catKey)}
                  style={{
                    padding: '8px 16px', borderRadius: 999,
                    background: active ? C.s : '#fff',
                    color: active ? '#fff' : C.m,
                    border: `1px solid ${active ? C.s : '#e2e8f0'}`,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  }}
                >
                  {t(`integrations.shared.filters.${catKey}`)} ({counts[catKey] ?? 0})
                </button>
              );
            })}
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {filtered.map(i => <IntegrationCard key={i.slug} integration={i} t={t} />)}
            {filter === 'all' && <ComingSoonCard t={t} />}
          </div>

          <div style={{
            marginTop: 60, padding: 36, borderRadius: 20,
            background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
            textAlign: 'center', border: '1px solid #a7f3d0',
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: C.s, margin: '0 0 8px' }}>
              {t('integrations.index.cta_title', 'Une intégration manque ?')}
            </h2>
            <p style={{ color: C.m, fontSize: 15, margin: '0 0 20px' }}>
              {t('integrations.index.cta_subtitle', "Notre API et nos webhooks permettent de connecter à peu près n'importe quel outil. Et si une intégration native vous manque, dites-le-nous.")}
            </p>
            <a
              href="/signup"
              style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: 12,
                background: C.s, color: '#fff', textDecoration: 'none',
                fontWeight: 700, fontSize: 14,
              }}
            >
              {t('integrations.shared.cta_signup', 'Commencer gratuitement')} →
            </a>
          </div>
        </div>
      </div>
    </LandingLayout>
  );
}
