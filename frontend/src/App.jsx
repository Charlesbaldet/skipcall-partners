import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import { TenantProvider } from './hooks/useTenant.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import useInactivityTimeout from './hooks/useInactivityTimeout.jsx';
import { DialogsHost } from './components/Dialogs.jsx';
import CookieConsentBanner from './components/CookieConsentBanner.jsx';

// ── Eager: landing + login ────────────────────────────────────────────
// LandingPage carries the SEO-critical homepage Helmet (Software
// Application JSON-LD) and is the most-visited route, so a Suspense
// flash here would hurt FCP/LCP for the very metric PageSpeed scores.
// LoginPage is the conversion funnel and tiny — keep it eager too.
// Layout sits inside the protected routes, but stays eager because
// every protected page wraps in <Layout> (lazy-loading it would
// just postpone the same 100 KB chunk by one tick).
import LandingPage from './pages/LandingPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import Layout from './components/Layout.jsx';

// ── Lazy: everything else ─────────────────────────────────────────────
// Auth-protected app pages are heavy (recharts, kanban, the 3000-
// line SettingsPage) and only logged-in users need them. Public
// marketing pages (Blog, Pricing, /fonctionnalites/*, /cas-dusage/*)
// are also lazy because their first paint comes from the static
// SPA shell + Vercel-edge meta injection — the JS chunk only
// hydrates the React tree, so a Suspense flash doesn't cost any
// SEO. Each lazy() call corresponds to one route-level chunk that
// downloads on demand.
const SignupPage           = lazy(() => import('./pages/SignupPage.jsx'));
const ForgotPasswordPage   = lazy(() => import('./pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage    = lazy(() => import('./pages/ResetPasswordPage.jsx'));
const SetupPasswordPage    = lazy(() => import('./pages/SetupPasswordPage.jsx'));

const DashboardPage        = lazy(() => import('./pages/DashboardPage.jsx'));
const ReferralsPage        = lazy(() => import('./pages/ReferralsPage.jsx'));
const CommissionsPage      = lazy(() => import('./pages/CommissionsPage.jsx'));
const TrashPage            = lazy(() => import('./pages/TrashPage.jsx'));
const PartnersPage         = lazy(() => import('./pages/PartnersPage.jsx'));
const PartnerMyReferrals   = lazy(() => import('./pages/PartnerMyReferrals.jsx'));
const PartnerDashboardPage = lazy(() => import('./pages/PartnerDashboardPage.jsx'));
const PartnerPaymentsPage  = lazy(() => import('./pages/PartnerPaymentsPage.jsx'));
const MessagingPage        = lazy(() => import('./pages/MessagingPage.jsx'));
const SettingsPage         = lazy(() => import('./pages/SettingsPage.jsx'));
const MarketplaceEditorPage = lazy(() => import('./pages/MarketplaceEditorPage.jsx'));
const ProgrammePage        = lazy(() => import('./pages/ProgrammePage.jsx'));
const ProgressionPage      = lazy(() => import('./pages/ProgressionPage.jsx'));
const AdminApplicationsPage = lazy(() => import('./pages/AdminApplicationsPage.jsx'));
const AdminSettingsPage    = lazy(() => import('./pages/AdminSettingsPage.jsx'));
const SuperAdminPage       = lazy(() => import('./pages/SuperAdminPage.jsx'));
const NewsPage             = lazy(() => import('./pages/NewsPage.jsx'));
const PartnerNewsPage      = lazy(() => import('./pages/PartnerNewsPage.jsx'));
const NotificationsPage    = lazy(() => import('./pages/NotificationsPage.jsx'));
const SearchPage           = lazy(() => import('./pages/SearchPage.jsx'));

const PublicApplyPage             = lazy(() => import('./pages/PublicApplyPage.jsx'));
const PublicReferralRedirectPage  = lazy(() => import('./pages/PublicReferralRedirectPage.jsx'));
const PublicTrackingPage          = lazy(() => import('./pages/PublicTrackingPage.jsx'));
const LegalPage                   = lazy(() => import('./pages/LegalPage.jsx'));
const SecurityPage                = lazy(() => import('./pages/SecurityPage.jsx'));
const DPAPage                     = lazy(() => import('./pages/DPAPage.jsx'));
const BlogPage                    = lazy(() => import('./pages/BlogPage.jsx'));
const BlogPostPage                = lazy(() => import('./pages/BlogPostPage.jsx'));
const MarketplacePage             = lazy(() => import('./pages/MarketplacePage.jsx'));
const MarketplaceProgramPage      = lazy(() => import('./pages/MarketplaceProgramPage.jsx'));
const PricingPage                 = lazy(() => import('./pages/PricingPage.jsx'));
const StatusPage                  = lazy(() => import('./pages/StatusPage.jsx'));
const FeaturePipelinePage         = lazy(() => import('./pages/features/FeaturePipelinePage'));
const FeatureCommissionsPage      = lazy(() => import('./pages/features/FeatureCommissionsPage'));
const FeatureAnalyticsPage        = lazy(() => import('./pages/features/FeatureAnalyticsPage'));
const FeaturePersonnalisationPage = lazy(() => import('./pages/features/FeaturePersonnalisationPage'));
const FeatureTrackingPage         = lazy(() => import('./pages/features/FeatureTrackingPage'));
const UseCaseSaasB2BPage          = lazy(() => import('./pages/usecases/UseCaseSaasB2BPage'));
const UseCaseCabinetConseilPage   = lazy(() => import('./pages/usecases/UseCaseCabinetConseilPage'));
const UseCaseStartupPage          = lazy(() => import('./pages/usecases/UseCaseStartupPage'));
const UseCaseDistributionPage     = lazy(() => import('./pages/usecases/UseCaseDistributionPage'));
const UseCaseMarketplacePage      = lazy(() => import('./pages/usecases/UseCaseMarketplacePage'));
const UseCaseAgencePage           = lazy(() => import('./pages/usecases/UseCaseAgencePage'));
const UseCasesIndexPage           = lazy(() => import('./pages/usecases/UseCasesIndexPage'));
const IntegrationsIndexPage       = lazy(() => import('./pages/integrations/IntegrationsIndexPage'));
const IntegrationDetailPage       = lazy(() => import('./pages/integrations/IntegrationDetailPage'));

// Per-route skeleton fallback. Sits INSIDE Layout (between the
// sidebar and the page content) so navigating /dashboard →
// /commissions never unmounts the sidebar — only the content area
// shows the placeholder. The skeleton mirrors the rough shape of
// every internal page (title row + 3-card grid) so the eye doesn't
// jump when the real content arrives.
function PageSkeleton() {
  return (
    <div style={{ padding: 24 }}>
      <style>{`
        @keyframes rb-skel-pulse { 0%,100% { opacity: .6 } 50% { opacity: 1 } }
        .rb-skel { background: #f1f5f9; border-radius: 10px; animation: rb-skel-pulse 1.4s ease-in-out infinite; }
      `}</style>
      <div className="rb-skel" style={{ width: 220, height: 28, marginBottom: 8 }} />
      <div className="rb-skel" style={{ width: 320, height: 14, marginBottom: 28 }} />
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div className="rb-skel" style={{ flex: '1 1 220px', height: 96 }} />
        <div className="rb-skel" style={{ flex: '1 1 220px', height: 96 }} />
        <div className="rb-skel" style={{ flex: '1 1 220px', height: 96 }} />
      </div>
      <div className="rb-skel" style={{ height: 220, marginTop: 20 }} />
    </div>
  );
}

// Wraps a lazy page in a per-route Suspense boundary. Every Route's
// element calls suspend(Component) so the skeleton only replaces
// the page content area when a chunk is loading — Layout (sidebar
// included) stays mounted because it sits OUTSIDE this Suspense.
function suspend(Component) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Component />
    </Suspense>
  );
}

