import { useTranslation } from 'react-i18next';
import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0e1f18" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1a2c24"/>
  <circle cx="18" cy="22" r="6" fill="#c24436"/><circle cx="36" cy="22" r="6" fill="#b4791f"/><circle cx="54" cy="22" r="6" fill="#2fa876"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#33433b" text-anchor="middle">Analytics & KPIs — RefBoost</text>

  <rect x="12" y="56" width="135" height="64" fill="#1a2c24" rx="8"/>
  <text x="22" y="76" font-family="system-ui" font-size="8" fill="#6e756c">Leads ce mois</text>
  <text x="22" y="99" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">47</text>
  <text x="22" y="113" font-family="system-ui" font-size="9" fill="#0e7a54">+18%</text>

  <rect x="159" y="56" width="135" height="64" fill="#1a2c24" rx="8"/>
  <text x="169" y="76" font-family="system-ui" font-size="8" fill="#6e756c">Conv. ce mois</text>
  <text x="169" y="99" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">34%</text>
  <text x="169" y="113" font-family="system-ui" font-size="9" fill="#0e7a54">+5pts</text>

  <rect x="306" y="56" width="135" height="64" fill="#1a2c24" rx="8"/>
  <text x="316" y="76" font-family="system-ui" font-size="8" fill="#6e756c">MRR ce mois</text>
  <text x="316" y="99" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">28k€</text>
  <text x="316" y="113" font-family="system-ui" font-size="9" fill="#b4791f">+22%</text>

  <rect x="453" y="56" width="135" height="64" fill="#1a2c24" rx="8"/>
  <text x="463" y="76" font-family="system-ui" font-size="8" fill="#6e756c">CAC ce mois</text>
  <text x="463" y="99" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">340€</text>
  <text x="463" y="113" font-family="system-ui" font-size="9" fill="#2fa876">-12%</text>

<rect x="12" y="130" width="370" height="190" fill="#1a2c24" rx="8"/>
<text x="24" y="150" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">MRR via partenaires</text>
<rect x="28" y="260" width="20" height="30" fill="#0e7a54" rx="3" opacity="0.4"/><rect x="55" y="248" width="20" height="42" fill="#0e7a54" rx="3" opacity="0.45"/><rect x="82" y="236" width="20" height="54" fill="#0e7a54" rx="3" opacity="0.5"/><rect x="109" y="224" width="20" height="66" fill="#0e7a54" rx="3" opacity="0.55"/><rect x="136" y="212" width="20" height="78" fill="#0e7a54" rx="3" opacity="0.6000000000000001"/><rect x="163" y="200" width="20" height="90" fill="#0e7a54" rx="3" opacity="0.65"/><rect x="190" y="188" width="20" height="102" fill="#0e7a54" rx="3" opacity="0.7000000000000001"/><rect x="217" y="176" width="20" height="114" fill="#0e7a54" rx="3" opacity="0.75"/><rect x="244" y="164" width="20" height="126" fill="#0e7a54" rx="3" opacity="0.8"/><rect x="271" y="152" width="20" height="138" fill="#0e7a54" rx="3" opacity="0.8500000000000001"/><rect x="298" y="140" width="20" height="150" fill="#0e7a54" rx="3" opacity="0.9"/><rect x="325" y="128" width="20" height="162" fill="#0e7a54" rx="3" opacity="0.9500000000000001"/>
<polyline points="38,260 65,248 92,236 119,224 146,212 173,200 200,188 227,176 254,164 281,152 308,140 335,128" fill="none" stroke="#0e7a54" stroke-width="2" stroke-linecap="round"/>
<rect x="392" y="130" width="196" height="190" fill="#1a2c24" rx="8"/>
<text x="404" y="150" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Top Apporteurs</text>

  <text x="404" y="174" font-family="system-ui" font-size="9" fill="#ded8cb">J. Dupont</text>
  <text x="560" y="174" font-family="system-ui" font-size="9" fill="#0e7a54">12 leads</text>
  <rect x="404" y="180" width="176" height="5" fill="#0e1f18" rx="3"/>
  <rect x="404" y="180" width="149.6" height="5" fill="#0e7a54" rx="3"/>

  <text x="404" y="210" font-family="system-ui" font-size="9" fill="#ded8cb">M. Martin</text>
  <text x="560" y="210" font-family="system-ui" font-size="9" fill="#0e7a54">9 leads</text>
  <rect x="404" y="216" width="176" height="5" fill="#0e1f18" rx="3"/>
  <rect x="404" y="216" width="112.64" height="5" fill="#0e7a54" rx="3"/>

  <text x="404" y="246" font-family="system-ui" font-size="9" fill="#ded8cb">S. Bernard</text>
  <text x="560" y="246" font-family="system-ui" font-size="9" fill="#b4791f">7 leads</text>
  <rect x="404" y="252" width="176" height="5" fill="#0e1f18" rx="3"/>
  <rect x="404" y="252" width="88" height="5" fill="#b4791f" rx="3"/>

  <text x="404" y="282" font-family="system-ui" font-size="9" fill="#ded8cb">A. Leroy</text>
  <text x="560" y="282" font-family="system-ui" font-size="9" fill="#0e7a54">5 leads</text>
  <rect x="404" y="288" width="176" height="5" fill="#0e1f18" rx="3"/>
  <rect x="404" y="288" width="63.36" height="5" fill="#0e7a54" rx="3"/>

