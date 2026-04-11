import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import ChangePasswordModal from './ChangePasswordModal';
import api from '../lib/api';
import {
  LayoutDashboard, FileText, DollarSign, Users, Send,
  MessageCircle, LogOut, ChevronLeft, ChevronRight,
  UserPlus, Settings, Globe, Activity, Shield,
} from 'lucide-react';

// ─── RefBoost design tokens (sync avec LandingPage) ───
const C = {
  p: 'var(--rb-primary, #059669)',
  pl: 'var(--rb-primary-light, #10b981)',
  pd: 'var(--rb-primary-dark, #047857)',
  s: '#0f172a',
  sl: '#1e293b',
  a: 'var(--rb-accent, #f97316)',
  al: 'var(--rb-accent-light, #fb923c)',
  m: '#64748b',
};

// RefBoost Logo SVG (compact version pour le sidebar)
function RefBoostLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs>
        <linearGradient id="lg-sidebar" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor={C.p} />
          <stop offset="100%" stopColor={C.pl} />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="14" fill="url(#lg-sidebar)" />
      <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white" />
      <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9" />
    </svg>
  );
}

const ADMIN_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/referrals', icon: FileText, label: 'Pipeline' },
  { to: '/commissions', icon: DollarSign, label: 'Commissions' },
  { to: '/partners', icon: Users, label: 'Partenaires' },
  { to: '/messaging', icon: MessageCircle, label: 'Messagerie', badge: 'messages' },
  { divider: true },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

const PARTNER_NAV = [
  { to: '/partner/referrals', icon: FileText, label: 'Mes Referrals' },
  { to: '/partner/submit', icon: Send, label: 'Soumettre' },
  { to: '/partner/payments', icon: DollarSign, label: 'Mes Paiements' },
  { to: '/messaging', icon: MessageCircle, label: 'Messagerie', badge: 'messages' },
  { divider: true },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

const SUPERADMIN_NAV = [
  { to: '/super-admin', icon: Shield, label: 'Plateforme' },
  { divider: true },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

export default function Layout({ children }) {
  const { user, logout, setUser } = useAuth();
  const handlePasswordChanged = () => {
    if (user) setUser({ ...user, mustChangePassword: false });
  };
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingApps, setPendingApps] = useState(0);
  const [tenant, setTenant] = useState(typeof window !== 'undefined' ? window.__rbTenant : null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => setTenant(e.detail || window.__rbTenant);
    window.addEventListener('rb-theme-loaded', handler);
    return () => window.removeEventListener('rb-theme-loaded', handler);
  }, []);

  const isSuperAdmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  const nav = isSuperAdmin ? SUPERADMIN_NAV : user?.role === 'partner' ? PARTNER_NAV : ADMIN_NAV;

  // Fetch notification counts (skip for superadmin)
  useEffect(() => {
    if (isSuperAdmin) return;
    const fetchCounts = async () => {
      try {
        const msgData = await api.getUnreadCount();
        setUnread(msgData.count || 0);
      } catch (e) {}
      if (isAdmin) {
        try {
          const appData = await api.getApplications('pending');
          setPendingApps((appData.applications || []).length);
        } catch (e) {}
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) {
      document.title = 'RefBoost - Super Admin';
      return;
    }
    const total = unread + pendingApps;
    document.title = total > 0
      ? `(${total}) RefBoost - Programme Partenaires`
      : 'RefBoost - Programme Partenaires';
  }, [unread, pendingApps, isSuperAdmin, tenant]);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const s = {
    sidebar: {
      width: collapsed ? 68 : 200,
      minWidth: collapsed ? 68 : 200,
      background: isSuperAdmin ? '#1a1a2e' : C.s,
      color: '#fff',
      display: 'flex',
      flexDirection: 'column',
      transition: 'all 0.2s ease',
      height: '100vh',
      position: 'fixed',
      left: 0,
      top: 0,
      zIndex: 50,
    },
    link: {
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '10px 16px',
      borderRadius: 10,
      color: '#94a3b8',
      textDecoration: 'none',
      fontSize: 14,
      fontWeight: 500,
      transition: 'all 0.15s',
      margin: '2px 8px',
    },
    activeLink: {
      background: isSuperAdmin
        ? 'linear-gradient(135deg, rgba(220,38,38,0.2), rgba(239,68,68,0.15))'
        : `linear-gradient(135deg, ${C.p}33, ${C.pl}26)`,
      color: '#fff',
    },
  };

  const getBadge = (item) => {
    if (item.badge === 'messages' && unread > 0) return unread;
    if (item.badge === 'applications' && pendingApps > 0) return pendingApps;
    return 0;
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      <aside style={s.sidebar}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          {isSuperAdmin ? (
            <div style={{
              width: 36, height: 36, borderRadius: 11, flexShrink: 0,
              background: 'linear-gradient(135deg, #dc2626, #ef4444)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 0 20px rgba(220,38,38,0.3)',
            }}>
              <Shield size={18} color="#fff" />
            </div>
          ) : (
            <div style={{
              flexShrink: 0,
              filter: `drop-shadow(0 0 16px ${C.p}40)`,
            }}>
              {tenant?.logo_url ? <img src={tenant.logo_url} alt="Logo" style={{ height: 36, maxWidth: 110, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }} /> : <RefBoostLogo size={36} />}
            </div>
          )}
          {!collapsed && (
            <span style={{
              fontSize: isSuperAdmin ? 16 : 18,
              fontWeight: 800,
              letterSpacing: -0.5,
              fontFamily: 'inherit',
            }}>
              {isSuperAdmin ? 'Super Admin' : (tenant?.name || 'RefBoost')}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {nav.map((item, i) => {
            if (item.divider) return <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 16px' }} />;
            if (item.to === '/applications' && !isAdmin) return null;
            const badge = getBadge(item);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/super-admin'}
                style={({ isActive }) => ({ ...s.link, ...(isActive ? s.activeLink : {}) })}
              >
                <item.icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && <span style={{ flex: 1 }}>{item.label}</span>}
                {!collapsed && badge > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                  }}>{badge}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            padding: '10px', margin: '4px 8px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: 'none',
            color: '#64748b', cursor: 'pointer', fontSize: 13,
          }}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> <span>Réduire</span></>}
        </button>

        {/* User */}
        <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: isSuperAdmin
                ? '#dc2626'
                : user?.role === 'admin'
                  ? C.p
                  : user?.role === 'commercial'
                    ? '#0891b2'
                    : C.pl,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 14,
            }}>
              {user?.fullName?.charAt(0) || '?'}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{
                  fontWeight: 600, color: '#e2e8f0', fontSize: 13,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {user?.fullName}
                </div>
                <div style={{ color: '#64748b', fontSize: 11, textTransform: 'capitalize' }}>{user?.role}</div>
              </div>
            )}
            <button
              onClick={handleLogout}
              title="Déconnexion"
              style={{
                background: 'transparent', border: 'none',
                color: '#64748b', cursor: 'pointer', padding: 6,
                borderRadius: 6, display: 'flex',
              }}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main style={{
        flex: 1,
        marginLeft: collapsed ? 68 : 200,
        padding: '32px 40px',
        transition: 'margin-left 0.2s ease',
        minHeight: '100vh',
        overflow: 'hidden',
      }}>
        {children}
      </main>
    
      {user?.mustChangePassword && (
        <ChangePasswordModal user={user} onSuccess={handlePasswordChanged} />
      )}
      </div>
  );
}

