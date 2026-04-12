import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';

const C = { p: '#f97316', s: '#0f172a', m: '#64748b' };
const g = `linear-gradient(135deg, #f97316, #f97316cc)`;

const MOCKUP = "<svg viewBox=\"0 0 600 340\" xmlns=\"http://www.w3.org/2000/svg\" style=\"width:100%;border-radius:12px;\">\n  <rect width=\"600\" height=\"340\" fill=\"#0f172a\" rx=\"12\"/>\n  <rect x=\"0\" y=\"0\" width=\"600\" height=\"44\" fill=\"#1e293b\" rx=\"12\"/>\n  <rect x=\"0\" y=\"32\" width=\"600\" height=\"12\" fill=\"#1e293b\"/>\n  <circle cx=\"20\" cy=\"22\" r=\"7\" fill=\"#ef4444\"/>\n  <circle cx=\"40\" cy=\"22\" r=\"7\" fill=\"#f59e0b\"/>\n  <circle cx=\"60\" cy=\"22\" r=\"7\" fill=\"#22c55e\"/>\n  <text x=\"200\" y=\"27\" font-family=\"system-ui\" font-size=\"12\" fill=\"#94a3b8\" text-anchor=\"middle\">Mon espace partenaire — Jean Dupont</text>\n  <!-- Unique link card -->\n  <rect x=\"16\" y=\"56\" width=\"568\" height=\"68\" fill=\"#1e293b\" rx=\"10\"/>\n  <text x=\"28\" y=\"76\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#f97316\">🔗 MON LIEN DE TRACKING UNIQUE</text>\n  <rect x=\"28\" y=\"84\" width=\"440\" height=\"28\" fill=\"#0f172a\" rx=\"6\"/>\n  <text x=\"38\" y=\"102\" font-family=\"system-ui\" font-size=\"10\" fill=\"#94a3b8\">https://partners.refboost.io/r/jean-dupont-x7k2</text>\n  <rect x=\"476\" y=\"84\" width=\"90\" height=\"28\" fill=\"#f97316\" rx=\"6\"/>\n  <text x=\"521\" y=\"102\" font-family=\"system-ui\" font-size=\"10\" fill=\"white\" text-anchor=\"middle\" font-weight=\"700\">Copier</text>\n  <!-- Stats cards -->\n  \n  <rect x=\"16\" y=\"136\" width=\"131\" height=\"64\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"28\" y=\"156\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Clics ce mois</text>\n  <text x=\"28\" y=\"186\" font-family=\"system-ui\" font-size=\"24\" font-weight=\"800\" fill=\"#3b82f6\">142</text>\n  \n  <rect x=\"159\" y=\"136\" width=\"131\" height=\"64\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"171\" y=\"156\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Formulaires</text>\n  <text x=\"171\" y=\"186\" font-family=\"system-ui\" font-size=\"24\" font-weight=\"800\" fill=\"#f97316\">38</text>\n  \n  <rect x=\"302\" y=\"136\" width=\"131\" height=\"64\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"314\" y=\"156\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Leads qualifiés</text>\n  <text x=\"314\" y=\"186\" font-family=\"system-ui\" font-size=\"24\" font-weight=\"800\" fill=\"#8b5cf6\">12</text>\n  \n  <rect x=\"445\" y=\"136\" width=\"131\" height=\"64\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"457\" y=\"156\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Taux conv.</text>\n  <text x=\"457\" y=\"186\" font-family=\"system-ui\" font-size=\"24\" font-weight=\"800\" fill=\"#22c55e\">31%</text>\n  \n  <!-- Lead list -->\n  <rect x=\"16\" y=\"212\" width=\"568\" height=\"30\" fill=\"#1e293b\" rx=\"6\"/>\n  <text x=\"28\" y=\"232\" font-family=\"system-ui\" font-size=\"9\" font-weight=\"700\" fill=\"#64748b\">PROSPECT</text>\n  <text x=\"200\" y=\"232\" font-family=\"system-ui\" font-size=\"9\" font-weight=\"700\" fill=\"#64748b\">SOUMIS LE</text>\n  <text x=\"340\" y=\"232\" font-family=\"system-ui\" font-size=\"9\" font-weight=\"700\" fill=\"#64748b\">STATUT</text>\n  <text x=\"460\" y=\"232\" font-family=\"system-ui\" font-size=\"9\" font-weight=\"700\" fill=\"#64748b\">COMMISSION</text>\n  \n  <rect x=\"16\" y=\"248\" width=\"568\" height=\"32\" fill=\"#0f172a\" rx=\"4\"/>\n  <text x=\"28\" y=\"268\" font-family=\"system-ui\" font-size=\"10\" fill=\"#e2e8f0\">Acme Corp</text>\n  <text x=\"200\" y=\"268\" font-family=\"system-ui\" font-size=\"9\" fill=\"#64748b\">12 avr. 2026</text>\n  <rect x=\"336\" y=\"256\" width=\"68\" height=\"16\" fill=\"#8b5cf622\" rx=\"8\"/>\n  <text x=\"344\" y=\"268\" font-family=\"system-ui\" font-size=\"8\" fill=\"#8b5cf6\">Qualifié</text>\n  <text x=\"460\" y=\"268\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#f59e0b\">En cours</text>\n  \n  <rect x=\"16\" y=\"284\" width=\"568\" height=\"32\" fill=\"#111827\" rx=\"4\"/>\n  <text x=\"28\" y=\"304\" font-family=\"system-ui\" font-size=\"10\" fill=\"#e2e8f0\">Tech Solutions</text>\n  <text x=\"200\" y=\"304\" font-family=\"system-ui\" font-size=\"9\" fill=\"#64748b\">10 avr. 2026</text>\n  <rect x=\"336\" y=\"292\" width=\"68\" height=\"16\" fill=\"#22c55e22\" rx=\"8\"/>\n  <text x=\"344\" y=\"304\" font-family=\"system-ui\" font-size=\"8\" fill=\"#22c55e\">Gagné</text>\n  <text x=\"460\" y=\"304\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#f59e0b\">1 200 €</text>\n  \n</svg>";

