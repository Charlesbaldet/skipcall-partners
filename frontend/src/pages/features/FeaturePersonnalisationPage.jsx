import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';

const C = { p: '#0ea5e9', s: '#0f172a', m: '#64748b' };
const g = `linear-gradient(135deg, #0ea5e9, #0ea5e9cc)`;

const MOCKUP = "<svg viewBox=\"0 0 600 340\" xmlns=\"http://www.w3.org/2000/svg\" style=\"width:100%;border-radius:12px;\">\n  <rect width=\"600\" height=\"340\" fill=\"#f8fafc\" rx=\"12\"/>\n  <!-- Left panel - editor -->\n  <rect x=\"0\" y=\"0\" width=\"220\" height=\"340\" fill=\"#0f172a\" rx=\"12\"/>\n  <rect x=\"220\" y=\"0\" width=\"380\" height=\"340\" fill=\"#f8fafc\"/>\n  <rect x=\"0\" y=\"0\" width=\"220\" height=\"340\" fill=\"#1e293b\" rx=\"12\"/>\n  <rect x=\"0\" y=\"20\" width=\"220\" height=\"320\" fill=\"#1e293b\"/>\n  <text x=\"16\" y=\"30\" font-family=\"system-ui\" font-size=\"11\" font-weight=\"700\" fill=\"#94a3b8\">PERSONNALISATION</text>\n  <!-- Color pickers -->\n  <text x=\"16\" y=\"56\" font-family=\"system-ui\" font-size=\"10\" fill=\"#64748b\">Couleur principale</text>\n  <rect x=\"16\" y=\"62\" width=\"185\" height=\"28\" fill=\"#0f172a\" rx=\"6\"/>\n  <rect x=\"22\" y=\"67\" width=\"18\" height=\"18\" fill=\"#0ea5e9\" rx=\"4\"/>\n  <text x=\"46\" y=\"80\" font-family=\"system-ui\" font-size=\"9\" fill=\"#94a3b8\">#0ea5e9</text>\n  <text x=\"16\" y=\"106\" font-family=\"system-ui\" font-size=\"10\" fill=\"#64748b\">Logo</text>\n  <rect x=\"16\" y=\"112\" width=\"185\" height=\"40\" fill=\"#0f172a\" rx=\"6\" stroke=\"#334155\" stroke-width=\"1\" stroke-dasharray=\"4\"/>\n  <text x=\"108\" y=\"136\" font-family=\"system-ui\" font-size=\"9\" fill=\"#64748b\" text-anchor=\"middle\">Glisser ou parcourir</text>\n  <text x=\"16\" y=\"170\" font-family=\"system-ui\" font-size=\"10\" fill=\"#64748b\">Domaine</text>\n  <rect x=\"16\" y=\"176\" width=\"185\" height=\"28\" fill=\"#0f172a\" rx=\"6\"/>\n  <text x=\"26\" y=\"194\" font-family=\"system-ui\" font-size=\"9\" fill=\"#94a3b8\">partners.votreentreprise.com</text>\n  <!-- Preview pane -->\n  <rect x=\"232\" y=\"16\" width=\"348\" height=\"308\" fill=\"#fff\" rx=\"10\" filter=\"url(#sh)\"/>\n  <defs><filter id=\"sh\"><feDropShadow dx=\"0\" dy=\"2\" stdDeviation=\"8\" flood-opacity=\"0.08\"/></filter></defs>\n  <rect x=\"232\" y=\"16\" width=\"348\" height=\"44\" fill=\"#0ea5e9\" rx=\"10\"/>\n  <rect x=\"232\" y=\"44\" width=\"348\" height=\"16\" fill=\"#0ea5e9\"/>\n  <circle cx=\"260\" cy=\"38\" r=\"14\" fill=\"rgba(255,255,255,0.15)\"/>\n  <text x=\"260\" y=\"43\" font-family=\"system-ui\" font-size=\"12\" fill=\"white\" text-anchor=\"middle\" font-weight=\"700\">M</text>\n  <text x=\"285\" y=\"43\" font-family=\"system-ui\" font-size=\"13\" fill=\"white\" font-weight=\"700\">MonEntreprise</text>\n  <text x=\"244\" y=\"82\" font-family=\"system-ui\" font-size=\"9\" fill=\"#64748b\">Tableau de bord</text>\n  <text x=\"244\" y=\"98\" font-family=\"system-ui\" font-size=\"18\" font-weight=\"800\" fill=\"#0f172a\">Bonjour, Jean !</text>\n  \n  <rect x=\"244\" y=\"112\" width=\"108\" height=\"52\" fill=\"#f8fafc\" rx=\"8\"/>\n  <text x=\"254\" y=\"130\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Mes leads</text>\n  <text x=\"254\" y=\"152\" font-family=\"system-ui\" font-size=\"16\" font-weight=\"800\" fill=\"#0ea5e9\">12</text>\n  \n  <rect x=\"360\" y=\"112\" width=\"108\" height=\"52\" fill=\"#f8fafc\" rx=\"8\"/>\n  <text x=\"370\" y=\"130\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Commissions</text>\n  <text x=\"370\" y=\"152\" font-family=\"system-ui\" font-size=\"16\" font-weight=\"800\" fill=\"#0ea5e9\">3 400 €</text>\n  \n  <rect x=\"476\" y=\"112\" width=\"108\" height=\"52\" fill=\"#f8fafc\" rx=\"8\"/>\n  <text x=\"486\" y=\"130\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Taux conv.</text>\n  <text x=\"486\" y=\"152\" font-family=\"system-ui\" font-size=\"16\" font-weight=\"800\" fill=\"#0ea5e9\">34%</text>\n  \n</svg>";

const BENEFITS = [{"icon":"🏷️","title":"White-label complet","text":"Votre logo, vos couleurs, votre domaine. Les emails envoyés à vos partenaires viennent de votre adresse, avec votre identité."},{"icon":"🌐","title":"Domaine personnalisé","text":"partners.votreentreprise.com plutôt que refboost.io. Un détail qui change la perception de votre programme."},{"icon":"🎨","title":"Thème sur mesure","text":"Couleur principale, couleur d'accentuation, logo en haute définition. L'interface s'adapte à votre charte graphique en temps réel."}];

export default function FeaturePersonnalisationPage() {
  const navigate = useNavigate();
  return (
    <LandingLayout>
      <Helmet>
        <title>Votre marque, votre plateforme — RefBoost</title>
        <meta name="description" content="Logo, couleurs, domaine personnalisé — en 5 minutes, RefBoost devient votre plateforme partenaires maison. Vos apporteurs ne voient jamais la marque RefBoo" />
        <link rel="canonical" href="https://refboost.io/fonctionnalites/personnalisation" />
      </Helmet>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '80px 48px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 50, background: `${C.p}20`, border: `1px solid ${C.p}40`, fontSize: 13, fontWeight: 700, color: C.p, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
          🎨 Fonctionnalité
        </div>
        <h1 style={{ margin: '0 0 20px', fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -2 }}>
          Votre marque, votre plateforme
        </h1>
        <p style={{ margin: '0 auto 36px', fontSize: 20, color: '#94a3b8', maxWidth: 600, lineHeight: 1.6 }}>
          Vos partenaires travaillent dans votre univers, pas dans le nôtre
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
            Aperçu de l'interface RefBoost — Votre marque, votre plateforme
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
            Nos apporteurs pensent qu'on a une plateforme développée en interne. C'est exactement l'image qu'on voulait donner.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Marketing Director, PME industrielle</p>
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
            <a href="/fonctionnalites/tracking" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🔗 Liens de tracking uniques</a>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
