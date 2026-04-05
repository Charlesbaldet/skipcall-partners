import { useState, useEffect, useRef } from 'react';
import { ArrowRight, CheckCircle, DollarSign, Users, TrendingUp, Zap, Shield, BarChart3, MessageCircle, Star } from 'lucide-react';

const STATS = [
  { value: '10%', label: 'Commission récurrente', sub: 'sur chaque deal signé' },
  { value: '48h', label: 'Prise de contact', sub: 'délai max garanti' },
  { value: '100%', label: 'Transparence', sub: 'suivi en temps réel' },
];

const STEPS = [
  { icon: Users, title: 'Recommandez', desc: 'Soumettez un prospect en 30 secondes via votre espace dédié.' },
  { icon: Zap, title: 'On s\'en occupe', desc: 'Notre équipe commerciale contacte et accompagne le prospect.' },
  { icon: DollarSign, title: 'Gagnez', desc: 'Vous touchez votre commission dès que le deal est signé.' },
];

const FEATURES = [
  { icon: BarChart3, title: 'Dashboard en temps réel', desc: 'Suivez vos referrals, conversions et commissions depuis votre espace.' },
  { icon: Shield, title: 'Paiements sécurisés', desc: 'Commissions versées automatiquement. IBAN géré en toute sécurité.' },
  { icon: MessageCircle, title: 'Communication directe', desc: 'Messagerie intégrée avec l\'équipe commerciale Skipcall.' },
  { icon: TrendingUp, title: 'Suivi du pipeline', desc: 'Visualisez l\'avancement de chaque prospect en temps réel.' },
];

const TESTIMONIALS = [
  { name: 'Marc D.', company: 'TechAlliance', text: 'En 3 mois, j\'ai généré plus de 5 000€ de commissions. Le suivi est impeccable.', rating: 5 },
  { name: 'Sophie M.', company: 'DigiConseil', text: 'La plateforme est intuitive et l\'équipe Skipcall réactive. Un vrai partenariat gagnant-gagnant.', rating: 5 },
  { name: 'Julien P.', company: 'CloudExperts', text: 'Je recommande Skipcall à mes clients sans hésiter. La qualité du service parle d\'elle-même.', rating: 5 },
];

