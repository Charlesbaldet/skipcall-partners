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
    logoSrc: '/images/integrations/notion-logo.png',
    seoTitle: 'Intégration Notion — RefBoost',
    seoDescription: "Synchronisez votre pipeline RefBoost avec Notion. Mapping bidirectionnel des statuts, contacts et entreprises avec détection de doublons.",
    crossLinks: ['hubspot', 'salesforce', 'qonto'],
  },
  {
    slug: 'hubspot',
    category: 'crm',
    available: true,
    plan: null,
    logoSrc: '/images/integrations/hubspot-logo.svg',
    seoTitle: 'Intégration HubSpot — RefBoost',
    seoDescription: 'Connectez HubSpot CRM à RefBoost. Synchronisez automatiquement vos referrals, contacts et deals avec HubSpot via OAuth.',
    crossLinks: ['notion', 'salesforce', 'qonto'],
  },
  {
    slug: 'salesforce',
    category: 'crm',
    available: true,
    plan: null,
    logoSrc: '/images/integrations/salesforce-logo.svg',
    seoTitle: 'Intégration Salesforce — RefBoost',
    seoDescription: 'Connectez Salesforce à RefBoost. Synchronisez vos Opportunities, Contacts et Accounts avec votre programme partenaires.',
    crossLinks: ['notion', 'hubspot', 'qonto'],
  },
  {
    slug: 'qonto',
    category: 'payments',
    available: true,
    plan: 'business',
    logoSrc: '/images/integrations/qonto-logo.svg',
    seoTitle: 'Intégration Qonto — RefBoost',
    seoDescription: 'Automatisez le paiement de vos commissions partenaires via Qonto. Virements SEPA en un clic avec validation SCA sécurisée.',
    crossLinks: ['notion', 'hubspot', 'pennylane'],
  },
  {
    slug: 'pennylane',
    category: 'accounting',
    available: true,
    plan: null,
    logoSrc: '/images/integrations/pennylane-logo.svg',
    seoTitle: 'Intégration Pennylane — RefBoost',
    seoDescription: 'Automatisez la comptabilité de vos commissions partenaires. Chaque commission approuvée crée une facture fournisseur dans Pennylane, marquée payée dès le virement Qonto.',
    crossLinks: ['qonto', 'notion', 'hubspot'],
  },
  {
    slug: 'google-sso',
    category: 'auth',
    available: true,
    plan: null,
    logoSrc: '/images/integrations/google-logo.svg',
    seoTitle: 'Google SSO — RefBoost',
    seoDescription: 'Permettez à vos équipes et partenaires de se connecter à RefBoost via Google SSO. Connexion sécurisée sans mot de passe.',
    crossLinks: ['notion', 'hubspot', 'qonto'],
  },
];

export const CATEGORY_KEYS = ['all', 'crm', 'payments', 'accounting', 'auth'];

export function getIntegration(slug) {
  return INTEGRATIONS.find(i => i.slug === slug) || null;
}