const BENEFITS = [{"icon":"🔗","title":"Lien unique par apporteur","text":"Un lien, un apporteur, une attribution automatique. Partageable sur LinkedIn, par email, en signature — ça marche partout."},{"icon":"📝","title":"Formulaire public intégré","text":"Vos prospects remplissent un formulaire simple. Le lead arrive directement dans votre pipeline avec toutes les informations nécessaires."},{"icon":"🕵️","title":"Tracking complet","text":"Nombre de clics, taux de conversion du formulaire, délai moyen de soumission — optimisez l'efficacité de vos apporteurs."}];

export default function FeatureTrackingPage() {
  const navigate = useNavigate();
  return (
    <LandingLayout>
      <Helmet>
        <title>Liens de tracking uniques — RefBoost</title>
        <meta name="description" content="Chaque apporteur reçoit son lien personnel. Il le partage, les leads arrivent directement dans votre pipeline avec attribution automatique. Pas de saisie m" />
        <link rel="canonical" href="https://refboost.io/fonctionnalites/tracking" />
      </Helmet>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '80px 48px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 50, background: `${C.p}20`, border: `1px solid ${C.p}40`, fontSize: 13, fontWeight: 700, color: C.p, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
          🔗 Fonctionnalité
        </div>
        <h1 style={{ margin: '0 0 20px', fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -2 }}>
          Liens de tracking uniques
        </h1>
        <p style={{ margin: '0 auto 36px', fontSize: 20, color: '#94a3b8', maxWidth: 600, lineHeight: 1.6 }}>
          Attribution automatique, zéro friction pour vos apporteurs
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/signup')} style={{ padding: '14px 32px', borderRadius: 12, border: 'none', background: g, color: '#fff', fontWeight: 700, fontSize: 16, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}40` }}>
            Essayer gratuitement →
          </button>
          <button onClick={() => navigate('/login')} style={{ padding: '14px 32px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.2)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 16, cursor: 'pointer' }}>
            Se connecter
          </button>
        </div>
      </section>

      {/* Mockup */}
      <section style={{ background: '#f8fafc', padding: '64px 48px' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <div style={{ borderRadius: 20, overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.15)', border: '1px solid #e2e8f0' }}
            dangerouslySetInnerHTML={{ __html: MOCKUP }} />
          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 13, color: '#94a3b8' }}>
            Aperçu de l'interface RefBoost — Liens de tracking uniques
          </p>
        </div>
      </section>

      {/* Benefits */}
      <section style={{ background: '#fff', padding: '80px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 56 }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 2 }}>Pourquoi ça change tout</p>
            <h2 style={{ margin: 0, fontSize: 36, fontWeight: 800, color: C.s, letterSpacing: -1 }}>3 raisons d'adopter cette fonctionnalité</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 28 }}>
            {BENEFITS.map((b, i) => (
              <div key={i} style={{ padding: 32, borderRadius: 20, background: '#f8fafc', border: '1px solid #f1f5f9', transition: 'all .2s' }}
                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 20px 60px ${C.p}15`; }}
                onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{b.icon}</div>
                <h3 style={{ margin: '0 0 10px', fontSize: 20, fontWeight: 700, color: C.s }}>{b.title}</h3>
                <p style={{ margin: 0, fontSize: 15, color: C.m, lineHeight: 1.7 }}>{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Quote */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', padding: '64px 48px' }}>
        <div style={{ maxWidth: 700, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16, opacity: 0.4, color: C.p }}>"</div>
          <p style={{ margin: '0 0 24px', fontSize: 22, color: '#fff', lineHeight: 1.6, fontStyle: 'italic' }}>
            Avant, on recevait des leads par email, WhatsApp, téléphone... Maintenant tout arrive au même endroit, proprement tracé.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Responsable Partenariats, Fintech</p>
        </div>
      </section>

      {/* CTA Final */}
      <section style={{ background: '#f8fafc', padding: '80px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 36, fontWeight: 800, color: C.s, letterSpacing: -1 }}>
            Prêt à tester ?
          </h2>
          <p style={{ margin: '0 0 36px', fontSize: 18, color: C.m, lineHeight: 1.6 }}>
            14 jours gratuits, sans carte bancaire. Configurez votre programme en 5 minutes.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={() => navigate('/signup')} style={{ padding: '16px 36px', borderRadius: 14, border: 'none', background: g, color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: `0 8px 30px ${C.p}30` }}>
              Créer mon compte gratuit →
            </button>
          </div>
          <p style={{ marginTop: 16, fontSize: 13, color: '#94a3b8' }}>✓ Sans engagement · ✓ 14 jours gratuits · ✓ Support inclus</p>
          <div style={{ marginTop: 24, display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href="/fonctionnalites/pipeline" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🔄 Pipeline de leads</a>
            <a href="/fonctionnalites/commissions" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>💰 Commissions automatiques</a>
            <a href="/fonctionnalites/analytics" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>📊 Analytics & KPIs</a>
            <a href="/fonctionnalites/personnalisation" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🎨 Votre marque, votre plateforme</a>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
