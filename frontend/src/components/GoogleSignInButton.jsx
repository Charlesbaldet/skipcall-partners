import { useRef, useState, useCallback, useEffect } from 'react';

// Inline official Google "G" mark — renders instantly, no CDN dependency.
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

// OAuth2 implicit popup flow — bypasses FedCM / One Tap entirely so
// Chrome cannot silently suppress it. The popup:
//   1. navigates to Google's OAuth consent screen
//   2. Google redirects back to our origin (/login) with the access
//      token in the URL hash
//   3. the parent polls popup.location; the first time the URL is
//      same-origin we can read the hash, capture the token, close the
//      popup and hand it off to onSuccess.
// The redirect URI (window.location.origin + '/login') MUST be listed
// under "Authorized redirect URIs" on the Google OAuth client.
export default function GoogleSignInButton({
  onSuccess, onError, text = 'Continue with Google', disabled = false,
}) {
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  // Clean up any poll interval left behind if the component unmounts
  // while a popup is open (user navigates away mid-auth).
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  const handleGoogleLogin = useCallback(() => {
    if (!clientId || disabled || loading) return;

    const redirectUri = window.location.origin + '/login';
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'token',
      scope: 'openid email profile',
      prompt: 'select_account',
      include_granted_scopes: 'true',
    });
    const url = 'https://accounts.google.com/o/oauth2/v2/auth?' + params.toString();

    // Center the popup on the user's screen — mirrors the stock Google
    // popup sizing so it feels native.
    const w = 500, h = 600;
    const left = Math.max(0, Math.round((window.screen.width  - w) / 2));
    const top  = Math.max(0, Math.round((window.screen.height - h) / 2));
    const popup = window.open(url, 'refboost-google-login',
      `width=${w},height=${h},left=${left},top=${top}`);

    if (!popup) {
      onError && onError(new Error('popup_blocked'));
      return;
    }

    setLoading(true);
    const origin = window.location.origin;

    pollRef.current = setInterval(() => {
      try {
        // `popup.closed` is readable cross-origin; everything else
        // throws until Google redirects back to our origin.
        if (popup.closed) {
          clearInterval(pollRef.current);
          pollRef.current = null;
          setLoading(false);
          return;
        }
        // Reading .location or .href on a cross-origin window throws
        // DOMException — caught below and retried.
        const href = popup.location.href;
        if (!href || !href.startsWith(origin)) return;

        const hash = popup.location.hash || '';
        const search = popup.location.search || '';
        const params = new URLSearchParams(hash.replace(/^#/, ''));
        const searchParams = new URLSearchParams(search);
        const errorFromGoogle = params.get('error') || searchParams.get('error');
        const accessToken = params.get('access_token');

        popup.close();
        clearInterval(pollRef.current);
        pollRef.current = null;
        setLoading(false);

        if (errorFromGoogle) {
          onError && onError(new Error(errorFromGoogle));
          return;
        }
        if (accessToken) {
          onSuccess && onSuccess({ access_token: accessToken });
        } else {
          onError && onError(new Error('no_access_token'));
        }
      } catch (_ignored) {
        // Cross-origin while still on accounts.google.com — keep polling.
      }
    }, 500);
  }, [clientId, disabled, loading, onSuccess, onError]);

  if (!clientId) return null;

  return (
    <button
      type="button"
      onClick={handleGoogleLogin}
      disabled={disabled || loading}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid #dadce0',
        borderRadius: 8,
        fontFamily: 'inherit',
        fontSize: 14, fontWeight: 600, color: '#3c4043',
        cursor: disabled || loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'background .15s',
      }}
      onMouseEnter={e => { if (!disabled && !loading) e.currentTarget.style.background = '#f8f9fa'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      <GoogleG size={18} />
      <span>{text}</span>
    </button>
  );
}
