import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0f172a" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1e293b"/>
  <circle cx="18" cy="22" r="6" fill="#ef4444"/><circle cx="36" cy="22" r="6" fill="#f59e0b"/><circle cx="54" cy="22" r="6" fill="#22c55e"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#475569" text-anchor="middle">Commissions — RefBoost</text>
<rect x="12" y="56" width="576" height="72" fill="#1e293b" rx="8"/>
<text x="24" y="76" font-family="system-ui" font-size="9" fill="#64748b">COMMISSIONS À VALIDER</text>
<text x="24" y="96" font-family="system-ui" font-size="18" font-weight="800" fill="#fff">3 en attente</text>
<text x="24" y="114" font-family="system-ui" font-size="9" fill="#f59e0b">Total : 4 280 €</text>
<rect x="320" y="68" width="120" height="32" fill="#f59e0b" rx="8"/>
<text x="380" y="88" font-family="system-ui" font-size="11" font-weight="700" fill="#0f172a" text-anchor="middle">Tout valider</text>
<rect x="12" y="140" width="576" height="1" fill="#1e293b"/>
<text x="12" y="162" font-family="system-ui" font-size="10" font-weight="700" fill="#64748b">HISTORIQUE DES COMMISSIONS</text>

  <rect x="12" y="175" width="576" height="32" fill="#0f172a" rx="0"/>
  <text x="24" y="195" font-family="system-ui" font-size="9" fill="#e2e8f0">M. Bernard</text>
  <text x="160" y="195" font-family="system-ui" font-size="9" fill="#64748b">Deal — Nexus SAS</text>
  <text x="400" y="195" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">1 232 €</text>
  <text x="500" y="195" font-family="system-ui" font-size="9" font-weight="600" fill="#22c55e">Payée</text>

  <rect x="12" y="213" width="576" height="32" fill="#1e293b" rx="0"/>
  <text x="24" y="233" font-family="system-ui" font-size="9" fill="#e2e8f0">S. Martin</text>
  <text x="160" y="233" font-family="system-ui" font-size="9" fill="#64748b">Deal — TechCorp</text>
  <text x="400" y="233" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">856 €</text>
  <text x="500" y="233" font-family="system-ui" font-size="9" font-weight="600" fill="#22c55e">Payée</text>

  <rect x="12" y="251" width="576" height="32" fill="#0f172a" rx="0"/>
  <text x="24" y="271" font-family="system-ui" font-size="9" fill="#e2e8f0">A. Leroy</text>
  <text x="160" y="271" font-family="system-ui" font-size="9" fill="#64748b">Deal — DataFlow</text>
  <text x="400" y="271" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">2 100 €</text>
  <text x="500" y="271" font-family="system-ui" font-size="9" font-weight="600" fill="#f59e0b">En attente</text>

  <rect x="12" y="289" width="576" height="32" fill="#1e293b" rx="0"/>
  <text x="24" y="309" font-family="system-ui" font-size="9" fill="#e2e8f0">J. Dupont</text>
  <text x="160" y="309" font-family="system-ui" font-size="9" fill="#64748b">Deal — Proxim</text>
  <text x="400" y="309" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">640 €</text>
  <text x="500" y="309" font-family="system-ui" font-size="9" font-weight="600" fill="#f59e0b">En attente</text>

  <rect x="12" y="327" width="576" height="32" fill="#0f172a" rx="0"/>
  <text x="24" y="347" font-family="system-ui" font-size="9" fill="#e2e8f0">C. Petit</text>
  <text x="160" y="347" font-family="system-ui" font-size="9" fill="#64748b">Deal — Opticom</text>
  <text x="400" y="347" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">1 380 €</text>
  <text x="500" y="347" font-family="system-ui" font-size="9" font-weight="600" fill="#3b82f6">Calculée</text>

