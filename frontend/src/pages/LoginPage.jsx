import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';
import GoogleSignInButton from '../components/GoogleSignInButton';

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
  const { t } = useTranslation();
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const revoked = searchParams.get('revoked') === '1';
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Complete the Google OAuth redirect flow: when Google sends the
  // user back here with `#access_token=…` in the URL, trade the
  // token with our backend, log the user in, and clear the hash so a
  // refresh doesn't re-trigger the call. If the token maps to no
  // existing account the backend returns { needsSignup: true } and
  // we forward the visitor to /signup with email + name pre-filled.
  useEffect(() => {
    const hash = window.location.hash || '';
    if (!hash.includes('access_token=')) return;

    const params = new URLSearchParams(hash.replace(/^#/, ''));
    const accessToken = params.get('access_token');
    const googleError = params.get('error');

    // Strip the hash before any async work so a re-render can't loop.
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search); }
    catch { window.location.hash = ''; }

    if (googleError) { setError(t('login.google_error')); return; }
    if (!accessToken) return;

    let cancelled = false;
    (async () => {
      setError('');
      setLoading(true);
      try {
        const data = await loginWithGoogle(accessToken);
        if (cancelled) return;
        if (data.needsSignup) {
          const qs = new URLSearchParams({ email: data.email || '' });
          if (data.name) qs.set('name', data.name);
          navigate('/signup?' + qs.toString());
          return;
        }
        navigate(data.user.role === 'partner' ? '/partner/submit' : '/');
      } catch (err) {
        if (!cancelled) setError(err.message || t('login.google_error'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'partner' ? '/partner/submit' : '/');
    } catch (err) {
      setError(err.message || t("login.error_default"));
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
        {t("login.back_to_site")}
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
          {t("login.title")}
        </h1>
        <p style={{
          color: C.m, fontSize: 15, textAlign: 'center',
          margin: '0 0 32px', fontFamily: 'inherit',
        }}>
          {t("login.subtitle")}s
        </p>

        {/* Access-revoked banner (set by api.js 401 handler when a
            partner record has been archived or deleted). */}
        {revoked && (
          <div style={{
            background: '#fef2f2', border: '1px solid #fecaca',
            borderRadius: 12, padding: '12px 16px',
            color: '#b91c1c', fontSize: 14, marginBottom: 20,
            fontFamily: 'inherit', fontWeight: 500,
          }}>
            {t('login.access_revoked')}
          </div>
        )}

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

        {/* Google SSO (renders only when VITE_GOOGLE_CLIENT_ID is set).
            Button triggers a full-page redirect to Google; the returning
            access token is handled by the mount-time useEffect above. */}
        <GoogleSignInButton text={t('login.google_continue')} intent="login" />

        {/* "or" divider between Google and email/password. Hidden when
            the Google button is suppressed (missing client id). */}
        {import.meta.env?.VITE_GOOGLE_CLIENT_ID && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
            <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>{t('login.or')}</span>
            <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
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
              placeholder={t("login.email_placeholder")}
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
              {t("login.password")}
            </label>
            <div style={{ position: 'relative' }}>
              <input
              type={showPwd ? "text" : "password"}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="input-rb"
              style={{
                width: '100%', padding: '14px 40px 14px 16px', borderRadius: 12,
                border: '1.5px solid #e2e8f0',
                background: '#fafbfc', fontSize: 15, color: C.s,
                fontFamily: 'inherit',
                outline: 'none', boxSizing: 'border-box',
                transition: 'all .2s',
              }}
            />
              <button type="button" onClick={() => setShowPwd(v => !v)} tabIndex={-1} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2, display: 'flex', alignItems: 'center' }}>
                {showPwd
                  ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
          </div>

                  <div style={{ textAlign: 'right', marginBottom: 16 }}>
            <Link to="/forgot-password" style={{ color: C.p, fontSize: 13, fontWeight: 600, textDecoration: 'none' }}>
              {t("login.forgot_password")}
            </Link>
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
            {loading ? t("login.loading") : t("login.submit")}
          </button>
        </form>

        {/* Footer link */}
        <p style={{
          textAlign: 'center', marginTop: 28, marginBottom: 0,
          fontSize: 14, color: C.m, fontFamily: 'inherit',
        }}>
          <span style={{ display: 'block', marginBottom: 4 }}>{t("login.no_account")}</span>
          <Link to="/signup" style={{ color: C.p, fontWeight: 700, textDecoration: 'none', display: 'block' }}>
            {t("login.create_account")}
          </Link>
        </p>
      </div>
    </div>
  );
}

