import { useTranslation } from 'react-i18next';
import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0e1f18" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1a2c24"/>
  <circle cx="18" cy="22" r="6" fill="#c24436"/><circle cx="36" cy="22" r="6" fill="#b4791f"/><circle cx="54" cy="22" r="6" fill="#2fa876"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#33433b" text-anchor="middle">Commissions — RefBoost</text>
<rect x="12" y="56" width="576" height="72" fill="#1a2c24" rx="8"/>
<text x="24" y="76" font-family="system-ui" font-size="9" fill="#6e756c">COMMISSIONS À VALIDER</text>
<text x="24" y="96" font-family="system-ui" font-size="18" font-weight="800" fill="#fff">3 en attente</text>
<text x="24" y="114" font-family="system-ui" font-size="9" fill="#b4791f">Total : 4 280 €</text>
<rect x="320" y="68" width="120" height="32" fill="#b4791f" rx="8"/>
<text x="380" y="88" font-family="system-ui" font-size="11" font-weight="700" fill="#0e1f18" text-anchor="middle">Tout valider</text>
<rect x="12" y="140" width="576" height="1" fill="#1a2c24"/>
<text x="12" y="162" font-family="system-ui" font-size="10" font-weight="700" fill="#6e756c">HISTORIQUE DES COMMISSIONS</text>

  <rect x="12" y="175" width="576" height="32" fill="#0e1f18" rx="0"/>
  <text x="24" y="195" font-family="system-ui" font-size="9" fill="#ded8cb">M. Bernard</text>
  <text x="160" y="195" font-family="system-ui" font-size="9" fill="#6e756c">Deal — Nexus SAS</text>
  <text x="400" y="195" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">1 232 €</text>
  <text x="500" y="195" font-family="system-ui" font-size="9" font-weight="600" fill="#2fa876">Payée</text>

  <rect x="12" y="213" width="576" height="32" fill="#1a2c24" rx="0"/>
  <text x="24" y="233" font-family="system-ui" font-size="9" fill="#ded8cb">S. Martin</text>
  <text x="160" y="233" font-family="system-ui" font-size="9" fill="#6e756c">Deal — TechCorp</text>
  <text x="400" y="233" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">856 €</text>
  <text x="500" y="233" font-family="system-ui" font-size="9" font-weight="600" fill="#2fa876">Payée</text>

  <rect x="12" y="251" width="576" height="32" fill="#0e1f18" rx="0"/>
  <text x="24" y="271" font-family="system-ui" font-size="9" fill="#ded8cb">A. Leroy</text>
  <text x="160" y="271" font-family="system-ui" font-size="9" fill="#6e756c">Deal — DataFlow</text>
  <text x="400" y="271" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">2 100 €</text>
  <text x="500" y="271" font-family="system-ui" font-size="9" font-weight="600" fill="#b4791f">En attente</text>

  <rect x="12" y="289" width="576" height="32" fill="#1a2c24" rx="0"/>
  <text x="24" y="309" font-family="system-ui" font-size="9" fill="#ded8cb">J. Dupont</text>
  <text x="160" y="309" font-family="system-ui" font-size="9" fill="#6e756c">Deal — Proxim</text>
  <text x="400" y="309" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">640 €</text>
  <text x="500" y="309" font-family="system-ui" font-size="9" font-weight="600" fill="#b4791f">En attente</text>

  <rect x="12" y="327" width="576" height="32" fill="#0e1f18" rx="0"/>
  <text x="24" y="347" font-family="system-ui" font-size="9" fill="#ded8cb">C. Petit</text>
  <text x="160" y="347" font-family="system-ui" font-size="9" fill="#6e756c">Deal — Opticom</text>
  <text x="400" y="347" font-family="system-ui" font-size="10" font-weight="700" fill="#fff">1 380 €</text>
  <text x="500" y="347" font-family="system-ui" font-size="9" font-weight="600" fill="#0e7a54">Calculée</text>

