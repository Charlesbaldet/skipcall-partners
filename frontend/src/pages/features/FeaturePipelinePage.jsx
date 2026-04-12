import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0f172a" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1e293b"/>
  <circle cx="18" cy="22" r="6" fill="#ef4444"/><circle cx="36" cy="22" r="6" fill="#f59e0b"/><circle cx="54" cy="22" r="6" fill="#22c55e"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#475569" text-anchor="middle">Pipeline de leads — RefBoost</text>
<text x="16" y="72" font-family="system-ui" font-size="10" font-weight="700" fill="#64748b">NOUVEAU (8)</text>
<text x="160" y="72" font-family="system-ui" font-size="10" font-weight="700" fill="#f59e0b">EN COURS (5)</text>
<text x="310" y="72" font-family="system-ui" font-size="10" font-weight="700" fill="#3b82f6">QUALIFIÉ (4)</text>
<text x="460" y="72" font-family="system-ui" font-size="10" font-weight="700" fill="#059669">SIGNÉ (3)</text>
<rect x="12" y="80" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="22" y="94" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 1 — Dupont SAS</text>
<text x="22" y="106" font-family="system-ui" font-size="8" fill="#64748b">Via M. Bernard · 12 000 €</text><rect x="12" y="120" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="22" y="134" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 2 — Dupont SAS</text>
<text x="22" y="146" font-family="system-ui" font-size="8" fill="#64748b">Via M. Bernard · 12 000 €</text><rect x="12" y="160" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="22" y="174" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 3 — Dupont SAS</text>
<text x="22" y="186" font-family="system-ui" font-size="8" fill="#64748b">Via M. Bernard · 12 000 €</text><rect x="12" y="200" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="22" y="214" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 4 — Dupont SAS</text>
<text x="22" y="226" font-family="system-ui" font-size="8" fill="#64748b">Via M. Bernard · 12 000 €</text><rect x="12" y="240" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="22" y="254" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 5 — Dupont SAS</text>
<text x="22" y="266" font-family="system-ui" font-size="8" fill="#64748b">Via M. Bernard · 12 000 €</text>
<rect x="154" y="80" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="164" y="94" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 6 — Tech Corp</text>
<text x="164" y="106" font-family="system-ui" font-size="8" fill="#64748b">Via S. Martin · 8 500 €</text><rect x="154" y="120" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="164" y="134" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 7 — Tech Corp</text>
<text x="164" y="146" font-family="system-ui" font-size="8" fill="#64748b">Via S. Martin · 8 500 €</text><rect x="154" y="160" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="164" y="174" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 8 — Tech Corp</text>
<text x="164" y="186" font-family="system-ui" font-size="8" fill="#64748b">Via S. Martin · 8 500 €</text><rect x="154" y="200" width="132" height="34" fill="#1e293b" rx="6"/>
<text x="164" y="214" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 9 — Tech Corp</text>
<text x="164" y="226" font-family="system-ui" font-size="8" fill="#64748b">Via S. Martin · 8 500 €</text>
<rect x="296" y="80" width="140" height="34" fill="#1e293b" rx="6"/>
<text x="306" y="94" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 10 — Nexus SAS</text>
<text x="306" y="106" font-family="system-ui" font-size="8" fill="#f59e0b">RDV planifié · 22 000 €</text><rect x="296" y="120" width="140" height="34" fill="#1e293b" rx="6"/>
<text x="306" y="134" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 11 — Nexus SAS</text>
<text x="306" y="146" font-family="system-ui" font-size="8" fill="#f59e0b">RDV planifié · 22 000 €</text><rect x="296" y="160" width="140" height="34" fill="#1e293b" rx="6"/>
<text x="306" y="174" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 12 — Nexus SAS</text>
<text x="306" y="186" font-family="system-ui" font-size="8" fill="#f59e0b">RDV planifié · 22 000 €</text><rect x="296" y="200" width="140" height="34" fill="#1e293b" rx="6"/>
<text x="306" y="214" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 13 — Nexus SAS</text>
<text x="306" y="226" font-family="system-ui" font-size="8" fill="#f59e0b">RDV planifié · 22 000 €</text>
<rect x="448" y="80" width="140" height="34" fill="#052e16" rx="6"/>
<text x="458" y="94" font-family="system-ui" font-size="9" fill="#4ade80">Lead 14 — Data Inc</text>
<text x="458" y="106" font-family="system-ui" font-size="8" fill="#059669">+15 400 € commission: 1 232 €</text><rect x="448" y="120" width="140" height="34" fill="#052e16" rx="6"/>
<text x="458" y="134" font-family="system-ui" font-size="9" fill="#4ade80">Lead 15 — Data Inc</text>
<text x="458" y="146" font-family="system-ui" font-size="8" fill="#059669">+15 400 € commission: 1 232 €</text><rect x="448" y="160" width="140" height="34" fill="#052e16" rx="6"/>
<text x="458" y="174" font-family="system-ui" font-size="9" fill="#4ade80">Lead 16 — Data Inc</text>
<text x="458" y="186" font-family="system-ui" font-size="8" fill="#059669">+15 400 € commission: 1 232 €</text>
<rect x="12" y="290" width="576" height="1" fill="#1e293b"/>
<rect x="12" y="308" width="576" height="60" fill="#1e293b" rx="8"/>
<text x="24" y="330" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Pipeline total</text>
<text x="24" y="348" font-family="system-ui" font-size="9" fill="#64748b">20 leads actifs · 287 000 € en cours</text>
<text x="500" y="330" font-family="system-ui" font-size="14" font-weight="800" fill="#059669" text-anchor="end">+34% ce mois</text>
</svg>`;
const ILLUS = [
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="100" height="236" fill="#1e293b" rx="8"/><rect x="124" y="12" width="100" height="236" fill="#1e293b" rx="8"/><rect x="236" y="12" width="100" height="236" fill="#1e293b" rx="8"/><rect x="348" y="12" width="120" height="236" fill="#052e16" rx="8"/>
    <text x="20" y="30" font-family="system-ui" font-size="8" fill="#64748b">NOUVEAU</text><text x="132" y="30" font-family="system-ui" font-size="8" fill="#f59e0b">EN COURS</text><text x="244" y="30" font-family="system-ui" font-size="8" fill="#3b82f6">QUALIFIÉ</text><text x="356" y="30" font-family="system-ui" font-size="8" fill="#4ade80">SIGNÉ</text>
    <rect x="18" y="42" width="88" height="20" fill="#0f172a" rx="4"/><rect x="18" y="68" width="88" height="20" fill="#0f172a" rx="4"/><rect x="18" y="94" width="88" height="20" fill="#0f172a" rx="4"/><rect x="18" y="120" width="88" height="20" fill="#0f172a" rx="4"/>
    <rect x="130" y="42" width="88" height="20" fill="#0f172a" rx="4"/><rect x="130" y="68" width="88" height="20" fill="#0f172a" rx="4"/><rect x="130" y="94" width="88" height="20" fill="#0f172a" rx="4"/>
    <rect x="242" y="42" width="88" height="20" fill="#0f172a" rx="4"/><rect x="242" y="68" width="88" height="20" fill="#0f172a" rx="4"/>
    <rect x="354" y="42" width="108" height="20" fill="#052e16" rx="4"/></svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Filtres actifs</text>
    <rect x="24" y="46" width="80" height="22" fill="#059669" rx="12"/><text x="64" y="62" font-family="system-ui" font-size="9" fill="#fff" text-anchor="middle">Apporteur</text>
    <rect x="112" y="46" width="80" height="22" fill="#3b82f6" rx="12"/><text x="152" y="62" font-family="system-ui" font-size="9" fill="#fff" text-anchor="middle">Montant</text>
    <rect x="200" y="46" width="80" height="22" fill="#f59e0b" rx="12"/><text x="240" y="62" font-family="system-ui" font-size="9" fill="#fff" text-anchor="middle">Statut</text>
    <rect x="24" y="80" width="432" height="20" fill="#162032" rx="0"/><text x="36" y="94" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 1</text><text x="300" y="94" font-family="system-ui" font-size="9" fill="#64748b">8k€</text><rect x="24" y="108" width="432" height="20" fill="#0f172a" rx="0"/><text x="36" y="122" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 2</text><text x="300" y="122" font-family="system-ui" font-size="9" fill="#64748b">12k€</text><rect x="24" y="136" width="432" height="20" fill="#162032" rx="0"/><text x="36" y="150" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 3</text><text x="300" y="150" font-family="system-ui" font-size="9" fill="#64748b">22k€</text><rect x="24" y="164" width="432" height="20" fill="#0f172a" rx="0"/><text x="36" y="178" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 4</text><text x="300" y="178" font-family="system-ui" font-size="9" fill="#64748b">5k€</text><rect x="24" y="192" width="432" height="20" fill="#162032" rx="0"/><text x="36" y="206" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 5</text><text x="300" y="206" font-family="system-ui" font-size="9" fill="#64748b">16k€</text><rect x="24" y="220" width="432" height="20" fill="#0f172a" rx="0"/><text x="36" y="234" font-family="system-ui" font-size="9" fill="#e2e8f0">Lead 6</text><text x="300" y="234" font-family="system-ui" font-size="9" fill="#64748b">9k€</text></svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="60" fill="#1e293b" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Statut mis à jour</text>
    <text x="24" y="54" font-family="system-ui" font-size="9" fill="#64748b">Lead Nexus SAS → Qualifié · Il y a 2 min</text>
    <rect x="24" y="84" width="432" height="1" fill="#1e293b"/>
    <text x="24" y="108" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Commentaire ajouté</text>
    <text x="24" y="126" font-family="system-ui" font-size="9" fill="#64748b">"RDV confirmé pour le 15 — très chaud" · Sophie M.</text>
    <rect x="24" y="148" width="432" height="1" fill="#1e293b"/>
    <text x="24" y="172" font-family="system-ui" font-size="10" font-weight="700" fill="#4ade80">Deal signé</text>
    <text x="24" y="190" font-family="system-ui" font-size="9" fill="#64748b">TechCorp — 22 000 € · Commission: 1 760 €</text></svg>`,
];

