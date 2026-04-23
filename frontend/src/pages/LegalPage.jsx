import { Helmet } from 'react-helmet-async';
import LandingLayout from '../components/LandingLayout';

// Single component that backs all four legal routes. Each variant
// supplies its own meta + raw HTML body — admin-grade legal copy
// rarely changes, so inlining keeps everything in one auditable file.

const SITE = 'https://refboost.io';
const LAST_UPDATED = '22 avril 2026';

const LEGAL = {
  cgv: {
    path: '/cgv',
    title: 'Conditions Générales de Vente',
    metaTitle: 'Conditions générales de vente — RefBoost',
    metaDescription: "Conditions générales de vente RefBoost : abonnements, facturation, résiliation, garanties et responsabilités de la plateforme SaaS partenaires.",
    body: `
<h2>1. Objet</h2>
<p>Les présentes Conditions Générales de Vente (CGV) régissent les relations contractuelles entre la société éditrice de RefBoost (ci-après « l'Éditeur ») et toute personne physique ou morale souscrivant à un abonnement sur la plateforme RefBoost (ci-après « le Client »).</p>
<p>RefBoost est une plateforme SaaS de gestion de programmes d'apporteurs d'affaires et de partenaires commerciaux accessible à l'adresse https://refboost.io.</p>

<h2>2. Inscription et compte</h2>
<p>L'accès aux services de RefBoost nécessite la création d'un compte. Le Client garantit l'exactitude des informations fournies lors de l'inscription. Il est responsable de la confidentialité de ses identifiants de connexion et de toute activité réalisée depuis son compte.</p>

<h2>3. Description des services</h2>
<p>RefBoost propose une plateforme permettant de gérer un programme de partenaires commerciaux, incluant notamment : la gestion du pipeline de leads partenaires, le calcul et le suivi des commissions, un portail dédié aux partenaires, des intégrations CRM, une marketplace de programmes partenaires, et des outils d'analyse et de reporting.</p>
<p>Les fonctionnalités disponibles dépendent du plan d'abonnement choisi par le Client.</p>

<h2>4. Tarification et paiement</h2>
<p>Les prix des abonnements sont indiqués en euros hors taxes sur la page Tarifs du site. L'Éditeur se réserve le droit de modifier ses tarifs à tout moment, les nouveaux tarifs s'appliquant au renouvellement suivant de l'abonnement.</p>
<p>Le paiement est effectué par carte bancaire via la plateforme de paiement sécurisée Stripe. Les abonnements sont facturés mensuellement ou annuellement selon le choix du Client.</p>

<h2>5. Durée et résiliation</h2>
<p>L'abonnement est souscrit pour une durée indéterminée avec une période de facturation mensuelle ou annuelle. Le Client peut résilier son abonnement à tout moment depuis son espace de gestion. La résiliation prend effet à la fin de la période de facturation en cours.</p>
<p>L'Éditeur se réserve le droit de suspendre ou de résilier l'accès du Client en cas de non-respect des présentes CGV, de non-paiement, ou d'utilisation abusive de la plateforme.</p>

<h2>6. Droit de rétractation</h2>
<p>Conformément à l'article L221-28 du Code de la consommation, le droit de rétractation ne s'applique pas aux contrats de fourniture de contenu numérique non fourni sur un support matériel dont l'exécution a commencé avec l'accord du consommateur.</p>
<p>Le Client bénéficie toutefois d'une période d'essai gratuite lui permettant de tester le service avant tout engagement financier.</p>

<h2>7. Responsabilité</h2>
<p>L'Éditeur s'engage à fournir un service conforme à la description de l'offre souscrite. La responsabilité de l'Éditeur est limitée aux dommages directs et prévisibles, et ne saurait excéder le montant total des sommes versées par le Client au cours des 12 derniers mois.</p>
<p>L'Éditeur ne saurait être tenu responsable des dommages indirects, des pertes de données, de chiffre d'affaires ou de bénéfices, ni des interruptions de service dues à des cas de force majeure.</p>

<h2>8. Propriété intellectuelle</h2>
<p>La plateforme RefBoost, son code source, son interface, ses textes, images et éléments graphiques sont la propriété exclusive de l'Éditeur. Toute reproduction, représentation ou exploitation non autorisée est interdite.</p>
<p>Les données saisies par le Client restent sa propriété. Le Client accorde à l'Éditeur une licence limitée d'utilisation de ces données aux seules fins de fourniture du service.</p>

<h2>9. Disponibilité du service</h2>
<p>L'Éditeur s'efforce de maintenir le service accessible 24 heures sur 24, 7 jours sur 7. Toutefois, l'Éditeur ne garantit pas une disponibilité ininterrompue et ne saurait être tenu responsable des interruptions liées à la maintenance, aux mises à jour ou aux pannes techniques.</p>

<h2>10. Droit applicable et litiges</h2>
<p>Les présentes CGV sont soumises au droit français. En cas de litige, les parties s'engagent à rechercher une solution amiable avant toute action judiciaire. À défaut, les tribunaux compétents seront ceux du ressort du siège social de l'Éditeur.</p>
`,
  },

  confidentialite: {
    path: '/confidentialite',
    title: 'Politique de Confidentialité',
    metaTitle: 'Politique de Confidentialité — RefBoost',
    metaDescription: "Comment RefBoost collecte, utilise et protège vos données personnelles. Détail de nos engagements conformes au RGPD et à la protection de la vie privée.",
    body: `
<h2>1. Introduction</h2>
<p>La présente politique de confidentialité décrit comment RefBoost (ci-après « nous ») collecte, utilise, stocke et protège les données personnelles des utilisateurs de la plateforme accessible à l'adresse https://refboost.io.</p>
<p>Nous nous engageons à respecter la vie privée de nos utilisateurs conformément au Règlement Général sur la Protection des Données (RGPD) et à la loi Informatique et Libertés.</p>

<h2>2. Données collectées</h2>
<p>Nous collectons les catégories de données suivantes :</p>
<p><strong>Données d'identification :</strong> nom, prénom, adresse email, numéro de téléphone, nom de l'entreprise, fonction.</p>
<p><strong>Données de connexion :</strong> adresse IP, type de navigateur, pages visitées, durée de visite, cookies.</p>
<p><strong>Données de facturation :</strong> informations de paiement (traitées par Stripe, nous ne stockons pas les numéros de carte bancaire).</p>
<p><strong>Données métier :</strong> informations relatives aux leads, partenaires, commissions et activités saisies par le Client dans le cadre de l'utilisation du service.</p>

<h2>3. Finalités du traitement</h2>
<p>Vos données sont collectées pour les finalités suivantes : fourniture et amélioration du service, gestion de votre compte et de votre abonnement, communication relative au service (notifications, mises à jour), support client, analyse statistique et amélioration de la plateforme, respect de nos obligations légales et réglementaires.</p>

<h2>4. Base légale du traitement</h2>
<p>Le traitement de vos données repose sur l'exécution du contrat (fourniture du service souscrit), le consentement (cookies non essentiels, communications marketing), l'intérêt légitime (amélioration du service, sécurité), et le respect d'obligations légales (facturation, comptabilité).</p>

<h2>5. Partage des données</h2>
<p>Nous ne vendons jamais vos données personnelles. Nous pouvons partager vos données avec nos sous-traitants techniques (hébergement, paiement, envoi d'emails) dans la stricte mesure nécessaire à la fourniture du service. Ces sous-traitants sont contractuellement tenus de protéger vos données conformément au RGPD.</p>
<p>Nos principaux sous-traitants : Vercel (hébergement frontend), Railway (hébergement backend), Stripe (paiement), PostgreSQL (base de données).</p>

<h2>6. Durée de conservation</h2>
<p>Les données de compte sont conservées pendant la durée de l'abonnement et supprimées dans un délai de 12 mois après la clôture du compte. Les données de facturation sont conservées pendant la durée légale de 10 ans. Les données de connexion (logs) sont conservées pendant 12 mois.</p>

<h2>7. Sécurité</h2>
<p>Nous mettons en œuvre des mesures techniques et organisationnelles appropriées pour protéger vos données : chiffrement des données en transit (HTTPS/TLS), authentification sécurisée, sauvegardes régulières, accès restreint aux données sur la base du besoin d'en connaître.</p>

<h2>8. Vos droits</h2>
<p>Conformément au RGPD, vous disposez des droits suivants : droit d'accès à vos données, droit de rectification, droit à l'effacement (« droit à l'oubli »), droit à la portabilité, droit d'opposition au traitement, droit à la limitation du traitement.</p>
<p>Pour exercer ces droits, contactez-nous à l'adresse : charles@getalead.co. Nous répondrons dans un délai maximum de 30 jours.</p>

<h2>9. Cookies</h2>
<p>Notre site utilise des cookies essentiels au fonctionnement du service (authentification, préférences de langue) et des cookies d'analyse (Google Analytics) pour comprendre l'utilisation du site. Vous pouvez gérer vos préférences de cookies via les paramètres de votre navigateur.</p>

<h2>10. Modifications</h2>
<p>Nous nous réservons le droit de modifier la présente politique de confidentialité. Toute modification significative sera notifiée aux utilisateurs par email ou via la plateforme.</p>

<h2>11. Contact</h2>
<p>Pour toute question relative à la protection de vos données, contactez-nous à : charles@getalead.co.</p>
`,
  },

  'mentions-legales': {
    path: '/mentions-legales',
    title: 'Mentions Légales',
    metaTitle: 'Mentions légales & éditeur du site — RefBoost',
    metaDescription: "Mentions légales du site RefBoost : informations sur l'éditeur, le directeur de publication, l'hébergeur et les conditions d'utilisation du site.",
    body: `
<h2>Éditeur du site</h2>
<p>Le site RefBoost (https://refboost.io) est édité par :</p>
<p>Contact : charles@getalead.co</p>
<p>Directeur de la publication : Charles BALDET</p>

<h2>Hébergement</h2>
<p><strong>Frontend :</strong> Vercel Inc. — 340 S Lemon Ave #4133, Walnut, CA 91789, États-Unis — https://vercel.com</p>
<p><strong>Backend :</strong> Railway Corporation — San Francisco, CA, États-Unis — https://railway.app</p>

<h2>Propriété intellectuelle</h2>
<p>L'ensemble du contenu du site RefBoost (textes, images, graphismes, logo, icônes, code source) est protégé par le droit d'auteur et le droit de la propriété intellectuelle. Toute reproduction, représentation, modification, publication, transmission ou dénaturation, totale ou partielle, du site ou de son contenu, par quelque procédé que ce soit, et sur quelque support que ce soit, est interdite sans l'autorisation écrite préalable de l'Éditeur.</p>

<h2>Données personnelles</h2>
<p>Les informations recueillies sur ce site font l'objet d'un traitement informatique destiné à la fourniture du service RefBoost. Pour plus d'informations, consultez notre <a href="/confidentialite">Politique de Confidentialité</a>.</p>
<p>Conformément au RGPD, vous disposez d'un droit d'accès, de rectification et de suppression des données vous concernant. Pour exercer ce droit, contactez-nous à : charles@getalead.co.</p>

<h2>Cookies</h2>
<p>Ce site utilise des cookies pour améliorer l'expérience utilisateur et réaliser des statistiques de visite. Pour en savoir plus, consultez notre <a href="/confidentialite">Politique de Confidentialité</a>.</p>

<h2>Limitation de responsabilité</h2>
<p>L'Éditeur s'efforce de fournir des informations aussi précises que possible sur le site. Toutefois, il ne pourra être tenu responsable des omissions, des inexactitudes et des carences dans la mise à jour, qu'elles soient de son fait ou du fait de tiers partenaires qui lui fournissent ces informations.</p>

<h2>Liens hypertextes</h2>
<p>Le site peut contenir des liens hypertextes vers d'autres sites. L'Éditeur décline toute responsabilité quant au contenu de ces sites externes.</p>

<h2>Droit applicable</h2>
<p>Les présentes mentions légales sont soumises au droit français. En cas de litige, les tribunaux français seront seuls compétents.</p>
`,
  },

  rgpd: {
    path: '/rgpd',
    title: 'Conformité RGPD',
    metaTitle: 'RGPD & protection des données — RefBoost',
    metaDescription: "Comment RefBoost assure sa conformité au RGPD : vos droits d'accès, rectification et suppression, nos engagements et les mesures de protection de vos données.",
    body: `
<h2>Notre engagement RGPD</h2>
<p>RefBoost s'engage à respecter le Règlement Général sur la Protection des Données (RGPD - Règlement UE 2016/679) dans l'ensemble de ses traitements de données personnelles. Cette page détaille nos engagements et vos droits.</p>

<h2>RefBoost en tant que sous-traitant</h2>
<p>Dans le cadre de l'utilisation de RefBoost, nos Clients (les entreprises qui utilisent la plateforme) sont responsables de traitement. RefBoost agit en qualité de sous-traitant au sens de l'article 28 du RGPD.</p>
<p>À ce titre, nous nous engageons à ne traiter les données personnelles que sur instruction documentée du Client, assurer la confidentialité des données, mettre en œuvre les mesures de sécurité appropriées, ne pas faire appel à un sous-traitant ultérieur sans autorisation, assister le Client dans le respect de ses obligations RGPD, et supprimer ou restituer les données à la fin du contrat.</p>

<h2>Données traitées par RefBoost</h2>
<p><strong>Données des utilisateurs de la plateforme :</strong> nom, email, mot de passe (hashé), préférences de langue.</p>
<p><strong>Données des partenaires :</strong> nom, email, téléphone, entreprise, catégorie de partenariat, historique de leads soumis, commissions.</p>
<p><strong>Données des prospects (leads) :</strong> nom du contact, entreprise, email, téléphone, notes, statut dans le pipeline.</p>

<h2>Mesures de sécurité</h2>
<p>RefBoost met en œuvre les mesures techniques et organisationnelles suivantes :</p>
<p><strong>Chiffrement :</strong> toutes les données sont chiffrées en transit via HTTPS/TLS. Les mots de passe sont hashés avec bcrypt.</p>
<p><strong>Contrôle d'accès :</strong> authentification par JWT, séparation des données par tenant (multi-tenant), principe du moindre privilège.</p>
<p><strong>Hébergement :</strong> infrastructure hébergée dans des data centers conformes aux normes de sécurité (Vercel, Railway). Les données sont stockées dans l'Union européenne lorsque possible.</p>
<p><strong>Sauvegardes :</strong> sauvegardes automatiques régulières de la base de données avec chiffrement.</p>
<p><strong>Monitoring :</strong> surveillance continue de la plateforme, alertes en cas d'incident de sécurité.</p>

<h2>Vos droits</h2>
<p>En tant qu'utilisateur de RefBoost ou personne dont les données sont traitées via la plateforme, vous disposez des droits suivants :</p>
<p><strong>Droit d'accès (art. 15) :</strong> obtenir la confirmation que vos données sont traitées et en recevoir une copie.</p>
<p><strong>Droit de rectification (art. 16) :</strong> demander la correction de données inexactes ou incomplètes.</p>
<p><strong>Droit à l'effacement (art. 17) :</strong> demander la suppression de vos données dans les conditions prévues par le RGPD.</p>
<p><strong>Droit à la portabilité (art. 20) :</strong> recevoir vos données dans un format structuré et lisible par machine.</p>
<p><strong>Droit d'opposition (art. 21) :</strong> vous opposer au traitement de vos données pour des motifs légitimes.</p>
<p><strong>Droit à la limitation (art. 18) :</strong> demander la limitation du traitement dans certaines circonstances.</p>

<h2>Exercer vos droits</h2>
<p>Pour exercer l'un de ces droits, contactez-nous à : charles@getalead.co. Nous traiterons votre demande dans un délai maximum de 30 jours.</p>
<p>Si vous estimez que le traitement de vos données constitue une violation du RGPD, vous avez le droit d'introduire une réclamation auprès de la CNIL (Commission Nationale de l'Informatique et des Libertés) : https://www.cnil.fr.</p>

<h2>Transferts internationaux</h2>
<p>Certains de nos sous-traitants techniques (Vercel, Railway, Stripe) sont basés aux États-Unis. Ces transferts sont encadrés par les clauses contractuelles types de la Commission européenne et/ou le Data Privacy Framework (DPF) EU-US.</p>

<h2>DPA (Data Processing Agreement)</h2>
<p>RefBoost propose un accord de traitement des données (DPA) conforme à l'article 28 du RGPD à tout Client qui en fait la demande. Contactez-nous à charles@getalead.co pour obtenir votre DPA.</p>

<h2>Délégué à la protection des données</h2>
<p>Pour toute question relative à la protection des données, contactez : Charles BALDET — charles@getalead.co.</p>
`,
  },
};

