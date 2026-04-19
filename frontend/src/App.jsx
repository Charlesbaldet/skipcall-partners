import SignupPage from './pages/SignupPage.jsx';
import ForgotPasswordPage from './pages/ForgotPasswordPage.jsx';
import ResetPasswordPage from './pages/ResetPasswordPage.jsx';
import { Routes, Route, Navigate } from 'react-router-dom';
import { TenantProvider } from './hooks/useTenant.jsx';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import Layout from './components/Layout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import ReferralsPage from './pages/ReferralsPage.jsx';
import CommissionsPage from './pages/CommissionsPage.jsx';
import PartnersPage from './pages/PartnersPage.jsx';
import PartnerMyReferrals from './pages/PartnerMyReferrals.jsx';
import PartnerSubmitPage from './pages/PartnerSubmitPage.jsx';
import PartnerPaymentsPage from './pages/PartnerPaymentsPage.jsx';
import MessagingPage from './pages/MessagingPage.jsx';
import LandingPage from './pages/LandingPage.jsx';
import PublicApplyPage from './pages/PublicApplyPage.jsx';
import SetupPasswordPage from './pages/SetupPasswordPage.jsx';
import AdminApplicationsPage from './pages/AdminApplicationsPage.jsx';
import AdminSettingsPage from './pages/AdminSettingsPage.jsx';
import SuperAdminPage from './pages/SuperAdminPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import ProgrammePage from './pages/ProgrammePage.jsx';
import PublicTrackingPage from './pages/PublicTrackingPage.jsx';
import BlogPage from './pages/BlogPage.jsx';
import BlogPostPage from './pages/BlogPostPage.jsx';
import MarketplacePage from './pages/MarketplacePage.jsx';
import FeaturePipelinePage from './pages/features/FeaturePipelinePage';
import FeatureCommissionsPage from './pages/features/FeatureCommissionsPage';
import FeatureAnalyticsPage from './pages/features/FeatureAnalyticsPage';
import FeaturePersonnalisationPage from './pages/features/FeaturePersonnalisationPage';
import FeatureTrackingPage from './pages/features/FeatureTrackingPage';
import NewsPage from './pages/NewsPage.jsx';
import PartnerNewsPage from './pages/PartnerNewsPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import BillingPage from './pages/BillingPage.jsx';
import PricingPage from './pages/PricingPage.jsx';
import SearchPage from './pages/SearchPage.jsx';

function ProtectedRoute({ children, allowedRoles }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', color: '#94a3b8' }}>Chargement...</div>;
  if (!user) return <Navigate to="/login" />;
  if (allowedRoles && !allowedRoles.includes(user.role)) return <Navigate to="/" />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return null;

  return (
    <Routes>
      {/* Public pages */}
      <Route path="/" element={user ? <Navigate to={user.role === 'partner' ? '/partner/referrals' : user.role === 'superadmin' ? '/super-admin' : '/dashboard'} /> : <LandingPage />} />
      <Route path="/ref/:code" element={<PublicTrackingPage />} />
      <Route path="/apply" element={<PublicApplyPage />} />
          <Route path="/r/:slug" element={<PublicApplyPage />} />
      <Route path="/setup-password/:token" element={<SetupPasswordPage />} />
      <Route path="/signup" element={<SignupPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
        <Route path="/blog" element={<BlogPage />} />
        <Route path="/blog/:slug" element={<BlogPostPage />} />
        <Route path="/marketplace" element={<MarketplacePage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="/login" element={user ? <Navigate to={user.role === 'partner' ? '/partner/referrals' : user.role === 'superadmin' ? '/super-admin' : '/dashboard'} /> : <LoginPage />} />

      {/* Admin / Commercial */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><DashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/referrals" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><ReferralsPage /></Layout></ProtectedRoute>} />
      <Route path="/commissions" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><CommissionsPage /></Layout></ProtectedRoute>} />
      <Route path="/partners" element={<ProtectedRoute allowedRoles={['admin', 'commercial', 'superadmin']}><Layout><PartnersPage /></Layout></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AdminApplicationsPage /></Layout></ProtectedRoute>} />
        <Route path="/admin/settings" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><AdminSettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/super-admin" element={<ProtectedRoute allowedRoles={['superadmin']}><Layout><SuperAdminPage /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Layout><SettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><BillingPage /></Layout></ProtectedRoute>} />
      <Route path="/programme" element={<ProtectedRoute><Layout><ProgrammePage /></Layout></ProtectedRoute>} />
      <Route path="/messaging" element={<ProtectedRoute><Layout><MessagingPage /></Layout></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute><Layout><NotificationsPage /></Layout></ProtectedRoute>} />
      <Route path="/search" element={<ProtectedRoute><Layout><SearchPage /></Layout></ProtectedRoute>} />
      <Route path="/news" element={<ProtectedRoute allowedRoles={['admin', 'superadmin']}><Layout><NewsPage /></Layout></ProtectedRoute>} />

      {/* Partner */}
      <Route path="/partner/referrals" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerMyReferrals /></Layout></ProtectedRoute>} />
      <Route path="/partner/submit" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerSubmitPage /></Layout></ProtectedRoute>} />
      <Route path="/partner/payments" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerPaymentsPage /></Layout></ProtectedRoute>} />
      <Route path="/partner/news" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerNewsPage /></Layout></ProtectedRoute>} />
              <Route path="/fonctionnalites/pipeline" element={<FeaturePipelinePage />} />
          <Route path="/fonctionnalites/commissions" element={<FeatureCommissionsPage />} />
          <Route path="/fonctionnalites/analytics" element={<FeatureAnalyticsPage />} />
          <Route path="/fonctionnalites/personnalisation" element={<FeaturePersonnalisationPage />} />
          <Route path="/fonctionnalites/tracking" element={<FeatureTrackingPage />} />
          </Routes>
  );
}

export default function App() {
  return (

      <TenantProvider><AuthProvider>
        <AppRoutes />
      </AuthProvider></TenantProvider>

  );
}
