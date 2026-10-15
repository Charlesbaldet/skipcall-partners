import { useTranslation } from 'react-i18next';
import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0e1f18" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1a2c24"/>
  <circle cx="18" cy="22" r="6" fill="#c24436"/><circle cx="36" cy="22" r="6" fill="#b4791f"/><circle cx="54" cy="22" r="6" fill="#2fa876"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#33433b" text-anchor="middle">Liens de tracking — RefBoost</text>
<rect x="12" y="56" width="576" height="60" fill="#1a2c24" rx="8"/>
<text x="24" y="74" font-family="system-ui" font-size="9" fill="#6e756c">MON LIEN DE PARRAINAGE</text>
<text x="24" y="95" font-family="system-ui" font-size="11" font-weight="700" fill="#0e7a54">https://acme.refboost.io/ref/sophie-martin?src=linkedin</text>
<rect x="488" y="64" width="88" height="28" fill="#0e7a54" rx="6"/>
<text x="532" y="82" font-family="system-ui" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">Copier</text>
<text x="12" y="138" font-family="system-ui" font-size="10" font-weight="700" fill="#6e756c">PERFORMANCE DU LIEN — 30 JOURS</text>

  <rect x="12" y="150" width="135" height="60" fill="#1a2c24" rx="8"/>
  <text x="22" y="170" font-family="system-ui" font-size="8" fill="#6e756c">Clics</text>
  <text x="22" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#0e7a54">1 284</text>

  <rect x="159" y="150" width="135" height="60" fill="#1a2c24" rx="8"/>
  <text x="169" y="170" font-family="system-ui" font-size="8" fill="#6e756c">Formulaires</text>
  <text x="169" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#b4791f">87</text>

  <rect x="306" y="150" width="135" height="60" fill="#1a2c24" rx="8"/>
  <text x="316" y="170" font-family="system-ui" font-size="8" fill="#6e756c">Leads qualifiés</text>
  <text x="316" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#0e7a54">23</text>

  <rect x="453" y="150" width="135" height="60" fill="#1a2c24" rx="8"/>
  <text x="463" y="170" font-family="system-ui" font-size="8" fill="#6e756c">Closings</text>
  <text x="463" y="195" font-family="system-ui" font-size="20" font-weight="800" fill="#4ade80">8</text>

<rect x="12" y="222" width="576" height="120" fill="#1a2c24" rx="8"/>
<text x="24" y="242" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Clics par source</text>

  <text x="24" y="268" font-family="system-ui" font-size="9" fill="#ded8cb">LinkedIn</text>
  <text x="120" y="268" font-family="system-ui" font-size="9" fill="#6e756c">612 clics</text>
  <rect x="200" y="260" width="340" height="8" fill="#0e1f18" rx="4"/>
  <rect x="200" y="260" width="340" height="8" fill="#0077b5" rx="4"/>

  <text x="24" y="288" font-family="system-ui" font-size="9" fill="#ded8cb">Email</text>
  <text x="120" y="288" font-family="system-ui" font-size="9" fill="#6e756c">308 clics</text>
  <rect x="200" y="280" width="340" height="8" fill="#0e1f18" rx="4"/>
  <rect x="200" y="280" width="170" height="8" fill="#b4791f" rx="4"/>

  <text x="24" y="308" font-family="system-ui" font-size="9" fill="#ded8cb">WhatsApp</text>
  <text x="120" y="308" font-family="system-ui" font-size="9" fill="#6e756c">214 clics</text>
  <rect x="200" y="300" width="340" height="8" fill="#0e1f18" rx="4"/>
  <rect x="200" y="300" width="120.64516129032259" height="8" fill="#25d366" rx="4"/>

  <text x="24" y="328" font-family="system-ui" font-size="9" fill="#ded8cb">Direct</text>
  <text x="120" y="328" font-family="system-ui" font-size="9" fill="#6e756c">150 clics</text>
  <rect x="200" y="320" width="340" height="8" fill="#0e1f18" rx="4"/>
  <rect x="200" y="320" width="82.25806451612904" height="8" fill="#6e756c" rx="4"/>

