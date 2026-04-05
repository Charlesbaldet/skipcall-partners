import { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import {
  LayoutDashboard, FileText, DollarSign, Users, Send, MessageCircle,
  LogOut, ChevronLeft, ChevronRight, UserPlus, Settings,
} from 'lucide-react';

const ADMIN_NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/referrals', icon: FileText, label: 'Pipeline' },
  { to: '/commissions', icon: DollarSign, label: 'Commissions' },
  { to: '/partners', icon: Users, label: 'Partenaires' },
  { to: '/applications', icon: UserPlus, label: 'Candidatures' },
  { to: '/messaging', icon: MessageCircle, label: 'Messagerie' },
  { divider: true },
  { to: '/settings', icon: Settings, label: 'Paramètres' },
];

const PARTNER_NAV = [
  { to: '/partner/referrals', icon: FileText, label: 'Mes Referrals' },
  { to: '/partner/submit', icon: Send, label: 'Soumettre' },
  { to: '/partner/payments', icon: DollarSign, label: 'Mes Paiements' },
  { to: '/messaging', icon: MessageCircle, label: 'Messagerie' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);

  const nav = user?.role === 'partner' ? PARTNER_NAV : ADMIN_NAV;
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    api.getUnreadCount().then(d => setUnread(d.count || 0)).catch(() => {});
    const interval = setInterval(() => {
      api.getUnreadCount().then(d => setUnread(d.count || 0)).catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => { logout(); navigate('/login'); };

  const s = {
    sidebar: {
      width: collapsed ? 68 : 200, minWidth: collapsed ? 68 : 200,
      background: '#0f172a', color: '#fff', display: 'flex', flexDirection: 'column',
      transition: 'all 0.2s ease', height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50,
    },
    link: {
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      borderRadius: 10, color: '#94a3b8', textDecoration: 'none', fontSize: 14,
      fontWeight: 500, transition: 'all 0.15s', margin: '2px 8px',
    },
    activeLink: {
      background: 'linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.15))',
      color: '#fff',
    },
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f8fafc' }}>
      {/* Sidebar */}
      <aside style={s.sidebar}>
        {/* Logo */}
        <div style={{ padding: '20px 16px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 11, flexShrink: 0,
            background: 'linear-gradient(135deg, #6366f1, #a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 800, color: '#fff',
            boxShadow: '0 0 20px rgba(99,102,241,0.3)',
          }}>S</div>
          {!collapsed && <span style={{ fontSize: 20, fontWeight: 700, letterSpacing: -0.5 }}>Skipcall</span>}
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 0', overflowY: 'auto' }}>
          {nav.map((item, i) => {
            if (item.divider) {
              return <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 16px' }} />;
            }
            if (item.to === '/applications' && !isAdmin) return null;
            if (item.to === '/settings' && !isAdmin) return null;
            return (
              <NavLink key={item.to} to={item.to}
                style={({ isActive }) => ({ ...s.link, ...(isActive ? s.activeLink : {}) })}
              >
                <item.icon size={18} style={{ flexShrink: 0 }} />
                {!collapsed && (
                  <span style={{ flex: 1 }}>{item.label}</span>
                )}
                {!collapsed && item.to === '/messaging' && unread > 0 && (
                  <span style={{
                    background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700,
                    padding: '2px 7px', borderRadius: 10, minWidth: 18, textAlign: 'center',
                  }}>{unread}</span>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Collapse toggle */}
        <button onClick={() => setCollapsed(!collapsed)} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          padding: '10px', margin: '4px 8px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)', border: 'none',
          color: '#64748b', cursor: 'pointer', fontSize: 13,
        }}>
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /> <span>Réduire</span></>}
        </button>

        {/* User */}
        <div style={{ padding: '12px 12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 10, flexShrink: 0,
              background: user?.role === 'admin' ? '#6366f1' : user?.role === 'commercial' ? '#0891b2' : '#8b5cf6',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 14,
            }}>
              {user?.fullName?.charAt(0) || '?'}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, overflow: 'hidden' }}>
                <div style={{ fontWeight: 600, color: '#e2e8f0', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {user?.fullName}
                </div>
                <div style={{ color: '#64748b', fontSize: 11, textTransform: 'capitalize' }}>{user?.role}</div>
              </div>
            )}
            <button onClick={handleLogout} title="Déconnexion" style={{
              background: 'transparent', border: 'none', color: '#64748b',
              cursor: 'pointer', padding: 6, borderRadius: 6, display: 'flex',
            }}>
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main style={{
        flex: 1, marginLeft: collapsed ? 68 : 200,
        padding: '32px 40px', transition: 'margin-left 0.2s ease',
        minHeight: '100vh',
      }}>
        {children}
      </main>
    </div>
  );
}