</svg>`;
const ILLUS = [
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="200" height="108" fill="#1e293b" rx="8"/>
    <text x="24" y="34" font-family="system-ui" font-size="8" fill="#64748b">Commissions du mois</text>
    <text x="24" y="64" font-family="system-ui" font-size="28" font-weight="800" fill="#fff">4 280 €</text>
    <text x="24" y="84" font-family="system-ui" font-size="9" fill="#22c55e">+22% vs mois dernier</text>
    <rect x="220" y="12" width="248" height="108" fill="#1e293b" rx="8"/>
    <text x="232" y="34" font-family="system-ui" font-size="8" fill="#64748b">Règle active: 8% MRR deal</text>
    <text x="232" y="54" font-family="system-ui" font-size="10" fill="#e2e8f0">Deal 22 000€ x 8% = 1 760€</text>
    <text x="232" y="80" font-family="system-ui" font-size="10" fill="#e2e8f0">Deal 12 000€ x 8% = 960€</text>
    <text x="232" y="106" font-family="system-ui" font-size="10" font-weight="700" fill="#f59e0b">Total automatique: 2 720€</text>
    <rect x="12" y="130" width="456" height="24" fill="#1e293b" rx="0"/>
    <text x="24" y="146" font-family="system-ui" font-size="9" fill="#e2e8f0">M. Bernard</text>
    <text x="360" y="146" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">1 232 €</text>
    <text x="436" y="146" font-family="system-ui" font-size="9" fill="#22c55e">Payée</text><rect x="12" y="158" width="456" height="24" fill="#0f172a" rx="0"/>
    <text x="24" y="174" font-family="system-ui" font-size="9" fill="#e2e8f0">S. Martin</text>
    <text x="360" y="174" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">856 €</text>
    <text x="436" y="174" font-family="system-ui" font-size="9" fill="#22c55e">Payée</text><rect x="12" y="186" width="456" height="24" fill="#1e293b" rx="0"/>
    <text x="24" y="202" font-family="system-ui" font-size="9" fill="#e2e8f0">A. Leroy</text>
    <text x="360" y="202" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">2 100 €</text>
    <text x="436" y="202" font-family="system-ui" font-size="9" fill="#f59e0b">Attente</text><rect x="12" y="214" width="456" height="24" fill="#0f172a" rx="0"/>
    <text x="24" y="230" font-family="system-ui" font-size="9" fill="#e2e8f0">J. Dupont</text>
    <text x="360" y="230" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">640 €</text>
    <text x="436" y="230" font-family="system-ui" font-size="9" fill="#f59e0b">Attente</text></svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="300" height="236" fill="#1e293b" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Règles de commission</text>
    <rect x="24" y="48" width="276" height="36" fill="#0f172a" rx="6"/><text x="36" y="68" font-family="system-ui" font-size="9" fill="#e2e8f0">Deal standard: 8% MRR</text>
    <rect x="24" y="90" width="276" height="36" fill="#0f172a" rx="6"/><text x="36" y="110" font-family="system-ui" font-size="9" fill="#e2e8f0">Vol. > 5 leads/mois: 12%</text>
    <rect x="24" y="132" width="276" height="36" fill="#0f172a" rx="6"/><text x="36" y="152" font-family="system-ui" font-size="9" fill="#e2e8f0">Bonus closing: +500€</text>
    <rect x="24" y="192" width="120" height="28" fill="#f59e0b" rx="8"/>
    <text x="84" y="210" font-family="system-ui" font-size="10" font-weight="700" fill="#0f172a" text-anchor="middle">+ Règle</text>
    <rect x="320" y="12" width="148" height="236" fill="#1e293b" rx="8"/>
    <text x="332" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Paiements</text>
    <rect x="332" y="52" width="128" height="26" fill="#0f172a" rx="4"/>
    <text x="344" y="68" font-family="system-ui" font-size="8" fill="#64748b">12 avril 2026</text>
    <text x="344" y="80" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">1 232 €</text><rect x="332" y="84" width="128" height="26" fill="#0f172a" rx="4"/>
    <text x="344" y="100" font-family="system-ui" font-size="8" fill="#64748b">12 avril 2026</text>
    <text x="344" y="112" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">856 €</text><rect x="332" y="116" width="128" height="26" fill="#0f172a" rx="4"/>
    <text x="344" y="132" font-family="system-ui" font-size="8" fill="#64748b">12 avril 2026</text>
    <text x="344" y="144" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">2 100 €</text><rect x="332" y="148" width="128" height="26" fill="#0f172a" rx="4"/>
    <text x="344" y="164" font-family="system-ui" font-size="8" fill="#64748b">12 avril 2026</text>
    <text x="344" y="176" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">640 €</text><rect x="332" y="180" width="128" height="26" fill="#0f172a" rx="4"/>
    <text x="344" y="196" font-family="system-ui" font-size="8" fill="#64748b">12 avril 2026</text>
    <text x="344" y="208" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">1 380 €</text><rect x="332" y="212" width="128" height="26" fill="#0f172a" rx="4"/>
    <text x="344" y="228" font-family="system-ui" font-size="8" fill="#64748b">12 avril 2026</text>
    <text x="344" y="240" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">720 €</text></svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Export & Comptabilité</text>
    <rect x="24" y="50" width="200" height="36" fill="#0f172a" rx="6"/><text x="36" y="73" font-family="system-ui" font-size="10" fill="#e2e8f0">Commission_Avril_2026.csv</text>
    <rect x="232" y="50" width="200" height="36" fill="#0f172a" rx="6"/><text x="244" y="73" font-family="system-ui" font-size="10" fill="#e2e8f0">Factures_Q1_2026.pdf</text>
    <text x="24" y="114" font-family="system-ui" font-size="9" fill="#64748b">Intégration comptabilité</text>
    <rect x="24" y="122" width="100" height="28" fill="#0f172a" rx="6"/><text x="74" y="140" font-family="system-ui" font-size="9" fill="#e2e8f0" text-anchor="middle">QuickBooks</text>
    <rect x="132" y="122" width="100" height="28" fill="#0f172a" rx="6"/><text x="182" y="140" font-family="system-ui" font-size="9" fill="#e2e8f0" text-anchor="middle">Pennylane</text>
    <rect x="240" y="122" width="100" height="28" fill="#0f172a" rx="6"/><text x="290" y="140" font-family="system-ui" font-size="9" fill="#e2e8f0" text-anchor="middle">Zapier</text></svg>`,
];

