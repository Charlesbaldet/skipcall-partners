import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { LayoutDashboard, Users, FileText, DollarSign, Send, List, LogOut, ChevronLeft, Menu } from 'lucide-react';

const NAV_INTERNAL = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/referrals', icon: FileText, label: 'Pipeline' },
  { to: '/commissions', icon: DollarSign, label: 'Commissions' },
  { to: '/partners', icon: Users, label: 'Partenaires', roles: ['admin'] },
];

const NAV_PARTNER = [
  { to: '/partner/submit', icon: Send, label: 'Nouvelle recommandation' },
  { to: '/partner/referrals', icon: List, label: 'Mes recommandations' },
];

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  const navItems = user?.role === 'partner' ? NAV_PARTNER : NAV_INTERNAL;
  const filteredItems = navItems.filter(item => !item.roles || item.roles.includes(user?.role));

  const handleLogout = () => { logout(); navigate('/login'); };

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside style={{
        width: collapsed ? 68 : 240, minHeight: '100vh', background: '#0f172a',
        display: 'flex', flexDirection: 'column', transition: 'width 0.2s ease',
        position: 'fixed', top: 0, left: 0, zIndex: 50,
      }}>
        {/* Logo */}
        <div style={{ padding: collapsed ? '20px 12px' : '20px 20px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ width: 36, height: 36, minWidth: 36, borderRadius: 11, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: '#fff' }}>S</div>
          {!collapsed && <span style={{ fontWeight: 700, color: '#fff', fontSize: 18, whiteSpace: 'nowrap' }}>Skipcall</span>}
        </div>

        {/* User info */}
        {!collapsed && (
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
            <div style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{user?.full_name || user?.fullName}</div>
            <div style={{ color: '#64748b', fontSize: 12, marginTop: 2 }}>
              {user?.role === 'partner' ? (user?.partner_name || user?.partnerName) : user?.role === 'admin' ? 'Administrateur' : 'Commercial'}
            </div>
          </div>
        )}

        {/* Nav */}
        <nav style={{ flex: 1, padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {filteredItems.map(item => (
            <NavLink key={item.to} to={item.to} end={item.to === '/' || item.to === '/partner/submit'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12,
                padding: collapsed ? '12px 16px' : '10px 14px',
                borderRadius: 10,
                background: isActive ? 'rgba(99,102,241,0.15)' : 'transparent',
                color: isActive ? '#818cf8' : '#94a3b8',
                fontWeight: isActive ? 600 : 500, fontSize: 14,
                transition: 'all 0.15s', textDecoration: 'none',
              })}
            >
              <item.icon size={20} />
              {!collapsed && <span>{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom */}
        <div style={{ padding: '12px 8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <button onClick={handleLogout} style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            padding: collapsed ? '12px 16px' : '10px 14px', borderRadius: 10,
            background: 'transparent', border: 'none', color: '#94a3b8',
            fontSize: 14, cursor: 'pointer', fontWeight: 500,
          }}>
            <LogOut size={20} />
            {!collapsed && <span>Déconnexion</span>}
          </button>
          <button onClick={() => setCollapsed(!collapsed)} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: '100%', padding: '8px', borderRadius: 8,
            background: 'rgba(255,255,255,0.04)', border: 'none', color: '#64748b',
            cursor: 'pointer', marginTop: 4,
          }}>
            {collapsed ? <Menu size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main style={{ flex: 1, marginLeft: collapsed ? 68 : 240, transition: 'margin-left 0.2s ease', minHeight: '100vh' }}>
        <div style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto' }}>
          {children}
        </div>
      </main>
    </div>
  );
}
