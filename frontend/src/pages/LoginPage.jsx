import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// ─── Design tokens (sync avec LandingPage) ───
const C = {
  p: '#059669', pl: '#10b981', pd: '#047857',
  s: '#0f172a', sl: '#1e293b',
  a: '#f97316', al: '#fb923c',
  m: '#64748b', bg: '#fafbfc',
};
const g = (a, b) => `linear-gradient(135deg,${a},${b})`;

function Logo({ size = 40, white = false }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs>
          <linearGradient id="lg-login" x1="0" y1="0" x2="48" y2="48">
            <stop offset="0%" stopColor={C.p} />
            <stop offset="100%" stopColor={C.pl} />
          </linearGradient>
        </defs>
        <rect width="48" height="48" rx="14" fill="url(#lg-login)" />
        <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white" />
        <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9" />
      </svg>
      <span style={{
        fontSize: size * 0.55, fontWeight: 800, letterSpacing: -1,
        color: white ? '#fff' : C.s, fontFamily: 'inherit'
      }}>
        Ref<span style={{ color: C.p }}>Boost</span>
      </span>
    </div>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'partner' ? '/partner/submit' : '/');
    } catch (err) {
      setError(err.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '24px',
      fontFamily: 'inherit',
      color: C.s,
      background: `radial-gradient(ellipse 80% 60% at 50% -20%,${C.p}12,transparent),radial-gradient(ellipse 60% 40% at 80% 80%,${C.a}08,transparent),${C.bg}`,
      position: 'relative', overflow: 'hidden',
    }}>
      
      <style>{`
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        .fu{animation:fadeUp .6s ease-out forwards}
        .bp{transition:all .3s}
        .bp:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 12px 40px rgba(5,150,105,.35)}
        .input-rb:focus{border-color:${C.p}!important;background:#fff!important;box-shadow:0 0 0 4px ${C.p}15!important}
      `}</style>

      {/* Floating background blobs */}
      <div style={{
        position: 'absolute', top: 100, left: 80, width: 280, height: 280,
        borderRadius: '50%', background: `${C.p}08`,
        animation: 'float 6s ease-in-out infinite', pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', bottom: 80, right: 100, width: 200, height: 200,
        borderRadius: '50%', background: `${C.a}10`,
        animation: 'float 8s ease-in-out infinite 2s', pointerEvents: 'none',
      }} />

      {/* Back to landing link */}
      <Link to="/" style={{
        position: 'absolute', top: 32, left: 48,
        color: C.m, textDecoration: 'none', fontSize: 14, fontWeight: 500,
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        ← Retour au site
      </Link>

      {/* Card */}
      <div className="fu" style={{
        width: '100%', maxWidth: 440,
        background: '#fff',
        border: '1px solid #f1f5f9',
        borderRadius: 24,
        padding: 48,
        boxShadow: '0 20px 60px rgba(15,23,42,0.08)',
        position: 'relative', zIndex: 1,
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32 }}>
          <Logo size={44} />
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 32, fontWeight: 800, letterSpacing: -1.5,
          textAlign: 'center', margin: '0 0 8px', color: C.s,
        }}>
          Connexion
        </h1>
        <p style={{
          color: C.m, fontSize: 15, textAlign: 'center',
          margin: '0 0 32px', fontFamily: 'inherit',
        }}>
          Accédez à votre programme partenaires
        </p>

        {/* Error */}
        {error && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 12, padding: '12px 16px',
            color: '#b91c1c', fontSize: 14, marginBottom: 20,
            fontFamily: 'inherit',
          }}>
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 18 }}>
            <label style={{
              display: 'block', color: C.s, fontSize: 13, fontWeight: 600,
              marginBottom: 8, fontFamily: 'inherit',
            }}>
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="vous@entreprise.com"
              required
              className="input-rb"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: '#fafbfc', fontSize: 15, color: C.s,
                fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                transition: 'all .2s',
              }}
            />
          </div>

          <div style={{ marginBottom: 24 }}>
            <label style={{
              display: 'block', color: C.s, fontSize: 13, fontWeight: 600,
              marginBottom: 8, fontFamily: 'inherit',
            }}>
              Mot de passe
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input-rb"
              style={{
                width: '100%', padding: '14px 16px', borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: '#fafbfc', fontSize: 15, color: C.s,
                fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                transition: 'all .2s',
              }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bp"
            style={{
              width: '100%', padding: '15px',
              borderRadius: 12, border: 'none',
              background: loading ? C.m : C.p,
              color: '#fff', fontWeight: 700, fontSize: 15,
              cursor: loading ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              boxShadow: loading ? 'none' : `0 8px 30px ${C.p}30`,
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Connexion en cours...' : 'Se connecter →'}
          </button>
        </form>

        {/* Footer link */}
        <p style={{
          textAlign: 'center', marginTop: 28, marginBottom: 0,
          fontSize: 14, color: C.m, fontFamily: 'inherit',
        }}>
          Pas encore de compte ?{' '}
          <Link to="/signup" style={{
            color: C.p, fontWeight: 600, textDecoration: 'none',
          }}>
            Créer un espace gratuit →
          </Link>
        </p>
      </div>
    </div>
  );
}