export default function FeatureCommissionsPage() {
  return (
    <FeaturePageTemplate
      helmet={{ title: 'Commissions automatiques — RefBoost', description: 'Calcul automatique des primes selon vos règles. Validation en un clic, historique complet, paiements traçables. Fini les tableurs.', canonical: 'https://refboost.io/fonctionnalites/commissions' }}
      accentColor="#f59e0b"
      label="Fonctionnalité"
      title="Commissions automatiques"
      subtitle="Définissez vos règles une fois. RefBoost calcule, valide et trace chaque commission sans intervention manuelle."
      mockupSvg={MOCKUP}
      benefits={[
        {
          stat: '0', statLabel: 'erreur de calcul depuis l’adoption de RefBoost (données clients)',
          title: 'Calcul automatique selon vos règles',
          text: 'Fixez votre grille de commissions une fois — taux fixe, pourcentage du MRR, paliers progressifs — et RefBoost calcule automatiquement la prime à chaque deal validé. Plus de tableur, plus d’erreur.',
          points: ['Taux configurables par apporteur, segment ou volume', 'Paliers progressifs : 8% jusqu’à 5 deals/mois, 12% au-delà', 'Commission sur la première vente ou récurrente sur abonnement', 'Calcul instantané dès la mise à jour du statut "Signé"'],
          illustration: ILLUS[0]
        },
        {
          stat: '100%', statLabel: 'de vos règles métier modélisables sans développement',
          title: 'Règles flexibles et auditables',
          text: 'Chaque règle de commission est documentée, horodatée et traçable. Vos apporteurs voient exactement comment leur rémunération est calculée. La transparence crée la confiance.',
          points: ['Interface no-code pour créer et modifier les règles', 'Historique complet de chaque modification de règle', 'Simulation du gain attendu avant validation d’un deal', 'Différentes règles par type de deal ou de partenaire'],
          illustration: ILLUS[1]
        },
        {
          stat: '< 5min', statLabel: 'pour exporter et synchroniser avec votre comptabilité',
          title: 'Export et intégrations comptabilité',
          text: 'Générez vos états de commissions en un clic, exportez vers votre logiciel comptable et envoyez les détails directement aux apporteurs. Fin du mois sans friction.',
          points: ['Export CSV/PDF des commissions par période ou par apporteur', 'Intégration Zapier pour synchronisation automatique', 'Emails automatiques aux apporteurs avec détail du calcul', 'Archivage réglementaire conforme RGPD'],
          illustration: ILLUS[2]
        }
      ]}
      quote={{ text: 'Fini les tableurs pour tracker les commissions. Tout est automatisé, transparent, et nos partenaires sont ravis de recevoir leurs calculs détaillés chaque mois.', author: 'Sophie M., Head of Partnerships — DataViz Pro' }}
      currentHref="/fonctionnalites/commissions"
    />
  );
}