// Variant for routes that pass a literal prop to a lazy component
// (LegalPage takes which="cgv" / "confidentialite" / etc.). The
// helper above can't carry props through, so this one accepts the
// already-instantiated element.
function suspendElement(element) {
  return <Suspense fallback={<PageSkeleton />}>{element}</Suspense>;
}

// Background prefetch hook. After login, kick off the import() for
// the next-likely pages so subsequent navigation hits the browser
// cache instead of triggering a fresh chunk load. 2 s delay so we
// never compete with first-paint of the landing destination
// (/dashboard or /partner/dashboard).
function usePrefetchAppChunks(user) {
  useEffect(() => {
    if (!user) return;
    const role = user.role;
    const t = setTimeout(() => {
      // Specifiers must match the lazy() import paths verbatim so
      // Vite resolves them to the same chunk (idempotent — calling
      // import() twice on the same module returns the same Promise
      // and triggers no second network round-trip).
      if (role === 'partner') {
        import('./pages/PartnerDashboardPage.jsx');
        import('./pages/PartnerMyReferrals.jsx');
        import('./pages/PartnerPaymentsPage.jsx');
        import('./pages/PartnerNewsPage.jsx');
        import('./pages/SettingsPage.jsx');
      } else if (role === 'admin' || role === 'commercial' || role === 'superadmin') {
        import('./pages/DashboardPage.jsx');
        import('./pages/ReferralsPage.jsx');
        import('./pages/CommissionsPage.jsx');
        import('./pages/PartnersPage.jsx');
        import('./pages/SettingsPage.jsx');
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [user]);
}

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#94a3b8' }}>Chargement...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

// Billing moved into Settings as a tab. Forward /billing (+ any Stripe
// callback querystring) to /settings?tab=billing so existing deep
// links — emails, the Stripe checkout-success redirect, the Stripe
// portal return URL — keep working.
function BillingRedirect() {
  const location = useLocation();
  const search = new URLSearchParams(location.search);
  search.set('tab', 'billing');
  return <Navigate to={'/settings?' + search.toString()} replace />;
}

// Route-level canonical fallback. Mounted once above <Routes/> so
// every page gets a <link rel="canonical"> that matches its current
// pathname, even if the individual page component forgot to set one
// in its own Helmet. Per-page <Helmet><link rel="canonical">…</Helmet>
// declarations nest inside this one and win (react-helmet-async uses
// the innermost declaration for single-tag-type elements).
// Cookie banner gate — only mount on public marketing/legal routes so
// authenticated app pages (dashboard, settings, partner workspace, etc.)
// don't ship a redundant CTA every page load. Auth-protected routes
// already dropped out of the public path-prefix allow-list before they
// got a session cookie, and showing the banner there would just create
// noise.
function PublicCookieBanner() {
  const location = useLocation();
  const path = location.pathname || '/';
  const isPublic =
    path === '/' ||
    path === '/login' ||
    path === '/signup' ||
    path === '/forgot-password' ||
    path === '/reset-password' ||
    path === '/pricing' ||
    path.startsWith('/legal') ||
    path.startsWith('/blog') ||
    path.startsWith('/marketplace') ||
    path.startsWith('/fonctionnalites/') ||
    path.startsWith('/cas-dusage') ||
    path.startsWith('/integrations') ||
    path.startsWith('/apply') ||
    path.startsWith('/r/') ||
    path.startsWith('/ref/') ||
    path.startsWith('/setup-password/') ||
    path === '/cgv' ||
    path === '/confidentialite' ||
    path === '/mentions-legales' ||
    path === '/rgpd';
  if (!isPublic) return null;
  return <CookieConsentBanner />;
}

function RouteCanonical() {
  const location = useLocation();
  const base = 'https://refboost.io';
  // Strip the trailing slash off non-root paths for canonical
  // normalisation (/pricing vs /pricing/).
  const path = location.pathname.length > 1
    ? location.pathname.replace(/\/+$/, '')
    : '/';
  const href = path === '/' ? base + '/' : base + path;
  return (
    <Helmet>
      <link rel="canonical" href={href} />
      <meta property="og:url" content={href} />
    </Helmet>
  );
}

function SessionExpiredModal() {
  const { t } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const handleReconnect = async () => {
    try { await logout(); } catch {}
    navigate('/login', { replace: true });
  };
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 99999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 40, width: 420, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', fontSize: 28 }}>!</div>
        <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
          {t('session.expired_title', 'Votre session a expiré')}
        </h2>
        <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5, margin: '0 0 24px' }}>
          {t('session.expired_message', 'Pour des raisons de sécurité, vous avez été déconnecté après 30 minutes d’inactivité.')}
        </p>
        <button
          onClick={handleReconnect}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: '#059669', color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}
        >
          {t('session.expired_cta', 'Se reconnecter')}
        </button>
      </div>
    </div>
  );
}

