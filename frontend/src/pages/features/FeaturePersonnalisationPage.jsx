import { useTranslation } from 'react-i18next';
import FeaturePageTemplate from '../../components/FeaturePageTemplate';

const MOCKUP = `<svg viewBox="0 0 600 380" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block">

  <rect width="600" height="380" fill="#0f172a" rx="0"/>
  <rect x="0" y="0" width="600" height="44" fill="#1e293b"/>
  <circle cx="18" cy="22" r="6" fill="#ef4444"/><circle cx="36" cy="22" r="6" fill="#f59e0b"/><circle cx="54" cy="22" r="6" fill="#22c55e"/>
  <text x="300" y="27" font-family="system-ui" font-size="11" fill="#475569" text-anchor="middle">Mon espace partenaires — Acme Corp</text>
<rect x="0" y="44" width="140" height="336" fill="#111827"/>
<rect x="12" y="56" width="116" height="36" fill="#1e3a2f" rx="8"/>
<circle cx="28" cy="74" r="8" fill="#059669"/>
<text x="42" y="78" font-family="system-ui" font-size="10" font-weight="700" fill="#4ade80">Dashboard</text>

  <rect x="12" y="100" width="116" height="36" fill="#0f172a" rx="8"/>
  <text x="42" y="122" font-family="system-ui" font-size="10" fill="#64748b">Pipeline</text>

  <rect x="12" y="144" width="116" height="36" fill="#0f172a" rx="8"/>
  <text x="42" y="166" font-family="system-ui" font-size="10" fill="#64748b">Commissions</text>

  <rect x="12" y="188" width="116" height="36" fill="#0f172a" rx="8"/>
  <text x="42" y="210" font-family="system-ui" font-size="10" fill="#64748b">Partenaires</text>

  <rect x="12" y="232" width="116" height="36" fill="#0f172a" rx="8"/>
  <text x="42" y="254" font-family="system-ui" font-size="10" fill="#64748b">Messagerie</text>

<rect x="0" y="320" width="140" height="60" fill="#0d1117"/>
<circle cx="24" cy="350" r="10" fill="#059669"/>
<text x="40" y="354" font-family="system-ui" font-size="9" fill="#e2e8f0">Sophie Martin</text>
<text x="40" y="365" font-family="system-ui" font-size="8" fill="#64748b">Partenaire Gold</text>
<rect x="148" y="56" width="440" height="72" fill="#1e293b" rx="8"/>
<rect x="160" y="68" width="36" height="36" fill="#059669" rx="8"/>
<text x="170" y="90" font-family="system-ui" font-size="14" font-weight="800" fill="#fff">A</text>
<text x="204" y="82" font-family="system-ui" font-size="13" font-weight="800" fill="#e2e8f0">Acme Corp</text>
<text x="204" y="97" font-family="system-ui" font-size="10" fill="#64748b">Votre programme partenaires premium</text>
<text x="540" y="82" font-family="system-ui" font-size="9" fill="#059669" text-anchor="end">Partenaire Gold</text>

  <rect x="148" y="138" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="158" y="157" font-family="system-ui" font-size="8" fill="#64748b">Leads soumis</text>
  <text x="158" y="180" font-family="system-ui" font-size="16" font-weight="800" fill="#fff">12</text>
  <text x="158" y="193" font-family="system-ui" font-size="8" fill="#059669">+3 ce mois</text>

  <rect x="295" y="138" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="305" y="157" font-family="system-ui" font-size="8" fill="#64748b">En cours</text>
  <text x="305" y="180" font-family="system-ui" font-size="16" font-weight="800" fill="#fff">7</text>
  <text x="305" y="193" font-family="system-ui" font-size="8" fill="#059669">2 relances</text>

  <rect x="442" y="138" width="135" height="60" fill="#1e293b" rx="8"/>
  <text x="452" y="157" font-family="system-ui" font-size="8" fill="#64748b">Commissions</text>
  <text x="452" y="180" font-family="system-ui" font-size="16" font-weight="800" fill="#fff">2 840 €</text>
  <text x="452" y="193" font-family="system-ui" font-size="8" fill="#059669">Mois en cours</text>

<rect x="148" y="210" width="440" height="120" fill="#1e293b" rx="8"/>
<text x="160" y="228" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Mes derniers leads</text>

  <rect x="148" y="240" width="440" height="24" fill="#0f172a" rx="0"/>
  <text x="160" y="256" font-family="system-ui" font-size="9" fill="#e2e8f0">DataFlow SAS</text>
  <text x="380" y="256" font-family="system-ui" font-size="9" fill="#94a3b8">En cours</text>
  <text x="560" y="256" font-family="system-ui" font-size="9" font-weight="700" fill="#fff" text-anchor="end">12 000 €</text>

  <rect x="148" y="268" width="440" height="24" fill="#1e293b" rx="0"/>
  <text x="160" y="284" font-family="system-ui" font-size="9" fill="#e2e8f0">Proxim Inc</text>
  <text x="380" y="284" font-family="system-ui" font-size="9" fill="#f59e0b">Qualifié</text>
  <text x="560" y="284" font-family="system-ui" font-size="9" font-weight="700" fill="#fff" text-anchor="end">8 500 €</text>

  <rect x="148" y="296" width="440" height="24" fill="#0f172a" rx="0"/>
  <text x="160" y="312" font-family="system-ui" font-size="9" fill="#e2e8f0">TechVision</text>
  <text x="380" y="312" font-family="system-ui" font-size="9" fill="#4ade80">Signé</text>
  <text x="560" y="312" font-family="system-ui" font-size="9" font-weight="700" fill="#fff" text-anchor="end">22 000 €</text>

<rect x="0" y="330" width="600" height="50" fill="#0d1117"/>
<text x="300" y="360" font-family="system-ui" font-size="9" fill="#475569" text-anchor="middle">acme-partenaires.com · Powered by RefBoost</text>
</svg>`;
const ILLUS0 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Personnalisation de l’interface</text><rect x="24" y="50" width="432" height="36" fill="#0f172a" rx="6"/><text x="36" y="72" font-family="system-ui" font-size="10" fill="#e2e8f0">Couleur principale</text><rect x="300" y="58" width="24" height="24" rx="6" fill="#059669"/><rect x="332" y="58" width="24" height="24" rx="6" fill="#3b82f6"/><rect x="364" y="58" width="24" height="24" rx="6" fill="#f59e0b"/><rect x="396" y="58" width="24" height="24" rx="6" fill="#dc2626"/><rect x="24" y="92" width="432" height="36" fill="#0f172a" rx="6"/><text x="36" y="114" font-family="system-ui" font-size="10" fill="#e2e8f0">Logo</text><rect x="300" y="100" width="148" height="20" fill="#1e293b" rx="4"/><text x="374" y="114" font-family="system-ui" font-size="9" fill="#64748b" text-anchor="middle">Téléverser</text><rect x="24" y="134" width="432" height="36" fill="#0f172a" rx="6"/><text x="36" y="156" font-family="system-ui" font-size="10" fill="#e2e8f0">Domaine personnalisé</text><text x="300" y="156" font-family="system-ui" font-size="9" fill="#3b82f6">partenaires.acme.com</text><rect x="24" y="188" width="432" height="36" fill="#0f172a" rx="6"/><text x="36" y="210" font-family="system-ui" font-size="10" fill="#e2e8f0">Nom de l’espace</text><text x="300" y="210" font-family="system-ui" font-size="9" fill="#e2e8f0">Programme Acme Partners</text></svg>`;
const ILLUS1 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Espace partenaire — Acme Corp</text><circle cx="36" cy="72" r="16" fill="#059669"/><text x="36" y="77" font-family="system-ui" font-size="12" font-weight="800" fill="#fff" text-anchor="middle">A</text><text x="60" y="68" font-family="system-ui" font-size="13" font-weight="800" fill="#fff">Acme Corp</text><text x="60" y="84" font-family="system-ui" font-size="9" fill="#64748b">Programme partenaires premium</text><rect x="24" y="100" width="140" height="56" fill="#052e16" rx="8"/><text x="36" y="120" font-family="system-ui" font-size="8" fill="#4ade80">Vos commissions</text><text x="36" y="144" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">2 840€</text><rect x="172" y="100" width="140" height="56" fill="#0f172a" rx="8"/><text x="184" y="120" font-family="system-ui" font-size="8" fill="#64748b">Leads actifs</text><text x="184" y="144" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">7</text><rect x="320" y="100" width="148" height="56" fill="#0f172a" rx="8"/><text x="332" y="120" font-family="system-ui" font-size="8" fill="#64748b">Taux conversion</text><text x="332" y="144" font-family="system-ui" font-size="20" font-weight="800" fill="#fff">34%</text></svg>`;
const ILLUS2 = `<svg viewBox="0 0 480 260" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;background:#0f172a"><rect x="12" y="12" width="456" height="236" fill="#1e293b" rx="8"/><text x="24" y="36" font-family="system-ui" font-size="10" font-weight="700" fill="#e2e8f0">Formulaire public de soumission</text><text x="24" y="60" font-family="system-ui" font-size="9" fill="#64748b">partenaires.acme.com/soumettre</text><rect x="24" y="74" width="432" height="32" fill="#0f172a" rx="6"/><text x="36" y="94" font-family="system-ui" font-size="9" fill="#94a3b8">Nom de la société</text><rect x="24" y="112" width="432" height="32" fill="#0f172a" rx="6"/><text x="36" y="132" font-family="system-ui" font-size="9" fill="#94a3b8">Contact décideur</text><rect x="24" y="150" width="432" height="32" fill="#0f172a" rx="6"/><text x="36" y="170" font-family="system-ui" font-size="9" fill="#94a3b8">Contexte et besoin</text><rect x="24" y="198" width="200" height="36" fill="#059669" rx="8"/><text x="124" y="220" font-family="system-ui" font-size="11" font-weight="700" fill="#fff" text-anchor="middle">Soumettre mon lead</text></svg>`;
const ILLUS = [ILLUS0, ILLUS1, ILLUS2];

export default function FeaturePersonnalisationPage() {
  const { t } = useTranslation();
  const d = t('features.personnalisation', { returnObjects: true });
  const benefits = d.benefits.map((b, i) => ({ ...b, illustration: ILLUS[i] }));

  return (
    <FeaturePageTemplate
      helmet={{ title: d.helmet_title, description: d.helmet_desc, canonical: 'https://refboost.io/fonctionnalites/personnalisation' }}
      accentColor="#0ea5e9"
      label={t('features.label')}
      title={d.title}
      subtitle={d.subtitle}
      mockupSvg={MOCKUP}
      benefits={benefits}
      quote={d.quote}
      currentHref="/fonctionnalites/personnalisation"
    />
  );
}
