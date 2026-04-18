// Full-page redirect OAuth2 flow — no GSI SDK, no popup, no FedCM.
// Clicking the button sends the whole tab to Google's consent screen;
// Google redirects back to `redirectUri` with `#access_token=…` in the
// URL hash. The LoginPage mount effect picks it up and completes sign-in.
//
// Authorized redirect URIs required on the Google OAuth client:
//   https://refboost.io/login
//   http://localhost:5173/login  (dev)
//   + any Vercel preview URL you want to test

function GoogleG({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      <path fill="none" d="M0 0h48v48H0z"/>
    </svg>
  );
}

// Stash context (signup vs. login, any pre-fill) in sessionStorage so
// the LoginPage mount handler knows where to route the user after the
// redirect roundtrip returns to /login.
export function redirectToGoogle({ intent = 'login' } = {}) {
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return;
  try { sessionStorage.setItem('google_sso_intent', intent); } catch { /* storage disabled */ }
  const redirectUri = window.location.origin + '/login';
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'token',
    scope: 'openid email profile',
    prompt: 'select_account',
    include_granted_scopes: 'true',
  });
  window.location.href = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();
}

export default function GoogleSignInButton({
  text = 'Continue with Google', disabled = false, intent = 'login',
}) {
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
  if (!clientId) return null;

  return (
    <button
      type="button"
      onClick={() => redirectToGoogle({ intent })}
      disabled={disabled}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid #dadce0',
        borderRadius: 8,
        fontFamily: 'inherit',
        fontSize: 14, fontWeight: 600, color: '#3c4043',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#f8f9fa'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      <GoogleG size={18} />
      <span>{text}</span>
    </button>
  );
}