function InactivityWatcher() {
  const { user } = useAuth();
  const { expired } = useInactivityTimeout({ active: !!user });
  if (!expired) return null;
  return <SessionExpiredModal />;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  // Background prefetch: 2 s after a user is present, kick off the
  // imports for the next-likely pages so navigation hits the
  // browser cache instead of triggering a fresh chunk fetch.
  usePrefetchAppChunks(user);
  if (loading) return null;

  return (
    <>
    <RouteCanonical />
    {/* Note: NO outer <Suspense> here. Each lazy page wraps in its
        own per-route Suspense (via suspend()) — that way the
        Suspense boundary sits INSIDE Layout for protected routes,
        so navigating /dashboard → /commissions only swaps the
        content area's skeleton in and out. The sidebar stays
        mounted because Layout is outside the Suspense boundary. */}
    <Routes>
      {/* Public pages */}
      <Route path="/" element={user ? <Navigate to={user.role === 'partner' ? '/partner/dashboard' : user.role === 'superadmin' ? '/super-admin' : '/dashboard'} /> : <LandingPage />} />
      <Route path="/ref/:code" element={suspend(PublicTrackingPage)} />
      <Route path="/apply" element={suspend(PublicApplyPage)} />
      {/* /apply/:slug is what the marketplace "Postuler au programme"
          buttons link to. PublicApplyPage already reads :slug via
          useParams; we just need the parameterized route registered
          so React Router doesn't fall through to the 404. */}
      <Route path="/apply/:slug" element={suspend(PublicApplyPage)} />
          {/* /r/:slug is handled server-side — Vercel rewrites it to the
              Railway backend which logs the click then 302s to the tenant's
              website. Kept as a no-op route so dev environments without
              the rewrite fall back to the legacy React component. */}
          <Route path="/r/:slug" element={suspend(PublicReferralRedirectPage)} />
      <Route path="/setup-password/:token" element={suspend(SetupPasswordPage)} />
      <Route path="/signup" element={suspend(SignupPage)} />
          <Route path="/forgot-password" element={suspend(ForgotPasswordPage)} />
        <Route path="/reset-password" element={suspend(ResetPasswordPage)} />
        <Route path="/blog" element={suspend(BlogPage)} />
        <Route path="/blog/:slug" element={suspend(BlogPostPage)} />
        <Route path="/marketplace" element={suspend(MarketplacePage)} />
        <Route path="/marketplace/:slug" element={suspend(MarketplaceProgramPage)} />
        <Route path="/pricing" element={suspend(PricingPage)} />
        <Route path="/security" element={suspend(SecurityPage)} />
        <Route path="/status" element={suspend(StatusPage)} />
        <Route path="/cgv"             element={suspendElement(<LegalPage which="cgv" />)} />
        <Route path="/confidentialite" element={suspendElement(<LegalPage which="confidentialite" />)} />
        <Route path="/mentions-legales" element={suspendElement(<LegalPage which="mentions-legales" />)} />
        <Route path="/rgpd"            element={suspendElement(<LegalPage which="rgpd" />)} />
        {/* /legal points at the privacy policy — the cookie consent
            banner deep-links to /legal#cookies so visitors can learn
            more without leaving the page they're on. */}
        <Route path="/legal"           element={<Navigate to="/confidentialite#cookies" replace />} />
        <Route path="/legal/dpa"       element={suspend(DPAPage)} />
        <Route path="/login" element={user ? <Navigate to={user.role === 'partner' ? '/partner/dashboard' : user.role === 'superadmin' ? '/super-admin' : '/dashboard'} /> : <LoginPage />} />

      {/* Admin / Commercial — Suspense INSIDE Layout so sidebar stays mounted */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout>{suspend(DashboardPage)}</Layout></ProtectedRoute>} />
      <Route path="/referrals" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout>{suspend(ReferralsPage)}</Layout></ProtectedRoute>} />
      <Route path="/commissions" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout>{suspend(CommissionsPage)}</Layout></ProtectedRoute>} />
      <Route path="/trash" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout>{suspend(TrashPage)}</Layout></ProtectedRoute>} />
      <Route path="/partners" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout>{suspend(PartnersPage)}</Layout></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute allowedRoles={['admin']}><Layout>{suspend(AdminApplicationsPage)}</Layout></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout>{suspend(AdminSettingsPage)}</Layout></ProtectedRoute>} />
      <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['superadmin']}><Layout>{suspend(SuperAdminPage)}</Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout>{suspend(SettingsPage)}</Layout></ProtectedRoute>} />
        <Route path="/marketplace-admin" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout>{suspend(MarketplaceEditorPage)}</Layout></ProtectedRoute>} />
        <Route path="/progression" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout>{suspend(ProgressionPage)}</Layout></ProtectedRoute>} />
      {/* Billing now lives inside Settings as the "Facturation" tab.
          The bare /billing URL stays valid (existing emails, billing
          portal redirects) by 301-equivalent forwarding to
          /settings?tab=billing while preserving any Stripe-callback
          query string (?session_id, ?canceled, etc). */}
      <Route path="/billing" element={<BillingRedirect />} />
      <Route path="/programme" element={<ProtectedRoute><Layout>{suspend(ProgrammePage)}</Layout></ProtectedRoute>} />
      <Route path="/messaging" element={<ProtectedRoute><Layout>{suspend(MessagingPage)}</Layout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Layout>{suspend(NotificationsPage)}</Layout></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><Layout>{suspend(SearchPage)}</Layout></ProtectedRoute>} />
      <Route path="/news" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout>{suspend(NewsPage)}</Layout></ProtectedRoute>} />

      {/* Partner */}
      <Route path="/partner/dashboard" element={<ProtectedRoute allowedRoles={['partner']}><Layout>{suspend(PartnerDashboardPage)}</Layout></ProtectedRoute>} />
      <Route path="/partner/referrals" element={<ProtectedRoute allowedRoles={['partner']}><Layout>{suspend(PartnerMyReferrals)}</Layout></ProtectedRoute>} />
      {/* Legacy /partner/submit route kept as a redirect to the
          referrals page with ?submit=1 — the form now lives in a
          modal opened from the Mes Referrals header. Old emails,
          deep links, and bookmarks still resolve. */}
      <Route path="/partner/submit" element={<Navigate to="/partner/referrals?submit=1" replace />} />
      <Route path="/partner/payments" element={<ProtectedRoute allowedRoles={['partner']}><Layout>{suspend(PartnerPaymentsPage)}</Layout></ProtectedRoute>} />
      <Route path="/partner/news" element={<ProtectedRoute allowedRoles={['partner']}><Layout>{suspend(PartnerNewsPage)}</Layout></ProtectedRoute>} />
              <Route path="/fonctionnalites/pipeline" element={suspend(FeaturePipelinePage)} />
          <Route path="/fonctionnalites/commissions" element={suspend(FeatureCommissionsPage)} />
          <Route path="/fonctionnalites/analytics" element={suspend(FeatureAnalyticsPage)} />
          <Route path="/fonctionnalites/personnalisation" element={suspend(FeaturePersonnalisationPage)} />
          <Route path="/fonctionnalites/tracking" element={suspend(FeatureTrackingPage)} />
          <Route path="/cas-dusage" element={suspend(UseCasesIndexPage)} />
          <Route path="/cas-dusage/saas-b2b" element={suspend(UseCaseSaasB2BPage)} />
          <Route path="/cas-dusage/cabinet-conseil" element={suspend(UseCaseCabinetConseilPage)} />
          <Route path="/cas-dusage/startup" element={suspend(UseCaseStartupPage)} />
          <Route path="/cas-dusage/reseau-distribution" element={suspend(UseCaseDistributionPage)} />
          <Route path="/cas-dusage/marketplace-plateforme" element={suspend(UseCaseMarketplacePage)} />
          <Route path="/cas-dusage/agence-marketing" element={suspend(UseCaseAgencePage)} />
          <Route path="/integrations" element={suspend(IntegrationsIndexPage)} />
          <Route path="/integrations/:slug" element={suspend(IntegrationDetailPage)} />
          </Routes>
    </>
  );
}

export default function App() {
  return (

      <TenantProvider><AuthProvider>
        <AppRoutes />
        <PublicCookieBanner />
        <InactivityWatcher />
        <DialogsHost />
      </AuthProvider></TenantProvider>

  );
}