</svg>`;
const ILLUS = [
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18"><rect x="12" y="12" width="200" height="108" fill="#1a2c24" rx="8"/>
    <text x="24" y="34" font-family="system-ui" font-size="8" fill="#6e756c">Commissions du mois</text>
    <text x="24" y="64" font-family="system-ui" font-size="28" font-weight="800" fill="#fff">4 280 €</text>
    <text x="24" y="84" font-family="system-ui" font-size="9" fill="#2fa876">+22% vs mois dernier</text>
    <rect x="220" y="12" width="248" height="108" fill="#1a2c24" rx="8"/>
    <text x="232" y="34" font-family="system-ui" font-size="8" fill="#6e756c">Règle active: 8% MRR deal</text>
    <text x="232" y="54" font-family="system-ui" font-size="10" fill="#ded8cb">Deal 22 000€ x 8% = 1 760€</text>
    <text x="232" y="80" font-family="system-ui" font-size="10" fill="#ded8cb">Deal 12 000€ x 8% = 960€</text>
    <text x="232" y="106" font-family="system-ui" font-size="10" font-weight="700" fill="#b4791f">Total automatique: 2 720€</text>
    <rect x="12" y="130" width="456" height="24" fill="#1a2c24" rx="0"/>
    <text x="24" y="146" font-family="system-ui" font-size="9" fill="#ded8cb">M. Bernard</text>
    <text x="360" y="146" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">1 232 €</text>
    <text x="436" y="146" font-family="system-ui" font-size="9" fill="#2fa876">Payée</text><rect x="12" y="158" width="456" height="24" fill="#0e1f18" rx="0"/>
    <text x="24" y="174" font-family="system-ui" font-size="9" fill="#ded8cb">S. Martin</text>
    <text x="360" y="174" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">856 €</text>
    <text x="436" y="174" font-family="system-ui" font-size="9" fill="#2fa876">Payée</text><rect x="12" y="186" width="456" height="24" fill="#1a2c24" rx="0"/>
    <text x="24" y="202" font-family="system-ui" font-size="9" fill="#ded8cb">A. Leroy</text>
    <text x="360" y="202" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">2 100 €</text>
    <text x="436" y="202" font-family="system-ui" font-size="9" fill="#b4791f">Attente</text><rect x="12" y="214" width="456" height="24" fill="#0e1f18" rx="0"/>
    <text x="24" y="230" font-family="system-ui" font-size="9" fill="#ded8cb">J. Dupont</text>
    <text x="360" y="230" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">640 €</text>
    <text x="436" y="230" font-family="system-ui" font-size="9" fill="#b4791f">Attente</text></svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18"><rect x="12" y="12" width="300" height="236" fill="#1a2c24" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Règles de commission</text>
    <rect x="24" y="48" width="276" height="36" fill="#0e1f18" rx="6"/><text x="36" y="68" font-family="system-ui" font-size="9" fill="#ded8cb">Deal standard: 8% MRR</text>
    <rect x="24" y="90" width="276" height="36" fill="#0e1f18" rx="6"/><text x="36" y="110" font-family="system-ui" font-size="9" fill="#ded8cb">Vol. > 5 leads/mois: 12%</text>
    <rect x="24" y="132" width="276" height="36" fill="#0e1f18" rx="6"/><text x="36" y="152" font-family="system-ui" font-size="9" fill="#ded8cb">Bonus closing: +500€</text>
    <rect x="24" y="192" width="120" height="28" fill="#b4791f" rx="8"/>
    <text x="84" y="210" font-family="system-ui" font-size="10" font-weight="700" fill="#0e1f18" text-anchor="middle">+ Règle</text>
    <rect x="320" y="12" width="148" height="236" fill="#1a2c24" rx="8"/>
    <text x="332" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Paiements</text>
    <rect x="332" y="52" width="128" height="26" fill="#0e1f18" rx="4"/>
    <text x="344" y="68" font-family="system-ui" font-size="8" fill="#6e756c">12 avril 2026</text>
    <text x="344" y="80" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">1 232 €</text><rect x="332" y="84" width="128" height="26" fill="#0e1f18" rx="4"/>
    <text x="344" y="100" font-family="system-ui" font-size="8" fill="#6e756c">12 avril 2026</text>
    <text x="344" y="112" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">856 €</text><rect x="332" y="116" width="128" height="26" fill="#0e1f18" rx="4"/>
    <text x="344" y="132" font-family="system-ui" font-size="8" fill="#6e756c">12 avril 2026</text>
    <text x="344" y="144" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">2 100 €</text><rect x="332" y="148" width="128" height="26" fill="#0e1f18" rx="4"/>
    <text x="344" y="164" font-family="system-ui" font-size="8" fill="#6e756c">12 avril 2026</text>
    <text x="344" y="176" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">640 €</text><rect x="332" y="180" width="128" height="26" fill="#0e1f18" rx="4"/>
    <text x="344" y="196" font-family="system-ui" font-size="8" fill="#6e756c">12 avril 2026</text>
    <text x="344" y="208" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">1 380 €</text><rect x="332" y="212" width="128" height="26" fill="#0e1f18" rx="4"/>
    <text x="344" y="228" font-family="system-ui" font-size="8" fill="#6e756c">12 avril 2026</text>
    <text x="344" y="240" font-family="system-ui" font-size="9" font-weight="700" fill="#fff">720 €</text></svg>`,
`<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0e1f18"><rect x="12" y="12" width="456" height="236" fill="#1a2c24" rx="8"/>
    <text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#ded8cb">Export & Comptabilité</text>
    <rect x="24" y="50" width="200" height="36" fill="#0e1f18" rx="6"/><text x="36" y="73" font-family="system-ui" font-size="10" fill="#ded8cb">Commission_Avril_2026.csv</text>
    <rect x="232" y="50" width="200" height="36" fill="#0e1f18" rx="6"/><text x="244" y="73" font-family="system-ui" font-size="10" fill="#ded8cb">Factures_Q1_2026.pdf</text>
    <text x="24" y="114" font-family="system-ui" font-size="9" fill="#6e756c">Intégration comptabilité</text>
    <rect x="24" y="122" width="100" height="28" fill="#0e1f18" rx="6"/><text x="74" y="140" font-family="system-ui" font-size="9" fill="#ded8cb" text-anchor="middle">QuickBooks</text>
    <rect x="132" y="122" width="100" height="28" fill="#0e1f18" rx="6"/><text x="182" y="140" font-family="system-ui" font-size="9" fill="#ded8cb" text-anchor="middle">Pennylane</text>
    <rect x="240" y="122" width="100" height="28" fill="#0e1f18" rx="6"/><text x="290" y="140" font-family="system-ui" font-size="9" fill="#ded8cb" text-anchor="middle">Zapier</text></svg>`,
];

export default function FeatureCommissionsPage() {
  const { t } = useTranslation();
  const d = t('features.commissions', { returnObjects: true });
  const benefits = d.benefits.map((b, i) => ({ ...b, illustration: ILLUS[i] }));

  return (
    <FeaturePageTemplate
      helmet={{ title: d.helmet_title, description: d.helmet_desc, canonical: 'https://refboost.io/fonctionnalites/commissions' }}
      accentColor="#b4791f"
      label={t('features.label')}
      title={d.title}
      subtitle={d.subtitle}
      mockupSvg={MOCKUP}
      benefits={benefits}
      quote={d.quote}
      currentHref="/fonctionnalites/commissions"
    />
  );
}
