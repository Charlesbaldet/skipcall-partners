import { Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ReferralsPage from './pages/ReferralsPage';
import CommissionsPage from './pages/CommissionsPage';
import PartnersPage from './pages/PartnersPage';
import PartnerSubmitPage from './pages/PartnerSubmitPage';
import PartnerMyReferrals from './pages/PartnerMyReferrals';
import PartnerPaymentsPage from './pages/PartnerPaymentsPage';
import MessagingPage from './pages/MessagingPage';
import Layout from './components/Layout';

function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

function AppRoutes() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to="/" replace /> : <LoginPage />} />

      {/* Internal routes */}
      <Route path="/" element={
        <ProtectedRoute roles={['admin', 'commercial']}>
          <Layout><DashboardPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/referrals" element={
        <ProtectedRoute roles={['admin', 'commercial']}>
          <Layout><ReferralsPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/commissions" element={
        <ProtectedRoute roles={['admin', 'commercial']}>
          <Layout><CommissionsPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/partners" element={
        <ProtectedRoute roles={['admin']}>
          <Layout><PartnersPage /></Layout>
        </ProtectedRoute>
      } />

      {/* Partner routes */}
      <Route path="/partner/submit" element={
        <ProtectedRoute roles={['partner']}>
          <Layout><PartnerSubmitPage /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/partner/referrals" element={
        <ProtectedRoute roles={['partner']}>
          <Layout><PartnerMyReferrals /></Layout>
        </ProtectedRoute>
      } />
      <Route path="/partner/payments" element={
        <ProtectedRoute roles={['partner']}>
          <Layout><PartnerPaymentsPage /></Layout>
        </ProtectedRoute>
      } />

      {/* Messaging (all roles) */}
      <Route path="/messaging" element={
        <ProtectedRoute roles={['admin', 'commercial', 'partner']}>
          <Layout><MessagingPage /></Layout>
        </ProtectedRoute>
      } />

      {/* Redirect based on role */}
      <Route path="*" element={<Navigate to={user?.role === 'partner' ? '/partner/submit' : '/'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f1f5f9' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 800, color: '#fff', margin: '0 auto 16px', animation: 'pulse 1.5s infinite' }}>S</div>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Chargement...</p>
      </div>
    </div>
  );
}