</svg>`;
const ILLUS0 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18"><rect x="12" y="12" width="456" height="236" fill="#1a2c24" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Mes liens de suivi</text><rect x="24" y="50" width="432" height="40" fill="#0e1f18" rx="6"/><text x="36" y="68" font-family="system-ui" font-size="9" fill="#0e7a54">https://acme.refboost.io/ref/sophie?src=linkedin</text><text x="36" y="83" font-family="system-ui" font-size="8" fill="#6e756c">487 clics · 23 leads · 8 closings</text><rect x="24" y="96" width="432" height="40" fill="#0e1f18" rx="6"/><text x="36" y="114" font-family="system-ui" font-size="9" fill="#0e7a54">https://acme.refboost.io/ref/sophie?src=email</text><text x="36" y="129" font-family="system-ui" font-size="8" fill="#6e756c">208 clics · 14 leads · 5 closings</text><rect x="24" y="142" width="432" height="40" fill="#0e1f18" rx="6"/><text x="36" y="160" font-family="system-ui" font-size="9" fill="#0e7a54">https://acme.refboost.io/ref/sophie?src=direct</text><text x="36" y="175" font-family="system-ui" font-size="8" fill="#6e756c">112 clics · 6 leads · 2 closings</text><rect x="24" y="198" width="200" height="28" fill="#0e7a54" rx="8"/><text x="124" y="216" font-family="system-ui" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">+ Créer un lien</text></svg>`;
const ILLUS1 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18"><rect x="12" y="12" width="456" height="236" fill="#1a2c24" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Attribution automatique</text><rect x="24" y="50" width="432" height="44" fill="#0e1f18" rx="6"/><text x="36" y="68" font-family="system-ui" font-size="9" fill="#ded8cb">Clic sur lien Sophie Martin · 14:32</text><text x="36" y="84" font-family="system-ui" font-size="8" fill="#6e756c">Prospect: DataFlow SAS — LinkedIn</text><rect x="24" y="100" width="432" height="44" fill="#0e1f18" rx="6"/><text x="36" y="118" font-family="system-ui" font-size="9" fill="#ded8cb">Formulaire rempli · 14:47</text><text x="36" y="134" font-family="system-ui" font-size="8" fill="#2fa876">Lead créé et attribué automatiquement à Sophie Martin</text><rect x="24" y="150" width="432" height="44" fill="#052e16" rx="6"/><text x="36" y="168" font-family="system-ui" font-size="9" fill="#4ade80">Deal signé · J+18</text><text x="36" y="184" font-family="system-ui" font-size="8" fill="#6e756c">Commission calculée: 1 760€ · Sophie Martin notifiée</text></svg>`;
const ILLUS2 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18"><rect x="12" y="12" width="456" height="236" fill="#1a2c24" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Fenêtre d’attribution</text><text x="24" y="58" font-family="system-ui" font-size="9" fill="#6e756c">Si un prospect clique puis remplit le formulaire dans</text><rect x="24" y="68" width="432" height="44" fill="#0e1f18" rx="8"/><text x="36" y="90" font-family="system-ui" font-size="14" font-weight="800" fill="#0e7a54">90 jours</text><text x="36" y="106" font-family="system-ui" font-size="8" fill="#6e756c">Configurable: 7, 14, 30, 60, 90 ou 180 jours</text><text x="24" y="134" font-family="system-ui" font-size="9" fill="#6e756c">Règle en cas de multi-clic</text><rect x="24" y="144" width="432" height="36" fill="#0e1f18" rx="8"/><text x="36" y="166" font-family="system-ui" font-size="9" fill="#ded8cb">Premier clic (First-touch) ou Dernier clic (Last-touch)</text><rect x="24" y="196" width="200" height="28" fill="#0e7a54" rx="8"/><text x="124" y="214" font-family="system-ui" font-size="10" font-weight="700" fill="#fff" text-anchor="middle">Sauvegarder les règles</text></svg>`;
const ILLUS = [ILLUS0, ILLUS1, ILLUS2];

export default function FeatureTrackingPage() {
  const { t } = useTranslation();
  const d = t('features.tracking', { returnObjects: true });
  const benefits = d.benefits.map((b, i) => ({ ...b, illustration: ILLUS[i] }));

  return (
    <FeaturePageTemplate
      helmet={{ title: d.helmet_title, description: d.helmet_desc, canonical: 'https://refboost.io/fonctionnalites/tracking' }}
      accentColor="#0e7a54"
      label={t('features.label')}
      title={d.title}
      subtitle={d.subtitle}
      mockupSvg={MOCKUP}
      benefits={benefits}
      quote={d.quote}
      currentHref="/fonctionnalites/tracking"
    />
  );
}