export default function FeaturePipelinePage() {
  return (
    <FeaturePageTemplate
      helmet={{ title: 'Pipeline de referrals — RefBoost', description: 'Suivez chaque recommandation du premier contact au closing. Vue Kanban, filtres avancés, statuts en temps réel pour ne manquer aucune opportunité.', canonical: 'https://refboost.io/fonctionnalites/pipeline' }}
      accentColor="#059669"
      label="Fonctionnalité"
      title="Pipeline de referrals"
      subtitle="De la recommandation au closing, chaque lead est tracé, priorisé et actionnable en temps réel."
      mockupSvg={MOCKUP}
      benefits={[
        {
          stat: '3x', statLabel: 'plus de leads convertis vs sans suivi structuré',
          title: 'Vue Kanban en temps réel',
          text: 'Visualisez l’intégralité de votre pipeline partenaires en un coup d'œil. Chaque lead avance dans les colonnes au fur et à mesure de la vente — sans tableur, sans email interminable.',
          points: ['Colonnes configurables : Nouveau, Qualification, Démo, Proposition, Signé', 'Drag & drop pour changer le statut en un geste', 'Notification automatique à l’apporteur à chaque changement d’étape', 'Valeur pondérée par probabilité de closing affichée en temps réel'],
          illustration: ILLUS[0]
        },
        {
          stat: '87%', statLabel: 'des équipes réduisent leur délai de réponse de plus de 2 jours',
          title: 'Filtres et recherche avancés',
          text: 'Trouvez instantanément n’importe quel lead parmi des centaines. Filtrez par apporteur, montant, statut, date ou source en un clic. Aucune opportunité ne tombe dans les oubliettes.',
          points: ['Filtres cumulables : apporteur + statut + montant + date', 'Recherche plein texte sur nom de société, contact, commentaires', 'Vues sauvegardées par commercial ou par source', 'Export CSV de tout sous-ensemble filtré'],
          illustration: ILLUS[1]
        },
        {
          stat: '48h', statLabel: 'de délai économisé en moyenne par deal grâce aux notifications',
          title: 'Historique complet et commentaires',
          text: 'Chaque lead a sa propre fiche avec l’historique de toutes les actions, les commentaires de l’équipe commerciale et les échanges avec l’apporteur. La mémoire de votre équipe externalisée.',
          points: ['Timeline complète de toutes les modifications de statut', 'Commentaires internes visibles uniquement par l’équipe', 'Messages visibles par l’apporteur pour le tenir informé', 'Rappels et relances planifiables directement sur la fiche'],
          illustration: ILLUS[2]
        }
      ]}
      quote={{ text: 'On a multiplié par 3 notre canal apporteurs d’affaires en 4 mois. La transparence du pipeline retient nos meilleurs partenaires.', author: 'Marie D., Directrice Commerciale — SaaS B2B' }}
      currentHref="/fonctionnalites/pipeline"
    />
  );
}