<rect x="12" y="330" width="576" height="1" fill="#1a2c24"/>
<text x="300" y="360" font-family="system-ui" font-size="9" fill="#33433b" text-anchor="middle">Période : 30 derniers jours · Mis à jour il y a 2 min</text>
</svg>`;
const ILLUS = [
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18">
    <rect x="12" y="12" width="456" height="236" fill="#1a2c24" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Entonnoir de conversion</text>
    
    <text x="24" y="60" font-family="system-ui" font-size="9" fill="#ded8cb">1 284 clics</text>
    <text x="420" y="60" font-family="system-ui" font-size="9" fill="#0e7a54">100%</text>
    <rect x="24" y="64" width="432" height="16" fill="#0e1f18" rx="4"/>
    <rect x="24" y="64" width="420" height="16" fill="#0e7a54" rx="4" opacity="0.8"/>
    
    <text x="24" y="98" font-family="system-ui" font-size="9" fill="#ded8cb">87 formulaires</text>
    <text x="420" y="98" font-family="system-ui" font-size="9" fill="#0e7a54">6.8%</text>
    <rect x="24" y="102" width="432" height="16" fill="#0e1f18" rx="4"/>
    <rect x="24" y="102" width="320" height="16" fill="#0e7a54" rx="4" opacity="0.8"/>
    
    <text x="24" y="136" font-family="system-ui" font-size="9" fill="#ded8cb">47 leads qualifiés</text>
    <text x="420" y="136" font-family="system-ui" font-size="9" fill="#b4791f">3.7%</text>
    <rect x="24" y="140" width="432" height="16" fill="#0e1f18" rx="4"/>
    <rect x="24" y="140" width="220" height="16" fill="#b4791f" rx="4" opacity="0.8"/>
    
    <text x="24" y="174" font-family="system-ui" font-size="9" fill="#ded8cb">23 démos</text>
    <text x="420" y="174" font-family="system-ui" font-size="9" fill="#0e7a54">1.8%</text>
    <rect x="24" y="178" width="432" height="16" fill="#0e1f18" rx="4"/>
    <rect x="24" y="178" width="140" height="16" fill="#0e7a54" rx="4" opacity="0.8"/>
    
    <text x="24" y="212" font-family="system-ui" font-size="9" fill="#ded8cb">8 deals</text>
    <text x="420" y="212" font-family="system-ui" font-size="9" fill="#4ade80">0.6%</text>
    <rect x="24" y="216" width="432" height="16" fill="#0e1f18" rx="4"/>
    <rect x="24" y="216" width="80" height="16" fill="#4ade80" rx="4" opacity="0.8"/>
    
  </svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18">
    <rect x="12" y="12" width="216" height="236" fill="#1a2c24" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">CAC Partenaires</text>
    <text x="24" y="80" font-family="system-ui" font-size="32" font-weight="900" fill="#0e7a54">340€</text>
    <text x="24" y="100" font-family="system-ui" font-size="9" fill="#2fa876">-12% vs trimestre dernier</text>
    <rect x="24" y="116" width="192" height="1" fill="#0e1f18"/>
    <text x="24" y="136" font-family="system-ui" font-size="9" fill="#6e756c">vs SEA: 1 240€</text>
    <text x="24" y="154" font-family="system-ui" font-size="9" fill="#6e756c">vs Inbound: 680€</text>
    <text x="24" y="172" font-family="system-ui" font-size="9" fill="#6e756c">vs Événements: 2 100€</text>
    <rect x="24" y="186" width="160" height="36" fill="#4c1d95" rx="8"/>
    <text x="104" y="208" font-family="system-ui" font-size="10" font-weight="700" fill="#c4b5fd" text-anchor="middle">Canal le plus rentable</text>
    <rect x="240" y="12" width="228" height="236" fill="#1a2c24" rx="8"/>
    <text x="252" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">ROI Programme</text>
    <text x="252" y="80" font-family="system-ui" font-size="32" font-weight="900" fill="#0e7a54">8:1</text>
    <text x="252" y="100" font-family="system-ui" font-size="9" fill="#6e756c">Pour 1€ investi</text>
    <text x="252" y="140" font-family="system-ui" font-size="9" fill="#ded8cb">Coût programme: 4 280€</text>
    <text x="252" y="158" font-family="system-ui" font-size="9" fill="#4ade80">CA généré: 34 200€</text>
  </svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18">
    <rect x="12" y="12" width="456" height="236" fill="#1a2c24" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Rapport Export — Avril 2026</text>
    <rect x="24" y="50" width="432" height="28" fill="#0e1f18" rx="6"/>
    <text x="36" y="68" font-family="system-ui" font-size="9" fill="#ded8cb">Rapport mensuel complet</text>
    <text x="400" y="68" font-family="system-ui" font-size="9" fill="#0e7a54">PDF</text>
    <rect x="24" y="84" width="432" height="28" fill="#0e1f18" rx="6"/>
    <text x="36" y="102" font-family="system-ui" font-size="9" fill="#ded8cb">Détail par apporteur</text>
    <text x="400" y="102" font-family="system-ui" font-size="9" fill="#2fa876">CSV</text>
    <rect x="24" y="118" width="432" height="28" fill="#0e1f18" rx="6"/>
    <text x="36" y="136" font-family="system-ui" font-size="9" fill="#ded8cb">Commissions à valider</text>
    <text x="400" y="136" font-family="system-ui" font-size="9" fill="#b4791f">CSV</text>
    <rect x="24" y="186" width="200" height="36" fill="#4c1d95" rx="8"/>
    <text x="124" y="208" font-family="system-ui" font-size="10" font-weight="700" fill="#c4b5fd" text-anchor="middle">Envoyer au Board</text>
    <rect x="236" y="186" width="200" height="36" fill="#0e1f18" rx="8"/>
    <text x="336" y="208" font-family="system-ui" font-size="10" fill="#6e756c" text-anchor="middle">Planifier automatique</text>
  </svg>`,
];

export default function FeatureAnalyticsPage() {
  const { t } = useTranslation();
  const d = t('features.analytics', { returnObjects: true });
  const benefits = d.benefits.map((b, i) => ({ ...b, illustration: ILLUS[i] }));

  return (
    <FeaturePageTemplate
      helmet={{ title: d.helmet_title, description: d.helmet_desc, canonical: 'https://refboost.io/fonctionnalites/analytics' }}
      accentColor="#0e7a54"
      label={t('features.label')}
      title={d.title}
      subtitle={d.subtitle}
      mockupSvg={MOCKUP}
      benefits={benefits}
      quote={d.quote}
      currentHref="/fonctionnalites/analytics"
    />
  );
}
