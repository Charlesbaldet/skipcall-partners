import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';

const C = { p: '#8b5cf6', s: '#0f172a', m: '#64748b' };
const g = `linear-gradient(135deg, #8b5cf6, #8b5cf6cc)`;

const MOCKUP = "<svg viewBox=\"0 0 600 340\" xmlns=\"http://www.w3.org/2000/svg\" style=\"width:100%;border-radius:12px;\">\n  <rect width=\"600\" height=\"340\" fill=\"#0f172a\" rx=\"12\"/>\n  <rect x=\"0\" y=\"0\" width=\"600\" height=\"44\" fill=\"#1e293b\" rx=\"12\"/>\n  <rect x=\"0\" y=\"32\" width=\"600\" height=\"12\" fill=\"#1e293b\"/>\n  <circle cx=\"20\" cy=\"22\" r=\"7\" fill=\"#ef4444\"/>\n  <circle cx=\"40\" cy=\"22\" r=\"7\" fill=\"#f59e0b\"/>\n  <circle cx=\"60\" cy=\"22\" r=\"7\" fill=\"#22c55e\"/>\n  <text x=\"200\" y=\"27\" font-family=\"system-ui\" font-size=\"12\" fill=\"#94a3b8\" text-anchor=\"middle\">Analytics — Programme Partenaires</text>\n  <!-- KPI row -->\n  \n  <rect x=\"12\" y=\"56\" width=\"135\" height=\"60\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"22\" y=\"74\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Leads ce mois</text>\n  <text x=\"22\" y=\"97\" font-family=\"system-ui\" font-size=\"18\" font-weight=\"800\" fill=\"#fff\">47</text>\n  <text x=\"22\" y=\"110\" font-family=\"system-ui\" font-size=\"9\" fill=\"#8b5cf6\">+18%</text>\n  \n  <rect x=\"159\" y=\"56\" width=\"135\" height=\"60\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"169\" y=\"74\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">Taux conversion</text>\n  <text x=\"169\" y=\"97\" font-family=\"system-ui\" font-size=\"18\" font-weight=\"800\" fill=\"#fff\">34%</text>\n  <text x=\"169\" y=\"110\" font-family=\"system-ui\" font-size=\"9\" fill=\"#059669\">+5pts</text>\n  \n  <rect x=\"306\" y=\"56\" width=\"135\" height=\"60\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"316\" y=\"74\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">MRR généré</text>\n  <text x=\"316\" y=\"97\" font-family=\"system-ui\" font-size=\"18\" font-weight=\"800\" fill=\"#fff\">28 400 €</text>\n  <text x=\"316\" y=\"110\" font-family=\"system-ui\" font-size=\"9\" fill=\"#f59e0b\">+22%</text>\n  \n  <rect x=\"453\" y=\"56\" width=\"135\" height=\"60\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"463\" y=\"74\" font-family=\"system-ui\" font-size=\"8\" fill=\"#64748b\">CAC partenaires</text>\n  <text x=\"463\" y=\"97\" font-family=\"system-ui\" font-size=\"18\" font-weight=\"800\" fill=\"#fff\">340 €</text>\n  <text x=\"463\" y=\"110\" font-family=\"system-ui\" font-size=\"9\" fill=\"#22c55e\">-12%</text>\n  \n  <!-- Chart -->\n  <rect x=\"12\" y=\"126\" width=\"370\" height=\"200\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"24\" y=\"148\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#e2e8f0\">Évolution du MRR</text>\n  \n  <rect x=\"32\" y=\"250\" width=\"20\" height=\"40\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.4\"/>\n  \n  <rect x=\"60\" y=\"235\" width=\"20\" height=\"55\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.45\"/>\n  \n  <rect x=\"88\" y=\"255\" width=\"20\" height=\"35\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.5\"/>\n  \n  <rect x=\"116\" y=\"220\" width=\"20\" height=\"70\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.55\"/>\n  \n  <rect x=\"144\" y=\"205\" width=\"20\" height=\"85\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.6000000000000001\"/>\n  \n  <rect x=\"172\" y=\"200\" width=\"20\" height=\"90\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.65\"/>\n  \n  <rect x=\"200\" y=\"180\" width=\"20\" height=\"110\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.7000000000000001\"/>\n  \n  <rect x=\"228\" y=\"190\" width=\"20\" height=\"100\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.75\"/>\n  \n  <rect x=\"256\" y=\"160\" width=\"20\" height=\"130\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.8\"/>\n  \n  <rect x=\"284\" y=\"170\" width=\"20\" height=\"120\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.8500000000000001\"/>\n  \n  <rect x=\"312\" y=\"140\" width=\"20\" height=\"150\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.9\"/>\n  \n  <rect x=\"340\" y=\"130\" width=\"20\" height=\"160\" fill=\"#8b5cf6\" rx=\"3\" opacity=\"0.9500000000000001\"/>\n  \n  <polyline points=\"42,250 70,235 98,255 126,220 154,205 182,200 210,180 238,190 266,160 294,170 322,140 350,130\" fill=\"none\" stroke=\"#8b5cf6\" stroke-width=\"2\"/>\n  <!-- Top apporteurs -->\n  <rect x=\"392\" y=\"126\" width=\"196\" height=\"200\" fill=\"#1e293b\" rx=\"8\"/>\n  <text x=\"404\" y=\"148\" font-family=\"system-ui\" font-size=\"10\" font-weight=\"700\" fill=\"#e2e8f0\">Top Apporteurs</text>\n  \n  <text x=\"404\" y=\"172\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">J. Dupont</text>\n  <text x=\"540\" y=\"172\" font-family=\"system-ui\" font-size=\"9\" fill=\"#059669\">12 leads</text>\n  <rect x=\"404\" y=\"178\" width=\"176\" height=\"6\" fill=\"#0f172a\" rx=\"3\"/>\n  <rect x=\"404\" y=\"178\" width=\"149.6\" height=\"6\" fill=\"#059669\" rx=\"3\"/>\n  \n  <text x=\"404\" y=\"208\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">M. Martin</text>\n  <text x=\"540\" y=\"208\" font-family=\"system-ui\" font-size=\"9\" fill=\"#8b5cf6\">9 leads</text>\n  <rect x=\"404\" y=\"214\" width=\"176\" height=\"6\" fill=\"#0f172a\" rx=\"3\"/>\n  <rect x=\"404\" y=\"214\" width=\"114.4\" height=\"6\" fill=\"#8b5cf6\" rx=\"3\"/>\n  \n  <text x=\"404\" y=\"244\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">S. Bernard</text>\n  <text x=\"540\" y=\"244\" font-family=\"system-ui\" font-size=\"9\" fill=\"#f59e0b\">7 leads</text>\n  <rect x=\"404\" y=\"250\" width=\"176\" height=\"6\" fill=\"#0f172a\" rx=\"3\"/>\n  <rect x=\"404\" y=\"250\" width=\"88\" height=\"6\" fill=\"#f59e0b\" rx=\"3\"/>\n  \n  <text x=\"404\" y=\"280\" font-family=\"system-ui\" font-size=\"9\" fill=\"#e2e8f0\">A. Leroy</text>\n  <text x=\"540\" y=\"280\" font-family=\"system-ui\" font-size=\"9\" fill=\"#3b82f6\">5 leads</text>\n  <rect x=\"404\" y=\"286\" width=\"176\" height=\"6\" fill=\"#0f172a\" rx=\"3\"/>\n  <rect x=\"404\" y=\"286\" width=\"63.36\" height=\"6\" fill=\"#3b82f6\" rx=\"3\"/>\n  \n</svg>";

