import { useState, useEffect, useRef, Fragment } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useTranslation } from 'react-i18next';
import ChangePasswordModal from './ChangePasswordModal';
import api from '../lib/api';
import { LayoutDashboard, FileText, DollarSign, Users, Send, MessageCircle, LogOut, ChevronDown, Settings, Globe, Activity, BarChart2, Trophy, Shield, Newspaper, Bell, CreditCard, Search } from 'lucide-react';

const C = {
  p: 'var(--rb-primary, #059669)', pl: 'var(--rb-primary-light, #10b981)',
  pd: 'var(--rb-primary-dark, #047857)', s: '#0f172a', sl: '#1e293b',
  a: 'var(--rb-accent, #f97316)', al: 'var(--rb-accent-light, #fb923c)', m: '#64748b',
};

function RefBoostLogo({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs><linearGradient id="lg-sidebar" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor={C.p}/><stop offset="100%" stopColor={C.pl}/></linearGradient></defs>
      <rect width="48" height="48" rx="14" fill="url(#lg-sidebar)"/>
      <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white"/>
      <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9"/>
    </svg>
  );
}

export default function Layout({ children }) {
  const { t } = useTranslation();
  const { user, logout, spaces, currentSpace, switchSpace } = useAuth();
  const handlePasswordChanged = () => { window.location.reload(); };
  const navigate = useNavigate();
  const location = useLocation();
  const [currentSearchParams] = useSearchParams();

  // `notifyKeys` — categories from /notifications/unread-by-category
  //  whose combined unread count triggers the red dot on this nav item.
  //  Visiting the page auto-marks those categories as read.
  const ALL_NOTIFY_KEYS = [
    'news', 'promo', 'kit', 'event',
    'referral_update', 'new_referral', 'deal_won',
    'commission', 'new_application', 'access_revoked',
  ];

  // Grouped nav data. Special entry types:
  //   { section: '...' }        section label row
  //   { divider: true }         thin horizontal rule
  //   { bottom: true, ... }     pinned at the bottom above the user bar
  //   { adminOnly: true, ... }  hidden for the commercial role
  const ADMIN_NAV = [
    { to: '/search', icon: Search, label: t('layout.nav.search') },
    { to: '/dashboard', icon: LayoutDashboard, label: t('layout.nav.dashboard') },

    { section: t('layout.section.pipeline') },
    { to: '/referrals', icon: FileText, label: t('layout.nav.referrals'), notifyKeys: ['new_referral', 'deal_won'] },
    { to: '/partners', icon: Users, label: t('layout.nav.partners'), notifyKeys: ['new_application'] },
    { to: '/commissions', icon: DollarSign, label: t('layout.nav.commissions') },

    { section: t('layout.section.communication') },
    { to: '/messaging', icon: MessageCircle, label: t('layout.nav.messaging'), badge: 'messages' },
    { to: '/news', icon: Newspaper, label: t('layout.nav.news') },

    { section: t('layout.section.gestion') },
    { to: '/programme', icon: Trophy, label: t('layout.nav.programme') },
    { to: '/billing', icon: CreditCard, label: t('layout.nav.billing'), adminOnly: true },
    { to: '/settings', icon: Settings, label: t('layout.nav.settings') },

    { bottom: true, to: '/notifications', icon: Bell, label: t('layout.nav.notifications'), notifyKeys: ALL_NOTIFY_KEYS },
  ];

  // Partner has no dedicated /dashboard route — the kanban at
  // /partner/referrals doubles as their landing page. We point both
  // the standalone Dashboard item and "Mes referrals" at the same
  // route; both will highlight when active.
  const PARTNER_NAV = [
    { to: '/search', icon: Search, label: t('layout.nav.search') },
    { to: '/partner/referrals', icon: LayoutDashboard, label: t('layout.nav.dashboard') },

    { section: t('layout.section.pipeline') },
    { to: '/partner/submit', icon: Send, label: t('layout.nav.submit') },
    { to: '/partner/referrals', icon: FileText, label: t('layout.nav.my_referrals'), notifyKeys: ['referral_update'] },
    { to: '/partner/payments', icon: DollarSign, label: t('layout.nav.my_payments'), notifyKeys: ['commission'] },

    { section: t('layout.section.communication') },
    { to: '/messaging', icon: MessageCircle, label: t('layout.nav.messaging'), badge: 'messages' },
    { to: '/partner/news', icon: Newspaper, label: t('layout.nav.news'), notifyKeys: ['news', 'promo', 'kit', 'event'] },

    { section: t('layout.section.gestion') },
    { to: '/settings', icon: Settings, label: t('layout.nav.settings') },

    { bottom: true, to: '/notifications', icon: Bell, label: t('layout.nav.notifications'), notifyKeys: ALL_NOTIFY_KEYS },
  ];

  const SUPERADMIN_NAV = [
    { to: '/super-admin?tab=clients', icon: Globe, label: t('layout.nav.clients') },
    { to: '/super-admin?tab=stats', icon: BarChart2, label: t('layout.nav.statistics') },
    { to: '/super-admin?tab=logs', icon: Activity, label: t('layout.nav.audit_logs') },
    { to: '/super-admin?tab=blog', icon: FileText, label: t('layout.nav.blog') },
    { divider: true },
    { to: '/settings', icon: Settings, label: t('layout.nav.settings') },
  ];

  const isItemActive = (item) => {
    if (!item.to || !item.to.includes('?')) return false;
    const [path, query] = item.to.split('?');
    const itemParams = new URLSearchParams(query);
    return location.pathname === path && [...itemParams].every(([k, v]) => currentSearchParams.get(k) === v);
  };

  const [spaceSwitcherOpen, setSpaceSwitcherOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [pendingApps, setPendingApps] = useState(0);
  const [tenant, setTenant] = useState(typeof window !== 'undefined' ? window.__rbTenant : null);
  // Per-category unread counts driving the sidebar red dots.
  const [unreadByCat, setUnreadByCat] = useState({});

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e) => setTenant(e.detail || window.__rbTenant);
    window.addEventListener('rb-theme-loaded', handler);
    return () => window.removeEventListener('rb-theme-loaded', handler);
  }, []);

  const isSuperAdmin = user?.role === 'superadmin';
  const isAdmin = user?.role === 'admin';
  const isCommercial = user?.role === 'commercial';
  const isPartner = user?.role === 'partner';
  // Commercial uses the admin nav minus admin-only entries (Billing).
  let nav = isSuperAdmin ? SUPERADMIN_NAV : isPartner ? PARTNER_NAV : ADMIN_NAV;
  if (isCommercial) nav = nav.filter(it => !it.adminOnly);

  useEffect(() => {
    if (isSuperAdmin) return;
    const fetchCounts = async () => {
      try { const d = await api.getUnreadCount(); setUnread(d.count || 0); } catch (e) {}
      if (isAdmin) { try { const d = await api.getApplications('pending'); setPendingApps((d.applications || []).length); } catch (e) {} }
      try { const d = await api.getUnreadByCategory(); setUnreadByCat(d.counts || {}); } catch (e) {}
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, isSuperAdmin]);

  // Auto-mark categories as read when the user lands on a page whose
  // nav item owns them. Fires once per path change so clicking around
  // within a section doesn't spam the endpoint.
  useEffect(() => {
    if (!user || isSuperAdmin) return;
    const routeCats = {
      '/notifications':    ['news', 'promo', 'kit', 'event', 'referral_update', 'new_referral', 'deal_won', 'commission', 'new_application', 'access_revoked'],
      '/partner/news':     ['news', 'promo', 'kit', 'event'],
      '/partner/referrals':['referral_update'],
      '/partner/payments': ['commission'],
      '/referrals':        ['new_referral', 'deal_won'],
      '/partners':         ['new_application'],
    };
    const cats = routeCats[location.pathname];
    if (!cats || !cats.length) return;
    (async () => {
      for (const c of cats) {
        try { await api.markCategoryRead(c); } catch {}
      }
      setUnreadByCat(prev => {
        const next = { ...prev };
        for (const c of cats) delete next[c];
        return next;
      });
    })();
  }, [location.pathname, user, isSuperAdmin]);

  useEffect(() => {
    if (isSuperAdmin) { document.title = 'Super Admin — RefBoost'; return; }
    // Per-route document.title lookup. Falls back to plain "RefBoost"
    // for routes we haven't tagged. The unread+pending count prefix
    // (e.g. "(3) Dashboard — RefBoost") still wins over the base
    // label when there's something to act on.
    const ROUTE_TITLE_KEYS = {
      '/dashboard':        'layout.nav.dashboard',
      '/referrals':        'layout.nav.referrals',
      '/partners':         'layout.nav.partners',
      '/applications':     'layout.nav.partners',
      '/commissions':      'layout.nav.commissions',
      '/messaging':        'layout.nav.messaging',
      '/news':             'layout.nav.news',
      '/programme':        'layout.nav.programme',
      '/billing':          'layout.nav.billing',
      '/settings':         'layout.nav.settings',
      '/notifications':    'layout.nav.notifications',
      '/partner/referrals':'layout.nav.my_referrals',
      '/partner/submit':   'layout.nav.submit',
      '/partner/payments': 'layout.nav.my_payments',
      '/partner/news':     'layout.nav.news',
    };
    const pageKey = ROUTE_TITLE_KEYS[location.pathname];
    const pageLabel = pageKey ? t(pageKey) : null;
    const baseTitle = pageLabel ? `${pageLabel} — RefBoost` : 'RefBoost';
    const total = unread + pendingApps;
    document.title = total > 0 ? `(${total}) ${baseTitle}` : baseTitle;
  }, [unread, pendingApps, isSuperAdmin, tenant, location.pathname, t]);

  // Close the space switcher dropdown on outside click + Escape.
  const switcherRef = useRef(null);
  useEffect(() => {
    if (!spaceSwitcherOpen) return;
    const onClick = (e) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target)) {
        setSpaceSwitcherOpen(false);
      }
    };
    const onKey = (e) => { if (e.key === 'Escape') setSpaceSwitcherOpen(false); };
    document.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [spaceSwitcherOpen]);

  // Global Cmd+K / Ctrl+K shortcut → /search. Registered once per Layout
  // mount so every logged-in screen picks it up. Doesn't fire while
  // editing a text field — pressing Cmd+K inside an <input> should
  // stay available for text-editing shortcuts or browser defaults.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        const tag = (e.target?.tagName || '').toLowerCase();
        if (tag === 'input' || tag === 'textarea' || e.target?.isContentEditable) return;
        e.preventDefault();
        navigate('/search');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigate]);

  const handleLogout = () => { logout(); navigate('/login'); };

  // ─── Style tokens ─────────────────────────────────────────────────
  // Every nav row (Dashboard, section items, bottom Notifications)
  // shares one geometry: 8px 18px padding + 18px icons + 10px gap.
  // The 2px transparent left border is promoted to #059669 on active so
  // the indicator never shifts content.
  const ACTIVE_ACCENT = isSuperAdmin ? '#dc2626' : '#059669';
  const s = {
    sidebar: { width: 220, minWidth: 220, background: isSuperAdmin ? '#1a1a2e' : C.s, color: '#fff', display: 'flex', flexDirection: 'column', height: '100vh', position: 'fixed', left: 0, top: 0, zIndex: 50 },
    link: {
      display: 'flex', alignItems: 'center', gap: 10,
      padding: '8px 18px', borderLeft: '2px solid transparent',
      color: '#94a3b8', textDecoration: 'none',
      fontSize: 13, fontWeight: 500, transition: 'all 0.15s',
      lineHeight: 1.3,
    },
    activeLink: { background: 'rgba(255,255,255,0.08)', color: '#fff', borderLeftColor: ACTIVE_ACCENT },
    activeQueryLink: { background: 'rgba(255,255,255,0.08)', color: '#fff', borderLeftColor: ACTIVE_ACCENT },
    sectionLabel: {
      fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
      color: '#475569', fontWeight: 500,
      padding: '10px 18px 3px',
    },
  };

  const getBadge = (item) => {
    if (item.badge === 'messages' && unread > 0) return unread;
    if (item.badge === 'applications' && pendingApps > 0) return pendingApps;
    return 0;
  };

  // Nav-item icon + optional notify dot. Reused by main nav + bottom
  // so every icon is exactly 18px.
  const ItemIcon = ({ Icon, hasDot, color }) => (
    <span style={{ position: 'relative', display: 'inline-flex', flexShrink: 0, width: 18, height: 18 }}>
      <Icon size={18} color={color}/>
      {hasDot && (
        <span style={{
          position: 'absolute', top: -2, right: -2,
          width: 8, height: 8, borderRadius: '50%',
          background: '#ef4444', boxShadow: '0 0 0 2px rgba(15,23,42,0.9)',
        }}/>
      )}
    </span>
  );

  const hasMultipleSpaces = spaces && spaces.length > 1;
  const programLabel = isSuperAdmin
    ? t('layout_extra.super_admin')
    : (currentSpace?.role === 'partner' && currentSpace?.partner_name)
      ? currentSpace.partner_name
      : (currentSpace?.tenant_name || tenant?.name || 'RefBoost');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      <aside style={s.sidebar}>
        {/* ─── Top: logo + program name (also the space-switcher trigger) ─ */}
        <div ref={switcherRef} style={{ position: 'relative', padding: '20px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isSuperAdmin ? (
              <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: 'linear-gradient(135deg, #dc2626, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(220,38,38,0.3)' }}>
                <Shield size={18} color="#fff"/>
              </div>
            ) : (
              <div style={{ flexShrink: 0, filter: `drop-shadow(0 0 16px ${C.p}40)` }}>
                {tenant?.logo_url
                  ? <img src={tenant.logo_url} alt={t('layout_extra.logo_alt')} style={{ height: 36, maxWidth: 110, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none'; }}/>
                  : <RefBoostLogo size={36}/>}
              </div>
            )}
            <button
              type="button"
              disabled={!hasMultipleSpaces}
              onClick={() => hasMultipleSpaces && setSpaceSwitcherOpen(v => !v)}
              style={{
                background: 'none', border: 'none', padding: 0,
                display: 'flex', alignItems: 'center', gap: 6,
                color: '#fff', fontFamily: 'inherit',
                cursor: hasMultipleSpaces ? 'pointer' : 'default',
                overflow: 'hidden', flex: 1, textAlign: 'left',
              }}
              aria-haspopup={hasMultipleSpaces ? 'menu' : undefined}
              aria-expanded={spaceSwitcherOpen}
            >
              <span style={{
                fontSize: isSuperAdmin ? 15 : 16, fontWeight: 800, letterSpacing: -0.4,
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {programLabel}
              </span>
              {hasMultipleSpaces && (
                <ChevronDown
                  size={14}
                  color="#94a3b8"
                  style={{
                    flexShrink: 0,
                    transition: 'transform .15s ease',
                    transform: spaceSwitcherOpen ? 'rotate(180deg)' : 'rotate(0)',
                  }}
                />
              )}
            </button>
          </div>

          {/* ─── Space switcher dropdown (spaces only — no external links) ─── */}
          {spaceSwitcherOpen && hasMultipleSpaces && (
            <div
              role="menu"
              style={{
                position: 'absolute', top: '100%', left: 12, right: 12,
                marginTop: 4, zIndex: 60,
                background: '#1e293b', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 10, padding: 6,
                boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
                maxHeight: '60vh', overflowY: 'auto',
              }}
            >
              {spaces.map((space) => {
                const isActive = currentSpace
                  && currentSpace.tenant_id === space.tenant_id
                  && currentSpace.role === space.role
                  && (currentSpace.partner_id || null) === (space.partner_id || null);
                const label = space.role === 'partner'
                  ? (space.partner_name || t('layout_extra.space_partner'))
                  : (space.tenant_name || t('layout_extra.space_space'));
                const initials = (label || '??').slice(0, 2).toUpperCase();
                const roleLabel = space.role === 'partner'
                  ? t('layout_extra.space_partner')
                  : (t('layout_extra.space_admin') || space.role);
                return (
                  <button
                    key={`sw-${space.tenant_id}-${space.role}-${space.partner_id || 'none'}`}
                    onClick={() => {
                      setSpaceSwitcherOpen(false);
                      if (!isActive) switchSpace(space).then(() => window.location.reload());
                    }}
                    style={{
                      width: '100%', padding: '8px 10px',
                      display: 'flex', alignItems: 'center', gap: 10,
                      borderRadius: 8, border: 'none',
                      background: isActive ? `linear-gradient(135deg, ${C.p}33, ${C.pl}26)` : 'transparent',
                      color: '#fff', cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left', marginBottom: 2,
                    }}
                  >
                    <div style={{
                      width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                      background: space.role === 'partner'
                        ? `linear-gradient(135deg, ${C.a}, ${C.al})`
                        : `linear-gradient(135deg, ${C.p}, ${C.pl})`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 9, fontWeight: 800, color: '#fff',
                    }}>{initials}</div>
                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      textTransform: 'uppercase', letterSpacing: 0.4,
                      background: space.role === 'partner' ? `${C.a}22` : `${C.p}22`,
                      color: space.role === 'partner' ? C.al : C.pl,
                    }}>{roleLabel}</span>
                    {isActive && <span style={{ color: '#10b981', fontSize: 12 }}>✓</span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Main nav (sections + items) ─── */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {nav.filter(it => !it.bottom).map((item, i) => {
            if (item.section) {
              return (
                <div key={'sec-' + i} style={s.sectionLabel}>
                  {item.section}
                </div>
              );
            }
            if (item.divider) return <div key={i} style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '8px 16px' }}/>;
            if (item.to === '/applications' && !isAdmin) return null;
            const badge = getBadge(item);
            const notifyCount = (item.notifyKeys || []).reduce(
              (n, k) => n + (unreadByCat[k] || 0), 0
            );
            return (
              <Fragment key={'nav-' + i + '-' + item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/super-admin'}
                  style={({ isActive }) => ({
                    ...s.link,
                    ...(item.to && item.to.includes('?')
                      ? (isItemActive(item) ? s.activeQueryLink : {})
                      : (isActive ? s.activeLink : {})),
                  })}
                >
                  <ItemIcon Icon={item.icon} hasDot={notifyCount > 0}/>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {badge > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>
                      {badge}
                    </span>
                  )}
                </NavLink>
              </Fragment>
            );
          })}
        </nav>

        {/* ─── Bottom Notifications row ─── */}
        {nav.filter(it => it.bottom).map((item) => {
          const notifyCount = (item.notifyKeys || []).reduce(
            (n, k) => n + (unreadByCat[k] || 0), 0
          );
          const hasUnread = notifyCount > 0;
          return (
            <NavLink
              key={'bot-' + item.to}
              to={item.to}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 18px', borderLeft: '2px solid transparent',
                borderTop: '1px solid rgba(255,255,255,0.06)',
                textDecoration: 'none',
                fontSize: 13, fontWeight: 500,
                color: isActive ? '#fff' : (hasUnread ? '#cbd5e1' : '#475569'),
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                borderLeftColor: isActive ? ACTIVE_ACCENT : 'transparent',
                transition: 'all 0.15s',
              })}
            >
              <ItemIcon Icon={item.icon} hasDot={hasUnread}/>
              <span style={{ flex: 1 }}>{item.label}</span>
              {hasUnread && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>
                  {notifyCount}
                </span>
              )}
            </NavLink>
          );
        })}

        {/* ─── User profile bar ─── */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
              background: isSuperAdmin ? '#dc2626' : user?.role === 'admin' ? C.p : user?.role === 'commercial' ? '#0891b2' : C.pl,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontWeight: 700, fontSize: 12,
            }}>
              {user?.fullName?.charAt(0)?.toUpperCase() || '?'}
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div style={{ fontWeight: 500, color: '#fff', fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {user?.fullName}
              </div>
              <div style={{ color: '#475569', fontSize: 10, textTransform: 'capitalize' }}>
                {isPartner ? (t('layout_extra.space_partner') || 'Partenaire') : user?.role}
              </div>
            </div>
            <button
              onClick={handleLogout}
              title={t('layout.logout')}
              style={{ background: 'transparent', border: 'none', color: '#475569', cursor: 'pointer', padding: 4, borderRadius: 6, display: 'flex' }}
            >
              <LogOut size={14}/>
            </button>
          </div>
        </div>

      </aside>

      <main style={{ flex: 1, marginLeft: 220, padding: '32px 40px', minHeight: '100vh', overflow: 'hidden' }}>
        {children}
      </main>

      {user?.mustChangePassword && <ChangePasswordModal user={user} onSuccess={handlePasswordChanged}/>}
    </div>
  );
}
