import { useState, useEffect, useRef, Fragment } from 'react';
import { NavLink, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.jsx';
import { useTranslation } from 'react-i18next';
import ChangePasswordModal from './ChangePasswordModal';
import api from '../lib/api';
import { LayoutDashboard, FileText, DollarSign, Users, Send, MessageCircle, LogOut, ChevronDown, Settings, Globe, Activity, BarChart2, Trophy, Shield, Newspaper, Bell, CreditCard, Search, Store, Trash2, ListChecks } from 'lucide-react';
import OnboardingChecklist from './OnboardingChecklist.jsx';

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
    { to: '/marketplace-admin', icon: Store, label: t('layout.nav.marketplace', 'Marketplace'), adminOnly: true },
    { to: '/settings', icon: Settings, label: t('layout.nav.settings') },

    { bottom: true, to: '/notifications', icon: Bell, label: t('layout.nav.notifications'), notifyKeys: ALL_NOTIFY_KEYS },
    { bottom: true, to: '/trash', icon: Trash2, label: t('sidebar.trash'), badge: 'trash' },
  ];

  // Partner navigation. Dashboard shows KPI cards + feature-gated
  // tracking cards (referral link, promo codes); "Mes referrals"
  // takes you to the Kanban/table view of the partner's pipeline.
  const PARTNER_NAV = [
    { to: '/search', icon: Search, label: t('layout.nav.search') },
    { to: '/partner/dashboard', icon: LayoutDashboard, label: t('layout.nav.dashboard') },

    { section: t('layout.section.pipeline') },
    // "Soumettre un referral" moved into a modal opened from the
    // Mes Referrals page header (sidebar entry removed). The
    // /partner/submit route still resolves — it redirects to
    // /partner/referrals?submit=1 so old emails / bookmarks open
    // the modal directly.
    { to: '/partner/referrals', icon: FileText, label: t('layout.nav.my_referrals'), notifyKeys: ['referral_update'] },
    { to: '/partner/payments', icon: DollarSign, label: t('layout.nav.my_payments'), notifyKeys: ['commission'] },

    { section: t('layout.section.communication') },
    { to: '/messaging', icon: MessageCircle, label: t('layout.nav.messaging'), badge: 'messages' },
    { to: '/partner/news', icon: Newspaper, label: t('layout.nav.news'), notifyKeys: ['news', 'promo', 'kit', 'event'] },

    { section: t('layout.section.gestion') },
    { to: '/settings', icon: Settings, label: t('layout.nav.settings') },

    { bottom: true, to: '/notifications', icon: Bell, label: t('layout.nav.notifications'), notifyKeys: ALL_NOTIFY_KEYS },
  ];

  // Note: Corbeille is admin/commercial only — partners don't see it
  // because they can't restore other people's deals. Same for
  // superadmin (which has its own teardown flows).

  const SUPERADMIN_NAV = [
    { to: '/super-admin?tab=clients', icon: Globe, label: t('layout.nav.clients') },
    { to: '/super-admin?tab=stats', icon: BarChart2, label: t('layout.nav.statistics') },
    { to: '/super-admin?tab=search', icon: Search, label: t('super_admin.search.tab', 'Recherche') },
    { to: '/super-admin?tab=logs', icon: Activity, label: t('layout.nav.audit_logs') },
    { to: '/super-admin?tab=blog', icon: FileText, label: t('layout.nav.blog') },
    { to: '/admin/compliance', icon: Shield, label: t('compliance.title', 'Conformité') },
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
  const [trashCount, setTrashCount] = useState(0);
  // Trash badge "seen" watermark — last trashCount value the user
  // had visible while on /trash. The displayed badge is the delta
  // (count − seen), so visiting /trash silences the badge until
  // something new is soft-deleted afterwards.
  const [trashSeenCount, setTrashSeenCount] = useState(() => {
    try { return Number(localStorage.getItem('rb_trash_seen_count') || 0) || 0; }
    catch { return 0; }
  });
  const [tenant, setTenant] = useState(typeof window !== 'undefined' ? window.__rbTenant : null);
  // Per-category unread counts driving the sidebar red dots.
  const [unreadByCat, setUnreadByCat] = useState({});
  // Onboarding checklist state. `null` = not loaded yet; otherwise
  // the percentage drives both the sidebar "Progression" entry and
  // whether the popup auto-opens on mount.
  const [onboardingPct, setOnboardingPct] = useState(null);
  const [onboardingDismissed, setOnboardingDismissed] = useState(true);
  const [showOnboardingPopup, setShowOnboardingPopup] = useState(false);

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

  // Inject the Progression entry into the bottom nav for admins who
  // haven't reached 100%. Spliced rather than baked into ADMIN_NAV
  // so the percentage badge stays live without rebuilding the
  // array in a useMemo. Pinned BEFORE Notifications/Trash so the
  // visual order (Progression → Notifications → Corbeille) matches
  // the spec.
  if (isAdmin && onboardingPct !== null && onboardingPct < 100) {
    const firstBottomIdx = nav.findIndex(it => it.bottom);
    const progressionItem = {
      bottom: true, to: '/progression', icon: ListChecks,
      label: t('sidebar.progression', 'Progression'),
      progressionBadge: onboardingPct + '%',
    };
    if (firstBottomIdx >= 0) {
      nav = [...nav.slice(0, firstBottomIdx), progressionItem, ...nav.slice(firstBottomIdx)];
    } else {
      nav = [...nav, progressionItem];
    }
  }

  useEffect(() => {
    if (isSuperAdmin) return;
    const fetchCounts = async () => {
      try { const d = await api.getUnreadCount(); setUnread(d.count || 0); } catch (e) {}
      if (isAdmin) { try { const d = await api.getApplications('pending'); setPendingApps((d.applications || []).length); } catch (e) {} }
      try { const d = await api.getUnreadByCategory(); setUnreadByCat(d.counts || {}); } catch (e) {}
      // Corbeille badge — admin/commercial only. Partners don't see
      // /trash so we skip the request for them.
      if (isAdmin || isCommercial) {
        try { const d = await api.getTrashCount(); setTrashCount(d.count || 0); } catch (e) {}
      }
    };
    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, isCommercial, isSuperAdmin]);

  // Onboarding fetch + auto-open. Admin-only because the
  // /onboarding/status endpoint is admin-gated; commercial users
  // get nothing extra in their sidebar. The popup auto-opens once
  // per session when the admin hasn't dismissed and isn't yet at
  // 100% — re-fetching when the user's role flips so a switch-
  // space into a fresh tenant resurfaces the popup.
  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    api.getOnboardingStatus()
      .then(d => {
        if (cancelled || !d) return;
        setOnboardingPct(typeof d.percentage === 'number' ? d.percentage : null);
        setOnboardingDismissed(!!d.dismissed);
        if (!d.dismissed && d.percentage < 100) setShowOnboardingPopup(true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isAdmin, user?.tenantId]);

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
      '/partner/dashboard':'layout.nav.dashboard',
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
    // IMPORTANT: always use the full `borderLeft` shorthand, never
    // the `borderLeftColor` sub-property. When the previous render
    // wrote `borderLeft: 2px solid transparent` and the next render
    // only sets `borderLeftColor`, React's style diffing can leave
    // the DOM with a partial value (border-left-width + style but no
    // explicit color) — and the browser falls back to the element's
    // text color, painting a stale gray bar on inactive items.
    activeLink:      { background: 'rgba(255,255,255,0.08)', color: '#fff', borderLeft: '2px solid ' + ACTIVE_ACCENT },
    activeQueryLink: { background: 'rgba(255,255,255,0.08)', color: '#fff', borderLeft: '2px solid ' + ACTIVE_ACCENT },
    sectionLabel: {
      fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
      color: '#475569', fontWeight: 500,
      padding: '10px 18px 3px',
    },
  };

  // Sync the trash seen-count whenever the user is on /trash and a
  // count is available — covers both the immediate visit (current
  // count) and any later refetches while the user is still on the
  // page (so a real-time-arriving item silently raises the watermark
  // instead of bouncing the badge).
  useEffect(() => {
    if (location.pathname !== '/trash') return;
    try { localStorage.setItem('rb_trash_seen_count', String(trashCount)); } catch {}
    setTrashSeenCount(trashCount);
  }, [location.pathname, trashCount]);

  const getBadge = (item) => {
    if (item.badge === 'messages' && unread > 0) return unread;
    if (item.badge === 'applications' && pendingApps > 0) return pendingApps;
    if (item.badge === 'trash') return Math.max(0, trashCount - trashSeenCount);
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
  // Tenant label resolution order:
  //   1. JWT-derived user.tenantName  (always matches the active workspace)
  //   2. currentSpace.tenant_name     (fresh from /auth/me/spaces)
  //   3. host-derived tenant?.name    (legacy single-tenant fallback)
  // Reading user.tenantName first means a switch-space is reflected
  // immediately, before /auth/me/spaces re-fetches.
  const programLabel = isSuperAdmin
    ? t('layout_extra.super_admin')
    : (currentSpace?.role === 'partner' && currentSpace?.partner_name)
      ? currentSpace.partner_name
      : (user?.tenantName || currentSpace?.tenant_name || tenant?.name || 'RefBoost');

  return (
    <div style={{ display: 'flex', minHeight: '100vh', overflow: 'hidden', background: '#f8fafc' }}>
      <aside style={s.sidebar}>
        {/* ─── Top: tenant logo OR name (single visual, not both), also
             the space-switcher trigger. Either render the tenant logo
             (when present) at large size, or the program label with a
             colour initial avatar — never both side-by-side, which was
             redundant. The chevron is the only consistent affordance
             across both states. */}
        <div ref={switcherRef} style={{ position: 'relative', padding: '20px 16px 12px' }}>
          <button
            type="button"
            disabled={!hasMultipleSpaces}
            onClick={() => hasMultipleSpaces && setSpaceSwitcherOpen(v => !v)}
            style={{
              background: 'none', border: 'none', padding: 0,
              display: 'flex', alignItems: 'center', gap: 10,
              color: '#fff', fontFamily: 'inherit',
              cursor: hasMultipleSpaces ? 'pointer' : 'default',
              width: '100%', textAlign: 'left',
            }}
            aria-haspopup={hasMultipleSpaces ? 'menu' : undefined}
            aria-expanded={spaceSwitcherOpen}
          >
            {isSuperAdmin ? (
              <>
                <div style={{ width: 36, height: 36, borderRadius: 11, flexShrink: 0, background: 'linear-gradient(135deg, #dc2626, #ef4444)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 0 20px rgba(220,38,38,0.3)' }}>
                  <Shield size={18} color="#fff"/>
                </div>
                <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: -0.4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>
                  {programLabel}
                </span>
              </>
            ) : tenant?.logo_url ? (
              // Has logo → big logo only, no name (logo is the brand)
              <div style={{ flex: 1, minWidth: 0, filter: `drop-shadow(0 0 16px ${C.p}40)` }}>
                <img
                  src={tenant.logo_url}
                  alt={programLabel || t('layout_extra.logo_alt')}
                  style={{ height: 48, maxWidth: '100%', objectFit: 'contain', display: 'block' }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              </div>
            ) : (
              // No logo → initial avatar + program/tenant name
              <>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${C.p}, ${C.pl})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 14, fontWeight: 800, color: '#fff',
                  boxShadow: `0 0 16px ${C.p}40`,
                }}>
                  {(programLabel || 'R').slice(0, 2).toUpperCase()}
                </div>
                <span style={{
                  fontSize: 16, fontWeight: 800, letterSpacing: -0.4,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  flex: 1, minWidth: 0,
                }}>
                  {programLabel}
                </span>
              </>
            )}
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

          {/* ─── Space switcher dropdown (spaces only — no external links) ───
               Width: anchored at left:12 with min/maxWidth so the dropdown can
               extend past the (narrow) sidebar to fit full tenant names without
               truncation. Each row prefers tenant_name over partner_name so a
               user who is a partner-of-X under their own first name still sees
               "X" (the tenant), not "Charles" (the partner row). The role pill
               communicates the access type. */}
          {spaceSwitcherOpen && hasMultipleSpaces && (
            <div
              role="menu"
              style={{
                position: 'absolute', top: '100%', left: 12,
                marginTop: 4, zIndex: 60,
                minWidth: 240, maxWidth: 320, width: 'max-content',
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
                // Always prefer tenant_name (the company / programme) over
                // partner_name (which is the partners row's `name` field —
                // often a personal first-name when the partner is a single
                // contractor signed up under their own name). The role pill
                // below handles the admin-vs-partner distinction.
                const label = space.tenant_name
                  || space.partner_name
                  || t('layout_extra.space_space');
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
                      width: '100%', padding: '10px 12px',
                      display: 'flex', alignItems: 'center', gap: 12,
                      borderRadius: 8, border: 'none',
                      background: isActive ? `linear-gradient(135deg, ${C.p}33, ${C.pl}26)` : 'transparent',
                      color: '#fff', cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left', marginBottom: 2,
                    }}
                  >
                    {space.tenant_logo_url ? (
                      <img
                        src={space.tenant_logo_url}
                        alt={label}
                        style={{
                          width: 28, height: 28, flexShrink: 0,
                          borderRadius: 8, objectFit: 'contain',
                          background: '#fff', padding: 2,
                        }}
                        onError={e => { e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        background: space.role === 'partner'
                          ? `linear-gradient(135deg, ${C.a}, ${C.al})`
                          : `linear-gradient(135deg, ${C.p}, ${C.pl})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 800, color: '#fff',
                      }}>{initials}</div>
                    )}
                    <div style={{ flex: 1, overflow: 'hidden', minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
                    </div>
                    <span style={{
                      fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 999,
                      textTransform: 'uppercase', letterSpacing: 0.4,
                      background: space.role === 'partner' ? `${C.a}22` : `${C.p}22`,
                      color: space.role === 'partner' ? C.al : C.pl,
                    }}>{roleLabel}</span>
                    {isActive && <span style={{ color: '#10b981', fontSize: 12 }}></span>}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ─── Main nav (sections + items) ─── */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
          {(() => {
            // Pre-compute the index of the FIRST nav item whose `to`
            // matches the current path. We use that as a tie-breaker so
            // that when two items share a `to` (e.g. partner Dashboard
            // + Mes referrals both → /partner/referrals), only the
            // first one lights up — otherwise both would render the
            // active border at once and the indicator would appear
            // "stuck" after navigating.
            const renderable = nav.filter(it => !it.bottom);
            const currentPath = location.pathname;
            const firstActiveIdx = renderable.findIndex(it => {
              if (!it.to) return false;
              if (it.to.includes('?')) return isItemActive(it);
              return currentPath === it.to;
            });
            return renderable.map((item, i) => {
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
              const isActive = i === firstActiveIdx;
              return (
                <Fragment key={'nav-' + i + '-' + item.to}>
                  <NavLink
                    to={item.to}
                    // Force an exact-match active state by passing our
                    // own computed flag via `style`; ignore NavLink's
                    // built-in prefix matching (which was lighting up
                    // /partner/referrals when on /partner/referrals/123).
                    end
                    style={() => ({
                      ...s.link,
                      outline: 'none',
                      ...(isActive ? s.activeLink : {}),
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
            });
          })()}
        </nav>

        {/* ─── Bottom rows (Notifications, Corbeille) ─── */}
        {nav.filter(it => it.bottom).map((item) => {
          const notifyCount = (item.notifyKeys || []).reduce(
            (n, k) => n + (unreadByCat[k] || 0), 0
          );
          const explicitBadge = getBadge(item);
          const count = notifyCount + explicitBadge;
          const hasUnread = count > 0;
          return (
            <NavLink
              key={'bot-' + item.to}
              to={item.to}
              end
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 18px',
                // Always use the full borderLeft shorthand on every
                // render so React's style diffing can't strip the
                // color and leave a stale gray bar on inactive rows.
                borderLeft: '2px solid ' + (isActive ? ACTIVE_ACCENT : 'transparent'),
                borderTop: '1px solid rgba(255,255,255,0.06)',
                textDecoration: 'none', outline: 'none',
                fontSize: 13, fontWeight: 500,
                color: isActive ? '#fff' : (hasUnread ? '#cbd5e1' : '#475569'),
                background: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
                transition: 'all 0.15s',
              })}
            >
              <ItemIcon Icon={item.icon} hasDot={hasUnread}/>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.progressionBadge && (
                <span style={{ background: C.p, color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>
                  {item.progressionBadge}
                </span>
              )}
              {hasUnread && (
                <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10, minWidth: 16, textAlign: 'center' }}>
                  {count}
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
      {showOnboardingPopup && (
        <OnboardingChecklist onClose={() => setShowOnboardingPopup(false)} />
      )}
    </div>
  );
}
