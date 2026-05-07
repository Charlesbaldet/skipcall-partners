import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { TenantProvider } from './hooks/useTenant.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { DialogsHost } from './components/Dialogs.jsx';

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
const BlogPage                    = lazy(() => import('./pages/BlogPage.jsx'));
const BlogPostPage                = lazy(() => import('./pages/BlogPostPage.jsx'));
const MarketplacePage             = lazy(() => import('./pages/MarketplacePage.jsx'));
const MarketplaceProgramPage      = lazy(() => import('./pages/MarketplaceProgramPage.jsx'));
const PricingPage                 = lazy(() => import('./pages/PricingPage.jsx'));
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

// Suspense fallback. Same visual as the auth-loading state inside
// ProtectedRoute so the eye doesn't flicker between two grey screens
// when navigating from a public route to a protected one.
function PageLoading() {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: '100vh', color: '#94a3b8', fontFamily: 'inherit',
    }}>
      Chargement…
    </div>
  );
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

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <>
    <RouteCanonical />
    <Suspense fallback={<PageLoading />}>
    <Routes>
      {/* Public pages */}
      <Route path="/" element={user ? <Navigate to={user.role === 'partner' ? '/partner/dashboard' : user.role === 'superadmin' ? '/super-admin' : '/dashboard'} /> : <LandingPage />} />
      <Route path="/ref/:code" element={<PublicTrackingPage />} />
      <Route path="/apply" element={<PublicApplyPage />} />
      {/* /apply/:slug is what the marketplace "Postuler au programme"
          buttons link to. PublicApplyPage already reads :slug via
          useParams; we just need the parameterized route registered
          so React Router doesn't fall through to the 404. */}
      <Route path="/apply/:slug" element={<PublicApplyPage />} />
          {/* /r/:slug is handled server-side — Vercel rewrites it to the
              Railway backend which logs the click then 302s to the tenant's
              website. Kept as a no-op route so dev environments without
              the rewrite fall back to the legacy React component. */}
          <Route path="/r/:slug" element={<PublicReferralRedirectPage />} />
      <Route path="/setup-password/:token" element={<SetupPasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/marketplace/:slug" element={<MarketplaceProgramPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/cgv"             element={<LegalPage which="cgv" />} />
        <Route path="/confidentialite" element={<LegalPage which="confidentialite" />} />
        <Route path="/mentions-legales" element={<LegalPage which="mentions-legales" />} />
        <Route path="/rgpd"            element={<LegalPage which="rgpd" />} />
        <Route path="/login" element={user ? <Navigate to={user.role === 'partner' ? '/partner/dashboard' : user.role === 'superadmin' ? '/super-admin' : '/dashboard'} /> : <LoginPage />} />

      {/* Admin / Commercial */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><DashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/referrals" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><ReferralsPage /></Layout></ProtectedRoute>} />
      <Route path="/commissions" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><CommissionsPage /></Layout></ProtectedRoute>} />
      <Route path="/trash" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><TrashPage /></Layout></ProtectedRoute>} />
      <Route path="/partners" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><PartnersPage /></Layout></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AdminApplicationsPage /></Layout></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><AdminSettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['superadmin']}><Layout><SuperAdminPage /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
        <Route path="/marketplace-admin" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><MarketplaceEditorPage /></Layout></ProtectedRoute>} />
        <Route path="/progression" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><ProgressionPage /></Layout></ProtectedRoute>} />
      {/* Billing now lives inside Settings as the "Facturation" tab.
          The bare /billing URL stays valid (existing emails, billing
          portal redirects) by 301-equivalent forwarding to
          /settings?tab=billing while preserving any Stripe-callback
          query string (?session_id, ?canceled, etc). */}
      <Route path="/billing" element={<BillingRedirect />} />
      <Route path="/programme" element={<ProtectedRoute><Layout><ProgrammePage /></Layout></ProtectedRoute>} />
      <Route path="/messaging" element={<ProtectedRoute><Layout><MessagingPage /></Layout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><Layout><SearchPage /></Layout></ProtectedRoute>} />
      <Route path="/news" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><NewsPage /></Layout></ProtectedRoute>} />

      {/* Partner */}
      <Route path="/partner/dashboard" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerDashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/partner/referrals" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerMyReferrals /></Layout></ProtectedRoute>} />
      {/* Legacy /partner/submit route kept as a redirect to the
          referrals page with ?submit=1 — the form now lives in a
          modal opened from the Mes Referrals header. Old emails,
          deep links, and bookmarks still resolve. */}
      <Route path="/partner/submit" element={<Navigate to="/partner/referrals?submit=1" replace />} />
      <Route path="/partner/payments" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerPaymentsPage /></Layout></ProtectedRoute>} />
      <Route path="/partner/news" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerNewsPage /></Layout></ProtectedRoute>} />
              <Route path="/fonctionnalites/pipeline" element={<FeaturePipelinePage />} />
          <Route path="/fonctionnalites/commissions" element={<FeatureCommissionsPage />} />
          <Route path="/fonctionnalites/analytics" element={<FeatureAnalyticsPage />} />
          <Route path="/fonctionnalites/personnalisation" element={<FeaturePersonnalisationPage />} />
          <Route path="/fonctionnalites/tracking" element={<FeatureTrackingPage />} />
          <Route path="/cas-dusage" element={<UseCasesIndexPage />} />
          <Route path="/cas-dusage/saas-b2b" element={<UseCaseSaasB2BPage />} />
          <Route path="/cas-dusage/cabinet-conseil" element={<UseCaseCabinetConseilPage />} />
          <Route path="/cas-dusage/startup" element={<UseCaseStartupPage />} />
          <Route path="/cas-dusage/reseau-distribution" element={<UseCaseDistributionPage />} />
          <Route path="/cas-dusage/marketplace-plateforme" element={<UseCaseMarketplacePage />} />
          <Route path="/cas-dusage/agence-marketing" element={<UseCaseAgencePage />} />
          <Route path="/integrations" element={<IntegrationsIndexPage />} />
          <Route path="/integrations/:slug" element={<IntegrationDetailPage />} />
          </Routes>
    </Suspense>
    </>
  );
}

export default function App() {
  return (

      <TenantProvider><AuthProvider>
        <AppRoutes />
        <DialogsHost />
      </AuthProvider></TenantProvider>

  );
}
