// Source-of-truth for the 5 integration sub-pages and the index grid.
// One entry per integration; the detail-page template reads everything
// from here so adding a new integration is one config edit, not a new
// React file. Body content stays in FR (matches the blog/marketplace
// pattern on this site — per-page <title>/description/canonical and
// hreflang in middleware.js are what crawlers actually grade for SEO).

export const INTEGRATIONS = [
  {
    slug: 'notion',
    name: 'Notion',
    category: 'crm',
    categoryLabel: 'CRM',
    available: true,
    plan: null,
    logo: { letter: 'N', color: '#000000', bg: '#f1f5f9' },
    shortDescription: 'Synchronisez votre pipeline avec vos bases Notion. Mapping bidirectionnel des statuts et des champs.',
    seoTitle: 'Intégration Notion — RefBoost',
    seoDescription: "Synchronisez votre pipeline RefBoost avec Notion. Mapping bidirectionnel des statuts, contacts et entreprises avec détection de doublons.",
    heroSubtitle: "Connectez vos bases Notion à RefBoost pour synchroniser votre pipeline partenaires en temps réel. Mapping bidirectionnel des statuts, des champs et des contacts.",
    features: [
      { title: 'Sync bidirectionnelle', description: 'Les referrals créés dans RefBoost apparaissent dans Notion et vice-versa, sans duplication.' },
      { title: 'Mapping des champs', description: 'Mappez vos propriétés Notion à nos champs RefBoost (nom, entreprise, valeur, statut, etc.).' },
      { title: 'Mapping des statuts', description: 'Vos colonnes de statut Notion sont alignées avec les étapes du pipeline RefBoost.' },
      { title: 'Détection des doublons', description: 'Aucun risque d\'écraser vos données : on détecte les doublons avant chaque écriture.' },
    ],
    steps: [
      { title: 'Connectez Notion', description: 'Créez un token d\'intégration interne Notion et collez-le dans RefBoost. Aucun OAuth requis.' },
      { title: 'Configurez le mapping', description: 'Choisissez la base à synchroniser, mappez les champs et les statuts en quelques clics.' },
      { title: 'C\'est synchronisé', description: 'Push temps réel des nouveaux referrals, pull quotidien à 21h pour rattraper les modifications côté Notion.' },
    ],
    faqs: [
      { q: 'Faut-il un compte Notion payant ?', a: 'Non, l\'intégration fonctionne avec un compte gratuit. Le seul prérequis est un token d\'intégration interne (création gratuite et instantanée).' },
      { q: 'Mes données Notion vont-elles être écrasées ?', a: 'Non. RefBoost détecte les doublons avant chaque écriture et propose une fusion plutôt que d\'écraser. Vous gardez le contrôle.' },
      { q: 'À quelle fréquence la synchronisation a-t-elle lieu ?', a: 'Push temps réel pour toute création/modification dans RefBoost. Pull complet une fois par jour à 21h pour rattraper les changements faits directement dans Notion.' },
      { q: 'Puis-je synchroniser plusieurs bases Notion ?', a: 'Oui, le plan Business permet de connecter plusieurs bases Notion (par exemple une base de leads et une base de clients).' },
    ],
    crossLinks: ['hubspot', 'salesforce', 'qonto'],
  },
  {
    slug: 'hubspot',
    name: 'HubSpot',
    category: 'crm',
    categoryLabel: 'CRM',
    available: true,
    plan: null,
    logo: { letter: 'H', color: '#ff7a59', bg: '#fff5f1' },
    shortDescription: 'Poussez vos referrals vers HubSpot Deals. Sync automatique des contacts et des transactions.',
    seoTitle: 'Intégration HubSpot — RefBoost',
    seoDescription: 'Connectez HubSpot CRM à RefBoost. Synchronisez automatiquement vos referrals, contacts et deals avec HubSpot via OAuth.',
    heroSubtitle: 'Connectez votre HubSpot CRM à RefBoost. Chaque referral devient un Deal HubSpot, chaque prospect un Contact, le tout synchronisé en temps réel.',
    features: [
      { title: 'Sync des deals', description: 'Chaque referral RefBoost devient un Deal HubSpot dans le pipeline de votre choix.' },
      { title: 'Contacts automatiques', description: 'Le prospect apparaît comme Contact HubSpot avec les infos partenaire en propriétés associées.' },
      { title: 'Statuts mappés', description: 'Vos étapes de Deal HubSpot sont alignées avec les statuts RefBoost dans les deux sens.' },
      { title: 'Détection des doublons', description: 'Si le contact existe déjà dans HubSpot, on lie le deal au contact existant plutôt que d\'en créer un nouveau.' },
    ],
    steps: [
      { title: 'Connectez HubSpot', description: 'Cliquez sur "Connecter HubSpot" : OAuth sécurisé, aucune clé d\'API à coller.' },
      { title: 'Configurez le mapping', description: 'Choisissez le pipeline HubSpot cible et mappez les statuts à vos étapes RefBoost.' },
      { title: 'Sync automatique', description: 'Tout nouveau referral apparaît instantanément dans HubSpot. Webhook bidirectionnel pour les mises à jour de statut.' },
    ],
    faqs: [
      { q: 'Quelle version de HubSpot est nécessaire ?', a: 'HubSpot Starter ou supérieur. La version gratuite ne donne pas accès à l\'API CRM nécessaire pour l\'intégration.' },
      { q: 'API key ou OAuth ?', a: 'OAuth uniquement, pour la sécurité. Aucune clé API à manipuler — la connexion se fait en deux clics et se révoque côté HubSpot à tout moment.' },
      { q: 'Que se passe-t-il avec mes deals existants ?', a: 'Rien n\'est touché côté HubSpot. Les nouveaux referrals RefBoost créent de nouveaux deals ; les contacts existants sont liés automatiquement.' },
      { q: 'Puis-je désactiver la sync sans déconnecter HubSpot ?', a: 'Oui, vous pouvez mettre l\'intégration en pause depuis Settings → Intégrations sans révoquer les tokens.' },
    ],
    crossLinks: ['notion', 'salesforce', 'qonto'],
  },
  {
    slug: 'salesforce',
    name: 'Salesforce',
    category: 'crm',
    categoryLabel: 'CRM',
    available: true,
    plan: null,
    logo: { letter: 'S', color: '#00a1e0', bg: '#e6f6fc' },
    shortDescription: 'Connectez vos Opportunities Salesforce. Import/export des leads et statuts en temps réel.',
    seoTitle: 'Intégration Salesforce — RefBoost',
    seoDescription: 'Connectez Salesforce à RefBoost. Synchronisez vos Opportunities, Contacts et Accounts avec votre programme partenaires.',
    heroSubtitle: 'Connectez votre instance Salesforce à RefBoost. Synchronisation des Opportunities, Contacts et Accounts avec mapping personnalisé des objets standards et custom.',
    features: [
      { title: 'Opportunities sync', description: 'Chaque referral RefBoost devient une Opportunity Salesforce dans la Stage de votre choix.' },
      { title: 'Contacts & Accounts', description: 'Le prospect est créé comme Contact lié à un Account, avec rattachement intelligent aux Accounts existants.' },
      { title: 'Statuts pipeline', description: 'Vos Stages Salesforce sont alignées avec les statuts RefBoost dans les deux sens.' },
      { title: 'Custom objects', description: 'Mappez vos custom objects et fields Salesforce vers les données RefBoost via l\'éditeur de mapping.' },
    ],
    steps: [
      { title: 'Connectez Salesforce', description: 'OAuth via votre login Salesforce. Production ou Sandbox — RefBoost détecte automatiquement.' },
      { title: 'Mappez les objets', description: 'Choisissez Opportunities ou un custom object, mappez les fields, les record types et les Stages.' },
      { title: 'Sync bidirectionnelle', description: 'Push temps réel via l\'API REST. Webhook Salesforce vers RefBoost pour les mises à jour de Stage.' },
    ],
    faqs: [
      { q: 'Quelle édition Salesforce est nécessaire ?', a: 'Enterprise Edition ou Professional avec accès API activé. Les éditions Essentials et Group n\'incluent pas l\'API REST.' },
      { q: 'Puis-je utiliser des custom objects ?', a: 'Oui. L\'éditeur de mapping vous laisse choisir n\'importe quel objet (standard ou custom) comme cible de synchronisation.' },
      { q: 'Sandbox supporté ?', a: 'Oui, vous pouvez connecter d\'abord une Sandbox pour tester puis basculer en Production sans reconfigurer le mapping.' },
      { q: 'Est-ce compatible avec Salesforce Lightning et Classic ?', a: 'Oui, l\'intégration utilise l\'API REST qui fonctionne identiquement sur les deux interfaces.' },
    ],
    crossLinks: ['notion', 'hubspot', 'qonto'],
  },
  {
    slug: 'qonto',
    name: 'Qonto',
    category: 'payments',
    categoryLabel: 'Paiements',
    available: true,
    plan: 'business',
    logo: { letter: 'Q', color: '#d4a015', bg: '#fff8e1' },
    shortDescription: 'Virements SEPA automatisés. Payez vos partenaires en un clic avec validation SCA sécurisée.',
    seoTitle: 'Intégration Qonto — RefBoost',
    seoDescription: 'Automatisez le paiement de vos commissions partenaires via Qonto. Virements SEPA en un clic avec validation SCA sécurisée.',
    heroSubtitle: 'Connectez votre compte pro Qonto à RefBoost et payez les commissions de vos partenaires en un clic. Virements SEPA, validation SCA et preuve de virement automatisée.',
    features: [
      { title: 'Virements SEPA automatisés', description: 'Un clic sur "Payer" déclenche un virement SEPA depuis votre compte Qonto, sans ressaisie d\'IBAN.' },
      { title: 'Validation SCA sécurisée', description: 'Conforme DSP2 : chaque virement passe par la validation forte sur votre app Qonto avant exécution.' },
      { title: 'Paiements groupés', description: 'Sélectionnez jusqu\'à 400 commissions et payez-les toutes en une seule action.' },
      { title: 'Preuve de virement par email', description: 'Le partenaire reçoit un email automatique avec la référence du virement dès que Qonto l\'a exécuté.' },
    ],
    steps: [
      { title: 'Connectez Qonto', description: 'OAuth officiel Qonto depuis Settings → Intégrations. La connexion prend 30 secondes.' },
      { title: 'Sélectionnez votre compte', description: 'Choisissez quel compte Qonto débiter (utile si vous avez plusieurs sous-comptes).' },
      { title: 'Payez en un clic', description: 'Sur chaque commission validée, le bouton "Payer" déclenche le virement avec validation SCA.' },
    ],
    faqs: [
      { q: 'La validation SCA est-elle obligatoire ?', a: 'Oui, c\'est imposé par la directive européenne DSP2. RefBoost vous rappelle simplement de valider sur votre app Qonto, l\'opération elle-même prend 5 secondes.' },
      { q: 'Combien de paiements groupés sont possibles ?', a: 'Jusqu\'à 400 commissions par lot. Au-delà, le système les découpe automatiquement en plusieurs lots successifs.' },
      { q: 'Y a-t-il des frais RefBoost en plus des frais Qonto ?', a: 'Non, RefBoost ne prélève aucun frais sur les virements. Seuls les frais SEPA habituels de votre compte Qonto s\'appliquent (gratuits dans la zone SEPA).' },
      { q: 'Quel plan RefBoost est nécessaire ?', a: 'L\'intégration Qonto est incluse dans le plan Business. Les plans Starter et Pro voient l\'intégration mais ne peuvent pas l\'activer.' },
    ],
    crossLinks: ['notion', 'hubspot', 'google-sso'],
  },
  {
    slug: 'google-sso',
    name: 'Google SSO',
    category: 'auth',
    categoryLabel: 'Authentification',
    available: true,
    plan: null,
    logo: { letter: 'G', color: '#4285f4', bg: '#e8f0fe' },
    shortDescription: 'Connexion sécurisée via Google pour vos équipes et vos partenaires. Zéro mot de passe à gérer.',
    seoTitle: 'Intégration Google SSO — RefBoost',
    seoDescription: 'Permettez à vos équipes et partenaires de se connecter à RefBoost via Google SSO. Connexion sécurisée sans mot de passe.',
    heroSubtitle: 'Activé par défaut sur tous les plans. Vos équipes et vos partenaires se connectent à RefBoost via leur compte Google en un clic — zéro mot de passe à gérer, sécurité renforcée.',
    features: [
      { title: 'Connexion sans mot de passe', description: 'Un clic sur "Se connecter avec Google" et l\'utilisateur est dans son espace RefBoost.' },
      { title: 'Multi-tenant', description: 'Le même compte Google peut accéder à plusieurs espaces partenaires si l\'utilisateur travaille avec plusieurs programmes.' },
      { title: 'Sécurité renforcée', description: 'Pas de mot de passe stocké : les fuites de mots de passe ne vous concernent plus. 2FA hérité de Google.' },
      { title: 'Onboarding simplifié', description: 'Pas de réinitialisation de mot de passe oubliée : un partenaire qui s\'inscrit avec Google peut se reconnecter à vie sans friction.' },
    ],
    steps: [
      { title: 'Activé par défaut', description: 'Aucune configuration nécessaire. Le bouton "Se connecter avec Google" apparaît sur toutes les pages de connexion RefBoost.' },
      { title: 'Le partenaire clique', description: 'Le partenaire choisit "Se connecter avec Google" sur l\'écran de login ou d\'inscription.' },
      { title: 'Accès instantané', description: 'L\'utilisateur arrive dans son espace ; les sessions Google et RefBoost sont synchronisées.' },
    ],
    faqs: [
      { q: 'Le SSO Google est-il obligatoire pour mes utilisateurs ?', a: 'Non. La connexion email + mot de passe reste disponible. Les utilisateurs peuvent choisir leur méthode au moment de l\'inscription.' },
      { q: 'Quelles données Google sont partagées avec RefBoost ?', a: 'Uniquement le nom complet et l\'adresse email. RefBoost ne lit ni vos contacts, ni vos emails, ni votre Drive.' },
      { q: 'Mes partenaires peuvent-ils lier leur compte existant à Google ?', a: 'Oui. Si un partenaire avec un compte email/mot de passe se connecte ensuite via Google avec la même adresse, les deux méthodes sont automatiquement liées.' },
      { q: 'Microsoft SSO ou Okta sont-ils prévus ?', a: 'Microsoft SSO est sur la roadmap pour 2026. Okta / SAML générique sont prévus pour les comptes Enterprise — contactez-nous si vous en avez besoin.' },
    ],
    crossLinks: ['notion', 'hubspot', 'qonto'],
  },
];

export const CATEGORIES = [
  { key: 'all', label: 'Toutes' },
  { key: 'crm', label: 'CRM' },
  { key: 'payments', label: 'Paiements' },
  { key: 'auth', label: 'Authentification' },
];

export function getIntegration(slug) {
  return INTEGRATIONS.find(i => i.slug === slug) || null;
}
