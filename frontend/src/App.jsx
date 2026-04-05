import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
      <Route path="/" element={user ? <Navigate to={user.role === 'partner' ? '/partner/referrals' : '/dashboard'} /> : <LandingPage />} />
      <Route path="/apply" element={<PublicApplyPage />} />
      <Route path="/setup-password/:token" element={<SetupPasswordPage />} />
      <Route path="/login" element={user ? <Navigate to={user.role === 'partner' ? '/partner/referrals' : '/dashboard'} /> : <LoginPage />} />

      {/* Admin / Commercial */}
      <Route path="/dashboard" element={<ProtectedRoute allowedRoles={['admin', 'commercial']}><Layout><DashboardPage /></Layout></ProtectedRoute>} />
      <Route path="/referrals" element={<ProtectedRoute allowedRoles={['admin', 'commercial']}><Layout><ReferralsPage /></Layout></ProtectedRoute>} />
      <Route path="/commissions" element={<ProtectedRoute allowedRoles={['admin', 'commercial']}><Layout><CommissionsPage /></Layout></ProtectedRoute>} />
      <Route path="/partners" element={<ProtectedRoute allowedRoles={['admin', 'commercial']}><Layout><PartnersPage /></Layout></ProtectedRoute>} />
      <Route path="/applications" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AdminApplicationsPage /></Layout></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute allowedRoles={['admin']}><Layout><AdminSettingsPage /></Layout></ProtectedRoute>} />
      <Route path="/messaging" element={<ProtectedRoute><Layout><MessagingPage /></Layout></ProtectedRoute>} />

      {/* Partner */}
      <Route path="/partner/referrals" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerMyReferrals /></Layout></ProtectedRoute>} />
      <Route path="/partner/submit" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerSubmitPage /></Layout></ProtectedRoute>} />
      <Route path="/partner/payments" element={<ProtectedRoute allowedRoles={['partner']}><Layout><PartnerPaymentsPage /></Layout></ProtectedRoute>} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
