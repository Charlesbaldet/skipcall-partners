import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';

const C = { p: '#059669', s: '#0f172a', m: '#64748b' };
const g = `linear-gradient(135deg, #059669, #059669cc)`;

const MOCKUP = "<svg viewBox=\"0 0 600 340\" xmlns=\"http://www.w3.org/2000/svg\" style=\"width:100%;border-radius:12px;\">\n  <rect width=\"600\" height=\"340\" fill=\"#0f172a\" rx=\"12\"/>\n  <!-- Header bar -->\n  <rect x=\"0\" y=\"0\" width=\"600\" height=\"44\" fill=\"#1e293b\" rx=\"12\"/>\n  <rect x=\"0\" y=\"32\" width=\"600\" height=\"12\" fill=\"#1e293b\"/>\n  <circle cx=\"20\" cy=\"22\" r=\"7\" fill=\"#ef4444\"/>\n  <circle cx=\"40\" cy=\"22\" r=\"7\" fill=\"#f59e0b\"/>\n  <circle cx=\"60\" cy=\"22\" r=\"7\" fill=\"#22c55e\"/>\n  <text x=\"200\" y=\"27\" font-family=\"system-ui\" font-size=\"12\" fill=\"#94a3b8\" text-anchor=\"middle\">Pipeline de leads — RefBoost</text>\n  <!-- Columns -->\n  \n    <rect x=\"12\" y=\"54\" width=\"136\" height=\"276\" fill=\"#1e293b\" rx=\"8\"/>\n    <rect x=\"12\" y=\"54\" width=\"136\" height=\"28\" fill=\"#3b82f622\" rx=\"8\"/>\n    <rect x=\"12\" y=\"74\" width=\"136\" height=\"8\" fill=\"#3b82f622\"/>\n    <text x=\"22\" y=\"72\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#3b82f6\">Nouveaux</text>\n    <rect x=\"20\" y=\"88\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"20\" y=\"88\" width=\"4\" height=\"52\" fill=\"#3b82f6\" rx=\"2\"/>\n    <text x=\"30\" y=\"103\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Acme Corp</text>\n    <text x=\"30\" y=\"117\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">12 000 € · J. Dupont</text>\n    <rect x=\"30\" y=\"124\" width=\"40\" height=\"10\" fill=\"#3b82f633\" rx=\"3\"/>\n    <text x=\"35\" y=\"132\" font-family=\"system-ui\" font-size=\"7\" fill=\"#3b82f6\">Nouveaux</text>\n    <rect x=\"20\" y=\"148\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"20\" y=\"148\" width=\"4\" height=\"52\" fill=\"#3b82f6\" rx=\"2\"/>\n    <text x=\"30\" y=\"163\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Tech Solutions</text>\n    <text x=\"30\" y=\"177\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">8 500 € · M. Martin</text>\n    \n    \n    <rect x=\"158\" y=\"54\" width=\"136\" height=\"276\" fill=\"#1e293b\" rx=\"8\"/>\n    <rect x=\"158\" y=\"54\" width=\"136\" height=\"28\" fill=\"#f59e0b22\" rx=\"8\"/>\n    <rect x=\"158\" y=\"74\" width=\"136\" height=\"8\" fill=\"#f59e0b22\"/>\n    <text x=\"168\" y=\"72\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#f59e0b\">En cours</text>\n    <rect x=\"166\" y=\"88\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"166\" y=\"88\" width=\"4\" height=\"52\" fill=\"#f59e0b\" rx=\"2\"/>\n    <text x=\"176\" y=\"103\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Acme Corp</text>\n    <text x=\"176\" y=\"117\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">12 000 € · J. Dupont</text>\n    <rect x=\"176\" y=\"124\" width=\"40\" height=\"10\" fill=\"#f59e0b33\" rx=\"3\"/>\n    <text x=\"181\" y=\"132\" font-family=\"system-ui\" font-size=\"7\" fill=\"#f59e0b\">En cours</text>\n    <rect x=\"166\" y=\"148\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"166\" y=\"148\" width=\"4\" height=\"52\" fill=\"#f59e0b\" rx=\"2\"/>\n    <text x=\"176\" y=\"163\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Tech Solutions</text>\n    <text x=\"176\" y=\"177\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">8 500 € · M. Martin</text>\n    \n    \n    <rect x=\"304\" y=\"54\" width=\"136\" height=\"276\" fill=\"#1e293b\" rx=\"8\"/>\n    <rect x=\"304\" y=\"54\" width=\"136\" height=\"28\" fill=\"#8b5cf622\" rx=\"8\"/>\n    <rect x=\"304\" y=\"74\" width=\"136\" height=\"8\" fill=\"#8b5cf622\"/>\n    <text x=\"314\" y=\"72\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#8b5cf6\">Qualifiés</text>\n    <rect x=\"312\" y=\"88\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"312\" y=\"88\" width=\"4\" height=\"52\" fill=\"#8b5cf6\" rx=\"2\"/>\n    <text x=\"322\" y=\"103\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Acme Corp</text>\n    <text x=\"322\" y=\"117\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">12 000 € · J. Dupont</text>\n    <rect x=\"322\" y=\"124\" width=\"40\" height=\"10\" fill=\"#8b5cf633\" rx=\"3\"/>\n    <text x=\"327\" y=\"132\" font-family=\"system-ui\" font-size=\"7\" fill=\"#8b5cf6\">Qualifiés</text>\n    <rect x=\"312\" y=\"148\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"312\" y=\"148\" width=\"4\" height=\"52\" fill=\"#8b5cf6\" rx=\"2\"/>\n    <text x=\"322\" y=\"163\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Tech Solutions</text>\n    <text x=\"322\" y=\"177\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">8 500 € · M. Martin</text>\n    \n    \n    <rect x=\"450\" y=\"54\" width=\"136\" height=\"276\" fill=\"#1e293b\" rx=\"8\"/>\n    <rect x=\"450\" y=\"54\" width=\"136\" height=\"28\" fill=\"#22c55e22\" rx=\"8\"/>\n    <rect x=\"450\" y=\"74\" width=\"136\" height=\"8\" fill=\"#22c55e22\"/>\n    <text x=\"460\" y=\"72\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#22c55e\">Gagnés</text>\n    <rect x=\"458\" y=\"88\" width=\"120\" height=\"52\" fill=\"#0f172a\" rx=\"6\"/>\n    <rect x=\"458\" y=\"88\" width=\"4\" height=\"52\" fill=\"#22c55e\" rx=\"2\"/>\n    <text x=\"468\" y=\"103\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">Acme Corp</text>\n    <text x=\"468\" y=\"117\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">12 000 € · J. Dupont</text>\n    <rect x=\"468\" y=\"124\" width=\"40\" height=\"10\" fill=\"#22c55e33\" rx=\"3\"/>\n    <text x=\"473\" y=\"132\" font-family=\"system-ui\" font-size=\"7\" fill=\"#22c55e\">Gagnés</text>\n    \n    <text x=\"478\" y=\"180\" font-family=\"system-ui\" font-size=\"22\" fill=\"#22c55e\">✓</text>\n    <text x=\"468\" y=\"200\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">24 500 € ce mois</text>\n    \n</svg>";

