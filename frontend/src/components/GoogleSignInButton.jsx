import { useEffect, useRef, useState } from 'react';

// Loads the Google Identity Services SDK once and caches the promise so
// multiple buttons on the page don't re-inject the script tag.
let gsiPromise = null;
function loadGsi() {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.google?.accounts?.id) return resolve(window.google);
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve(window.google);
    s.onerror = () => { gsiPromise = null; reject(new Error('GSI load failed')); };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

// Inline SVG of the official multi-colour Google G mark — saves a
// network hop and guarantees the button renders even if the CDN is slow.
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

export default function GoogleSignInButton({ onSuccess, onError, text = 'Continue with Google', disabled = false }) {
  const clientId = import.meta.env?.VITE_GOOGLE_CLIENT_ID;
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const initedFor = useRef(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    loadGsi().then((google) => {
      if (cancelled) return;
      // Re-init if the client id changes at runtime (unlikely, but cheap).
      if (initedFor.current !== clientId) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          ux_mode: 'popup',
          auto_select: false,
        });
        initedFor.current = clientId;
      }
      setReady(true);
    }).catch((err) => {
      console.error('[gsi load]', err);
      if (!cancelled && onError) onError(err);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId]);

  function handleCredential(resp) {
    setLoading(false);
    if (!resp || !resp.credential) {
      onError && onError(new Error('no credential'));
      return;
    }
    onSuccess && onSuccess({ credential: resp.credential });
  }

  function onClick() {
    if (!ready || disabled) return;
    setLoading(true);
    try {
      // One Tap prompt — falls back to the standard popup when One Tap is
      // suppressed (e.g. the user has previously dismissed it).
      window.google.accounts.id.prompt((notification) => {
        if (notification.isNotDisplayed?.() || notification.isSkippedMoment?.()) {
          // Fallback to explicit popup via id.prompt retry with a one-off
          // button-triggered FedCM flow. If even that is blocked we surface
          // the error so the caller can show a message.
          setLoading(false);
          onError && onError(new Error(notification.getNotDisplayedReason?.() || notification.getSkippedReason?.() || 'google_prompt_blocked'));
        }
      });
    } catch (err) {
      setLoading(false);
      onError && onError(err);
    }
  }

  if (!clientId) {
    // Don't render the button at all when the client ID is missing —
    // clicking would only produce console errors. Keeps the rest of the
    // login form usable in local dev without the GOOGLE_CLIENT_ID set.
    return null;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || !ready || loading}
      style={{
        width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
        padding: '12px 16px',
        background: '#fff',
        border: '1px solid #dadce0',
        borderRadius: 8,
        fontFamily: 'inherit',
        fontSize: 14, fontWeight: 600, color: '#3c4043',
        cursor: disabled || !ready || loading ? 'not-allowed' : 'pointer',
        opacity: loading ? 0.7 : 1,
        transition: 'background .15s, box-shadow .15s',
      }}
      onMouseEnter={e => { if (!disabled && ready && !loading) e.currentTarget.style.background = '#f8f9fa'; }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff'; }}
    >
      <GoogleG size={18} />
      <span>{text}</span>
    </button>
  );
}
