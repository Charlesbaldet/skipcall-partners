import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0f172a" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1e293b"/>
  <circle cx="18" cy="22" r="6" fill="#ef4444"/><circle cx="36" cy="22" r="6" fill="#f59e0b"/><circle cx="54" cy="22" r="6" fill="#22c55e"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#475569" text-anchor="middle">Liens de tracking — RefBoost</text>
<rect x="12" y="56" width="576" height="60" fill="#1e293b" rx="8"/>
<text x="24" y="74" font-family="system-ui" font-size="9" fill="#64748b">MON LIEN DE PARRAINAGE</text>
<text x="24" y="95" font-family="system-ui" font-size="11" font-weight="700" fill="#3b82f6">https://acme.refboost.io/ref/sophie-martin?src=linkedin</text>
<rect x="488" y="64" width="88" height="28" fill="#3b82f6" rx="6"/>
<text x="532" y="82" font-family="system-ui" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">Copier</text>
<text x="12" y="138" font-family="system-ui" font-size="10" font-weight="700" fill="#64748b">PERFORMANCE DU LIEN — 30 JOURS</text>

  <rect x="12" y="150" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="22" y="170" font-family="system-ui" font-size="8" fill="#64748b">Clics</text>
  <text x="22" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#3b82f6">1 284</text>

  <rect x="159" y="150" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="169" y="170" font-family="system-ui" font-size="8" fill="#64748b">Formulaires</text>
  <text x="169" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#f59e0b">87</text>

  <rect x="306" y="150" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="316" y="170" font-family="system-ui" font-size="8" fill="#64748b">Leads qualifiés</text>
  <text x="316" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#059669">23</text>

  <rect x="453" y="150" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="463" y="170" font-family="system-ui" font-size="8" fill="#64748b">Closings</text>
  <text x="463" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#4ade80">8</text>

<rect x="12" y="222" width="576" height="120" fill="#1e293b" rx="8"/>
<text x="24" y="242" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Clics par source</text>

  <text x="24" y="268" font-family="system-ui" font-size="9" fill="#e2e8f0">LinkedIn</text>
  <text x="120" y="268" font-family="system-ui" font-size="9" fill="#64748b">612 clics</text>
  <rect x="200" y="260" width="340" height="8" fill="#0f172a" rx="4"/>
  <rect x="200" y="260" width="340" height="8" fill="#0077b5" rx="4"/>

  <text x="24" y="288" font-family="system-ui" font-size="9" fill="#e2e8f0">Email</text>
  <text x="120" y="288" font-family="system-ui" font-size="9" fill="#64748b">308 clics</text>
  <rect x="200" y="280" width="340" height="8" fill="#0f172a" rx="4"/>
  <rect x="200" y="280" width="170" height="8" fill="#f59e0b" rx="4"/>

  <text x="24" y="308" font-family="system-ui" font-size="9" fill="#e2e8f0">WhatsApp</text>
  <text x="120" y="308" font-family="system-ui" font-size="9" fill="#64748b">214 clics</text>
  <rect x="200" y="300" width="340" height="8" fill="#0f172a" rx="4"/>
  <rect x="200" y="300" width="120.64516129032259" height="8" fill="#25d366" rx="4"/>

  <text x="24" y="328" font-family="system-ui" font-size="9" fill="#e2e8f0">Direct</text>
  <text x="120" y="328" font-family="system-ui" font-size="9" fill="#64748b">150 clics</text>
  <rect x="200" y="320" width="340" height="8" fill="#0f172a" rx="4"/>
  <rect x="200" y="320" width="82.25806451612904" height="8" fill="#64748b" rx="4"/>

