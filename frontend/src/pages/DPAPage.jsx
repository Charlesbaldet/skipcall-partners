import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import LandingLayout from '../components/LandingLayout';

// Data Processing Agreement — public route /legal/dpa.
// Mirrors LegalPage's typography + LandingLayout shell so the
// document blends in with the rest of the legal corpus. Each
// section is i18n-keyed so the 7-locale rollout stays consistent
// (dpa.section.<n>.title / dpa.section.<n>.body).

const SITE = 'https://refboost.io';
const LAST_UPDATED = '8 mai 2026';

const SECTION_KEYS = [
  'parties',
  'subject',
  'nature',
  'categories',
  'subprocessors',
  'retention',
  'security',
  'breach',
  'deletion',
  'audit',
  'contact',
];

export default function DPAPage() {
  const { t } = useTranslation();
  const url = SITE + '/legal/dpa';
  const title = t('dpa.title', 'Accord de traitement des données (DPA)');
  const metaTitle = t('dpa.meta_title', 'Accord de traitement des données — RefBoost');
  const metaDescription = t(
    'dpa.meta_description',
    "Accord de traitement des données (DPA) RefBoost conforme à l'article 28 du RGPD : sous-traitants, durée, sécurité, notification de violation, droit d'audit."
  );

  return (
    <LandingLayout>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
      </Helmet>

      <article style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px 80px', color: '#0f172a', fontFamily: 'inherit' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: '0 0 8px' }}>{title}</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 32px' }}>
          {t('dpa.last_updated_label', 'Dernière mise à jour')} : {LAST_UPDATED}
        </p>

        <style>{`
          .rb-legal h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 32px 0 12px; letter-spacing: -0.2px; }
          .rb-legal p  { font-size: 15px; line-height: 1.7; color: #334155; margin: 0 0 14px; white-space: pre-line; }
          .rb-legal a  { color: #059669; text-decoration: underline; }
          .rb-legal strong { color: #0f172a; font-weight: 700; }
        `}</style>

        <div className="rb-legal">
          <p>
            {t(
              'dpa.intro',
              "Le présent accord de traitement des données (« DPA ») est conclu en application de l'article 28 du Règlement (UE) 2016/679 (RGPD) entre le client (« Responsable de traitement ») et RefBoost SAS (« Sous-traitant »). Il complète et fait partie intégrante des Conditions Générales de Vente."
            )}
          </p>

          {SECTION_KEYS.map((key, idx) => (
            <section key={key}>
              <h2>
                {idx + 1}. {t(`dpa.section.${key}.title`, defaultSectionTitle(key))}
              </h2>
              <p>{t(`dpa.section.${key}.body`, defaultSectionBody(key))}</p>
            </section>
          ))}
        </div>
      </article>
    </LandingLayout>
  );
}

// French fallback titles + bodies — used both as i18next defaults
// (so the page never flashes raw keys before the locale loads) and
// as the source-of-truth content the translation pipeline copies
// into the other 6 locales.
function defaultSectionTitle(key) {
  switch (key) {
    case 'parties': return 'Parties';
    case 'subject': return 'Objet et durée du traitement';
    case 'nature': return 'Nature et finalité du traitement';
    case 'categories': return 'Catégories de données et de personnes concernées';
    case 'subprocessors': return 'Sous-traitants ultérieurs';
    case 'retention': return 'Durée de conservation';
    case 'security': return 'Mesures de sécurité';
    case 'breach': return 'Notification de violation de données';
    case 'deletion': return 'Suppression des données en fin de contrat';
    case 'audit': return "Droit d'audit";
    case 'contact': return 'Contact';
    default: return key;
  }
}

function defaultSectionBody(key) {
  switch (key) {
    case 'parties':
      return 'Le Responsable de traitement est le client utilisant la plateforme RefBoost (l\'entreprise dont le compte tenant est créé). Le Sous-traitant est RefBoost SAS, société par actions simplifiée immatriculée en France, agissant en qualité de prestataire SaaS.';
    case 'subject':
      return "Le présent DPA s'applique pendant toute la durée du contrat d'abonnement RefBoost et pour la durée nécessaire à la suppression complète des données après résiliation (30 jours maximum après la fin du contrat).";
    case 'nature':
      return "Le Sous-traitant traite les données personnelles confiées par le Responsable de traitement aux seules fins de fournir les services de gestion de programme partenaires : authentification, suivi des recommandations, calcul et paiement des commissions, communication intra-programme, reporting analytique.";
    case 'categories':
      return "Catégories de personnes concernées : utilisateurs administrateurs et commerciaux, partenaires apporteurs d'affaires, prospects (filleuls / leads). Catégories de données : nom, prénom, email, téléphone, IBAN, informations entreprise, données fiscales, échanges intra-programme, statistiques d'usage.";
    case 'subprocessors':
      return [
        "Le Sous-traitant fait appel aux sous-traitants ultérieurs suivants :",
        "• Vercel Inc. (États-Unis / edges UE) — hébergement frontend",
        "• Railway Corporation (UE Ouest) — hébergement backend + base de données PostgreSQL",
        "• Resend Inc. (États-Unis) — envoi d'emails transactionnels",
        "• Qonto SAS (France) — paiements SEPA des commissions",
        "• Pennylane SAS (France) — comptabilité et facturation",
        "• HubSpot / Salesforce (uniquement si le tenant connecte explicitement l'intégration CRM)",
        "Les transferts hors UE sont encadrés par les clauses contractuelles types adoptées par la Commission européenne et/ou le Data Privacy Framework EU-US.",
      ].join('\n');
    case 'retention':
      return "Les données sont conservées pendant toute la durée du contrat. À la résiliation, elles sont conservées pendant 30 jours supplémentaires (fenêtre de récupération technique), puis supprimées définitivement, à l'exception des données nécessaires au respect d'obligations légales (facturation, comptabilité — 10 ans).";
    case 'security':
      return [
        "Le Sous-traitant met en œuvre les mesures techniques et organisationnelles suivantes :",
        "• Chiffrement TLS 1.3 pour toutes les données en transit",
        "• Chiffrement AES-256 pour les données stockées (base de données et sauvegardes)",
        "• Isolation multi-tenant stricte : chaque table est filtrée par tenant_id à chaque requête",
        "• Journalisation des accès (audit logs) avec rétention de 12 mois",
        "• Authentification forte (mots de passe hashés bcrypt, MFA disponible)",
        "• Sauvegardes chiffrées quotidiennes",
      ].join('\n');
    case 'breach':
      return "Conformément à l'article 33 du RGPD, le Sous-traitant notifie le Responsable de traitement de toute violation de données personnelles dans un délai de 72 heures après en avoir pris connaissance. La notification précise la nature de la violation, les catégories et le volume approximatif de personnes concernées, les conséquences probables et les mesures prises ou proposées pour y remédier.";
    case 'deletion':
      return "À la fin du contrat, et au plus tard 30 jours après la résiliation, le Sous-traitant supprime définitivement l'ensemble des données personnelles confiées par le Responsable de traitement, à l'exception de celles nécessaires au respect d'obligations légales. Une attestation de suppression peut être fournie sur demande.";
    case 'audit':
      return "Le Responsable de traitement dispose d'un droit d'audit sur les mesures de conformité du Sous-traitant. Cet audit peut être réalisé une fois par an, sur préavis de 30 jours, à la charge du Responsable de traitement, et doit respecter la confidentialité des autres clients du Sous-traitant.";
    case 'contact':
      return "Pour toute question relative au présent DPA ou à la protection des données : dpo@refboost.io.";
    default:
      return '';
  }
}