const BENEFITS = [{"icon":"📋","title":"Vue Kanban en temps réel","text":"Glissez les leads d'une colonne à l'autre. Vos apporteurs voient l'avancement en direct, sans relance de votre part."},{"icon":"🔔","title":"Notifications automatiques","text":"Chaque changement de statut déclenche une notification à l'apporteur. Il sait toujours où en est son lead."},{"icon":"📁","title":"Historique complet","text":"Chaque interaction, commentaire et date est tracé. Retrouvez n'importe quelle information en 2 clics."}];

export default function FeaturePipelinePage() {
  const navigate = useNavigate();
  return (
    <LandingLayout>
      <Helmet>
        <title>Pipeline de leads — RefBoost</title>
        <meta name="description" content="Fini les tableurs qui traînent. Suivez en temps réel où en est chaque lead soumis par vos apporteurs, de la première prise de contact jusqu'au deal signé." />
        <link rel="canonical" href="https://refboost.io/fonctionnalites/pipeline" />
      </Helmet>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '80px 48px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 50, background: `${C.p}20`, border: `1px solid ${C.p}40`, fontSize: 13, fontWeight: 700, color: C.p, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
          🔄 Fonctionnalité
        </div>
        <h1 style={{ margin: '0 0 20px', fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -2 }}>
          Pipeline de leads
        </h1>
        <p style={{ margin: '0 auto 36px', fontSize: 20, color: '#94a3b8', maxWidth: 600, lineHeight: 1.6 }}>
          Visualisez chaque recommandation du premier contact au closing
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
            Aperçu de l'interface RefBoost — Pipeline de leads
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
            On a divisé par 3 le temps passé à répondre aux questions de nos apporteurs sur l'état de leurs leads.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600 }}>Directeur Commercial, SaaS B2B</p>
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
            <a href="/fonctionnalites/commissions" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>💰 Commissions automatiques</a>
            <a href="/fonctionnalites/analytics" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>📊 Analytics & KPIs</a>
            <a href="/fonctionnalites/personnalisation" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🎨 Votre marque, votre plateforme</a>
            <a href="/fonctionnalites/tracking" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🔗 Liens de tracking uniques</a>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
