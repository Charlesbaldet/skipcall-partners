// Structural metadata only — slug, category key, logo styling, plan
// gate, cross-links, and the SEO title/description served from
// middleware (FR primary). Every other piece of UI text (hero
// subtitle, features, steps, FAQs) is translated and lives under
// the `integrations.<slug>` namespace in frontend/src/locales/*.

export const INTEGRATIONS = [
  {
    slug: 'notion',
    category: 'crm',
    available: true,
    plan: null,
    logo: { letter: 'N', color: '#000000', bg: '#f1f5f9' },
    seoTitle: 'Intégration Notion — RefBoost',
    seoDescription: "Synchronisez votre pipeline RefBoost avec Notion. Mapping bidirectionnel des statuts, contacts et entreprises avec détection de doublons.",
    crossLinks: ['hubspot', 'salesforce', 'qonto'],
  },
  {
    slug: 'hubspot',
    category: 'crm',
    available: true,
    plan: null,
    logo: { letter: 'H', color: '#ff7a59', bg: '#fff5f1' },
    seoTitle: 'Intégration HubSpot — RefBoost',
    seoDescription: 'Connectez HubSpot CRM à RefBoost. Synchronisez automatiquement vos referrals, contacts et deals avec HubSpot via OAuth.',
    crossLinks: ['notion', 'salesforce', 'qonto'],
  },
  {
    slug: 'salesforce',
    category: 'crm',
    available: true,
    plan: null,
    logo: { letter: 'S', color: '#00a1e0', bg: '#e6f6fc' },
    seoTitle: 'Intégration Salesforce — RefBoost',
    seoDescription: 'Connectez Salesforce à RefBoost. Synchronisez vos Opportunities, Contacts et Accounts avec votre programme partenaires.',
    crossLinks: ['notion', 'hubspot', 'qonto'],
  },
  {
    slug: 'qonto',
    category: 'payments',
    available: true,
    plan: 'business',
    logo: { letter: 'Q', color: '#d4a015', bg: '#fff8e1' },
    seoTitle: 'Intégration Qonto — RefBoost',
    seoDescription: 'Automatisez le paiement de vos commissions partenaires via Qonto. Virements SEPA en un clic avec validation SCA sécurisée.',
    crossLinks: ['notion', 'hubspot', 'google-sso'],
  },
  {
    slug: 'google-sso',
    category: 'auth',
    available: true,
    plan: null,
    logo: { letter: 'G', color: '#4285f4', bg: '#e8f0fe' },
    seoTitle: 'Google SSO — RefBoost',
    seoDescription: 'Permettez à vos équipes et partenaires de se connecter à RefBoost via Google SSO. Connexion sécurisée sans mot de passe.',
    crossLinks: ['notion', 'hubspot', 'qonto'],
  },
];

export const CATEGORY_KEYS = ['all', 'crm', 'payments', 'auth'];

export function getIntegration(slug) {
  return INTEGRATIONS.find(i => i.slug === slug) || null;
}