const BENEFITS = [{"icon":"📈","title":"Performance par apporteur","text":"Identifiez vos 20% d'apporteurs qui génèrent 80% de votre pipeline. Concentrez vos efforts là où ça rapporte."},{"icon":"💹","title":"MRR et CA générés","text":"Suivez le chiffre d'affaires généré par le canal partenaires. Comparez-le à vos autres canaux et calculez votre ROI réel."},{"icon":"🎯","title":"Taux de conversion","text":"Du lead soumis au deal signé : mesurez chaque étape, identifiez les goulots d'étranglement, optimisez votre processus."}];

export default function FeatureAnalyticsPage() {
  const navigate = useNavigate();
  return (
    <LandingLayout>
      <Helmet>
        <title>Analytics & KPIs — RefBoost</title>
        <meta name="description" content="Taux de conversion, MRR généré, performance par apporteur, cycle de vente moyen — toutes les métriques qui comptent dans un tableau de bord actionnable." />
        <link rel="canonical" href="https://refboost.io/fonctionnalites/analytics" />
      </Helmet>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '80px 48px 64px', textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px', borderRadius: 50, background: `${C.p}20`, border: `1px solid ${C.p}40`, fontSize: 13, fontWeight: 700, color: C.p, marginBottom: 20, textTransform: 'uppercase', letterSpacing: 1 }}>
          📊 Fonctionnalité
        </div>
        <h1 style={{ margin: '0 0 20px', fontSize: 48, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -2 }}>
          Analytics & KPIs
        </h1>
        <p style={{ margin: '0 auto 36px', fontSize: 20, color: '#94a3b8', maxWidth: 600, lineHeight: 1.6 }}>
          Pilotez votre programme partenaires avec des données réelles
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
            Aperçu de l'interface RefBoost — Analytics & KPIs
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
            Pour la première fois, on a pu montrer à notre board le ROI exact du programme partenaires.
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600 }}>CEO, Series A</p>
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
            <a href="/fonctionnalites/personnalisation" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🎨 Votre marque, votre plateforme</a>
            <a href="/fonctionnalites/tracking" style={{ fontSize: 14, color: C.p, textDecoration: 'none', fontWeight: 600 }}>🔗 Liens de tracking uniques</a>
          </div>
        </div>
      </section>
    </LandingLayout>
  );
}