export default function LegalPage({ which }) {
  const page = LEGAL[which];
  if (!page) return null;
  const url = SITE + page.path;

  return (
    <LandingLayout>
      <Helmet>
        <title>{page.metaTitle}</title>
        <meta name="description" content={page.metaDescription} />
        <link rel="canonical" href={url} />
        <meta property="og:title" content={page.metaTitle} />
        <meta property="og:description" content={page.metaDescription} />
        <meta property="og:url" content={url} />
        <meta property="og:type" content="website" />
      </Helmet>

      <article style={{ maxWidth: 800, margin: '0 auto', padding: '40px 24px 80px', color: '#0f172a', fontFamily: 'inherit' }}>
        <h1 style={{ fontSize: 36, fontWeight: 800, letterSpacing: -1, margin: '0 0 8px' }}>{page.title}</h1>
        <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 32px' }}>Dernière mise à jour : {LAST_UPDATED}</p>
        <style>{`
          .rb-legal h2 { font-size: 20px; font-weight: 700; color: #0f172a; margin: 32px 0 12px; letter-spacing: -0.2px; }
          .rb-legal p  { font-size: 15px; line-height: 1.7; color: #334155; margin: 0 0 14px; }
          .rb-legal a  { color: #059669; text-decoration: underline; }
          .rb-legal strong { color: #0f172a; font-weight: 700; }
        `}</style>
        <div className="rb-legal" dangerouslySetInnerHTML={{ __html: page.body }} />
      </article>
    </LandingLayout>
  );
}