export default function LandingPage() {
  const [scrollY, setScrollY] = useState(0);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div style={{ background: '#000', color: '#fff', fontFamily: "'DM Sans', -apple-system, sans-serif", overflow: 'hidden' }}>
      {/* ═══ NAVBAR ═══ */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '16px 40px', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: scrollY > 50 ? 'rgba(0,0,0,0.85)' : 'transparent',
        backdropFilter: scrollY > 50 ? 'blur(20px)' : 'none',
        borderBottom: scrollY > 50 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'all 0.3s',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff' }}>S</div>
          <span style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.5 }}>Skipcall</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 }}>
          <a href="#how" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}>Comment ça marche</a>
          <a href="#features" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Avantages</a>
          <a href="#testimonials" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Témoignages</a>
          <a href="/login" style={{ color: '#94a3b8', textDecoration: 'none', fontSize: 14, fontWeight: 500 }}>Connexion</a>
          <a href="/apply" style={{
            padding: '10px 22px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
            color: '#fff', textDecoration: 'none', fontWeight: 600, fontSize: 14,
            boxShadow: '0 4px 15px rgba(99,102,241,0.3)',
          }}>Devenir partenaire</a>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', textAlign: 'center', padding: '120px 24px 80px',
      }}>
        {/* Background effects */}
        <div style={{
          position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)',
          width: 800, height: 800, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.15) 0%, transparent 60%)',
          filter: 'blur(80px)', pointerEvents: 'none',
        }} />
        <div style={{
          position: 'absolute', top: '30%', right: '10%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 60%)',
          filter: 'blur(60px)', pointerEvents: 'none',
        }} />

        <div style={{ position: 'relative', maxWidth: 800 }}>
          <div style={{
            display: 'inline-block', padding: '6px 16px', borderRadius: 20,
            background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.2)',
            color: '#818cf8', fontSize: 13, fontWeight: 600, marginBottom: 28,
          }}>
            Programme Partenaires Skipcall
          </div>

          <h1 style={{
            fontSize: 'clamp(36px, 5.5vw, 72px)', fontWeight: 800, lineHeight: 1.1,
            letterSpacing: -2, marginBottom: 24,
            background: 'linear-gradient(to right, #fff 30%, #a5b4fc 70%, #c084fc)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
          }}>
            Recommandez.<br />Nous vendons.<br />Vous gagnez.
          </h1>

          <p style={{
            fontSize: 20, color: '#94a3b8', lineHeight: 1.7, maxWidth: 560, margin: '0 auto 40px',
          }}>
            Rejoignez notre réseau de partenaires et touchez des commissions récurrentes sur chaque client que vous nous recommandez.
          </p>

          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, flexWrap: 'wrap' }}>
            <a href="/apply" style={{
              display: 'inline-flex', alignItems: 'center', gap: 10, padding: '16px 32px',
              borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              color: '#fff', textDecoration: 'none', fontWeight: 700, fontSize: 17,
              boxShadow: '0 8px 30px rgba(99,102,241,0.4)',
              transition: 'transform 0.2s, box-shadow 0.2s',
            }}>
              Devenir partenaire <ArrowRight size={20} />
            </a>
            <a href="#how" style={{
              display: 'inline-flex', alignItems: 'center', gap: 8, padding: '16px 32px',
              borderRadius: 14, background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)', color: '#fff',
              textDecoration: 'none', fontWeight: 600, fontSize: 17,
            }}>
              Comment ça marche
            </a>
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 48, marginTop: 80 }}>
            {STATS.map((s, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 44, fontWeight: 800, color: '#fff', letterSpacing: -1 }}>{s.value}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#a5b4fc', marginTop: 4 }}>{s.label}</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section id="how" style={{ padding: '100px 24px', position: 'relative' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Simple & efficace</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>Comment ça marche</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 32 }}>
            {STEPS.map((step, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 20, padding: 36, position: 'relative', textAlign: 'center',
                transition: 'border-color 0.3s, background 0.3s',
              }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(99,102,241,0.3)'; e.currentTarget.style.background = 'rgba(99,102,241,0.05)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'; e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <div style={{
                  position: 'absolute', top: -16, left: '50%', transform: 'translateX(-50%)',
                  width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#6366f1,#a855f7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: '#fff',
                }}>{i + 1}</div>
                <div style={{
                  width: 56, height: 56, borderRadius: 16, background: 'rgba(99,102,241,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  margin: '16px auto 20px',
                }}>
                  <step.icon size={26} color="#818cf8" />
                </div>
                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 10 }}>{step.title}</h3>
                <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6 }}>{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="features" style={{ padding: '100px 24px', background: 'rgba(255,255,255,0.02)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Votre espace</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>Tout ce qu'il vous faut</h2>
            <p style={{ color: '#94a3b8', fontSize: 17, maxWidth: 500, margin: '16px auto 0' }}>Un espace dédié pour gérer vos recommandations et suivre vos gains.</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24 }}>
            {FEATURES.map((f, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 18, padding: 32, display: 'flex', gap: 20,
                transition: 'border-color 0.3s',
              }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.06)'}
              >
                <div style={{ width: 48, height: 48, borderRadius: 14, background: 'rgba(99,102,241,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <f.icon size={22} color="#818cf8" />
                </div>
                <div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>{f.title}</h3>
                  <p style={{ color: '#94a3b8', fontSize: 15, lineHeight: 1.6 }}>{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section id="testimonials" style={{ padding: '100px 24px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ color: '#818cf8', fontSize: 13, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 }}>Ils nous font confiance</div>
            <h2 style={{ fontSize: 44, fontWeight: 800, letterSpacing: -1 }}>Nos partenaires témoignent</h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            {TESTIMONIALS.map((t, i) => (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: 18, padding: 28,
              }}>
                <div style={{ display: 'flex', gap: 2, marginBottom: 16 }}>
                  {Array.from({ length: t.rating }).map((_, j) => (
                    <Star key={j} size={16} fill="#f59e0b" color="#f59e0b" />
                  ))}
                </div>
                <p style={{ color: '#e2e8f0', fontSize: 15, lineHeight: 1.7, marginBottom: 20, fontStyle: 'italic' }}>"{t.text}"</p>
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: 14 }}>{t.name}</div>
                  <div style={{ color: '#64748b', fontSize: 13 }}>{t.company}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{ padding: '100px 24px' }}>
        <div style={{
          maxWidth: 800, margin: '0 auto', textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(99,102,241,0.15), rgba(168,85,247,0.1))',
          border: '1px solid rgba(99,102,241,0.2)', borderRadius: 28, padding: '64px 48px',
          position: 'relative', overflow: 'hidden',
        }}>
          <div style={{
            position: 'absolute', top: -50, right: -50, width: 200, height: 200,
            borderRadius: '50%', background: 'rgba(99,102,241,0.1)', filter: 'blur(40px)',
          }} />
          <h2 style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1, marginBottom: 16, position: 'relative' }}>
            Prêt à générer des revenus ?
          </h2>
          <p style={{ color: '#94a3b8', fontSize: 17, maxWidth: 480, margin: '0 auto 32px', lineHeight: 1.7, position: 'relative' }}>
            Rejoignez notre programme en quelques minutes et commencez à toucher des commissions récurrentes.
          </p>
          <a href="/apply" style={{
            display: 'inline-flex', alignItems: 'center', gap: 10, padding: '18px 36px',
            borderRadius: 14, background: '#fff', color: '#0f172a',
            textDecoration: 'none', fontWeight: 700, fontSize: 17,
            boxShadow: '0 8px 30px rgba(255,255,255,0.1)',
            position: 'relative',
          }}>
            Postuler maintenant <ArrowRight size={20} />
          </a>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{
        padding: '48px 40px', borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 1200, margin: '0 auto',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>S</div>
          <span style={{ color: '#64748b', fontSize: 14 }}>Skipcall - Programme Partenaires</span>
        </div>
        <div style={{ color: '#475569', fontSize: 13 }}>
          2026 Skipcall. Tous droits réservés.
        </div>
      </footer>
    </div>
  );
}
