import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';
import GoogleSignInButton from '../components/GoogleSignInButton';
import { Helmet } from 'react-helmet-async';

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
  const { login, loginWithGoogle, switchSpace, finalizeMfaLogin } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const revoked = searchParams.get('revoked') === '1';
  const [showPwd, setShowPwd] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // When the backend returns requiresSpaceSelection (multi-tenant
  // user), this holds the spaces list so we can render the picker
  // modal. Cleared once the user picks one.
  const [pickerSpaces, setPickerSpaces] = useState(null);
  const [pickerBusy, setPickerBusy] = useState(false);
  // MFA-required step. Holds the short-lived mfa_token issued by
  // /auth/login and the form state for the second-factor screen.
  const [mfaToken, setMfaToken] = useState(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaUseBackup, setMfaUseBackup] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);

  const finishLogin = (u) => {
    navigate(u.role === 'partner' ? '/partner/submit' : '/');
  };

  const handlePickSpace = async (space) => {
    setError('');
    setPickerBusy(true);
    try {
      const data = await switchSpace(space);
      setPickerSpaces(null);
      finishLogin(data.user);
    } catch (err) {
      setError(err.message || t('login.error_default'));
    } finally {
      setPickerBusy(false);
    }
  };

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
          // Stash the access_token so the signup form can POST it with
          // the company/fullName to /auth/signup-google; the backend
          // re-verifies the token against Google to bind the new account
          // to the proven Google identity.
          try { sessionStorage.setItem('google_signup_access_token', accessToken); } catch {}
          const qs = new URLSearchParams({ google_email: data.email || '' });
          if (data.name) qs.set('google_name', data.name);
          if (data.picture) qs.set('google_avatar', data.picture);
          navigate('/signup?' + qs.toString());
          return;
        }
        if (data.mfa_required) {
          setMfaToken(data.mfa_token);
        } else if (data.requiresSpaceSelection) {
          setPickerSpaces(data.spaces || []);
        } else {
          finishLogin(data.user);
        }
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
      const data = await login(email, password);
      // login() returns the full backend payload. Multi-tenant
      // accounts get requiresSpaceSelection + a temp token; the
      // picker modal owns the next step.
      if (data.mfa_required) {
        setMfaToken(data.mfa_token);
      } else if (data.requiresSpaceSelection) {
        setPickerSpaces(data.spaces || []);
      } else {
        finishLogin(data.user);
      }
    } catch (err) {
      setError(err.message || t("login.error_default"));
    } finally {
      setLoading(false);
    }
  };

  const handleMfaSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setError('');
    setMfaBusy(true);
    try {
      const data = await finalizeMfaLogin({
        mfa_token: mfaToken,
        code: mfaCode,
        is_backup_code: mfaUseBackup,
      });
      if (data.requiresSpaceSelection) {
        setMfaToken(null);
        setPickerSpaces(data.spaces || []);
      } else {
        setMfaToken(null);
        finishLogin(data.user);
      }
    } catch (err) {
      setError(err.message || t('mfa.invalid_code'));
    } finally {
      setMfaBusy(false);
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
      <Helmet>
        <title>Connexion à votre espace partenaires RefBoost</title>
        <meta name="description" content="Connectez-vous à votre espace RefBoost pour gérer vos partenaires, suivre vos referrals, valider les commissions et piloter votre programme B2B." />
        <link rel="canonical" href="https://refboost.io/login" />
        <meta property="og:title" content="Connexion à votre espace partenaires RefBoost" />
        <meta property="og:description" content="Connectez-vous à votre espace RefBoost pour gérer vos partenaires, suivre vos referrals, valider les commissions et piloter votre programme B2B." />
        <meta property="og:url" content="https://refboost.io/login" />
        <meta property="og:image" content="https://refboost.io/og-image.png" />
      </Helmet>
      
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
          {mfaToken ? t('mfa.login_title') : t("login.title")}
        </h1>
        <p style={{
          color: C.m, fontSize: 15, textAlign: 'center',
          margin: '0 0 32px', fontFamily: 'inherit',
        }}>
          {mfaToken ? t('mfa.login_subtitle') : t("login.subtitle")}
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

        {/* MFA second-factor form. Replaces the credentials form once
            /auth/login returns mfa_required. Toggling "use backup code"
            swaps the input from a 6-digit numeric to an 8-char alpha. */}
        {mfaToken && (
          <form onSubmit={handleMfaSubmit}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', color: C.s, fontSize: 13, fontWeight: 600, marginBottom: 8, fontFamily: 'inherit' }}>
                {t('mfa.code_placeholder')}
              </label>
              <input
                type="text"
                inputMode={mfaUseBackup ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                maxLength={mfaUseBackup ? 8 : 6}
                value={mfaCode}
                onChange={e => {
                  const v = mfaUseBackup
                    ? e.target.value.toUpperCase().replace(/[^0-9A-F]/g, '').slice(0, 8)
                    : e.target.value.replace(/\D/g, '').slice(0, 6);
                  setMfaCode(v);
                  if (!mfaUseBackup && v.length === 6 && !mfaBusy) {
                    // Auto-submit on the 6th digit. Use a microtask so
                    // React commits the state update first.
                    setTimeout(() => {
                      if (v.length === 6) handleMfaSubmit();
                    }, 0);
                  }
                }}
                placeholder={mfaUseBackup ? '• • • • • • • •' : '• • • • • •'}
                className="input-rb"
                style={{
                  width: '100%', padding: '14px 16px', borderRadius: 12,
                  border: '1.5px solid #e2e8f0',
                  background: '#fafbfc', fontSize: 22, color: C.s,
                  fontFamily: 'monospace', letterSpacing: 6, textAlign: 'center',
                  outline: 'none', boxSizing: 'border-box', transition: 'all .2s',
                }}
              />
            </div>
            <div style={{ textAlign: 'right', marginBottom: 16 }}>
              <button
                type="button"
                onClick={() => { setMfaUseBackup(v => !v); setMfaCode(''); }}
                style={{ background: 'none', border: 'none', color: C.p, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
              >
                {mfaUseBackup ? t('mfa.login_use_totp') : t('mfa.login_use_backup')}
              </button>
            </div>
            <button
              type="submit"
              disabled={mfaBusy || (mfaUseBackup ? mfaCode.length !== 8 : mfaCode.length !== 6)}
              className="bp"
              style={{
                width: '100%', padding: '15px',
                borderRadius: 12, border: 'none',
                background: mfaBusy ? C.m : C.p,
                color: '#fff', fontWeight: 700, fontSize: 15,
                cursor: mfaBusy ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: mfaBusy ? 'none' : `0 8px 30px ${C.p}30`,
                opacity: mfaBusy ? 0.7 : 1,
              }}
            >
              {mfaBusy ? t('login.loading') : t('mfa.login_submit')}
            </button>
          </form>
        )}

        {/* Form */}
        {!mfaToken && (
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

          {/* "or" divider + Google SSO, placed just above submit */}
          {import.meta.env?.VITE_GOOGLE_CLIENT_ID && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
                <span style={{ color: '#94a3b8', fontSize: 12, fontWeight: 500 }}>{t('login.or')}</span>
                <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
              </div>
              <div style={{ marginBottom: 16 }}>
                <GoogleSignInButton text={t('login.google_continue')} intent="login" />
              </div>
            </>
          )}

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
        )}

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

      {/* Workspace picker — shown when /auth/login or /auth/google
          returns requiresSpaceSelection because the user belongs to
          multiple tenants and we couldn't auto-pick the last-used one. */}
      {pickerSpaces && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 100,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        }}>
          <div style={{
            width: '100%', maxWidth: 480, background: '#fff', borderRadius: 20,
            padding: 32, boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
          }}>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.s, margin: '0 0 6px' }}>
              {t('login.select_space_title', 'Choisissez votre espace')}
            </h2>
            <p style={{ color: C.m, fontSize: 14, margin: '0 0 20px' }}>
              {t('login.select_space_desc', 'Vous avez accès à plusieurs espaces. Sélectionnez celui auquel vous souhaitez vous connecter.')}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {pickerSpaces.map((space) => {
                const label = space.role === 'partner'
                  ? (space.partner_name || t('layout_extra.space_partner', 'Espace partenaire'))
                  : (space.tenant_name || t('layout_extra.space_space', 'Espace'));
                const initials = (label || '??').slice(0, 2).toUpperCase();
                const roleLabel = space.role === 'partner'
                  ? t('layout_extra.space_partner', 'Partenaire')
                  : t('layout_extra.space_admin', space.role);
                return (
                  <button
                    key={`pick-${space.tenant_id}-${space.role}-${space.partner_id || 'none'}`}
                    type="button"
                    onClick={() => handlePickSpace(space)}
                    disabled={pickerBusy}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '14px 16px', borderRadius: 12,
                      border: '1.5px solid #e2e8f0', background: '#fafbfc',
                      cursor: pickerBusy ? 'wait' : 'pointer',
                      textAlign: 'left', fontFamily: 'inherit',
                      transition: 'all .15s',
                      opacity: pickerBusy ? 0.6 : 1,
                    }}
                    onMouseEnter={e => !pickerBusy && (e.currentTarget.style.borderColor = C.p)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e2e8f0')}
                  >
                    <div style={{
                      width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                      background: g(C.p, C.pl), color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 800, fontSize: 14, letterSpacing: -0.5,
                    }}>{initials}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: C.s, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                      <div style={{ color: C.m, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 2 }}>{roleLabel}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

