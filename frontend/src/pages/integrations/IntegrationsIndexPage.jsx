import { useState } from 'react';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';
import { INTEGRATIONS, CATEGORIES } from './integrationsData';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#f8fafc' };
const SITE = 'https://refboost.io';

const HREF_LANGS = ['fr', 'en', 'es', 'de', 'it', 'nl', 'pt'];

function Logo({ letter, color, bg, size = 44 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: 10, background: bg,
      color, display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontWeight: 800, fontSize: size * 0.42, flexShrink: 0,
    }}>{letter}</div>
  );
}

function IntegrationCard({ integration }) {
  const i = integration;
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
        <Logo letter={i.logo.letter} color={i.logo.color} bg={i.logo.bg} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontWeight: 800, fontSize: 17, color: C.s }}>{i.name}</div>
          <div style={{ fontSize: 11, color: C.m, textTransform: 'uppercase', letterSpacing: 1, fontWeight: 600 }}>
            {i.categoryLabel}
          </div>
        </div>
      </div>
      <p style={{ color: C.m, fontSize: 14, lineHeight: 1.55, margin: '0 0 18px', flex: 1 }}>
        {i.shortDescription}
      </p>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{
          fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
          background: '#f0fdf4', color: '#059669',
        }}>Disponible</span>
        {i.plan === 'business' && (
          <span style={{
            fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999,
            background: '#eef2ff', color: '#4338ca',
          }}>Plan Business</span>
        )}
      </div>
      <span style={{ color: C.p, fontSize: 13, fontWeight: 700 }}>
        En savoir plus →
      </span>
    </a>
  );
}

function ComingSoonCard() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: '#fafbfc', borderRadius: 16, padding: 28,
      border: '2px dashed #cbd5e1', minHeight: 220,
      textAlign: 'center',
    }}>
      <div style={{ fontWeight: 700, fontSize: 15, color: C.s, marginBottom: 8 }}>
        D'autres intégrations arrivent
      </div>
      <div style={{ color: C.m, fontSize: 13, lineHeight: 1.55 }}>
        Zapier, Make, Microsoft SSO… Suggérez la vôtre depuis le formulaire de contact.
      </div>
    </div>
  );
}

export default function IntegrationsIndexPage() {
  const [filter, setFilter] = useState('all');

  const filtered = filter === 'all'
    ? INTEGRATIONS
    : INTEGRATIONS.filter(i => i.category === filter);

  const counts = {
    all: INTEGRATIONS.length,
    crm: INTEGRATIONS.filter(i => i.category === 'crm').length,
    payments: INTEGRATIONS.filter(i => i.category === 'payments').length,
    auth: INTEGRATIONS.filter(i => i.category === 'auth').length,
  };

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    name: 'Intégrations RefBoost',
    description: "Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Google SSO. Synchronisez votre pipeline et automatisez les paiements partenaires.",
    url: SITE + '/integrations',
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>Intégrations — RefBoost</title>
        <meta name="description" content="Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Google SSO. Synchronisez votre pipeline et automatisez les paiements partenaires." />
        <link rel="canonical" href={SITE + '/integrations'} />
        <meta property="og:title" content="Intégrations — RefBoost" />
        <meta property="og:description" content="Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Google SSO." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE + '/integrations'} />
        <meta property="og:image" content={SITE + '/og-image.png'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Intégrations — RefBoost" />
        <meta name="twitter:description" content="Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Google SSO." />
        {HREF_LANGS.map(l => (
          <link key={l} rel="alternate" hrefLang={l} href={SITE + '/integrations'} />
        ))}
        <link rel="alternate" hrefLang="x-default" href={SITE + '/integrations'} />
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
      </Helmet>

      {/* Hero — same dark gradient as /blog and /marketplace */}
      <div style={{ background: 'linear-gradient(135deg, ' + C.s + ' 0%, #1e293b 100%)', padding: '80px 24px 60px', textAlign: 'center' }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <span style={{ display: 'inline-block', color: C.p, fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16 }}>
            Intégrations
          </span>
          <h1 style={{ fontSize: 'clamp(28px,5vw,48px)', fontWeight: 900, color: '#fff', margin: '0 0 16px', lineHeight: 1.1 }}>
            Connectez vos outils
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 17, margin: '0 auto', lineHeight: 1.6, maxWidth: 600 }}>
            RefBoost s'intègre avec vos CRM, outils de paiement et d'authentification pour automatiser votre programme partenaires.
          </p>
        </div>
      </div>

      {/* Body */}
      <div style={{ background: '#fafbfc', padding: '60px 24px 80px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Category pills */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 36, justifyContent: 'center' }}>
            {CATEGORIES.map(cat => {
              const active = filter === cat.key;
              return (
                <button
                  key={cat.key}
                  onClick={() => setFilter(cat.key)}
                  style={{
                    padding: '8px 16px', borderRadius: 999,
                    background: active ? C.s : '#fff',
                    color: active ? '#fff' : C.m,
                    border: `1px solid ${active ? C.s : '#e2e8f0'}`,
                    fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    transition: 'all .15s',
                  }}
                >
                  {cat.label} ({counts[cat.key] ?? 0})
                </button>
              );
            })}
          </div>

          {/* Integration grid — 3 cols ≥768px, 1 col on mobile */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: 20,
          }}>
            {filtered.map(i => <IntegrationCard key={i.slug} integration={i} />)}
            {filter === 'all' && <ComingSoonCard />}
          </div>

          {/* CTA strip */}
          <div style={{
            marginTop: 60, padding: 36, borderRadius: 20,
            background: 'linear-gradient(135deg, #ecfdf5, #d1fae5)',
            textAlign: 'center', border: '1px solid #a7f3d0',
          }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, color: C.s, margin: '0 0 8px' }}>
              Une intégration manque ?
            </h2>
            <p style={{ color: C.m, fontSize: 15, margin: '0 0 20px' }}>
              Notre API et nos webhooks permettent de connecter à peu près n'importe quel outil. Et si une intégration native vous manque, dites-le-nous.
            </p>
            <a
              href="/signup"
              style={{
                display: 'inline-block', padding: '12px 28px', borderRadius: 12,
                background: C.s, color: '#fff', textDecoration: 'none',
                fontWeight: 700, fontSize: 14,
              }}
            >
              Commencer gratuitement →
            </a>
          </div>
        </div>
      </div>
    </LandingLayout>
  );
}
