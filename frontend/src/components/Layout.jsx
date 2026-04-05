import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import api from '../lib/api';
import { 
  BarChart3, FileText, DollarSign, Users, Send, List, 
  CreditCard, MessageCircle, LogOut, ChevronLeft, Settings
} from 'lucide-react';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  // Poll unread messages every 30s
  useEffect(() => {
    const fetchUnread = () => {
      api.getUnreadCount().then(d => setUnreadCount(d.unread)).catch(() => {});
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const isPartner = user?.role === 'partner';

  const navItems = isPartner ? [
    { path: '/partner/submit', icon: Send, label: 'Recommander' },
    { path: '/partner/referrals', icon: List, label: 'Mes recommandations' },
    { path: '/partner/payments', icon: CreditCard, label: 'Mes paiements' },
    { path: '/messaging', icon: MessageCircle, label: 'Messagerie', badge: unreadCount },
  ] : [
    { path: '/', icon: BarChart3, label: 'Dashboard' },
    { path: '/referrals', icon: FileText, label: 'Pipeline' },
    { path: '/commissions', icon: DollarSign, label: 'Commissions' },
    ...(user?.role === 'admin' ? [{ path: '/partners', icon: Users, label: 'Partenaires' }] : []),
    { path: '/messaging', icon: MessageCircle, label: 'Messagerie', badge: unreadCount },
  ];

  const w = collapsed ? 72 : 260;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#f1f5f9' }}>
      {/* Sidebar */}
      <nav style={{
        width: w, minHeight: '100vh', background: '#0f172a', 
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease',
        position: 'fixed', top: 0, left: 0, zIndex: 100,
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 12px' : '20px 24px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{
            width: 38, height: 38, borderRadius: 11, flexShrink: 0,
            background: 'linear-gradient(135deg,#6366f1,#a855f7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, fontWeight: 800, color: '#fff',
          }}>S</div>
          {!collapsed && <span style={{ fontSize: 20, fontWeight: 700, color: '#fff', letterSpacing: -0.5 }}>Skipcall</span>}
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {navItems.map(item => {
            const active = location.pathname === item.path;
            return (
              <button key={item.path} onClick={() => navigate(item.path)} style={{
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '12px' : '10px 16px',
                borderRadius: 10, border: 'none', cursor: 'pointer', width: '100%',
                background: active ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: active ? '#818cf8' : '#94a3b8',
                fontWeight: active ? 600 : 500, fontSize: 14,
                justifyContent: collapsed ? 'center' : 'flex-start',
                transition: 'all 0.15s',
                position: 'relative',
              }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <item.icon size={20} />
                {!collapsed && <span>{item.label}</span>}
                {item.badge > 0 && (
                  <span style={{
                    position: collapsed ? 'absolute' : 'relative',
                    top: collapsed ? 4 : 'auto', right: collapsed ? 4 : 'auto',
                    marginLeft: collapsed ? 0 : 'auto',
                    background: '#ef4444', color: '#fff', fontSize: 11, fontWeight: 700,
                    borderRadius: 10, padding: '1px 7px', minWidth: 20, textAlign: 'center',
                  }}>{item.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Bottom */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          {/* Collapse toggle */}
          <button onClick={() => setCollapsed(!collapsed)} style={{
            display: 'flex', alignItems: 'center', justifyContent: collapsed ? 'center' : 'flex-start',
            gap: 12, padding: '10px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
            width: '100%', background: 'transparent', color: '#64748b', fontSize: 13,
          }}
            onMouseEnter={e => e.currentTarget.style.color = '#94a3b8'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
          >
            <ChevronLeft size={18} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
            {!collapsed && <span>Réduire</span>}
          </button>

          {/* User info + logout */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
            borderRadius: 10, marginTop: 4,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8, flexShrink: 0,
              background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 13, fontWeight: 700, color: '#fff',
            }}>
              {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            {!collapsed && (
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {user?.fullName}
                </div>
                <div style={{ color: '#64748b', fontSize: 11 }}>
                  {user?.role === 'admin' ? 'Admin' : user?.role === 'commercial' ? 'Commercial' : user?.partnerName || 'Partenaire'}
                </div>
              </div>
            )}
            <button onClick={handleLogout} title="Déconnexion" style={{
              background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer',
              padding: 4, display: 'flex', borderRadius: 6,
            }}
              onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748b'}
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, marginLeft: w, padding: 32, transition: 'margin-left 0.2s ease', maxWidth: `calc(100vw - ${w}px)` }}>
        {children}
      </main>
    </div>
  );
}
