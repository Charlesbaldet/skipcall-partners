import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

// ePrivacy / GDPR consent gate. Renders fixed at the bottom of the
// viewport when localStorage `cookie_consent` is null. On accept,
// persists the flag and dynamically injects GA4. On reject, persists
// the flag and never touches GA. The footer "Gérer les cookies" link
// clears the flag + reloads, which makes the banner reappear.
//
// Returning visitors who already accepted: we call loadGA() at module
// load (see ensureConsentLoaded below) so analytics keep firing
// without a banner round-trip.

const GA_MEASUREMENT_ID = 'G-MJY1N13L2S';

export function loadGA() {
  if (typeof window === 'undefined') return;
  if (window.__gaLoaded) return;
  window.__gaLoaded = true;
  const s = document.createElement('script');
  s.defer = true;
  s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_MEASUREMENT_ID;
  document.head.appendChild(s);
  s.onload = () => {
    window.dataLayer = window.dataLayer || [];
    function gtag() { window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_MEASUREMENT_ID);
  };
}

// Call this once at app bootstrap so previously-consenting visitors
// get GA loaded automatically without seeing the banner again.
export function ensureConsentLoaded() {
  if (typeof window === 'undefined') return;
  try {
    if (localStorage.getItem('cookie_consent') === 'accepted') {
      loadGA();
    }
  } catch {
    // localStorage may throw in private mode — fail closed (no GA).
  }
}

export default function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem('cookie_consent');
      if (v === null || v === undefined) setVisible(true);
    } catch {
      // private mode → don't show banner (we can't persist anyway).
    }
  }, []);

  if (!visible) return null;

  const accept = () => {
    try { localStorage.setItem('cookie_consent', 'accepted'); } catch {}
    setVisible(false);
    loadGA();
  };
  const reject = () => {
    try { localStorage.setItem('cookie_consent', 'rejected'); } catch {}
    setVisible(false);
  };

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={t('cookies.banner_text', 'Nous utilisons des cookies pour améliorer votre expérience.')}
      style={{
        position: 'fixed',
        left: 16,
        right: 16,
        bottom: 16,
        zIndex: 9999,
        background: '#ffffff',
        color: '#0f172a',
        border: '1px solid #e2e8f0',
        borderRadius: 14,
        boxShadow: '0 10px 40px rgba(15, 23, 42, 0.18)',
        padding: '16px 20px',
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
        maxWidth: 920,
        margin: '0 auto',
      }}
    >
      <div style={{ flex: '1 1 280px', fontSize: 14, lineHeight: 1.5, color: '#334155' }}>
        {t('cookies.banner_text', 'Nous utilisons des cookies pour améliorer votre expérience.')}{' '}
        <a
          href="/legal#cookies"
          style={{ color: '#059669', textDecoration: 'underline', fontWeight: 600 }}
        >
          {t('cookies.banner_link', 'En savoir plus')}
        </a>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={reject}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: '1.5px solid #cbd5e1',
            background: 'transparent',
            color: '#0f172a',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('cookies.reject', 'Refuser')}
        </button>
        <button
          type="button"
          onClick={accept}
          style={{
            padding: '10px 18px',
            borderRadius: 10,
            border: 'none',
            background: '#059669',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t('cookies.accept', 'Accepter')}
        </button>
      </div>
    </div>
  );
}
