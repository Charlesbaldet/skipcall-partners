import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import PublicApplyPage from './PublicApplyPage.jsx';

// Router target for /r/:slug. If the URL carries ?ref=REF-XXXX the page
// pings the track endpoint, drops a 30-day cookie, and redirects to the
// tenant's configured landing page (falls back to a branded interstitial
// when no redirect URL is set). With no `ref` query param it defers to
// the existing PublicApplyPage (partner application flow).
export default function PublicReferralRedirectPage() {
  const { slug } = useParams();
  const [search] = useSearchParams();
  const ref = search.get('ref');
  const [status, setStatus] = useState('loading');
  const [tenantName, setTenantName] = useState('');
  const [fallbackUrl, setFallbackUrl] = useState(null);

  useEffect(() => {
    if (!ref) return;
    const code = ref.toUpperCase();
    const cookieDays = 30;
    document.cookie = `refboost_ref=${encodeURIComponent(code)};max-age=${cookieDays * 24 * 60 * 60};path=/;SameSite=Lax`;

    // Best-effort track. We don't block on the response — the cookie
    // drop + redirect are what matter.
    fetch(`/api/referral-links/track?ref=${encodeURIComponent(code)}&tenant=${encodeURIComponent(slug || '')}&landing=${encodeURIComponent(location.href)}`, {
      mode: 'cors',
      keepalive: true,
    }).catch(() => {});

    // Look up the tenant's redirect URL via the public tenant config.
    fetch(`/api/tenants/public/${encodeURIComponent(slug || '')}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        const redirect = d?.tenant?.tracking_redirect_url;
        const name = d?.tenant?.name || slug || '';
        setTenantName(name);
        if (redirect) {
          window.location.replace(redirect);
        } else {
          setFallbackUrl(null);
          setStatus('noredirect');
        }
      })
      .catch(() => setStatus('noredirect'));
  }, [ref, slug]);

  // No ?ref → this is a partner application short-link. Defer to the
  // existing page so we don't break the /r/:slug apply flow.
  if (!ref) return <PublicApplyPage />;

  if (status === 'loading') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b', fontFamily: 'system-ui, sans-serif' }}>
        Redirection…
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'system-ui, sans-serif', background: 'linear-gradient(135deg, #f0fdf4, #ecfdf5)' }}>
      <div style={{ background: '#fff', borderRadius: 16, padding: 40, maxWidth: 480, textAlign: 'center', boxShadow: '0 10px 40px rgba(15,23,42,0.08)' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>👋</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0f172a', marginBottom: 10 }}>
          You've been referred by a partner of {tenantName || 'RefBoost'}
        </h1>
        <p style={{ color: '#64748b', fontSize: 15, lineHeight: 1.5, marginBottom: 24 }}>
          Your referral has been recorded. Please continue to the partner's website to finish signing up.
        </p>
        {fallbackUrl && (
          <a href={fallbackUrl} style={{ display: 'inline-block', padding: '12px 28px', background: '#059669', color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 600 }}>
            Continue
          </a>
        )}
      </div>
    </div>
  );
}
