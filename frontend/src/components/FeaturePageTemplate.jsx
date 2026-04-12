import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import LandingLayout from '../../components/LandingLayout';

const FEATURE_LINKS = [
  { href: '/fonctionnalites/pipeline', label: 'Pipeline de referrals' },
  { href: '/fonctionnalites/commissions', label: 'Commissions automatiques' },
  { href: '/fonctionnalites/analytics', label: 'Analytics & KPIs' },
  { href: '/fonctionnalites/personnalisation', label: 'Marque blanche' },
  { href: '/fonctionnalites/tracking', label: 'Liens de tracking' },
];

export default function FeaturePageTemplate({
  helmet,        // { title, description, canonical }
  accentColor,   // ex: '#059669'
  label,         // ex: 'Fonctionnalité'
  title,         // ex: 'Pipeline de referrals'
  subtitle,      // ex: 'De la recommandation au closing...'
  mockupSvg,     // string: SVG HTML complet
  benefits,      // [{ title, text, points: [] }]
  quote,         // { text, author }
  currentHref,   // ex: '/fonctionnalites/pipeline'
}) {
  const navigate = useNavigate();
  const g = `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`;

  return (
    <LandingLayout>
      <Helmet>
        <title>{helmet.title}</title>
        <meta name="description" content={helmet.description} />
        <link rel="canonical" href={helmet.canonical} />
      </Helmet>

      {/* ── Hero split ── */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '80px 48px 0', overflow: 'hidden' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 64, alignItems: 'flex-end' }}>
          <div style={{ paddingBottom: 80 }}>
            <span style={{ display: 'inline-block', padding: '4px 14px', borderRadius: 20, background: `${accentColor}20`, border: `1px solid ${accentColor}40`, fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 24 }}>
              {label}
            </span>
            <h1 style={{ margin: '0 0 20px', fontSize: 44, fontWeight: 900, color: '#fff', lineHeight: 1.1, letterSpacing: -2 }}>
              {title}
            </h1>
            <p style={{ margin: '0 0 40px', fontSize: 19, color: '#94a3b8', lineHeight: 1.65 }}>
              {subtitle}
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <button onClick={() => navigate('/signup')} style={{ padding: '14px 30px', borderRadius: 12, border: 'none', background: g, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', boxShadow: `0 8px 30px ${accentColor}40` }}>
                Essayer gratuitement
              </button>
              <button onClick={() => navigate('/login')} style={{ padding: '14px 30px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.18)', background: 'transparent', color: '#fff', fontWeight: 600, fontSize: 15, cursor: 'pointer' }}>
                Se connecter
              </button>
            </div>
          </div>
          <div style={{ position: 'relative', alignSelf: 'flex-end' }}>
            <div style={{ borderRadius: '16px 16px 0 0', overflow: 'hidden', boxShadow: '0 -20px 60px rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.08)', borderBottom: 'none' }}
              dangerouslySetInnerHTML={{ __html: mockupSvg }} />
          </div>
        </div>
      </section>

      {/* ── Chiffres clés ── */}
      <section style={{ background: '#f8fafc', padding: '56px 48px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
          {benefits.slice(0, 3).map((b, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 36, fontWeight: 900, color: accentColor, letterSpacing: -2, marginBottom: 6 }}>{b.stat}</div>
              <div style={{ fontSize: 14, color: '#64748b', lineHeight: 1.5 }}>{b.statLabel}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Benefits alternés ── */}
      <section style={{ background: '#fff', padding: '80px 48px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 72 }}>
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: 2 }}>Fonctionnalités détaillées</p>
            <h2 style={{ margin: 0, fontSize: 36, fontWeight: 800, color: '#0f172a', letterSpacing: -1 }}>Ce que vous obtenez concrètement</h2>
          </div>
          {benefits.map((b, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: i % 2 === 0 ? '1fr 1fr' : '1fr 1fr', gap: 80, alignItems: 'center', marginBottom: i < benefits.length - 1 ? 96 : 0 }}>
              {/* Texte côté gauche pour 0,2,4 — droite pour 1,3 */}
              <div style={{ order: i % 2 === 0 ? 0 : 1 }}>
                <div style={{ width: 40, height: 4, background: g, borderRadius: 2, marginBottom: 20 }} />
                <h3 style={{ margin: '0 0 16px', fontSize: 26, fontWeight: 800, color: '#0f172a', lineHeight: 1.3 }}>{b.title}</h3>
                <p style={{ margin: '0 0 24px', fontSize: 16, color: '#64748b', lineHeight: 1.75 }}>{b.text}</p>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {b.points.map((pt, j) => (
                    <li key={j} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, fontSize: 15, color: '#334155' }}>
                      <span style={{ width: 20, height: 20, borderRadius: '50%', background: `${accentColor}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 2 }}>
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              {/* Illustration côté droit ou gauche */}
              <div style={{ order: i % 2 === 0 ? 1 : 0, borderRadius: 20, overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,0.08)', border: '1px solid #e2e8f0' }}
                dangerouslySetInnerHTML={{ __html: b.illustration }} />
            </div>
          ))}
        </div>
      </section>

      {/* ── Quote ── */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a, #1e293b)', padding: '80px 48px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          <svg width="40" height="32" viewBox="0 0 40 32" style={{ opacity: 0.3, marginBottom: 24 }}>
            <path d="M0 32V20C0 8.667 4 2.333 12 0l2 4C9.333 5.333 8 8 8 12h8v20H0zm20 0V20c0-11.333 4-17.667 12-20l2 4c-4.667 1.333-6 4-6 8h8v20H20z" fill={accentColor}/>
          </svg>
          <p style={{ margin: '0 0 28px', fontSize: 22, color: '#fff', lineHeight: 1.65, fontStyle: 'italic', fontWeight: 300 }}>
            {quote.text}
          </p>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', fontWeight: 600, letterSpacing: 0.5 }}>{quote.author}</p>
        </div>
      </section>

      {/* ── CTA Final ── */}
      <section style={{ background: '#f8fafc', padding: '80px 48px', textAlign: 'center' }}>
        <div style={{ maxWidth: 560, margin: '0 auto' }}>
          <h2 style={{ margin: '0 0 16px', fontSize: 36, fontWeight: 800, color: '#0f172a', letterSpacing: -1 }}>
            Prêt à tester ?
          </h2>
          <p style={{ margin: '0 0 36px', fontSize: 18, color: '#64748b', lineHeight: 1.6 }}>
            14 jours gratuits, sans carte bancaire. Configurez votre programme en 5 minutes.
          </p>
          <button onClick={() => navigate('/signup')} style={{ padding: '16px 36px', borderRadius: 14, border: 'none', background: g, color: '#fff', fontWeight: 700, fontSize: 18, cursor: 'pointer', boxShadow: `0 8px 30px ${accentColor}30` }}>
            Créer mon espace gratuitement
          </button>
          <p style={{ marginTop: 16, fontSize: 13, color: '#94a3b8' }}>Sans engagement · 14 jours gratuits · Support inclus</p>
        </div>
        <div style={{ maxWidth: 900, margin: '48px auto 0', display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {FEATURE_LINKS.filter(l => l.href !== currentHref).map(l => (
            <a key={l.href} href={l.href} style={{ fontSize: 14, color: accentColor, textDecoration: 'none', fontWeight: 600, padding: '8px 16px', borderRadius: 8, border: `1px solid ${accentColor}30`, background: `${accentColor}08`, transition: 'all 0.15s' }}>
              {l.label}
            </a>
          ))}
        </div>
      </section>
    </LandingLayout>
  );
}