</svg>`;
const ILLUS0 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Mes liens de suivi</text><rect x="24" y="50" width="432" height="40" fill="#0f172a" rx="6"/><text x="36" y="68" font-family="system-ui" font-size="9" fill="#3b82f6">https://acme.refboost.io/ref/sophie?src=linkedin</text><text x="36" y="83" font-family="system-ui" font-size="8" fill="#64748b">487 clics · 23 leads · 8 closings</text><rect x="24" y="96" width="432" height="40" fill="#0f172a" rx="6"/><text x="36" y="114" font-family="system-ui" font-size="9" fill="#3b82f6">https://acme.refboost.io/ref/sophie?src=email</text><text x="36" y="129" font-family="system-ui" font-size="8" fill="#64748b">208 clics · 14 leads · 5 closings</text><rect x="24" y="142" width="432" height="40" fill="#0f172a" rx="6"/><text x="36" y="160" font-family="system-ui" font-size="9" fill="#3b82f6">https://acme.refboost.io/ref/sophie?src=direct</text><text x="36" y="175" font-family="system-ui" font-size="8" fill="#64748b">112 clics · 6 leads · 2 closings</text><rect x="24" y="198" width="200" height="28" fill="#3b82f6" rx="8"/><text x="124" y="216" font-family="system-ui" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">+ Créer un lien</text></svg>`;
const ILLUS1 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Attribution automatique</text><rect x="24" y="50" width="432" height="44" fill="#0f172a" rx="6"/><text x="36" y="68" font-family="system-ui" font-size="9" fill="#e2e8f0">Clic sur lien Sophie Martin · 14:32</text><text x="36" y="84" font-family="system-ui" font-size="8" fill="#64748b">Prospect: DataFlow SAS — LinkedIn</text><rect x="24" y="100" width="432" height="44" fill="#0f172a" rx="6"/><text x="36" y="118" font-family="system-ui" font-size="9" fill="#e2e8f0">Formulaire rempli · 14:47</text><text x="36" y="134" font-family="system-ui" font-size="8" fill="#22c55e">Lead créé et attribué automatiquement à Sophie Martin</text><rect x="24" y="150" width="432" height="44" fill="#052e16" rx="6"/><text x="36" y="168" font-family="system-ui" font-size="9" fill="#4ade80">Deal signé · J+18</text><text x="36" y="184" font-family="system-ui" font-size="8" fill="#64748b">Commission calculée: 1 760€ · Sophie Martin notifiée</text></svg>`;
const ILLUS2 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Fenêtre d’attribution</text><text x="24" y="58" font-family="system-ui" font-size="9" fill="#64748b">Si un prospect clique puis remplit le formulaire dans</text><rect x="24" y="68" width="432" height="44" fill="#0f172a" rx="8"/><text x="36" y="90" font-family="system-ui" font-size="14" font-weight="800" fill="#3b82f6">90 jours</text><text x="36" y="106" font-family="system-ui" font-size="8" fill="#64748b">Configurable: 7, 14, 30, 60, 90 ou 180 jours</text><text x="24" y="134" font-family="system-ui" font-size="9" fill="#64748b">Règle en cas de multi-clic</text><rect x="24" y="144" width="432" height="36" fill="#0f172a" rx="8"/><text x="36" y="166" font-family="system-ui" font-size="9" fill="#e2e8f0">Premier clic (First-touch) ou Dernier clic (Last-touch)</text><rect x="24" y="196" width="200" height="28" fill="#3b82f6" rx="8"/><text x="124" y="214" font-family="system-ui" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">Sauvegarder les règles</text></svg>`;

export default function FeatureTrackingPage() {
  return (
    <FeaturePageTemplate
      helmet={{ title: 'Liens de tracking uniques — RefBoost', description: 'Chaque apporteur dispose de son lien personnel. Attribution automatique, formulaire public intégré, zero friction pour vos partenaires et vos prospects.', canonical: 'https://refboost.io/fonctionnalites/tracking' }}
      accentColor="#3b82f6"
      label="Fonctionnalité"
      title="Liens de tracking uniques"
      subtitle="Un lien par apporteur, une attribution parfaite. Vos partenaires partagent, les leads arrivent qualifiés et attribués automatiquement."
      mockupSvg={MOCKUP}
      benefits={[
        {
          stat: '0', statLabel: 'lead perdu ou mal attribué grâce au tracking automatique',
          title: 'Un lien unique par apporteur et par source',
          text: 'Chaque apporteur dispose d’un lien personnel unique qu’il peut décliner par canal (LinkedIn, email, événement). Vous savez exactement d’où vient chaque lead et qui l’a apporté.',
          points: ['Génération automatique du lien à l’invitation de l’apporteur', 'Paramètres UTM pour distinguer les sources (LinkedIn, email, téléphone)', 'QR code téléchargeable pour les événements et présentations', 'Lien court personnalisé avec le nom de l’apporteur'],
          illustration: ILLUS0
        },
        {
          stat: '100%', statLabel: 'des leads attribués sans intervention manuelle',
          title: 'Attribution automatique sans ambiguïté',
          text: 'Quand un prospect clique sur le lien d’un apporteur puis remplit le formulaire, le lead lui est attribué automatiquement. Pas de dispute, pas d’ambiguïté, même des semaines plus tard.',
          points: ['Cookie de tracking persistant configurable (7 à 180 jours)', 'Attribution même si le prospect revient plusieurs jours plus tard', 'Traçabilité complète de la source au deal signé', 'Notification instantanée à l’apporteur à chaque conversion'],
          illustration: ILLUS1
        },
        {
          stat: '6', statLabel: 'fenêtres d’attribution configurables selon votre cycle de vente',
          title: 'Fenêtres d’attribution configurables',
          text: 'Adaptez les règles d’attribution à votre cycle de vente. Un cycle court de 2 semaines ou un cycle long de 6 mois : définissez la fenêtre qui reflète votre réalité commerciale.',
          points: ['Fenêtre d’attribution de 7 à 180 jours selon votre cycle de vente', 'Règle first-touch ou last-touch selon votre politique', 'Gestion des conflits d’attribution transparente et auditable', 'Rétroactivité possible sur les leads en cours'],
          illustration: ILLUS2
        }
      ]}
      quote={{ text: 'Avant RefBoost, on passait 2h par mois à réconcilier manuellement les leads avec les apporteurs. Maintenant c’est automatique et sans discussion.', author: 'Alexandre R., VP Sales — ScaleB2B' }}
      currentHref="/fonctionnalites/tracking"
    />
  );
}
