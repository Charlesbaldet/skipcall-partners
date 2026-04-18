import { useEffect, useRef, useState, useCallback } from 'react';

// ─── SDK loader ──────────────────────────────────────────────────────
// Load https://accounts.google.com/gsi/client exactly once per tab.
// Multiple button instances share the same promise so we don't re-inject
// the tag or double-initialise.
let gsiPromise = null;
function loadGsi() {
  if (gsiPromise) return gsiPromise;
  gsiPromise = new Promise((resolve, reject) => {
    if (typeof window === 'undefined') return reject(new Error('no window'));
    if (window.google?.accounts?.id) return resolve(window.google);
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    const onLoad = () => {
      if (window.google?.accounts?.id) resolve(window.google);
      else reject(new Error('GSI loaded but id namespace missing'));
    };
    if (existing) {
      if (window.google?.accounts?.id) return resolve(window.google);
      existing.addEventListener('load', onLoad, { once: true });
      existing.addEventListener('error', () => { gsiPromise = null; reject(new Error('GSI load failed')); }, { once: true });
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = onLoad;
    s.onerror = () => { gsiPromise = null; reject(new Error('GSI load failed')); };
    document.head.appendChild(s);
  });
  return gsiPromise;
}

// Inline official Google "G" mark. Avoids a CDN dependency and renders
// instantly even on a cold load.
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
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  // The hidden container where Google renders its own real button. We
  // size it to 0 and clip it visually; a click on our custom button
  // dispatches a click on the Google button inside, which triggers
  // Google's own account-picker popup — no FedCM prompt() required.
  const hiddenRef = useRef(null);
  const initedFor = useRef(null);

  const handleCredential = useCallback((resp) => {
    setLoading(false);
    if (!resp || !resp.credential) {
      onError && onError(new Error('no credential'));
      return;
    }
    onSuccess && onSuccess({ credential: resp.credential });
  }, [onSuccess, onError]);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGsi().then((google) => {
      if (cancelled) return;

      // Initialise once per client id. Subsequent button mounts reuse
      // the existing callback; if initialize runs a second time Google
      // simply overwrites the previous config.
      if (initedFor.current !== clientId) {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: handleCredential,
          // Opt into FedCM to avoid the deprecation warnings when the
          // SDK falls back to legacy cookies.
          use_fedcm_for_prompt: true,
          auto_select: false,
          ux_mode: 'popup',
        });
        initedFor.current = clientId;
      }

      // Render Google's real button inside our hidden slot. This is
      // what actually wires up the popup account picker.
      if (hiddenRef.current) {
        hiddenRef.current.innerHTML = '';
        google.accounts.id.renderButton(hiddenRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          width: 300,
          logo_alignment: 'left',
        });
      }

      setReady(true);
    }).catch((err) => {
      console.error('[gsi load]', err);
      if (!cancelled && onError) onError(err);
    });

    return () => { cancelled = true; };
  }, [clientId, handleCredential, onError]);

  function onCustomClick() {
    if (!ready || disabled) return;
    // Find the real Google button inside our hidden container and
    // dispatch a click on it. This opens Google's own account-picker
    // popup without us having to manage OAuth redirects.
    const root = hiddenRef.current;
    if (!root) return;
    const realBtn = root.querySelector('div[role="button"]') || root.querySelector('button') || root.firstElementChild;
    if (!realBtn) {
      onError && onError(new Error('google_button_missing'));
      return;
    }
    setLoading(true);
    realBtn.click();
    // If Google's popup is blocked or dismissed we never get a callback;
    // relax the loading flag after a short while so the UI recovers.
    setTimeout(() => setLoading(false), 4000);
  }

  if (!clientId) return null;

  return (
    <div style={{ position: 'relative', width: '100%' }}>
      {/* Our styled wrapper — visible to the user. */}
      <button
        type="button"
        onClick={onCustomClick}
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

      {/* The real Google button lives here — visually hidden but in the
          accessibility tree + interactive so .click() on it triggers
          Google's flow. We can't use display:none (Google refuses to
          render into a display:none node) so we clip it instead. */}
      <div
        ref={hiddenRef}
        aria-hidden="true"
        style={{
          position: 'absolute', left: 0, top: 0,
          width: 1, height: 1, overflow: 'hidden',
          opacity: 0, pointerEvents: 'none',
        }}
      />
    </div>
  );
}
