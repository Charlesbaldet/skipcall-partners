import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const COLORS = {
  primary: '#059669',      // Emerald green
  primaryLight: '#10b981',
  primaryDark: '#047857',
  secondary: '#0f172a',    // Deep navy
  accent: '#f97316',       // Warm orange
  accentLight: '#fb923c',
  surface: '#ffffff',
  muted: '#64748b',
  bg: '#fafbfc',
};

// ─── SVG Logo Component ───
function Logo({ size = 40, white = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor={COLORS.primary} />
            <stop offset="100%" stopColor={COLORS.primaryLight} />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#logoGrad)" />
        <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white" />
        <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={COLORS.accent} opacity="0.9" />
        <path d="M35 14l-1 4 3-1z" fill={COLORS.accentLight} opacity="0.7" />
      </svg>
      <span style={{
        fontSize: size * 0.55, fontWeight: 800, letterSpacing: -1,
        color: white ? '#fff' : COLORS.secondary,
        fontFamily: "'Outfit', 'SF Pro Display', sans-serif",
      }}>
        Ref<span style={{ color: COLORS.primary }}>Boost</span>
      </span>
    </div>
  );
}

// ─── Animated Counter ───
function Counter({ target, suffix = '' }) {
  return <span>{target}{suffix}</span>;
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  const features = [
    { icon: '🚀', title: 'Pipeline intelligent', desc: 'Suivez chaque referral du premier contact au closing. Kanban, filtres, statuts — tout en temps réel.' },
    { icon: '💰', title: 'Commissions automatiques', desc: "Calcul auto des primes, validation en un clic, historique complet. Vos partenaires sont payés plus vite." },
    { icon: '📊', title: 'Analytics avancés', desc: 'Dashboard avec KPIs, taux de conversion, MRR généré, performance par partenaire et par niveau.' },
    { icon: '🏷️', title: 'White-label total', desc: 'Votre logo, vos couleurs, votre domaine. Vos clients ne verront jamais RefBoost — ils verront VOTRE marque.' },
    { icon: '🔒', title: 'Sécurité ISO 27001', desc: 'Chiffrement AES-256, audit logs, brute force protection, RGPD ready. Vos données sont en sécurité.' },
    { icon: '🔗', title: 'Liens de tracking', desc: 'Chaque partenaire a son lien unique. Formulaire public, attribution automatique, zéro friction.' },
  ];

  const testimonials = [
    { name: 'Marie Dupont', role: 'Directrice Commerciale', company: 'TechFlow', text: "On a multiplié par 3 notre canal partenaires en 4 mois. L'outil est intuitif et nos partenaires l'adorent.", avatar: 'M' },
    { name: 'Thomas Chen', role: 'CEO', company: 'ScaleUp Agency', text: "Le white-label nous permet de proposer un programme partenaires à nos clients sous notre marque. Game changer.", avatar: 'T' },
    { name: 'Sophie Martin', role: 'Head of Partnerships', company: 'DataViz Pro', text: "Fini les tableurs Excel pour tracker les commissions. Tout est automatisé, transparent, et nos partenaires sont ravis.", avatar: 'S' },
  ];

  const plans = [
    { name: 'Starter', price: '99', desc: 'Pour démarrer votre programme', features: ['Jusqu\'à 20 partenaires', '100 referrals/mois', 'Dashboard & analytics', 'Liens de tracking', 'Support email'], cta: false },
    { name: 'Growth', price: '249', desc: 'Pour scaler votre programme', features: ['Partenaires illimités', 'Referrals illimités', 'White-label complet', 'API & intégrations', 'Support prioritaire', 'Multi-utilisateurs'], cta: true },
    { name: 'Enterprise', price: 'Sur mesure', desc: 'Pour les grandes organisations', features: ['Tout Growth +', 'Multi-tenant', 'SSO / SAML', 'SLA garanti', 'Account manager dédié', 'Audit & conformité'], cta: false },
  ];

  return (
    <div style={{ fontFamily: "'Outfit', 'DM Sans', -apple-system, sans-serif", color: COLORS.secondary, overflow: 'hidden' }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700;800;900&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet" />

      <style>{`
        @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-12px); } }
        @keyframes fadeUp { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 0.8; } }
        @keyframes slideIn { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        .fade-up { animation: fadeUp 0.7s ease-out forwards; opacity: 0; }
        .fade-up-1 { animation-delay: 0.1s; }
        .fade-up-2 { animation-delay: 0.2s; }
        .fade-up-3 { animation-delay: 0.3s; }
        .fade-up-4 { animation-delay: 0.4s; }
        .hover-lift { transition: transform 0.3s, box-shadow 0.3s; }
        .hover-lift:hover { transform: translateY(-6px); box-shadow: 0 20px 60px rgba(5,150,105,0.15) !important; }
        .btn-primary { transition: all 0.3s; }
        .btn-primary:hover { transform: translateY(-2px); box-shadow: 0 12px 40px rgba(5,150,105,0.35); }
        .btn-secondary:hover { background: ${COLORS.secondary} !important; color: #fff !important; }
      `}</style>

      {/* ═══ NAVBAR ═══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '16px 48px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(0,0,0,0.04)',
      }}>
        <Logo size={36} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 32 }}>
          {['Fonctionnalités', 'Tarifs', 'Témoignages'].map(item => (
            <a key={item} href={`#${item.toLowerCase()}`} style={{ color: COLORS.muted, textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = COLORS.primary} onMouseLeave={e => e.target.style.color = COLORS.muted}>
              {item}
            </a>
          ))}
          <button onClick={() => navigate('/login')} style={{
            padding: '10px 24px', borderRadius: 10, border: `2px solid ${COLORS.secondary}`, background: 'transparent',
            color: COLORS.secondary, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }} className="btn-secondary">
            Connexion
          </button>
          <button onClick={() => navigate('/apply')} className="btn-primary" style={{
            padding: '10px 24px', borderRadius: 10, border: 'none',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
            color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            Démarrer gratuitement
          </button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '140px 48px 80px', position: 'relative',
        background: `radial-gradient(ellipse 80% 60% at 50% -20%, ${COLORS.primary}12, transparent),
                     radial-gradient(ellipse 60% 40% at 80% 80%, ${COLORS.accent}08, transparent),
                     ${COLORS.bg}`,
      }}>
        {/* Decorative elements */}
        <div style={{ position: 'absolute', top: 120, left: 80, width: 300, height: 300, borderRadius: '50%', background: `${COLORS.primary}06`, animation: 'float 6s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', bottom: 100, right: 120, width: 200, height: 200, borderRadius: '50%', background: `${COLORS.accent}08`, animation: 'float 8s ease-in-out infinite 2s' }} />

        <div style={{ maxWidth: 900, textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <div className="fade-up fade-up-1" style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 16px',
            borderRadius: 50, background: `${COLORS.primary}10`, border: `1px solid ${COLORS.primary}20`,
            fontSize: 13, fontWeight: 600, color: COLORS.primary, marginBottom: 28,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: COLORS.primary, animation: 'pulse 2s infinite' }} />
            Nouveau — White-label multi-tenant disponible
          </div>

          <h1 className="fade-up fade-up-2" style={{
            fontSize: 68, fontWeight: 900, lineHeight: 1.05, letterSpacing: -3,
            margin: '0 0 24px', color: COLORS.secondary,
          }}>
            Boostez vos revenus<br />
            <span style={{ background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              grâce aux partenaires
            </span>
          </h1>

          <p className="fade-up fade-up-3" style={{
            fontSize: 20, color: COLORS.muted, lineHeight: 1.6, maxWidth: 600, margin: '0 auto 40px',
            fontFamily: "'DM Sans', sans-serif",
          }}>
            La plateforme SaaS qui transforme votre réseau en machine à referrals.
            Pipeline, commissions, analytics — tout en white-label.
          </p>

          <div className="fade-up fade-up-4" style={{ display: 'flex', gap: 16, justifyContent: 'center', alignItems: 'center' }}>
            <button onClick={() => navigate('/apply')} className="btn-primary" style={{
              padding: '16px 36px', borderRadius: 14, border: 'none',
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
              color: '#fff', fontWeight: 700, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 8px 30px ${COLORS.primary}30`,
            }}>
              Essai gratuit 14 jours →
            </button>
            <button onClick={() => document.getElementById('fonctionnalités')?.scrollIntoView({ behavior: 'smooth' })} className="btn-secondary" style={{
              padding: '16px 36px', borderRadius: 14, border: `2px solid #e2e8f0`,
              background: '#fff', color: COLORS.secondary, fontWeight: 600, fontSize: 17, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              Voir la démo
            </button>
          </div>

          {/* Social proof */}
          <div className="fade-up fade-up-4" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 32, marginTop: 60, color: COLORS.muted, fontSize: 14 }}>
            <div><span style={{ fontSize: 28, fontWeight: 800, color: COLORS.secondary }}>150+</span><br />Partenaires actifs</div>
            <div style={{ width: 1, height: 40, background: '#e2e8f0' }} />
            <div><span style={{ fontSize: 28, fontWeight: 800, color: COLORS.secondary }}>2.4M€</span><br />MRR généré</div>
            <div style={{ width: 1, height: 40, background: '#e2e8f0' }} />
            <div><span style={{ fontSize: 28, fontWeight: 800, color: COLORS.secondary }}>98%</span><br />Satisfaction</div>
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="fonctionnalités" style={{ padding: '100px 48px', background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Fonctionnalités</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: 0 }}>Tout ce qu'il faut pour<br /><span style={{ color: COLORS.primary }}>scaler votre programme</span></h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {features.map((f, i) => (
              <div key={i} className="hover-lift" style={{
                padding: 32, borderRadius: 20, background: '#fff', border: '1px solid #f1f5f9',
                boxShadow: '0 4px 20px rgba(0,0,0,0.03)', cursor: 'default',
              }}>
                <div style={{ fontSize: 36, marginBottom: 16 }}>{f.icon}</div>
                <h3 style={{ fontSize: 19, fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.7, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section style={{ padding: '100px 48px', background: COLORS.secondary }}>
        <div style={{ maxWidth: 900, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primaryLight, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Comment ça marche</div>
          <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: '0 0 64px', color: '#fff' }}>3 étapes pour démarrer</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 40 }}>
            {[
              { step: '01', title: 'Créez votre espace', desc: 'Configurez votre programme en 5 minutes. Logo, couleurs, domaine — tout est personnalisable.' },
              { step: '02', title: 'Invitez vos partenaires', desc: 'Envoyez des invitations par email. Chaque partenaire a son dashboard et son lien de tracking.' },
              { step: '03', title: 'Récoltez les referrals', desc: 'Vos partenaires soumettent des leads. Vous trackez, convertissez, et payez les commissions.' },
            ].map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, margin: '0 auto 20px',
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 22, fontWeight: 800, color: '#fff',
                }}>{s.step}</div>
                <h3 style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{s.title}</h3>
                <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.7, margin: 0, fontFamily: "'DM Sans', sans-serif" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section id="témoignages" style={{ padding: '100px 48px', background: '#fff' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Témoignages</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: 0 }}>Ils nous font confiance</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {testimonials.map((t, i) => (
              <div key={i} className="hover-lift" style={{
                padding: 32, borderRadius: 20, background: '#fafbfc', border: '1px solid #f1f5f9',
              }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {[1,2,3,4,5].map(s => <span key={s} style={{ color: '#fbbf24', fontSize: 18 }}>★</span>)}
                </div>
                <p style={{ color: '#334155', fontSize: 15, lineHeight: 1.7, margin: '0 0 24px', fontFamily: "'DM Sans', sans-serif", fontStyle: 'italic' }}>"{t.text}"</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 12,
                    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: '#fff', fontWeight: 700, fontSize: 18,
                  }}>{t.avatar}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: COLORS.secondary }}>{t.name}</div>
                    <div style={{ fontSize: 12, color: COLORS.muted }}>{t.role} · {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="tarifs" style={{ padding: '100px 48px', background: COLORS.bg }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.primary, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Tarifs</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -2, margin: 0 }}>Simple et transparent</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {plans.map((p, i) => (
              <div key={i} className="hover-lift" style={{
                padding: 36, borderRadius: 24, background: '#fff',
                border: p.cta ? `2px solid ${COLORS.primary}` : '1px solid #f1f5f9',
                boxShadow: p.cta ? `0 20px 60px ${COLORS.primary}15` : '0 4px 20px rgba(0,0,0,0.03)',
                position: 'relative',
              }}>
                {p.cta && <div style={{
                  position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                  background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
                  color: '#fff', fontSize: 11, fontWeight: 700, padding: '4px 16px', borderRadius: 50,
                  textTransform: 'uppercase', letterSpacing: 1,
                }}>Populaire</div>}
                <h3 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>{p.name}</h3>
                <p style={{ color: COLORS.muted, fontSize: 13, margin: '0 0 20px' }}>{p.desc}</p>
                <div style={{ marginBottom: 24 }}>
                  <span style={{ fontSize: 42, fontWeight: 800, color: COLORS.secondary }}>{p.price === 'Sur mesure' ? '' : p.price}</span>
                  {p.price === 'Sur mesure' ? <span style={{ fontSize: 20, fontWeight: 700 }}>Sur mesure</span> : <span style={{ color: COLORS.muted, fontSize: 15 }}>€/mois</span>}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
                  {p.features.map((f, j) => (
                    <li key={j} style={{ padding: '8px 0', fontSize: 14, color: '#334155', display: 'flex', alignItems: 'center', gap: 10, fontFamily: "'DM Sans', sans-serif" }}>
                      <span style={{ color: COLORS.primary, fontWeight: 700 }}>✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button onClick={() => navigate('/apply')} className={p.cta ? 'btn-primary' : 'btn-secondary'} style={{
                  width: '100%', padding: '14px 24px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 15, fontWeight: 600, border: p.cta ? 'none' : `2px solid #e2e8f0`,
                  background: p.cta ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})` : '#fff',
                  color: p.cta ? '#fff' : COLORS.secondary,
                  boxShadow: p.cta ? `0 8px 30px ${COLORS.primary}25` : 'none',
                }}>
                  {p.price === 'Sur mesure' ? 'Nous contacter' : 'Commencer'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{
        padding: '100px 48px',
        background: `linear-gradient(135deg, ${COLORS.secondary} 0%, #1e293b 100%)`,
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -100, right: -100, width: 400, height: 400, borderRadius: '50%', background: `${COLORS.primary}10` }} />
        <div style={{ position: 'absolute', bottom: -50, left: -50, width: 250, height: 250, borderRadius: '50%', background: `${COLORS.accent}08` }} />

        <div style={{ maxWidth: 650, margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <h2 style={{ fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: -2, margin: '0 0 16px' }}>
            Prêt à booster vos<br />revenus partenaires ?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 17, lineHeight: 1.6, marginBottom: 36, fontFamily: "'DM Sans', sans-serif" }}>
            Rejoignez les entreprises qui utilisent RefBoost pour transformer leur réseau en source de revenus récurrents.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', maxWidth: 460, margin: '0 auto' }}>
            <input
              type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)}
              style={{
                flex: 1, padding: '16px 20px', borderRadius: 12, border: '2px solid rgba(255,255,255,0.1)',
                background: 'rgba(255,255,255,0.06)', color: '#fff', fontSize: 15, fontFamily: 'inherit',
                outline: 'none', backdropFilter: 'blur(10px)',
              }}
            />
            <button onClick={() => navigate('/apply')} className="btn-primary" style={{
              padding: '16px 28px', borderRadius: 12, border: 'none',
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.primaryLight})`,
              color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
              whiteSpace: 'nowrap', boxShadow: `0 8px 30px ${COLORS.primary}30`,
            }}>
              Démarrer →
            </button>
          </div>
          <p style={{ color: '#475569', fontSize: 12, marginTop: 16 }}>14 jours d'essai gratuit · Aucune carte requise</p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ padding: '48px 48px 32px', background: COLORS.secondary, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Logo size={28} white />
          <div style={{ display: 'flex', gap: 32 }}>
            {['Fonctionnalités', 'Tarifs', 'Blog', 'Contact', 'CGV', 'Confidentialité'].map(item => (
              <a key={item} href="#" style={{ color: '#64748b', textDecoration: 'none', fontSize: 13, fontWeight: 500 }}>{item}</a>
            ))}
          </div>
          <div style={{ color: '#475569', fontSize: 12 }}>© 2026 RefBoost. Tous droits réservés.</div>
        </div>
      </footer>
    </div>
  );
}
