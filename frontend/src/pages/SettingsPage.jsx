import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PipelineStagesEditor from '../components/PipelineStagesEditor.jsx';
import WebhooksSection from '../components/WebhooksSection.jsx';
import PipedriveConfigModal from '../components/PipedriveConfigModal.jsx';
import BillingPage from './BillingPage.jsx';
import { showConfirm, showPrompt, showToast } from '../components/Dialogs.jsx';
import {
  Trophy, Plus, Edit2,
  Palette,
  Link2,
  X, User, Users, Lock, Eye, EyeOff, UserPlus, Shield, Briefcase,
  CheckCircle, Copy, ToggleLeft, ToggleRight, Plug, Key, Trash2, ExternalLink, Globe, Store,
  Bell, Banknote, Save, CreditCard, Mail, LifeBuoy, BookOpen, Building, History,
  Download, MonitorSmartphone, AlertTriangle, DollarSign,
} from 'lucide-react';
import DateRangePicker from '../components/DateRangePicker.jsx';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isPartner = user?.role === 'partner';
  const isSuperadmin = user?.role === 'superadmin';
  const isCommercial = user?.role === 'commercial';
  const [searchParams, setSearchParams] = useSearchParams();
  // Map legacy tab IDs (deep-links, bookmarks, old emails) to the new
  // grouped tab IDs so existing URLs keep working.
  const LEGACY_TAB_MAP = {
    account: 'profile',
    members: 'team',
    superadmins: 'team',
    appearance: 'branding',
    'public-link': 'public-marketplace',
    marketplace: 'public-marketplace',
  };
  // Derive the active tab from searchParams every render so an
  // external navigation to /settings?tab=X (onboarding popup,
  // /billing redirect) reaches the right section without the
  // component remounting. Page-internal tab clicks write back into
  // the URL via setSearchParams so the URL stays the source of truth
  // and back/forward + refresh keep working.
  const rawTab = searchParams.get('tab');
  const tab = LEGACY_TAB_MAP[rawTab] || rawTab || 'profile';
  const setTab = (id) => setSearchParams({ tab: id }, { replace: true });
  // Close → land on the role-aware home (the "/" route resolves it
  // for us). Replaces the previous `navigate(-1)` because, after a
  // Qonto OAuth round-trip, the previous history entry is
  // oauth.qonto.com — so a backdrop click would walk the user
  // straight back into Qonto. `replace` swaps the current /settings
  // entry instead of pushing, so the back button still works
  // sensibly afterwards.
  const handleClose = () => navigate('/', { replace: true });

  // Grouped nav: each entry is either { section: 'label' } or a tab.
  // Admin sees all three sections; superadmin only sees COMPTE (since
  // they don't have program/preferences tabs wired).
  const NAV = [
    { section: t('layout.section.account') },
    { id: 'profile', icon: User, label: t('settings.tab_profile') },
    ...((isAdmin || isSuperadmin) ? [
      { id: 'team', icon: Users, label: t('settings.tab_team') },
    ] : []),
    ...(isAdmin ? [
      { id: 'company', icon: Building, label: t('settings.company_tab', 'Entreprise') },
      { id: 'billing', icon: CreditCard, label: t('settings.tab_billing', 'Facturation') },
    ] : []),
    ...(isAdmin ? [
      { section: t('layout.section.programme') },
      { id: 'branding', icon: Palette, label: t('settings.tab_branding') },
      { id: 'pipeline', icon: Trophy, label: t('settings.tab_pipeline') },
      { id: 'commission', icon: DollarSign, label: t('settings.tab_commission', 'Commission') },
      { id: 'public-marketplace', icon: Store, label: t('settings.tab_public_marketplace') },

      { section: t('layout.section.preferences') },
      { id: 'notifications', icon: Bell, label: t('settings.tab_notifications_emails') },
      { id: 'integrations', icon: Plug, label: t('settings.tab_integrations') },
      { id: 'audit', icon: History, label: t('settings.audit.tab_label', 'Historique') },
    ] : []),
    ...(isSuperadmin ? [
      { section: t('layout.section.preferences') },
      { id: 'audit', icon: History, label: t('settings.audit.tab_label', 'Historique') },
    ] : []),
    ...(isPartner ? [
      { id: 'bank', icon: Banknote, label: t('settings.tab_bank_info', 'Informations bancaires') },
      { section: t('layout.section.preferences') },
      { id: 'partner-notifications', icon: Bell, label: t('partner_notifications.tab', 'Notifications') },
      // Confidentialité tab removed for partners (item 1 of the UX
      // lot) — its content is now a section inside "Profil et
      // sécurité". The /settings?tab=privacy URL is rerouted to
      // ?tab=profile in the body below so old bookmarks still land.
    ] : []),
    // Sales (commercial) gets the same notifications panel as
    // admin, scoped server-side to the per-tenant table they share
    // with the admin. Visible event list is filtered to the
    // pipeline + commission + partner-application + news subset.
    ...(isCommercial ? [
      { section: t('layout.section.preferences') },
      { id: 'notifications', icon: Bell, label: t('settings.tab_notifications_emails') },
    ] : []),
    // Contact is the last entry across every role's preferences
    // group — admin, sales, partner, superadmin all get a way to
    // reach the team without leaving Settings.
    { id: 'contact', icon: Mail, label: t('settings.contact.title', 'Contact') },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 920, maxWidth: '100%', height: '85vh', maxHeight: 700, display: 'flex', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        {/* Left sidebar */}
        <div style={{ width: 240, background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '28px 12px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', padding: '0 12px', marginBottom: 20 }}>{t('settings.title')}</h2>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map((item, i) => {
              if (item.section) {
                return (
                  <div
                    key={'sec-' + i}
                    style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
                      color: '#475569', fontWeight: 700,
                      padding: '12px 12px 4px',
                      marginTop: i === 0 ? 0 : 8,
                    }}
                  >
                    {item.section}
                  </div>
                );
              }
              return (
                <button key={item.id} onClick={() => setTab(item.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left',
                  background: tab === item.id ? '#fff' : 'transparent', color: tab === item.id ? '#0f172a' : '#64748b',
                  boxShadow: tab === item.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}><item.icon size={16} /> {item.label}</button>
              );
            })}
          </nav>
        </div>
        {/* Right content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <button onClick={handleClose} style={{ position: 'absolute', top: 24, right: 24, width: 36, height: 36, borderRadius: 10, zIndex: 10, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color="#475569" />
          </button>
          {/* Extra bottom padding so dropdowns near the bottom (e.g. the
              language switcher in Profil) aren't clipped by the
              scroll container's overflow: auto. */}
          <div style={{ padding: '72px 32px 120px 32px' }}>
            {tab === 'profile' && <AccountTab user={user} />}
            {tab === 'team' && isSuperadmin && <SuperAdminsTab />}
            {tab === 'team' && isAdmin && <MembersTab />}
            {tab === 'notifications' && (isAdmin || isCommercial) && <NotificationsTab forCommercial={isCommercial} />}
            {tab === 'partner-notifications' && isPartner && <PartnerNotificationsTab />}
            {tab === 'bank' && isPartner && <PartnerBankInfoTab />}
            {/* Legacy /settings?tab=privacy URL: the Confidentialité
                content moved into the Profile tab. Render the same
                AccountTab so bookmarks keep working without a 404. */}
            {tab === 'privacy' && isPartner && <AccountTab user={user} />}
            {tab === 'integrations' && isAdmin && <IntegrationsTab />}
            {tab === 'company' && isAdmin && <CompanyBillingTab />}
            {tab === 'branding' && isAdmin && <AppearanceTab />}
            {tab === 'pipeline' && isAdmin && (
              <>
                <PipelineStagesEditor />
                <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />
                <PartnerCategoriesTab />
              </>
            )}
            {tab === 'public-marketplace' && isAdmin && (
              <>
                {/* MarketplaceTab moved to its own page at /marketplace-admin
                    (sidebar → Marketplace). The settings tab now hosts only
                    the public link + tracking-feature toggles, which aren't
                    marketplace-specific. */}
                <PublicLinkTab />
                <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />
                <TrackingFeaturesTab />
              </>
            )}
            {tab === 'program' && isAdmin && <ProgramTab />}
            {tab === 'commission' && isAdmin && <CommissionTab />}
            {tab === 'billing' && isAdmin && <BillingPage />}
            {tab === 'audit' && (isAdmin || isSuperadmin) && <AuditLogTab />}
            {tab === 'contact' && <ContactTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ AUDIT LOG (Historique) ═══
// Admin/superadmin-only feed of every state-changing admin action
// for ISO 27001 A.12.4 / SOC 2 CC6 compliance. Joined to users so
// the actor's display name surfaces; filterable by date range +
// action; paginated server-side.
const ACTION_KEYS = [
  'partner.created', 'partner.updated', 'partner.deleted',
  'commission.approved', 'commission.paid', 'commission.deleted',
  'referral.status_changed',
  'settings.updated', 'billing.updated',
  'user.invited', 'user.invitation_revoked',
  'integration.connected', 'integration.disconnected',
];

function AuditLogTab() {
  const { t, i18n } = useTranslation();
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  // Date range now drives the from/to params via the shared
  // DateRangePicker component (same one the dashboard uses).
  const [dateRange, setDateRange] = useState(null);
  const [action, setAction] = useState('');
  // Filter pill — one of '', 'partners', 'commissions', 'settings',
  // 'security'. Empty string means "all".
  const [actionType, setActionType] = useState('');
  const [data, setData] = useState({ logs: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(null);

  const from = dateRange?.startDate || '';
  const to = dateRange?.endDate || '';

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getAuditLogs({ page, pageSize, from, to, action, action_type: actionType })
      .then(d => { if (!cancelled) setData(d); })
      .catch(() => { if (!cancelled) setData({ logs: [], total: 0, totalPages: 1 }); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [page, pageSize, from, to, action, actionType]);

  const handleExport = async () => {
    setExporting(true); setExportErr(null);
    try {
      const blob = await api.exportAuditLogsCsv({ from, to, action, action_type: actionType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const stamp = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `refboost-audit-log-${stamp}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportErr(e.message || 'export_error');
    } finally {
      setExporting(false);
    }
  };

  const PILLS = [
    { id: '', label: t('settings.audit.filter_all', 'Toutes') },
    { id: 'partners', label: t('settings.audit.filter_partners', 'Partenaires') },
    { id: 'commissions', label: t('settings.audit.filter_commissions', 'Commissions') },
    { id: 'settings', label: t('settings.audit.filter_settings', 'Paramètres') },
    { id: 'security', label: t('settings.audit.filter_security', 'Sécurité') },
  ];

  const fmt = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString(i18n.language || 'fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return String(d); }
  };
  const actionLabel = (a) => t(`settings.audit.actions.${a}`, a);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>
        {t('settings.audit.title', 'Historique des actions')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, margin: '0 0 24px' }}>
        {t('settings.audit.description', 'Journal des actions administrateur — conservé pour la conformité ISO 27001 / SOC 2.')}
      </p>

      {/* Filter pills — group action families for one-click filtering. */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {PILLS.map(p => {
          const active = actionType === p.id;
          return (
            <button
              key={p.id || 'all'}
              type="button"
              onClick={() => { setActionType(p.id); setPage(1); }}
              style={{
                padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                border: '1px solid ' + (active ? '#059669' : '#e2e8f0'),
                background: active ? '#ecfdf5' : '#fff',
                color: active ? '#059669' : '#475569',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Date range + free-form action picker + export. */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{t('settings.audit.filter_action', 'Action')}</label>
          <select value={action} onChange={e => { setAction(e.target.value); setPage(1); }}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, minWidth: 200 }}>
            <option value="">{t('common.all', 'Toutes')}</option>
            {ACTION_KEYS.map(k => <option key={k} value={k}>{actionLabel(k)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#475569', marginBottom: 4 }}>{t('settings.audit.filter_from', 'Du')} → {t('settings.audit.filter_to', 'Au')}</label>
          <DateRangePicker value={dateRange} onChange={(r) => { setDateRange(r); setPage(1); }} />
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 14px', borderRadius: 8,
              border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a',
              fontSize: 13, fontWeight: 600, cursor: exporting ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit', opacity: exporting ? 0.6 : 1,
            }}
          >
            <Download size={14} /> {exporting
              ? t('settings.audit.export_progress', 'Export…')
              : t('settings.audit.export_csv', 'Exporter CSV')}
          </button>
          {exportErr && (
            <span style={{ fontSize: 11, color: '#dc2626' }}>
              {t('settings.audit.export_error', 'Erreur lors de l’export')}
            </span>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={thCell}>{t('settings.audit.col_date', 'Date')}</th>
              <th style={thCell}>{t('settings.audit.col_user', 'Utilisateur')}</th>
              <th style={thCell}>{t('settings.audit.col_action', 'Action')}</th>
              <th style={thCell}>{t('settings.audit.col_entity', 'Entité')}</th>
              <th style={thCell}>{t('settings.audit.col_details', 'Détails')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>...</td></tr>
            )}
            {!loading && data.logs.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>
                {t('settings.audit.empty', 'Aucune entrée')}
              </td></tr>
            )}
            {!loading && data.logs.map(log => {
              const open = !!expanded[log.id];
              const detailsStr = (() => {
                try { return JSON.stringify(log.details || {}, null, 2); }
                catch { return ''; }
              })();
              return (
                <tr key={log.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={tdCell}>{fmt(log.created_at)}</td>
                  <td style={tdCell}>{log.user_name || log.user_email || '—'}</td>
                  <td style={tdCell}><code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{actionLabel(log.action)}</code></td>
                  <td style={tdCell}>
                    {log.entity_type ? `${log.entity_type}${log.entity_id ? ` · ${String(log.entity_id).slice(0, 8)}` : ''}` : '—'}
                  </td>
                  <td style={tdCell}>
                    {detailsStr && detailsStr !== '{}' ? (
                      <>
                        <button
                          onClick={() => setExpanded(p => ({ ...p, [log.id]: !p[log.id] }))}
                          style={{ background: 'none', border: 'none', color: '#059669', cursor: 'pointer', fontSize: 12, padding: 0 }}
                        >
                          {open ? '▼' : '▶'} JSON
                        </button>
                        {open && (
                          <pre style={{ marginTop: 6, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#334155', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                            {detailsStr}
                          </pre>
                        )}
                      </>
                    ) : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {data.totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {t('settings.audit.pagination', '{{count}} entrées', { count: data.total })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: 13, opacity: page <= 1 ? 0.5 : 1 }}
            >‹</button>
            <span style={{ padding: '6px 12px', fontSize: 13, color: '#475569' }}>{page} / {data.totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(data.totalPages, p + 1))}
              disabled={page >= data.totalPages}
              style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: page >= data.totalPages ? 'not-allowed' : 'pointer', fontSize: 13, opacity: page >= data.totalPages ? 0.5 : 1 }}
            >›</button>
          </div>
        </div>
      )}
    </div>
  );
}

const thCell = { textAlign: 'left', padding: '12px 16px', fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 };
const tdCell = { padding: '12px 16px', color: '#334155', verticalAlign: 'top' };

// ═══ CONTACT ═══
// Available to admin / sales / partner / superadmin. Three cards
// (Sales / Support / Resources) with mailto + external links —
// no API calls, no tenant scoping, just a clean way to reach the
// team without leaving Settings.
function ContactTab() {
  const { t } = useTranslation();
  const cards = [
    {
      icon: Mail,
      iconBg: '#ecfdf5',
      iconColor: '#059669',
      titleKey: 'settings.contact.sales_title',
      titleDefault: 'Commercial',
      descKey: 'settings.contact.sales_desc',
      descDefault: 'Questions sur les plans, démos, partenariats',
      href: 'mailto:sales@refboost.io',
      label: 'sales@refboost.io',
      labelColor: '#059669',
      external: false,
    },
    {
      icon: LifeBuoy,
      iconBg: '#eff6ff',
      iconColor: '#2563eb',
      titleKey: 'settings.contact.support_title',
      titleDefault: 'Support technique',
      descKey: 'settings.contact.support_desc',
      descDefault: 'Aide sur votre compte, bugs, intégrations',
      href: 'mailto:support@refboost.io',
      label: 'support@refboost.io',
      labelColor: '#2563eb',
      external: false,
    },
    {
      icon: BookOpen,
      iconBg: '#f8fafc',
      iconColor: '#64748b',
      titleKey: 'settings.contact.docs_title',
      titleDefault: 'Ressources',
      descKey: 'settings.contact.docs_desc',
      descDefault: 'Guides, articles et bonnes pratiques',
      href: 'https://refboost.io/blog',
      label: 'refboost.io/blog →',
      labelColor: '#475569',
      external: true,
      dashed: true,
    },
  ];
  return (
    <div style={{ maxWidth: 520 }}>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {t('settings.contact.title', 'Contact')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('settings.contact.subtitle', "Besoin d'aide ou d'informations ? Contactez notre équipe.")}
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {cards.map(c => (
          <div
            key={c.titleKey}
            style={{
              border: c.dashed ? '1.5px dashed #e2e8f0' : '1px solid #e2e8f0',
              borderRadius: 12, padding: 16, background: '#fff',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                background: c.iconBg, color: c.iconColor,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <c.icon size={20} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>
                  {t(c.titleKey, c.titleDefault)}
                </div>
                <div style={{ fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>
                  {t(c.descKey, c.descDefault)}
                </div>
              </div>
            </div>
            <a
              href={c.href}
              {...(c.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              style={{
                display: 'block', marginTop: 12,
                fontSize: 13, fontWeight: 600,
                color: c.labelColor, textDecoration: 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.textDecoration = 'underline'; }}
              onMouseLeave={e => { e.currentTarget.style.textDecoration = 'none'; }}
            >
              {c.label}
            </a>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══ MON COMPTE ═══
function AccountTab({ user }) {
  const { t } = useTranslation();
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  const handlePasswordChange = async () => {
    if (pwForm.newPw.length < 8) { setPwMsg({ type: 'error', text: t('settings.password_min8') }); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({ type: 'error', text: t('settings.password_mismatch') }); return; }
    setPwSaving(true); setPwMsg(null);
    try { await api.changePassword(pwForm.current, pwForm.newPw); setPwMsg({ type: 'success', text: t('settings.password_updated') }); setPwForm({ current: '', newPw: '', confirm: '' }); }
    catch (err) { setPwMsg({ type: 'error', text: err.message }); }
    setPwSaving(false);
  };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>{t('settings.tab_account')}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 20, background: '#f8fafc', borderRadius: 14, marginBottom: 28, border: '1px solid #e2e8f0' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: user?.role === 'admin' ? '#6366f1' : user?.role === 'commercial' ? '#0891b2' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>
          {user?.fullName?.charAt(0) || '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{user?.fullName}</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{user?.email} · <span style={{ textTransform: 'capitalize', color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{user?.role}</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Lock size={16} color="#6366f1" />
        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{t('settings.change_pwd')}</h4>
      </div>
      {pwMsg && (<div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500, background: pwMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: pwMsg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>{pwMsg.text}</div>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
        <div>
          <label style={labelStyle}>{t('settings.pwd_current')}</label>
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} style={inputStyle} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div><label style={labelStyle}>{t('settings.pwd_new')}</label><input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder={t('settings.password_min8')} style={inputStyle} /></div>
        <div><label style={labelStyle}>{t('settings.pwd_confirm')}</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} /></div>
        <button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} style={{ padding: '11px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: pwSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: 'fit-content' }}><Lock size={14} /> {pwSaving ? t('settings.updating') : t('settings.update')}</button>
      </div>

      {/* MFA / 2FA section */}
      <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #e2e8f0' }}>
        <MfaSection />
      </div>

      {/* Confidentialité — GDPR Article 17 + 20. Moved here from the
          standalone partner "Confidentialité" tab; admin owners see
          the same section with a tenant-deletion CTA instead of the
          per-user one. The section itself decides via /account-info
          whether to render anything (commercials + invited admins
          get nothing). */}
      <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #e2e8f0' }}>
        <PrivacySection user={user} />
      </div>

      {/* Language — moved out of the sidebar so the only language entry
          point lives in the user's account settings. */}
      <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Globe size={16} color="#6366f1" />
          <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('settings.language') || 'Langue'}</h4>
        </div>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px', lineHeight: 1.55 }}>
          {t('settings.language_help') || 'Choisissez la langue d\'affichage de l\'interface.'}
        </p>
        <div style={{ maxWidth: 260 }}>
          <LanguageSwitcher direction="up" dark={false} style={{ width: '100%' }}/>
        </div>
      </div>

      <LoginHistoryCard />
    </div>
  );
}

// ═══ LOGIN HISTORY ═══
// Last 20 successful login events for the signed-in user. SOC 2 CC6.1
// gives users visibility into where their account has been used and a
// "this wasn't me" panic button that bumps users.token_version,
// invalidating every existing JWT (including the current device's).
function parseUserAgent(ua) {
  if (!ua) return { device: '—', browser: '' };
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  let browser = 'Browser';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) browser = 'Safari';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  let os = '';
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';
  return { device: `${os || (isMobile ? 'Mobile' : 'Desktop')}`, browser };
}

function LoginHistoryCard() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [logins, setLogins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Initial slice — "Voir plus" reveals 10 more per click instead of
  // dumping the full ~50 rows the BE returns. Resets when the data
  // refetches.
  const LOGIN_PAGE_STEP = 10;
  const [visibleCount, setVisibleCount] = useState(LOGIN_PAGE_STEP);
  useEffect(() => { setVisibleCount(LOGIN_PAGE_STEP); }, [logins.length]);
  const visibleLogins = logins.slice(0, visibleCount);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getLoginHistory()
      .then(d => { if (!cancelled) setLogins(d?.logins || []); })
      .catch(() => { if (!cancelled) setLogins([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const fmt = (d) => {
    if (!d) return '—';
    try {
      return new Date(d).toLocaleString(i18n.language || 'fr-FR', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return String(d); }
  };

  const handleConfirmInvalidate = async () => {
    setSubmitting(true);
    try {
      await api.invalidateSessions();
      // Local logout + navigate to /login. The api client also bails
      // out as soon as the next request hits a 401 from the bumped
      // token_version, but going there proactively skips the round-trip.
      try { showToast(t('settings.profile.login_history.toast_invalidated', 'Sessions invalidées')); } catch {}
      api.setToken(null);
      api.setUser(null);
      navigate('/login', { replace: true });
    } catch (e) {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <MonitorSmartphone size={16} color="#6366f1" />
          <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
            {t('settings.profile.login_history.title', 'Connexions récentes')}
          </h4>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 12px', borderRadius: 8,
            border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626',
            fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          <AlertTriangle size={13} />
          {t('settings.profile.login_history.invalidate_cta', "Ce n'était pas moi")}
        </button>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={thCell}>{t('settings.profile.login_history.col_date', 'Date')}</th>
              <th style={thCell}>{t('settings.profile.login_history.col_ip', 'IP')}</th>
              <th style={thCell}>{t('settings.profile.login_history.col_device', 'Appareil')}</th>
              <th style={thCell}>{t('settings.profile.login_history.col_method', 'Méthode')}</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>...</td></tr>
            )}
            {!loading && logins.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                {t('settings.profile.login_history.empty', 'Aucune connexion récente')}
              </td></tr>
            )}
            {!loading && visibleLogins.map((row, idx) => {
              const ua = parseUserAgent(row.user_agent);
              return (
                <tr key={idx} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={tdCell}>{fmt(row.created_at)}</td>
                  <td style={tdCell}><code style={{ fontSize: 12, background: '#f1f5f9', padding: '2px 6px', borderRadius: 4 }}>{row.ip || '—'}</code></td>
                  <td style={tdCell}>{ua.device}{ua.browser ? ` · ${ua.browser}` : ''}</td>
                  <td style={tdCell}>{row.method || 'password'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!loading && visibleCount < logins.length && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0', borderTop: '1px solid #f1f5f9' }}>
            <button
              type="button"
              onClick={() => setVisibleCount(c => c + LOGIN_PAGE_STEP)}
              style={{
                padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0',
                background: '#fff', color: '#475569', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {t('settings.profile.login_history.see_more', { count: Math.min(LOGIN_PAGE_STEP, logins.length - visibleCount), defaultValue: 'Voir {{count}} de plus' })}
            </button>
          </div>
        )}
      </div>

      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(15,23,42,0.6)' }}>
          <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 460, width: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {t('settings.profile.login_history.invalidate_modal_title', 'Déconnecter toutes les sessions ?')}
            </h3>
            <p style={{ margin: '0 0 20px', color: '#475569', fontSize: 14, lineHeight: 1.5 }}>
              {t('settings.profile.login_history.invalidate_modal_body', 'Vous serez déconnecté de tous vos appareils, y compris celui-ci. Vous devrez vous reconnecter.')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={submitting}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
              >
                {t('settings.profile.login_history.cancel', 'Annuler')}
              </button>
              <button
                type="button"
                onClick={handleConfirmInvalidate}
                disabled={submitting}
                style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: submitting ? 0.6 : 1 }}
              >
                {t('settings.profile.login_history.confirm_invalidate', 'Tout déconnecter')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ MFA / 2FA ═══
// State machine:
//   loading → disabled / enabled
//   disabled → setup (QR) → backup-codes display → enabled
//   enabled → disable modal (TOTP code) → disabled
function MfaSection() {
  const { t } = useTranslation();
  const [status, setStatus] = useState('loading'); // loading|disabled|setup|backup|enabled
  const [setupData, setSetupData] = useState(null); // { qrCode, secret, otpauthUri }
  const [setupCode, setSetupCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [showDisable, setShowDisable] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const data = await api.mfaStatus();
        setStatus(data.mfa_enabled ? 'enabled' : 'disabled');
      } catch {
        setStatus('disabled');
      }
    })();
  }, []);

  const handleStartSetup = async () => {
    setError(null); setBusy(true);
    try {
      const data = await api.mfaSetup();
      setSetupData(data);
      setStatus('setup');
    } catch (err) {
      setError(err.message || t('mfa.invalid_code'));
    }
    setBusy(false);
  };

  const handleVerify = async () => {
    if (!/^[0-9]{6}$/.test(setupCode)) {
      setError(t('mfa.invalid_code'));
      return;
    }
    setError(null); setBusy(true);
    try {
      const data = await api.mfaVerify(setupCode);
      setBackupCodes(data.backup_codes || []);
      setStatus('backup');
      setSetupCode('');
    } catch (err) {
      setError(err.message || t('mfa.invalid_code'));
    }
    setBusy(false);
  };

  const handleDownloadCodes = () => {
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob(
      [t('mfa.backup_codes_title') + '\n\n' + backupCodes.join('\n') + '\n'],
      { type: 'text/plain;charset=utf-8' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `refboost-backup-codes-${today}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const handleConfirmSaved = () => {
    setBackupCodes([]);
    setSetupData(null);
    setStatus('enabled');
  };

  const handleDisable = async () => {
    if (!disableCode) { setError(t('mfa.invalid_code')); return; }
    setError(null); setBusy(true);
    try {
      await api.mfaDisable(disableCode);
      setShowDisable(false);
      setDisableCode('');
      setStatus('disabled');
    } catch (err) {
      setError(err.message || t('mfa.invalid_code'));
    }
    setBusy(false);
  };

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <Shield size={16} color="#6366f1" />
        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('mfa.title')}</h4>
      </div>

      {error && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca' }}>
          {error}
        </div>
      )}

      {status === 'loading' && (
        <div style={{ color: '#94a3b8', fontSize: 13 }}>…</div>
      )}

      {status === 'disabled' && (
        <button
          onClick={handleStartSetup}
          disabled={busy}
          style={{ padding: '11px 18px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}
        >
          {t('mfa.activate_cta')}
        </button>
      )}

      {status === 'setup' && setupData && (
        <div>
          <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px', lineHeight: 1.55 }}>
            {t('mfa.scan_with_app')}
          </p>
          <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap', marginBottom: 18 }}>
            <img src={setupData.qrCode} alt="QR" style={{ width: 200, height: 200, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff' }} />
            <div style={{ flex: '1 1 220px', minWidth: 220 }}>
              <div style={{ color: '#64748b', fontSize: 12, marginBottom: 4 }}>{t('mfa.manual_entry')}</div>
              <div style={{ fontFamily: 'monospace', fontSize: 14, padding: '10px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
                {setupData.secret}
              </div>
            </div>
          </div>
          <div style={{ maxWidth: 260, marginBottom: 12 }}>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={setupCode}
              onChange={e => setSetupCode(e.target.value.replace(/\D/g, ''))}
              placeholder={t('mfa.code_placeholder')}
              style={inputStyle}
            />
          </div>
          <button
            onClick={handleVerify}
            disabled={busy || setupCode.length !== 6}
            style={{ padding: '11px 18px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: busy ? 'wait' : 'pointer', opacity: (busy || setupCode.length !== 6) ? 0.6 : 1 }}
          >
            {t('mfa.verify_cta')}
          </button>
        </div>
      )}

      {status === 'backup' && (
        <div>
          <h5 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 6px' }}>{t('mfa.backup_codes_title')}</h5>
          <p style={{ color: '#b91c1c', fontSize: 13, margin: '0 0 14px', lineHeight: 1.55, fontWeight: 500 }}>
            {t('mfa.backup_codes_warning')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxWidth: 360, marginBottom: 16 }}>
            {backupCodes.map((c, i) => (
              <div key={i} style={{ fontFamily: 'monospace', fontSize: 14, padding: '8px 12px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', textAlign: 'center', letterSpacing: 1 }}>{c}</div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              onClick={handleDownloadCodes}
              style={{ padding: '10px 16px', borderRadius: 10, background: '#fff', color: '#0f172a', border: '1.5px solid #e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {t('mfa.download_codes')}
            </button>
            <button
              onClick={handleConfirmSaved}
              style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {t('mfa.codes_saved_cta')}
            </button>
          </div>
        </div>
      )}

      {status === 'enabled' && (
        <div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 999, background: '#d1fae5', color: '#065f46', fontSize: 12, fontWeight: 700, marginBottom: 14 }}>
            <CheckCircle size={14} /> {t('mfa.active_badge')}
          </div>
          <div>
            <button
              onClick={() => setShowDisable(true)}
              style={{ padding: '10px 16px', borderRadius: 10, background: '#fff', color: '#dc2626', border: '1.5px solid #fecaca', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
            >
              {t('mfa.disable_cta')}
            </button>
          </div>
        </div>
      )}

      {showDisable && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(4px)' }}>
          <div style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{t('mfa.disable_modal_title')}</h3>
            <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px', lineHeight: 1.55 }}>{t('mfa.disable_modal_body')}</p>
            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              value={disableCode}
              onChange={e => setDisableCode(e.target.value)}
              placeholder={t('mfa.code_placeholder')}
              style={inputStyle}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => { setShowDisable(false); setDisableCode(''); setError(null); }}
                style={{ padding: '10px 16px', borderRadius: 10, background: '#fff', color: '#0f172a', border: '1.5px solid #e2e8f0', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
              >
                {t('mfa.cancel')}
              </button>
              <button
                onClick={handleDisable}
                disabled={busy || !disableCode}
                style={{ padding: '10px 16px', borderRadius: 10, background: '#dc2626', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (busy || !disableCode) ? 0.6 : 1 }}
              >
                {t('mfa.confirm_disable')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ SUPER ADMINS (vue superadmin) ═══
function SuperAdminsTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [superadmins, setSuperadmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saEmail, setSaEmail] = useState('');
  const [saName, setSaName] = useState('');
  const [saSubmitting, setSaSubmitting] = useState(false);

  const loadSuperadmins = async () => {
    setLoading(true);
    try {
      const data = await api.request('/super-admin/superadmins');
      setSuperadmins(data.superadmins || []);
    } catch (e) {
      console.error('Failed to load superadmins:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadSuperadmins(); }, []);

  const handleInvite = async () => {
    if (!saEmail) return;
    setSaSubmitting(true);
    try {
      await api.request('/super-admin/invite-superadmin', { method: 'POST', body: JSON.stringify({ email: saEmail, full_name: saName || saEmail }), headers: { 'Content-Type': 'application/json' } });
      showToast.success(t('settings.sa_invited_prefix') + saEmail);
      setSaEmail('');
      setSaName('');
      loadSuperadmins();
    } catch (e) {
      showToast.error(t('settings.erreur_prefix') + e.message);
    }
    setSaSubmitting(false);
  };

  const handleDeleteSA = async (sa) => {
    const ok = await showConfirm({
      title: t('settings.remove_superadmin_title', 'Retirer ce super admin ?'),
      message: t('settings.confirm_remove_superadmin', { name: sa.full_name || sa.email }),
      variant: 'danger',
      confirmLabel: t('common.delete', 'Retirer'),
      cancelLabel: t('common.cancel', 'Annuler'),
    });
    if (!ok) return;
    try {
      await api.request('/super-admin/delete-superadmin/' + sa.id, { method: 'DELETE' });
      showToast.success(t('settings.sa_deleted'));
      loadSuperadmins();
    } catch (e) {
      showToast.error(t('settings.erreur_prefix') + e.message);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{t('settings.superadmins_title')}</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>{t('settings.superadmins_desc')}</p>
      </div>

      <div style={{ marginBottom: 24, padding: 20, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#581c87' }}>{t('settings.invite_superadmin')}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b21a8' }}>{t('settings.invite_sa_long')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="email" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder={t('settings.email_ph_example')} style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box' }} />
          <input type="text" value={saName} onChange={e => setSaName(e.target.value)} placeholder={t('settings.full_name')} style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box' }} />
          <button disabled={saSubmitting || !saEmail} onClick={handleInvite} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saSubmitting ? 'not-allowed' : 'pointer', opacity: saSubmitting ? 0.6 : 1, whiteSpace: 'nowrap' }}>{saSubmitting ? t('settings.sending') : t('settings.invite')}</button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.list_label')} ({superadmins.length})</h3>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>{t('settings.loading')}</div>
        ) : superadmins.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>{t('settings.no_super_admin')}</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {superadmins.map((sa, idx) => (
              <div key={sa.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(sa.full_name || sa.email).charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{sa.full_name || '—'}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{sa.email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: sa.is_active ? '#d1fae5' : '#fee2e2', color: sa.is_active ? '#065f46' : '#991b1b', fontSize: 12, fontWeight: 600 }}>{sa.is_active ? t('settings.active') : t('settings.inactive')}</span>
                  {sa.id !== user?.id && <button onClick={() => handleDeleteSA(sa)} style={{ padding: '4px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>{t('common.delete')}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ MEMBRES ═══
function MembersTab() {
  const { t } = useTranslation();
  const ROLE_CONFIG = {
    admin: { label: t('settings.role_admin_short'), icon: Shield, color: '#dc2626', bg: '#fef2f2' },
    commercial: { label: t('settings.role_member'), icon: Briefcase, color: '#0891b2', bg: '#ecfeff' },
  };
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'commercial' });
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);

  const handleDeleteUser = async (id) => {
    try { await api.request('/admin/users/' + id, { method: 'DELETE' }); setDeleteUserConfirm(null); load(); }
    catch (err) { showToast.error(err.message); }
  };

  const load = async () => { try { const u = await api.getAdminUsers(); setUsers(u.users); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);
  const founderAdminId = users.filter(u => u.role === 'admin').sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]?.id;

  const handleInvite = async () => {
    setSending(true); setInviteResult(null);
    try { const data = await api.inviteUser(inviteForm); setInviteResult({ email: data.email || inviteForm.email, tempPassword: data.tempPassword }); setInviteForm({ email: '', full_name: '', role: 'commercial' }); load(); }
    catch (err) { showToast.error(err.message); }
    setSending(false);
  };

  const copyToClipboard = (tx) => { navigator.clipboard.writeText(tx); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{t('settings.members_title')}</h3>
        <button onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: showInvite ? '#f1f5f9' : 'var(--rb-primary, #059669)', color: showInvite ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {showInvite ? <X size={14} /> : <UserPlus size={14} />} {showInvite ? t('settings.cancel') : t('settings.add')}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' }} className="fade-in">
          {inviteResult ? (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={32} color="#16a34a" style={{ marginBottom: 10 }} />
              <h4 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>{t('settings.member_created')}</h4>
              <div style={{ background: '#fff', borderRadius: 10, padding: 16, display: 'inline-block', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontSize: 11 }}>{t('settings.email')}</span><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{inviteResult.email}</div></div>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontSize: 11 }}>{t('settings.temp_password')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ background: '#eef2ff', padding: '4px 10px', borderRadius: 6, color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 15 }}>{inviteResult.tempPassword}</code>
                    <button onClick={() => copyToClipboard(inviteResult.tempPassword)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 5, padding: 4, cursor: 'pointer', display: 'flex' }}>{copied ? <CheckCircle size={12} color="#16a34a" /> : <Copy size={12} color="#6366f1" />}</button>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}><button onClick={() => { setShowInvite(false); setInviteResult(null); }} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>OK</button></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.name_required_label')}</label><input value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} placeholder={t('settings.full_name_ph')} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.email_required_label')}</label><input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder={t('settings.email_ph_work')} type="email" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
              </div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.role_label')}</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setInviteForm(f => ({ ...f, role: k }))} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: inviteForm.role === k ? `2px solid ${v.color}` : '2px solid #e2e8f0', background: inviteForm.role === k ? v.bg : '#fff', color: v.color, display: 'flex', alignItems: 'center', gap: 5 }}><v.icon size={13} /> {v.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleInvite} disabled={sending || !inviteForm.email || !inviteForm.full_name} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: sending ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content' }}><UserPlus size={14} /> {sending ? t('settings.creating') : t('settings.create')}</button>
            </div>
          )}
        </div>
      )}

      {/* Delete user confirmation modal */}
      {deleteUserConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteUserConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 400, boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Trash2 size={28} color="#dc2626" /></div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{t('settings.delete_user_confirm')}</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.irreversible_action')}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteUserConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('settings.cancel')}</button>
              <button onClick={() => handleDeleteUser(deleteUserConfirm)} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={16} /> {t('common.delete')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => {
          const role = ROLE_CONFIG[u.role];
          return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, opacity: u.is_active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: role.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><role.icon size={15} color={role.color} /></div>
                <div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{u.full_name}</div><div style={{ color: '#94a3b8', fontSize: 11 }}>{u.email}</div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={u.role} onChange={e => api.updateAdminUser(u.id, { role: e.target.value }).then(load)} style={{ padding: '3px 6px', borderRadius: 6, border: `1px solid ${role.color}30`, background: role.bg, color: role.color, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                  <option value="admin">{t('settings.role_admin_short')}</option><option value="commercial">{t('settings.role_member')}</option>
                </select>
                {u.role !== 'admin' && (<button onClick={() => api.updateAdminUser(u.id, { is_active: !u.is_active }).then(load)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                  {u.is_active ? <ToggleRight size={24} color="#16a34a" /> : <ToggleLeft size={24} color="#dc2626" />}
                </button>)}
                {u.id !== founderAdminId && (<button onClick={() => setDeleteUserConfirm(u.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={14} color="#dc2626" />
                </button>)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ INTÉGRATIONS ═══
function IntegrationsTab() {
  const { t } = useTranslation();
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [partners, setPartners] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);
  // New keys default to read-only. Toggle Write on for keys that need
  // to push referrals/partners from the client's CRM.
  const [permRead, setPermRead] = useState(true);
  const [permWrite, setPermWrite] = useState(false);

  const load = async () => { try { const [k, p] = await Promise.all([api.getApiKeys(), api.getPartners()]); setApiKeys(k.apiKeys || []); setPartners(p.partners || []); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const permissions = [];
      if (permRead) permissions.push('read');
      if (permWrite) permissions.push('write');
      const data = await api.createApiKey({
        name: keyName,
        partner_id: partnerId || null,
        permissions: permissions.length ? permissions : ['read'],
      });
      setNewKey(data.apiKey);
      setKeyName('');
      setPartnerId('');
      setPermRead(true);
      setPermWrite(false);
      load();
    }
    catch (err) { showToast.error(err.message); }
    setCreating(false);
  };

  const handleRevoke = async (id) => {
    const ok = await showConfirm({
      title: t('settings.revoke_title', 'Révoquer cette clé API ?'),
      message: t('settings.revoke_confirm'),
      variant: 'danger',
      confirmLabel: t('settings.revoke', 'Révoquer'),
    });
    if (!ok) return;
    try { await api.revokeApiKey(id); load(); } catch (err) { showToast.error(err.message); }
  };

  const copyToClipboard = (tx) => { navigator.clipboard.writeText(tx); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>{t('settings.tab_integrations')}</h3>

      {/* Unified integrations panel — filter pills (All / CRM /
          Payments / Accounting / Auth / Webhooks / History) over a
          row-card list. WebhooksSection and the sync log are surfaced
          via the Webhooks/History filters. Pennylane joined the
          panel as category=accounting so its card shape matches
          every other integration. */}
      <IntegrationsPanel />

      <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Key size={16} color="#6366f1" /><h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Open API</h4></div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{t('settings.api_desc')} <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>POST /api/v1/referrals</code> · <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>GET /api/v1/referrals</code></p>

      {newKey && (
        <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #fde68a' }} className="fade-in">
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 8 }}>{t('settings.copy_this_key_now')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ background: '#fff', padding: '8px 12px', borderRadius: 8, color: '#0f172a', fontWeight: 600, fontSize: 14, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{newKey}</code>
            <button onClick={() => copyToClipboard(newKey)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>{copied ? <CheckCircle size={16} color="#16a34a" /> : <Copy size={16} color="#6366f1" />}</button>
          </div>
        </div>
      )}

      {showCreate ? (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.name_required_label')}</label><input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder={t('settings.integrations_zapier_ph')} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.partner_optional')}</label><select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}><option value="">{t('settings.none_option')}</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 6 }}>{t('settings.api_permissions')}</div>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={permRead} onChange={e => setPermRead(e.target.checked)} />
                {t('settings.api_read')}
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#475569', cursor: 'pointer' }}>
                <input type="checkbox" checked={permWrite} onChange={e => setPermWrite(e.target.checked)} />
                {t('settings.api_write')}
              </label>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={creating || !keyName || (!permRead && !permWrite)} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: (creating || (!permRead && !permWrite)) ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}><Key size={13} /> {creating ? t('settings.creating') : t('settings.api_generate')}</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowCreate(true); setNewKey(null); }} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}><Key size={14} /> {t('settings.api_key_create')}</button>
      )}

      {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>{t('settings.loading')}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apiKeys.filter(k => k.is_active).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Key size={16} color="#6366f1" />
                <div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{k.name}</div><div style={{ color: '#94a3b8', fontSize: 11 }}><code>{k.key_prefix}</code> · {k.partner_name || t('settings.global_label')} · {t('settings.created_on')} {fmtDate(k.created_at)}{k.last_used_at && <> · {t('settings.used_on')} {fmtDate(k.last_used_at)}</>}</div></div>
              </div>
              <button onClick={() => handleRevoke(k.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
            </div>
          ))}
          {apiKeys.filter(k => k.is_active).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: 16, textAlign: 'center' }}>{t('settings.api_no_keys')}</div>}
        </div>
      )}
    </div>
  );
}

// ═══ INTEGRATIONS — unified panel ═══════════════════════════════════
//
// Filter pills (All / CRM / Payments / Auth / Webhooks / History) over
// a single row-card list. The list is driven by an array so adding a
// new integration = adding a row, not a new component. CRM + Qonto
// state lives here together so the panel can decide which cards to
// show without a second round-trip. The legacy CrmIntegrations +
// QontoSection were merged into this one function.
function IntegrationsPanel() {
  const { t } = useTranslation();

  // CRM
  const [data, setData] = useState({ integrations: [], plan: 'starter' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [mappingFor, setMappingFor] = useState(null); // CrmMappingModal target
  const [syncLog, setSyncLog] = useState([]);
  const [notion, setNotion] = useState(null);
  const [showNotionConnect, setShowNotionConnect] = useState(false);
  const [showNotionMappings, setShowNotionMappings] = useState(false);
  const [notionMsg, setNotionMsg] = useState(null);

  // Qonto (merged from the deleted QontoSection)
  const [qontoStatus, setQontoStatus] = useState(null);
  const [qontoAccounts, setQontoAccounts] = useState([]);
  const [qontoPickerOpen, setQontoPickerOpen] = useState(false);
  const [qontoMsg, setQontoMsg] = useState('');

  // Pennylane (folded in from the deleted standalone PennylaneSection).
  // Token input state is colocated here so the inline expansion can
  // gate Connecter on a non-empty value without parent props.
  const [pennylaneStatus, setPennylaneStatus] = useState(null);
  const [pennylaneToken, setPennylaneToken] = useState('');
  const [pennylaneSubmitting, setPennylaneSubmitting] = useState(false);

  // Pipedrive (P1: OAuth ; P2: pipeline picker + mappings via modal ;
  // P3: push referrals → Pipedrive, auto on every create/update plus
  // a manual "Pousser tous les referrals" rattrapage button).
  const [pipedriveStatus, setPipedriveStatus] = useState(null);
  const [pipedriveMsg, setPipedriveMsg] = useState('');
  const [pipedrivePushMsg, setPipedrivePushMsg] = useState(null); // {tone, text}
  const [pipedrivePushErrors, setPipedrivePushErrors] = useState([]); // detailed errors from last push
  const [pipedrivePushDetailsOpen, setPipedrivePushDetailsOpen] = useState(false);
  const [pipedrivePushing, setPipedrivePushing] = useState(false);
  const [showPipedriveConfig, setShowPipedriveConfig] = useState(false);

  // Filter pill + per-row expansion
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);

  const stopEv = (e) => { if (e && typeof e.stopPropagation === 'function') { e.stopPropagation(); e.preventDefault(); } };

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getCrmIntegrations();
      setData(d);
      const log = await api.getCrmSyncLog().catch(() => ({ log: [] }));
      setSyncLog(log.log || []);
      const n = await api.getNotionStatus().catch(() => null);
      setNotion(n);
      const q = await api.getQontoStatus().catch(() => null);
      setQontoStatus(q);
      const pl = await api.getPennylaneStatus().catch(() => null);
      setPennylaneStatus(pl);
      const pd = await api.getPipedriveStatus().catch(() => null);
      setPipedriveStatus(pd);
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  // Qonto OAuth callback handler — kept verbatim from the old
  // QontoSection so the ?qonto=connected/error redirect still
  // surfaces inline.
  useEffect(() => {
    const u = new URL(window.location.href);
    const flag = u.searchParams.get('qonto');
    if (flag === 'connected') {
      setQontoMsg(t('qonto.connected_ok', 'Qonto connecté.'));
      setTimeout(() => setQontoMsg(''), 5000);
    } else if (flag === 'error') {
      setErr(t('qonto.connect_error', 'Connexion Qonto échouée.'));
    }
    if (flag) {
      u.searchParams.delete('qonto');
      const cleanUrl = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [t]);

  // Pipedrive OAuth callback handler — pipedrive_success=1 or
  // pipedrive_error=<code>&detail=<text>. We strip both query params
  // after surfacing so a refresh doesn't replay the toast.
  useEffect(() => {
    const u = new URL(window.location.href);
    const success = u.searchParams.get('pipedrive_success');
    const errorCode = u.searchParams.get('pipedrive_error');
    const detail = u.searchParams.get('detail');
    if (success === '1') {
      setPipedriveMsg(t('pipedrive.connect_success', 'Pipedrive a été connecté avec succès'));
      setTimeout(() => setPipedriveMsg(''), 5000);
      // Refresh status so the card flips to "connected" without
      // waiting for the next mount.
      api.getPipedriveStatus().then(setPipedriveStatus).catch(() => {});
    } else if (errorCode) {
      setErr(t('pipedrive.connect_error', { detail: detail || errorCode, defaultValue: 'La connexion à Pipedrive a échoué : {{detail}}' }));
    }
    if (success || errorCode) {
      u.searchParams.delete('pipedrive_success');
      u.searchParams.delete('pipedrive_error');
      u.searchParams.delete('detail');
      const cleanUrl = u.pathname + (u.searchParams.toString() ? '?' + u.searchParams.toString() : '');
      window.history.replaceState({}, '', cleanUrl);
    }
  }, [t]);

  // Esc closes Qonto account picker
  useEffect(() => {
    if (!qontoPickerOpen) return;
    const onKey = (e) => { if (e.key === 'Escape') setQontoPickerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [qontoPickerOpen]);

  const isBusiness = data.plan === 'business' || data.plan === 'enterprise';
  const byProvider = (p) => (data.integrations || []).find(i => i.provider === p);

  // ─── Connect / disconnect handlers ────────────────────────────────
  const connectHubspot = async (e) => {
    stopEv(e); setBusy(true); setErr('');
    try {
      const { url } = await api.getHubspotAuthUrl();
      if (url) window.location.href = url;
    } catch (e) {
      if (e?.data?.error === 'plan_upgrade_required') setErr(t('crm.upgrade_required_body'));
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const disconnectHubspot = async (e) => {
    stopEv(e); setBusy(true);
    try { await api.disconnectHubspot(); load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const connectSalesforce = async (e) => {
    stopEv(e); setBusy(true); setErr('');
    try {
      const { url } = await api.getSalesforceAuthUrl();
      if (url) window.location.href = url;
    } catch (e) {
      if (e?.data?.error === 'plan_upgrade_required') setErr(t('crm.upgrade_required_body'));
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const disconnectSalesforce = async (e) => {
    stopEv(e); setBusy(true);
    try { await api.disconnectSalesforce(); load(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  const syncNotion = async (e) => {
    stopEv(e); setBusy(true); setNotionMsg(null);
    try {
      const r = await api.syncAllNotion();
      if (!r.ok) throw new Error(r.error || 'sync_failed');
      load();
      setNotionMsg({ tone: 'success', text: t('notion.sync_ok_push', { pushed: r.pushed ?? 0, total: r.total ?? 0, pulled: r.pulled ?? 0 }) });
      setTimeout(() => setNotionMsg(null), 6000);
    } catch (err) {
      setNotionMsg({ tone: 'error', text: err.message || t('notion.sync_failed') });
    } finally { setBusy(false); }
  };
  const disconnectNotion = async (e) => {
    stopEv(e); setBusy(true); setNotionMsg(null);
    try {
      await api.disconnectNotion();
      load();
      setNotionMsg({ tone: 'success', text: t('notion.disconnect_ok') });
      setTimeout(() => setNotionMsg(null), 4000);
    } catch (err) {
      setNotionMsg({ tone: 'error', text: err.message });
    } finally { setBusy(false); }
  };

  const connectQonto = async () => {
    setBusy(true); setErr('');
    try {
      const { url } = await api.getQontoConnectUrl();
      if (url) window.location.href = url;
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const disconnectQonto = async () => {
    const ok = await showConfirm({
      title: t('qonto.disconnect_title', 'Déconnecter Qonto'),
      message: t('qonto.disconnect_confirm', 'Êtes-vous sûr de vouloir déconnecter Qonto ?'),
      variant: 'danger',
      confirmLabel: t('crm.disconnect', 'Déconnecter'),
    });
    if (!ok) return;
    setBusy(true);
    try { await api.disconnectQonto(); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // ─── Pipedrive ─────────────────────────────────────────────────────
  const connectPipedrive = async (e) => {
    stopEv(e); setBusy(true); setErr('');
    try {
      const { authorize_url } = await api.connectPipedrive();
      if (authorize_url) window.location.href = authorize_url;
    } catch (e) {
      if (e?.data?.error === 'plan_upgrade_required') setErr(t('crm.upgrade_required_body'));
      else if (e?.data?.error === 'pipedrive_not_configured') setErr(t('pipedrive.not_configured', 'Pipedrive n\'est pas configuré sur ce service. Contactez l\'admin RefBoost.'));
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const pushAllPipedrive = async (e) => {
    stopEv(e);
    if (pipedrivePushing) return;
    setPipedrivePushing(true);
    setPipedrivePushMsg(null);
    setPipedrivePushErrors([]);
    try {
      const r = await api.pushAllToPipedrive();
      const summary = t('pipedrive.push_all_done', {
        pushed: r.pushed ?? 0,
        total: r.total ?? 0,
        failed: r.failed ?? 0,
        defaultValue: '{{pushed}}/{{total}} referrals poussés ({{failed}} échec(s))',
      });
      setPipedrivePushMsg({ tone: r.failed ? 'warning' : 'success', text: summary });
      setPipedrivePushErrors(Array.isArray(r.errors) ? r.errors : []);
    } catch (err) {
      setPipedrivePushMsg({ tone: 'error', text: err?.message || t('pipedrive.push_all_error', 'Échec du push Pipedrive') });
      setPipedrivePushErrors([]);
    } finally {
      setPipedrivePushing(false);
    }
  };

  const disconnectPipedrive = async (e) => {
    stopEv(e);
    const ok = await showConfirm({
      title: t('pipedrive.disconnect_title', 'Déconnecter Pipedrive'),
      message: t('pipedrive.disconnect_confirm', 'Êtes-vous sûr de vouloir déconnecter Pipedrive ? Vous pourrez vous reconnecter à tout moment.'),
      variant: 'danger',
      confirmLabel: t('crm.disconnect', 'Déconnecter'),
    });
    if (!ok) return;
    setBusy(true);
    try { await api.disconnectPipedrive(); await load(); }
    catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const openQontoPicker = async () => {
    setBusy(true); setErr('');
    try {
      const d = await api.getQontoBankAccounts();
      setQontoAccounts(d?.bank_accounts || []);
      setQontoPickerOpen(true);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  const pickQontoAccount = async (acc) => {
    setBusy(true); setErr('');
    try {
      await api.selectQontoBankAccount({ bank_account_id: acc.id, iban: acc.iban, label: acc.label });
      setQontoPickerOpen(false);
      await load();
      setQontoMsg(t('qonto.account_selected', 'Compte sélectionné.'));
      setTimeout(() => setQontoMsg(''), 4000);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  // ─── Build the integration list ───────────────────────────────────
  const hubspot = byProvider('hubspot');
  const salesforce = byProvider('salesforce');
  const qontoConnected = !!qontoStatus?.connected;
  const qontoConfigured = !!qontoStatus?.configured;
  const qontoPlanAllowed = (qontoStatus?.plan === 'business' || qontoStatus?.plan === 'enterprise');

  const fmt = (iso) => iso ? new Date(iso).toLocaleString() : '—';

  const integrations = [
    {
      id: 'notion',
      category: 'crm',
      name: t('notion.title', 'Notion'),
      description: t('notion.description'),
      letter: 'N',
      color: '#111827',
      logo: '/images/integrations/notion-logo.png',
      connected: !!notion?.connected,
      meta: notion?.connected
        ? t('settings.integrations.meta_notion', {
            last: notion.lastPullAt ? fmt(notion.lastPullAt) : '—',
            time: notion.nightlyScheduleParis || '21:00',
            defaultValue: 'Dernière sync : {{last}} — Sync auto : {{time}}',
          })
        : null,
      planRequired: !isBusiness,
    },
    {
      id: 'hubspot',
      category: 'crm',
      name: t('crm.hubspot', 'HubSpot'),
      description: t('crm.hubspot_desc'),
      letter: 'H',
      color: '#ff7a59',
      logo: '/images/integrations/hubspot-logo.svg',
      connected: !!hubspot?.is_active,
      meta: hubspot?.is_active && hubspot?.updated_at
        ? t('settings.integrations.meta_connected_at', { at: fmt(hubspot.updated_at), defaultValue: 'Connecté · {{at}}' })
        : null,
      planRequired: !isBusiness,
    },
    {
      id: 'salesforce',
      category: 'crm',
      name: t('crm.salesforce', 'Salesforce'),
      description: t('crm.salesforce_desc'),
      letter: 'S',
      color: '#00a1e0',
      logo: '/images/integrations/salesforce-logo.svg',
      connected: !!salesforce?.is_active,
      meta: salesforce?.is_active && salesforce?.updated_at
        ? t('settings.integrations.meta_connected_at', { at: fmt(salesforce.updated_at), defaultValue: 'Connecté · {{at}}' })
        : null,
      planRequired: !isBusiness,
    },
    {
      id: 'pipedrive',
      category: 'crm',
      name: t('pipedrive.title', 'Pipedrive'),
      description: t('pipedrive.description_short', 'Synchronisez vos referrals avec votre pipeline Pipedrive'),
      letter: 'P',
      color: '#1a1a1a',
      logo: '/images/integrations/pipedrive-logo.svg',
      connected: !!pipedriveStatus?.connected,
      meta: pipedriveStatus?.connected
        ? t('pipedrive.connected_to', {
            domain: (pipedriveStatus.api_domain || '').replace(/^https?:\/\//, '') || '—',
            defaultValue: 'Connecté à {{domain}}',
          })
        : null,
      // The /status endpoint exposes plan_allowed so we don't have to
      // duplicate the plan logic here. Falls back to isBusiness when
      // the status hasn't loaded yet.
      planRequired: pipedriveStatus ? !pipedriveStatus.plan_allowed : !isBusiness,
    },
    {
      id: 'qonto',
      category: 'payments',
      name: t('qonto.title', 'Qonto'),
      description: t('qonto.description', 'Connectez votre compte Qonto pour payer les commissions automatiquement.'),
      letter: 'Q',
      color: '#5b50ec',
      logo: '/images/integrations/qonto-logo.svg',
      connected: qontoConnected,
      meta: qontoConnected
        ? t('settings.integrations.meta_qonto', {
            org: qontoStatus?.organization_slug || '—',
            account: qontoStatus?.bank_account_label || qontoStatus?.bank_account_iban || '—',
            defaultValue: 'Organisation : {{org}} — Compte : {{account}}',
          })
        : null,
      planRequired: !qontoPlanAllowed,
      configured: qontoConfigured,
    },
    {
      id: 'pennylane',
      category: 'accounting',
      name: 'Pennylane',
      description: t('settings.pennylane_subtitle', 'Créez automatiquement des factures fournisseurs dans Pennylane pour chaque commission.'),
      letter: 'P',
      color: '#0f172a',
      logo: '/images/integrations/pennylane-logo.svg',
      connected: !!pennylaneStatus?.connected,
      meta: pennylaneStatus?.connected
        ? (pennylaneStatus.company?.name || pennylaneStatus.company?.email || t('settings.pennylane_connected_default', 'Espace connecté'))
        : null,
    },
    {
      id: 'google-sso',
      category: 'auth',
      name: t('settings.integrations.google_sso', 'Google SSO'),
      description: t('settings.integrations.google_sso_desc', 'Authentification single sign-on avec un compte Google.'),
      letter: 'G',
      color: '#4285f4',
      logo: '/images/integrations/google-logo.svg',
      ssoActive: true, // platform-level — always available, no per-tenant config
    },
  ];

  // ─── Click handlers per integration ───────────────────────────────
  const handleConnect = (id) => {
    if (id === 'notion') setShowNotionConnect(true);
    else if (id === 'hubspot') connectHubspot();
    else if (id === 'salesforce') connectSalesforce();
    else if (id === 'pipedrive') connectPipedrive();
    else if (id === 'qonto') connectQonto();
    else if (id === 'pennylane') setExpandedId(prev => prev === 'pennylane' ? null : 'pennylane');
  };
  const handleConfigure = (id) => {
    // Toggle inline expansion for providers that show their config
    // panel inline; open a modal for those that don't.
    if (id === 'notion') {
      setShowNotionMappings(true);
    } else if (id === 'hubspot') {
      setMappingFor(hubspot);
    } else if (id === 'salesforce') {
      setMappingFor(salesforce);
    } else if (id === 'pipedrive') {
      // P2 surface: open the dedicated config modal (pipeline picker
      // + status / deal / person / organization mappings).
      setShowPipedriveConfig(true);
    } else if (id === 'qonto') {
      setExpandedId(prev => prev === 'qonto' ? null : 'qonto');
    } else if (id === 'pennylane') {
      setExpandedId(prev => prev === 'pennylane' ? null : 'pennylane');
    }
  };

  // ─── Pennylane handlers (folded in from the deleted PennylaneSection)
  const connectPennylane = async () => {
    if (!pennylaneToken) return;
    setPennylaneSubmitting(true);
    try {
      await api.updatePennylaneSettings({ api_token: pennylaneToken, enabled: true });
      setPennylaneToken('');
      const fresh = await api.getPennylaneStatus().catch(() => null);
      setPennylaneStatus(fresh);
      setExpandedId(null);
      showToast(t('settings.pennylane_connected_success', 'Connexion à Pennylane réussie !'), 'success');
    } catch (err) {
      showToast(err.message || t('settings.pennylane_connect_error', 'Token invalide.'), 'error');
    }
    setPennylaneSubmitting(false);
  };
  const disconnectPennylane = async (e) => {
    stopEv(e);
    const ok = await showConfirm({
      title: t('settings.pennylane_disconnect_title', 'Déconnecter Pennylane ?'),
      message: t('settings.pennylane_disconnect_msg', 'Les factures déjà créées resteront dans Pennylane, mais aucune nouvelle facture ne sera créée.'),
      confirmLabel: t('settings.disconnect', 'Déconnecter'),
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await api.disconnectPennylane();
      const fresh = await api.getPennylaneStatus().catch(() => null);
      setPennylaneStatus(fresh);
      setExpandedId('pennylane');
    } catch (err) { showToast(err.message, 'error'); }
  };
  const togglePennylane = async () => {
    const next = !pennylaneStatus?.enabled;
    try {
      await api.updatePennylaneSettings({ enabled: next });
      setPennylaneStatus(s => ({ ...s, enabled: next }));
    } catch (err) { showToast(err.message, 'error'); }
  };
  const handleUpgrade = () => { window.location.href = '/billing'; };

  if (loading) return <div style={{ color: '#94a3b8', padding: 16 }}>{t('settings.loading')}</div>;

  // ─── Filter pills ──────────────────────────────────────────────────
  const FILTERS = [
    { id: 'all',        label: t('settings.integrations.filter_all', 'Toutes') },
    { id: 'crm',        label: t('settings.integrations.filter_crm', 'CRM') },
    { id: 'payments',   label: t('settings.integrations.filter_payments', 'Paiements') },
    { id: 'accounting', label: t('settings.integrations.filter_accounting', 'Comptabilité') },
    { id: 'auth',       label: t('settings.integrations.filter_auth', 'Auth') },
    { id: 'webhooks',   label: t('settings.integrations.filter_webhooks', 'Webhooks') },
    { id: 'history',    label: t('settings.integrations.filter_history', 'Historique') },
  ];

  // For all/crm/payments/accounting/auth we render the card list.
  // Webhooks and History delegate to the existing components so we
  // don't duplicate their already-tested behaviour.
  const showCards = ['all', 'crm', 'payments', 'accounting', 'auth'].includes(filter);
  const visibleIntegrations = filter === 'all'
    ? integrations
    : integrations.filter(i => i.category === filter);

  return (
    <div>
      <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Plug size={16} color="#6366f1"/> {t('crm.integrations', 'Intégrations')}
      </h4>

      {err && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}
      {qontoMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{qontoMsg}</div>
      )}
      {pipedriveMsg && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#15803d', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{pipedriveMsg}</div>
      )}

      {/* Filter pills */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {FILTERS.map(f => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => { setFilter(f.id); setExpandedId(null); }}
              style={{
                padding: '6px 14px', borderRadius: 999,
                fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                cursor: 'pointer', transition: 'all .15s',
                border: '1.5px solid ' + (active ? '#0f172a' : '#e5e7eb'),
                background: active ? '#0f172a' : '#fff',
                color: active ? '#fff' : '#475569',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {showCards && (
        <div>
          {visibleIntegrations.map(integration => (
            <IntegrationRow
              key={integration.id}
              integration={integration}
              t={t}
              busy={busy}
              expanded={expandedId === integration.id}
              onConnect={() => handleConnect(integration.id)}
              onConfigure={() => handleConfigure(integration.id)}
              onUpgrade={handleUpgrade}
              onDisconnect={
                integration.id === 'hubspot' ? disconnectHubspot
                : integration.id === 'salesforce' ? disconnectSalesforce
                : integration.id === 'notion' ? disconnectNotion
                : integration.id === 'pipedrive' ? disconnectPipedrive
                : integration.id === 'qonto' ? disconnectQonto
                : integration.id === 'pennylane' ? disconnectPennylane
                : null
              }
              onSync={integration.id === 'notion' ? syncNotion : null}
              notionMsg={integration.id === 'notion' ? notionMsg : null}
              qontoStatus={integration.id === 'qonto' ? qontoStatus : null}
              onQontoOpenPicker={integration.id === 'qonto' ? openQontoPicker : null}
              pipedriveStatus={integration.id === 'pipedrive' ? pipedriveStatus : null}
              pipedrivePushMsg={integration.id === 'pipedrive' ? pipedrivePushMsg : null}
              pipedrivePushing={integration.id === 'pipedrive' ? pipedrivePushing : false}
              onPipedrivePushAll={integration.id === 'pipedrive' ? pushAllPipedrive : null}
              pipedriveErrorCount={integration.id === 'pipedrive' ? pipedrivePushErrors.length : 0}
              onPipedriveOpenDetails={integration.id === 'pipedrive' ? (() => setPipedrivePushDetailsOpen(true)) : null}
              pennylaneStatus={integration.id === 'pennylane' ? pennylaneStatus : null}
              pennylaneToken={integration.id === 'pennylane' ? pennylaneToken : ''}
              onPennylaneTokenChange={integration.id === 'pennylane' ? setPennylaneToken : null}
              onPennylaneSubmit={integration.id === 'pennylane' ? connectPennylane : null}
              onPennylaneToggle={integration.id === 'pennylane' ? togglePennylane : null}
              pennylaneSubmitting={integration.id === 'pennylane' ? pennylaneSubmitting : false}
            />
          ))}
        </div>
      )}

      {filter === 'webhooks' && <WebhooksSection />}

      {filter === 'history' && <SyncHistoryPanel log={syncLog} t={t} />}

      {/* Modals — kept identical to the old IntegrationsTab */}
      {mappingFor && (
        <CrmMappingModal integration={mappingFor} onClose={() => { setMappingFor(null); load(); }}/>
      )}
      {showNotionConnect && (
        <NotionConnectModal
          onClose={() => setShowNotionConnect(false)}
          onConnected={() => {
            setShowNotionConnect(false);
            load();
            setShowNotionMappings(true);
          }}
        />
      )}
      {showNotionMappings && (
        <NotionMappingModal
          onClose={() => { setShowNotionMappings(false); load(); }}
        />
      )}

      {showPipedriveConfig && (
        <PipedriveConfigModal
          onClose={() => { setShowPipedriveConfig(false); load(); }}
        />
      )}

      {pipedrivePushDetailsOpen && (
        <PipedrivePushErrorsModal
          errors={pipedrivePushErrors}
          onClose={() => setPipedrivePushDetailsOpen(false)}
          t={t}
        />
      )}

      {/* Qonto account picker modal */}
      {qontoPickerOpen && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => setQontoPickerOpen(false)}
        >
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.55)' }} />
          <div
            onClick={e => e.stopPropagation()}
            style={{ position: 'relative', background: '#fff', borderRadius: 16, width: 480, maxWidth: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', padding: 24 }}
          >
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>
              {t('qonto.choose_account', 'Choisir le compte à débiter')}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 360, overflowY: 'auto' }}>
              {qontoAccounts.length === 0 && (
                <div style={{ color: '#94a3b8', fontSize: 13, padding: 12 }}>{t('qonto.no_accounts', 'Aucun compte trouvé.')}</div>
              )}
              {qontoAccounts.map(acc => (
                <button
                  key={acc.id}
                  type="button"
                  onClick={() => pickQontoAccount(acc)}
                  disabled={busy}
                  style={{
                    textAlign: 'left', padding: '12px 14px', borderRadius: 10,
                    border: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer',
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#0f172a' }}>{acc.label || acc.slug || acc.iban}</div>
                  <div style={{ color: '#64748b', fontSize: 12, fontFamily: 'monospace', marginTop: 2 }}>{acc.iban}</div>
                  {typeof acc.balance !== 'undefined' && (
                    <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>{acc.currency || 'EUR'} · {acc.balance}</div>
                  )}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button onClick={() => setQontoPickerOpen(false)} style={btnSecondary}>{t('common.close', 'Fermer')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Single integration row ─────────────────────────────────────────
// Kept as a separate component so the filtered list maps cleanly; the
// row owns its own hover state only — all real state lives on
// IntegrationsTab.
function IntegrationRow({
  integration, t, busy, expanded,
  onConnect, onConfigure, onDisconnect, onUpgrade, onSync,
  notionMsg, qontoStatus, onQontoOpenPicker,
  pipedriveStatus, pipedrivePushMsg, pipedrivePushing, onPipedrivePushAll,
  pipedriveErrorCount, onPipedriveOpenDetails,
  pennylaneStatus, pennylaneToken, onPennylaneTokenChange, onPennylaneSubmit, onPennylaneToggle, pennylaneSubmitting,
}) {
  const [hover, setHover] = useState(false);
  const { name, description, meta, color, letter, logo, connected, ssoActive, planRequired, configured } = integration;

  // Status badge styles (Connecté green, Actif blue, Non connecté grey)
  const badge = ssoActive
    ? { bg: '#eff6ff', fg: '#1d4ed8', label: t('settings.integrations.active', 'Actif') }
    : connected
      ? { bg: '#f0fdf4', fg: '#15803d', label: t('settings.integrations.connected', 'Connecté') }
      : { bg: '#f3f4f6', fg: '#6b7280', label: t('settings.integrations.not_connected', 'Non connecté') };

  return (
    <div style={{
      border: '1px solid ' + (hover ? '#d1d5db' : '#e5e7eb'),
      borderRadius: 12, marginBottom: 8, transition: 'border-color .15s',
      background: '#fff', overflow: 'hidden',
    }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: 14, gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: 1 }}>
          {/* Avatar — logo when available, coloured letter as fallback */}
          <div style={{
            width: 36, height: 36, borderRadius: 8, flexShrink: 0,
            background: logo ? '#fff' : color,
            border: logo ? '1px solid #e5e7eb' : 'none',
            color: '#fff', fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: logo ? 4 : 0, overflow: 'hidden',
          }}>
            {logo ? (
              <img src={logo} alt={name} style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={e => {
                  // textContent (not innerHTML) — `letter` is derived
                  // from a partner-supplied name. innerHTML would
                  // execute any HTML the partner pasted, which is
                  // a stored-XSS vector reachable by every admin
                  // viewing the integrations panel.
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.parentElement.style.background = color;
                  e.currentTarget.parentElement.textContent = letter;
                }}
              />
            ) : letter}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#0f172a' }}>{name}</div>
            <div style={{ fontSize: 12, color: '#6b7280', lineHeight: 1.5 }}>{description}</div>
            {meta && (
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, fontStyle: 'italic' }}>{meta}</div>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 11, padding: '3px 10px', borderRadius: 999,
            background: badge.bg, color: badge.fg, fontWeight: 500,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}>
            {planRequired && <Lock size={10} />}
            {planRequired ? t('pricing.business', 'Plan Business') : badge.label}
          </span>

          {/* Buttons — Google SSO has none */}
          {ssoActive ? null : planRequired ? (
            <button onClick={onUpgrade} disabled={busy} style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 8,
              background: '#0f172a', color: '#fff', border: 'none',
              cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
            }}>
              {t('crm.upgrade_cta', 'Passer au Business')} →
            </button>
          ) : connected ? (
            <button onClick={onConfigure} disabled={busy} style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 8,
              border: '1px solid #e5e7eb', background: '#fff', color: '#0f172a',
              cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
            }}>
              {t('settings.integrations.configure', 'Configurer')}
            </button>
          ) : (
            <button onClick={onConnect} disabled={busy || (integration.id === 'qonto' && configured === false)} style={{
              fontSize: 12, padding: '6px 12px', borderRadius: 8,
              background: '#059669', color: '#fff', border: 'none',
              cursor: 'pointer', fontWeight: 500, fontFamily: 'inherit',
              opacity: (busy || (integration.id === 'qonto' && configured === false)) ? 0.6 : 1,
            }}>
              {t('settings.integrations.connect', 'Connecter')}
            </button>
          )}
        </div>
      </div>

      {/* Inline expansion — Qonto's account picker / disconnect, plus
          Notion's sync now / disconnect actions while connected. */}
      {expanded && integration.id === 'qonto' && qontoStatus?.connected && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: 14, background: '#f9fafb' }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
            <button type="button" onClick={onQontoOpenPicker} disabled={busy} style={btnSecondary}>
              {t('qonto.choose_account', 'Choisir le compte à débiter')}
            </button>
            <button type="button" onClick={onDisconnect} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>
              {t('crm.disconnect', 'Déconnecter')}
            </button>
          </div>
        </div>
      )}

      {/* Notion: when connected, surface "Sync now" + "Disconnect" as
          a small actions row right under the card so admins don't
          need to open the mappings modal just to trigger a sync. */}
      {connected && integration.id === 'notion' && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 14px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={onSync} disabled={busy} style={btnSecondary}>{t('notion.sync_now', 'Synchroniser maintenant')}</button>
          <button type="button" onClick={onDisconnect} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>{t('notion.disconnect', 'Déconnecter')}</button>
          {notionMsg && (
            <div style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600,
              background: notionMsg.tone === 'success' ? '#ecfdf5' : '#fef2f2',
              border: notionMsg.tone === 'success' ? '1px solid #6ee7b7' : '1px solid #fecaca',
              color: notionMsg.tone === 'success' ? '#047857' : '#b91c1c',
            }}>{notionMsg.text}</div>
          )}
        </div>
      )}

      {/* HubSpot / Salesforce: when connected, surface the disconnect
          shortcut. Configure goes through the modal. */}
      {connected && (integration.id === 'hubspot' || integration.id === 'salesforce') && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 14px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={onDisconnect} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>
            {t('crm.disconnect', 'Déconnecter')}
          </button>
        </div>
      )}

      {/* Pipedrive (P1): when connected, show Disconnect + a placeholder
          telling the admin that mapping/push arrive in a later cycle.
          When a token refresh has failed (last_error set on the row),
          surface a red banner prompting reconnection — that's the most
          actionable thing the admin can do until P2 lands. */}
      {integration.id === 'pipedrive' && pipedriveStatus?.last_error && (
        <div style={{ borderTop: '1px solid #fecaca', padding: '10px 14px', background: '#fef2f2', display: 'flex', alignItems: 'center', gap: 8, color: '#b91c1c', fontSize: 12 }}>
          {t('pipedrive.connection_error', 'Erreur de synchronisation, reconnectez-vous.')}
        </div>
      )}
      {/* Pipedrive: when connected, expose Pousser tous les referrals
          + Déconnecter inline under the card (same posture as Notion's
          actions row). Mapping config is opened via the dedicated
          modal — no inline expansion needed any more. */}
      {pipedriveStatus?.connected && integration.id === 'pipedrive' && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: '10px 14px', background: '#f9fafb', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button" onClick={onPipedrivePushAll} disabled={busy || pipedrivePushing}
            style={btnSecondary}
          >
            {pipedrivePushing
              ? t('pipedrive.push_all_running', 'Synchronisation…')
              : t('pipedrive.push_all', 'Pousser tous les referrals')}
          </button>
          <button type="button" onClick={onDisconnect} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>
            {t('crm.disconnect', 'Déconnecter')}
          </button>
          {pipedrivePushMsg && (() => {
            const clickable = pipedriveErrorCount > 0 && onPipedriveOpenDetails;
            return (
              <button
                type="button"
                onClick={clickable ? onPipedriveOpenDetails : undefined}
                disabled={!clickable}
                style={{
                  padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                  background: pipedrivePushMsg.tone === 'success' ? '#ecfdf5'
                            : pipedrivePushMsg.tone === 'warning' ? '#fffbeb'
                            : '#fef2f2',
                  border: '1px solid ' + (pipedrivePushMsg.tone === 'success' ? '#6ee7b7'
                                        : pipedrivePushMsg.tone === 'warning' ? '#fde68a'
                                        : '#fecaca'),
                  color: pipedrivePushMsg.tone === 'success' ? '#047857'
                       : pipedrivePushMsg.tone === 'warning' ? '#92400e'
                       : '#b91c1c',
                  cursor: clickable ? 'pointer' : 'default',
                  fontFamily: 'inherit',
                  textDecoration: clickable ? 'underline dotted' : 'none',
                }}
                title={clickable ? t('pipedrive.push_all_view_details', 'Voir le détail des erreurs') : undefined}
              >
                {pipedrivePushMsg.text}
              </button>
            );
          })()}
        </div>
      )}

      {/* Pennylane: inline expansion. Connected → auto-invoice toggle
          + disconnect link. Disconnected → token input + Connecter
          button. Mirrors the layout of the old standalone
          PennylaneSection; the visual chrome above this block comes
          from the shared IntegrationRow header. */}
      {expanded && integration.id === 'pennylane' && (
        <div style={{ borderTop: '1px solid #e5e7eb', padding: 14, background: '#f9fafb' }}>
          {pennylaneStatus?.connected ? (
            <>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                padding: '12px 14px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', marginBottom: 12,
              }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#0f172a' }}>
                    {t('settings.pennylane_auto_invoice', 'Création automatique des factures')}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                    {t('settings.pennylane_auto_invoice_desc', 'Créer une facture fournisseur dans Pennylane à chaque commission approuvée.')}
                  </div>
                </div>
                <button onClick={onPennylaneToggle} aria-pressed={!!pennylaneStatus.enabled}
                  style={{
                    width: 44, height: 24, borderRadius: 999,
                    background: pennylaneStatus.enabled ? '#059669' : '#cbd5e1',
                    border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0,
                  }}>
                  <span style={{
                    position: 'absolute', top: 2, left: pennylaneStatus.enabled ? 22 : 2,
                    width: 20, height: 20, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                  }} />
                </button>
              </div>
              <button type="button" onClick={onDisconnect} disabled={busy}
                style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>
                {t('settings.disconnect', 'Déconnecter')}
              </button>
            </>
          ) : (
            <>
              {pennylaneStatus?.error && pennylaneStatus.error !== 'Pennylane: API token requis' && (
                <div style={{
                  padding: '8px 12px', borderRadius: 8, marginBottom: 12,
                  background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12,
                }}>
                  {t('settings.pennylane_token_invalid', 'Le token enregistré a été refusé par Pennylane. Saisissez-en un nouveau.')}
                </div>
              )}
              <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 600, marginBottom: 6 }}>
                {t('settings.pennylane_token', 'Token API Pennylane')}
              </label>
              <input
                type="password"
                value={pennylaneToken || ''}
                onChange={e => onPennylaneTokenChange && onPennylaneTokenChange(e.target.value)}
                placeholder="plk_xxxxxxxxxxxxxxxxxxxxxxxx"
                style={{
                  width: '100%', padding: '9px 12px', borderRadius: 8,
                  border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'monospace',
                  boxSizing: 'border-box', background: '#fff',
                }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6, marginBottom: 12 }}>
                {t('settings.pennylane_token_help', 'Disponible dans Pennylane → Paramètres → Développeurs → Créer un token.')}
              </div>
              <button onClick={onPennylaneSubmit} disabled={pennylaneSubmitting || !pennylaneToken}
                style={{
                  padding: '8px 16px', borderRadius: 8, border: 'none',
                  background: '#059669', color: '#fff', fontSize: 13, fontWeight: 600,
                  cursor: (pennylaneSubmitting || !pennylaneToken) ? 'not-allowed' : 'pointer',
                  opacity: (pennylaneSubmitting || !pennylaneToken) ? 0.6 : 1, fontFamily: 'inherit',
                }}>
                {pennylaneSubmitting ? t('settings.connecting', 'Connexion…') : t('settings.connect', 'Connecter')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Sync history panel (filter='history') ──────────────────────────
function SyncHistoryPanel({ log, t }) {
  if (!log || log.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
        {t('crm.no_sync_yet', 'Aucune synchronisation pour l\'instant.')}
      </div>
    );
  }
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
      {log.map((row, i) => (
        <div key={row.id} style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
          padding: '10px 14px', fontSize: 13,
          borderTop: i === 0 ? 'none' : '1px solid #f1f5f9',
        }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', overflow: 'hidden', minWidth: 0 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
              background: row.status === 'success' ? '#f0fdf4' : '#fef2f2',
              color: row.status === 'success' ? '#059669' : '#b91c1c',
              textTransform: 'uppercase',
            }}>{row.action}</span>
            <span style={{ color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.prospect_name || '—'}</span>
            <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>· {row.provider}</span>
          </div>
          <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(row.created_at)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Field + stage mapping modal ────────────────────────────────────
const REFBOOST_FIELDS = ['prospect_name', 'prospect_company', 'email', 'phone', 'deal_value', 'notes'];
const REFBOOST_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'meeting', 'won', 'lost'];

function CrmMappingModal({ integration, onClose }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState([]);
  const [stages, setStages] = useState([]);
  const [crmFields, setCrmFields] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // HubSpot-only multi-object mapping. Each tab owns its own property
  // list (fetched from /crm/hubspot/properties/:object) + its own
  // map. Salesforce/webhook fall through to the single-tab mode.
  const isHubspot = integration.provider === 'hubspot';
  const [activeTab, setActiveTab] = useState('transaction');
  const [contactProps, setContactProps] = useState([]);
  const [companyProps, setCompanyProps] = useState([]);
  const [contactMap, setContactMap] = useState({});
  const [companyMap, setCompanyMap] = useState({});

  const [tenantStages, setTenantStages] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        // Load the tenant's custom pipeline stages so the stage-mapping
        // table iterates over the actual columns they built (not the
        // hardcoded default set).
        const sr = await api.getPipelineStages().catch(() => ({ stages: [] }));
        const pipelineStages = sr.stages || [];
        setTenantStages(pipelineStages);

        const m = await api.getCrmMappings(integration.id);
        // Initialise mapping rows for every RefBoost field/status, even
        // those without an existing CRM mapping yet.
        const fmap = new Map((m.fields || []).map(f => [f.refboost_field, f.crm_field]));
        const smap = new Map((m.stages || []).map(s => [s.refboost_status, s.crm_stage]));
        setFields(REFBOOST_FIELDS.map(f => ({ refboost_field: f, crm_field: fmap.get(f) || '' })));
        const sourceStatuses = pipelineStages.length
          ? pipelineStages.map(s => s.slug)
          : REFBOOST_STATUSES;
        setStages(sourceStatuses.map(s => ({ refboost_status: s, crm_stage: smap.get(s) || '' })));

        if (integration.provider === 'hubspot') {
          const [f, p, cP, coP, om] = await Promise.all([
            api.getHubspotFields(),
            api.getHubspotPipelines(),
            api.getHubspotProperties('contacts').catch(() => ({ properties: [] })),
            api.getHubspotProperties('companies').catch(() => ({ properties: [] })),
            api.getHubspotObjectMappings().catch(() => ({ contacts: {}, companies: {} })),
          ]);
          setCrmFields(f.fields || []);
          setContactProps(cP.properties || []);
          setCompanyProps(coP.properties || []);

          // Auto-suggest any unmapped Contact/Company field by name
          // match against HubSpot property names. Saved mappings
          // always win.
          const byLower = (list) => Object.fromEntries((list || []).map(p => [p.name.toLowerCase(), p.name]));
          const cLook = byLower(cP.properties);
          const coLook = byLower(coP.properties);
          setContactMap({
            firstname: om.contacts?.firstname || cLook.firstname || '',
            lastname:  om.contacts?.lastname  || cLook.lastname  || '',
            email:     om.contacts?.email     || cLook.email     || '',
            phone:     om.contacts?.phone     || cLook.phone     || '',
            jobtitle:  om.contacts?.jobtitle  || cLook.jobtitle  || '',
          });
          setCompanyMap({
            company: om.companies?.company || coLook.name   || '',
            domain:  om.companies?.domain  || coLook.domain || '',
          });

          // Flatten pipelines → stages list (use first pipeline by default).
          const allStages = [];
          for (const pl of p.pipelines || []) {
            for (const st of pl.stages || []) allStages.push({ id: st.id, label: pl.label + ' · ' + st.label });
          }
          setCrmStages(allStages);
        } else if (integration.provider === 'salesforce') {
          const [f, s] = await Promise.all([api.getSalesforceFields(), api.getSalesforceStages()]);
          setCrmFields(f.fields || []);
          setCrmStages(s.stages || []);
        }
      } catch (e) {
        // Best-effort — modal still works, dropdowns just become empty
        console.error('[crm.mapping.load]', e);
      } finally { setLoading(false); }
    })();
  }, [integration.id, integration.provider]);

  const save = async () => {
    setSaving(true);
    try {
      if (activeTab === 'transaction') {
        await api.updateCrmMappings(integration.id, {
          fields: fields.filter(f => f.crm_field),
          stages: stages.filter(s => s.crm_stage),
        });
      } else if (activeTab === 'contact') {
        await api.updateHubspotObjectMappings({ contacts: contactMap });
      } else if (activeTab === 'company') {
        await api.updateHubspotObjectMappings({ companies: companyMap });
      }
      setSavedMsg(t('crm.saved'));
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (e) {
      showToast.error(e.message);
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', padding: 24, boxShadow: '0 25px 80px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            {t('crm.configure')} — {t('crm.' + integration.provider)}
          </h3>
          <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16}/>
          </button>
        </div>

        {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>…</div> : (
          <>
            {isHubspot && (
              <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 16 }}>
                {[
                  { id: 'transaction', label: 'Transaction' },
                  { id: 'contact',     label: 'Contact' },
                  { id: 'company',     label: 'Entreprise' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: activeTab === tab.id ? '#fff' : 'transparent',
                      color: activeTab === tab.id ? '#059669' : '#64748b',
                      boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >{tab.label}</button>
                ))}
              </div>
            )}

            {isHubspot && activeTab !== 'transaction' ? (
              <ObjectMappingTable
                type={activeTab}
                properties={activeTab === 'contact' ? contactProps : companyProps}
                mapping={activeTab === 'contact' ? contactMap : companyMap}
                onChange={activeTab === 'contact' ? setContactMap : setCompanyMap}
              />
            ) : (
              <TransactionMappingContent
                fields={fields} setFields={setFields}
                stages={stages} setStages={setStages}
                crmFields={crmFields} crmStages={crmStages}
                tenantStages={tenantStages} t={t}
              />
            )}
          </>
        )}
        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginTop: 4 }}>
            {savedMsg && <span style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}>{savedMsg}</span>}
            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }} disabled={saving} style={btnSecondary}>{t('settings.cancel')}</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); save(); }} disabled={saving} style={btnPrimary}>{saving ? '…' : t('crm.save_mappings')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Transaction (Deal) mapping content ═══
// The original modal body, now extracted into a subcomponent so
// CrmMappingModal can render it inside a tab layout.
function TransactionMappingContent({ fields, setFields, stages, setStages, crmFields, crmStages, tenantStages, t }) {
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  return (
    <>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('crm.field_mappings')}
      </h4>
      <table style={{ width: '100%', marginBottom: 20 }}>
        <thead>
          <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.refboost_field')}</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.crm_field')}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((row, i) => (
            <tr key={row.refboost_field}>
              <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{t('crm.field_' + row.refboost_field)}</td>
              <td style={{ padding: '4px 8px' }}>
                {crmFields.length > 0 ? (
                  <select value={row.crm_field} onChange={e => setFields(f => f.map((x, j) => j === i ? { ...x, crm_field: e.target.value } : x))} style={inp}>
                    <option value="">{t('crm.select_field')}</option>
                    {crmFields.map(c => <option key={c.name} value={c.name}>{c.label || c.name}</option>)}
                  </select>
                ) : (
                  <input value={row.crm_field} onChange={e => setFields(f => f.map((x, j) => j === i ? { ...x, crm_field: e.target.value } : x))} placeholder={t('crm.crm_field')} style={inp} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('crm.stage_mappings')}
      </h4>
      <table style={{ width: '100%', marginBottom: 20 }}>
        <thead>
          <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.refboost_status')}</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.crm_stage')}</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((row, i) => (
            <tr key={row.refboost_status}>
              <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>
                {(tenantStages.find(s => s.slug === row.refboost_status)?.name) || t('crm.status_' + row.refboost_status)}
              </td>
              <td style={{ padding: '4px 8px' }}>
                {crmStages.length > 0 ? (
                  <select value={row.crm_stage} onChange={e => setStages(s => s.map((x, j) => j === i ? { ...x, crm_stage: e.target.value } : x))} style={inp}>
                    <option value="">{t('crm.select_field')}</option>
                    {crmStages.map(c => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
                  </select>
                ) : (
                  <input value={row.crm_stage} onChange={e => setStages(s => s.map((x, j) => j === i ? { ...x, crm_stage: e.target.value } : x))} placeholder={t('crm.crm_stage')} style={inp} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ═══ Contact / Company mapping tab ═══
// Simple two-column table. One row per RefBoost field; right side is
// a dropdown populated from HubSpot's contacts/companies property
// list. Auto-suggested pairings happen upstream in the parent.
function ObjectMappingTable({ type, properties, mapping, onChange }) {
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  const rows = type === 'contact'
    ? [
        { key: 'firstname', label: 'Prénom' },
        { key: 'lastname',  label: 'Nom' },
        { key: 'email',     label: 'Email' },
        { key: 'phone',     label: 'Téléphone' },
        { key: 'jobtitle',  label: 'Poste / Rôle' },
      ]
    : [
        { key: 'company', label: "Nom de l'entreprise" },
        { key: 'domain',  label: 'Domaine' },
      ];

  return (
    <table style={{ width: '100%', marginBottom: 20 }}>
      <thead>
        <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Champ RefBoost</th>
          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Propriété HubSpot</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{r.label}</td>
            <td style={{ padding: '4px 8px' }}>
              <select
                value={mapping[r.key] || ''}
                onChange={e => onChange({ ...mapping, [r.key]: e.target.value })}
                style={inp}
              >
                <option value="">—</option>
                {properties.map(p => (
                  <option key={p.name} value={p.name}>{p.label || p.name}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const btnPrimary = {
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg, #059669, #10b981)',
  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const btnSecondary = {
  padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  background: '#fff', color: '#0f172a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

// ═══ LIEN PUBLIC ═══
function PublicLinkTab() {
  const { t } = useTranslation();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api.getMyTenant()
      .then(d => setTenant(d.tenant))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;
  if (!tenant) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.tenant_load_error')}</div>;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const directLink = origin + '/r/' + (tenant.slug || '');
  const embedCode = '<iframe src="' + directLink + '" width="100%" height="700" frameborder="0" style="border-radius:12px;"></iframe>';

  const copy = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.public_link_title')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.public_link_full_desc')}</p>

      <div style={{ marginBottom: 28 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{t('settings.direct_link')}</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <code style={{ flex: 1, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{directLink}</code>
          <button onClick={() => copy('link', directLink)} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: copied === 'link' ? '#dcfce7' : 'var(--rb-primary, #059669)',
            color: copied === 'link' ? '#166534' : '#fff',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {copied === 'link' ? <><CheckCircle size={14}/> {t('settings.copied_short')}</> : <><Copy size={14}/> {t('settings.copy_short')}</>}
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>{t('settings.link_share_hint')}</p>
      </div>

      <div>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{t('settings.embed_code')}</h4>
        <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <code style={{ display: 'block', fontSize: 12, color: '#0f172a', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.6 }}>{embedCode}</code>
          <button onClick={() => copy('embed', embedCode)} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: copied === 'embed' ? '#dcfce7' : 'var(--rb-primary, #059669)',
            color: copied === 'embed' ? '#166534' : '#fff',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {copied === 'embed' ? <><CheckCircle size={14}/> {t('settings.copied_short')}</> : <><Copy size={14}/> {t('settings.copy_code')}</>}
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>{t('settings.embed_hint')}</p>
      </div>
    </div>
  );
}

// ═══ APPARENCE ═══
function AppearanceTab() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', revenue_model: 'CA', primary_color: '#059669', accent_color: '#f97316', logo_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.getMyTenant()
      .then(d => {
        if (d && d.tenant) {
          setForm({
            name: d.tenant.name || '',
            primary_color: d.tenant.primary_color || '#059669',
            revenue_model: d.tenant.revenue_model || 'CA',
            accent_color: d.tenant.accent_color || '#f97316',
            logo_url: d.tenant.logo_url || '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
  }

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const slug = slugify(form.name);
      const payload = { ...form, slug: slug || undefined };
      await api.updateMyTenant(payload);
      if (typeof window !== 'undefined' && window.__rbLoadTheme) window.__rbLoadTheme();
      setMsg({ type: 'success', text: slug ? t('settings.appearance_saved_with_link', { slug }) : t('settings.appearance_saved') });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('settings.save_error') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.tab_appearance')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.appearance_desc_full')}</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <div>
          <label style={labelStyle}>{t('settings.general_company')}</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('settings.company_ph')} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>{t('settings.revenue_model')}</label>
          <select value={form.revenue_model || 'CA'} onChange={e => setForm(f => ({ ...f, revenue_model: e.target.value }))} style={inputStyle}>
            <option value="MRR">{t('onboarding.mrr_label')}</option>
            <option value="ARR">{t('onboarding.arr_label')}</option>
            <option value="CA">{t('onboarding.ca_label')}</option>
            <option value="Other">{t('onboarding.revenue_other')}</option>
          </select>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{t('settings.revenue_model_hint')}</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>{t('settings.branding_primary')}</label>
            <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ ...inputStyle, height: 44, padding: 4, cursor: 'pointer' }} />
          </div>
          <div>
            <label style={labelStyle}>{t('settings.branding_accent')}</label>
            <input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} style={{ ...inputStyle, height: 44, padding: 4, cursor: 'pointer' }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('settings.branding_logo')}</label>
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder={t('settings.logo_ph')} style={inputStyle} />
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>{t('settings.logo_hint')}</p>
          {form.logo_url && (
            <div style={{ marginTop: 12, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <img src={form.logo_url} alt={t('settings.preview')} style={{ maxHeight: 60, maxWidth: '100%' }} onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}
        </div>

        <button onClick={save} disabled={saving} style={{
          padding: '12px 24px', borderRadius: 10, border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 700, fontSize: 14,
          width: 'fit-content', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Palette size={16} /> {saving ? t('settings.saving_short') : t('settings.save')}
        </button>
      </div>
    </div>
  );
}

// ═══ PROGRAMME ═══
function ProgramTab() {
  const { t } = useTranslation();
  const [data, setData] = useState({ levels: [], threshold_type: 'deals' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // level id or 'new'
  const [form, setForm] = useState({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10 });
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getTenantLevels();
      setData({ levels: d.levels || [], threshold_type: d.threshold_type || 'deals' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setType = async (type) => {
    try {
      await api.setTenantLevelThresholdType(type);
      setData(d => ({ ...d, threshold_type: type }));
      setMsg({ type: 'success', text: t('programme.saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const startEdit = (l) => {
    setForm({
      name: l.name || '',
      icon: l.icon || '⭐',
      color: l.color || '#94a3b8',
      min_threshold: parseFloat(l.min_threshold) || 0,
      commission_rate: parseFloat(l.commission_rate) || 10,
    });
    setEditing(l.id);
  };

  const startNew = () => {
    setForm({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10 });
    setEditing('new');
  };

  const save = async () => {
    if (!form.name) { setMsg({ type: 'error', text: t('programme.name_required') }); return; }
    try {
      if (editing === 'new') {
        await api.createTenantLevel({ ...form, position: data.levels.length });
      } else {
        await api.updateTenantLevel(editing, form);
      }
      setEditing(null);
      await load();
      setMsg({ type: 'success', text: t('programme.level_saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
  };

  const del = async (id) => {
    const ok = await showConfirm({
      title: t('programme.delete_title', 'Supprimer ce niveau ?'),
      message: t('programme.delete_confirm'),
      variant: 'danger',
      confirmLabel: t('common.delete', 'Supprimer'),
    });
    if (!ok) return;
    try {
      await api.deleteTenantLevel(id);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const reset = async () => {
    const ok = await showConfirm({
      title: t('programme.reset_title', 'Réinitialiser les niveaux ?'),
      message: t('programme.reset_confirm'),
      variant: 'warning',
      confirmLabel: t('programme.reset', 'Réinitialiser'),
    });
    if (!ok) return;
    try {
      await api.resetTenantLevels();
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  const isDeal = data.threshold_type === 'deals';
  const unitLabel = isDeal ? t('programme.unit_deals') : t('programme.unit_volume');
  const thresholdInputLabel = isDeal ? t('programme.threshold_deals') : t('programme.threshold_volume');

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 11, marginBottom: 4 };

  const formBlock = (
    <div style={{ padding: 16, background: '#fffbeb', borderRadius: 12, border: '2px dashed #fbbf24', marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>{t('programme.level_name')}</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('programme.level_name_placeholder')} />
        </div>
        <div>
          <label style={labelStyle}>{t('programme.level_icon')}</label>
          <input style={{ ...inputStyle, textAlign: 'center', fontSize: 18 }} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} maxLength="2" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>{t('programme.level_color')}</label>
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inputStyle, height: 36, padding: 2, cursor: 'pointer' }} />
        </div>
        <div>
          <label style={labelStyle}>{thresholdInputLabel}</label>
          <input type="number" min="0" step={isDeal ? '1' : '100'} style={inputStyle} value={form.min_threshold} onChange={e => setForm(f => ({ ...f, min_threshold: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label style={labelStyle}>{t('programme.level_rate')}</label>
          <input type="number" min="0" max="100" step="0.5" style={inputStyle} value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.save')}</button>
        <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.cancel')}</button>
      </div>
    </div>
  );

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('programme.title_full')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('programme.subtitle_full')}</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      {/* Threshold type */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 10 }}>{t('programme.crit_title')}</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setType('deals')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: isDeal ? '#f0fdf4' : '#fff', color: isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('programme.crit_deals')}</button>
          <button onClick={() => setType('volume')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (!isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: !isDeal ? '#f0fdf4' : '#fff', color: !isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('programme.crit_volume')}</button>
        </div>
      </div>

      {/* Levels list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {data.levels.map(l => editing === l.id ? (
          <div key={l.id}>{formBlock}</div>
        ) : (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: (l.color || '#94a3b8') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{l.icon || '⭐'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: l.color || '#0f172a', fontSize: 15 }}>{l.name}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{t('programme.level_desc', { min: parseFloat(l.min_threshold), unit: unitLabel, rate: parseFloat(l.commission_rate) })}</div>
            </div>
            <button onClick={() => startEdit(l)} title={t('common.edit')} style={{ padding: 8, borderRadius: 8, border: 'none', background: '#eef2ff', cursor: 'pointer', display: 'flex' }}><Edit2 size={14} color="#6366f1" /></button>
            <button onClick={() => del(l.id)} title={t('common.delete')} style={{ padding: 8, borderRadius: 8, border: 'none', background: '#fef2f2', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
          </div>
        ))}
        {editing === 'new' && formBlock}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={startNew} disabled={editing !== null} style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: editing !== null ? '#e2e8f0' : 'var(--rb-primary, #059669)',
          color: editing !== null ? '#94a3b8' : '#fff',
          fontWeight: 600, fontSize: 13, cursor: editing !== null ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}><Plus size={14} /> {t('programme.add_level')}</button>
        <button onClick={reset} style={{
          padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>{t('programme.reset_defaults')}</button>
      </div>
    </div>
  );
}

// E5 — Commission tab. Hosts the recurring-billing master switch
// (moved from /programme during E5) and the per-tenant renewal
// trigger ('on_paid' default vs 'temporal'). The trigger radio is
// hidden until the master switch is ON — there's nothing to
// configure otherwise.
function CommissionTab() {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(false);
  const [trigger, setTrigger] = useState('on_paid');
  const [loading, setLoading] = useState(true);
  const [savingEnabled, setSavingEnabled] = useState(false);
  const [savingTrigger, setSavingTrigger] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mt = await api.getMyTenant();
        const t0 = mt && (mt.tenant || mt);
        if (!alive) return;
        setEnabled(!!t0?.recurring_billing_enabled);
        setTrigger(t0?.recurring_renewal_trigger || 'on_paid');
      } catch (e) {
        if (alive) setMsg({ type: 'error', text: e.message || t('common.error') });
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  const toggleEnabled = async () => {
    const next = !enabled;
    setEnabled(next);
    setSavingEnabled(true);
    try {
      await api.updateMyTenant({ recurring_billing_enabled: next });
      setMsg({ type: 'success', text: t('programme.saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setEnabled(!next);
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
    setSavingEnabled(false);
  };

  const setTriggerMode = async (mode) => {
    if (mode === trigger) return;
    const prev = trigger;
    setTrigger(mode);
    setSavingTrigger(true);
    try {
      await api.updateMyTenant({ recurring_renewal_trigger: mode });
      setMsg({ type: 'success', text: t('programme.saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setTrigger(prev);
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
    setSavingTrigger(false);
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.commission.title', 'Commission')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('settings.commission.subtitle', 'Configurez la facturation récurrente et le déclenchement des renouvellements.')}
      </p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      {/* Master switch — moved here from /programme during E5. */}
      <div style={{ marginBottom: 24, padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 4 }}>
              {t('programme.recurring_billing_title', 'Activer la facturation récurrente')}
            </div>
            <div style={{ color: '#64748b', fontSize: 12, lineHeight: 1.5 }}>
              {t('programme.recurring_billing_desc', 'Permet de définir des commissions à vie ou sur une durée limitée pour les deals récurrents. Sans cette option, les commissions sont calculées une seule fois au moment du gain.')}
            </div>
          </div>
          <button
            onClick={toggleEnabled}
            disabled={savingEnabled}
            style={{ background: 'none', border: 'none', cursor: savingEnabled ? 'wait' : 'pointer', color: enabled ? '#059669' : '#cbd5e1', flexShrink: 0, padding: 4 }}
            aria-label={t('programme.recurring_billing_title', 'Activer la facturation récurrente')}
          >
            {enabled ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
          </button>
        </div>
      </div>

      {/* Renewal trigger — visible only when master switch is ON. */}
      {!enabled ? (
        <div style={{ padding: '14px 16px', borderRadius: 10, background: '#f8fafc', border: '1px dashed #cbd5e1', color: '#64748b', fontSize: 13 }}>
          {t('settings.commission.activate_first', 'Activez d\'abord la facturation récurrente pour configurer le déclenchement des renouvellements.')}
        </div>
      ) : (
        <div style={{ padding: 16, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff' }}>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14, marginBottom: 12 }}>
            {t('settings.commission.trigger_title', 'Déclenchement du renouvellement')}
          </div>
          {[
            {
              id: 'on_paid',
              label: t('settings.commission.trigger_on_paid_label', 'Conditionné à une confirmation'),
              desc:  t('settings.commission.trigger_on_paid_desc', 'Le prochain cycle n\'est préparé que lorsque le cycle précédent a été payé au partenaire.'),
            },
            {
              id: 'temporal',
              label: t('settings.commission.trigger_temporal_label', 'Purement temporel'),
              desc:  t('settings.commission.trigger_temporal_desc', 'Le prochain cycle est préparé dès que la durée d\'engagement s\'est écoulée, indépendamment du paiement (limité à 2 cycles non réglés en attente).'),
            },
          ].map(opt => {
            const active = trigger === opt.id;
            return (
              <label key={opt.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: 10, borderRadius: 10, cursor: savingTrigger ? 'wait' : 'pointer', background: active ? '#eef2ff' : 'transparent', border: '1px solid ' + (active ? '#c7d2fe' : 'transparent'), marginBottom: 6 }}>
                <input
                  type="radio"
                  name="renewal-trigger"
                  value={opt.id}
                  checked={active}
                  disabled={savingTrigger}
                  onChange={() => setTriggerMode(opt.id)}
                  style={{ marginTop: 3, cursor: savingTrigger ? 'wait' : 'pointer' }}
                />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: active ? '#6366f1' : '#0f172a', fontSize: 13 }}>{opt.label}</div>
                  <div style={{ color: '#64748b', fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{opt.desc}</div>
                </div>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Notification preferences grouped by domain. Each event_type lives
// in exactly one group; anything not enumerated falls into 'other'.
// Order inside each group reflects the natural lifecycle (status
// change before payment outcome before deletion).
const NOTIFICATION_GROUPS = [
  { id: 'pipeline',       events: ['new_referral', 'new_form_lead', 'deal_won', 'referral_update'] },
  { id: 'commissions',    events: ['commission_approved', 'commission', 'invoice_submitted', 'payment_completed', 'payment_failed', 'commission_deleted'] },
  { id: 'partners',       events: ['new_application', 'access_revoked', 'tier_change'] },
  { id: 'marketplace',    events: ['marketplace_application'] },
  { id: 'communication',  events: ['news'] },
];

// Subset of events surfaced to commercial / sales users. Admin-only
// outcomes (payment_failed, marketplace_application, invoice_submitted,
// commission_deleted, access_revoked, tier_change) are intentionally
// hidden — sales doesn't need to manage transfer failures or partner
// lifecycle from this panel.
const COMMERCIAL_EVENTS = new Set([
  'new_referral', 'new_form_lead', 'referral_update', 'deal_won',
  'commission_approved', 'commission', 'payment_completed',
  'new_application',
  'news',
]);

function NotificationsTab({ forCommercial = false } = {}) {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [preview, setPreview] = useState(null); // { loading, subject, html, event_type, error }

  useEffect(() => {
    api.getNotificationPreferences()
      .then(d => setPrefs(d.preferences || []))
      .catch(() => setPrefs([]))
      .finally(() => setLoading(false));
  }, []);

  const openPreview = async (event_type) => {
    setPreview({ loading: true, event_type });
    try {
      const { subject, html } = await api.previewEmailTemplate(event_type);
      setPreview({ loading: false, event_type, subject, html });
    } catch (err) {
      // Backend returns { error: 'preview_unavailable', message: '…' }
      // for events without a template. Surface the friendlier message
      // instead of the bare error code.
      const friendly = err?.data?.message || err.message || 'Aperçu indisponible';
      setPreview({ loading: false, event_type, error: friendly });
    }
  };

  const toggle = (event_type, field) => {
    setPrefs(list => list.map(p => p.event_type === event_type ? { ...p, [field]: !p[field] } : p));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences({ preferences: prefs });
      setSavedAt(Date.now());
    } catch (err) { showToast.error(err.message); }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 24, color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{t('notifications.preferences')}</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('notifications.preferences_desc')}</p>

      {(() => {
        // Index prefs by event_type so the group lookups are O(1).
        // Anything the backend returned that isn't in any GROUPS
        // bucket falls into the "other" group at the bottom — keeps
        // newly-added events visible even if we forgot to register
        // them in NOTIFICATION_GROUPS. Commercial users see a
        // subset (COMMERCIAL_EVENTS) so admin-only outcomes don't
        // clutter the sales preferences screen.
        const visiblePrefs = forCommercial
          ? prefs.filter(p => COMMERCIAL_EVENTS.has(p.event_type))
          : prefs;
        const byEvent = new Map(visiblePrefs.map(p => [p.event_type, p]));
        const grouped = NOTIFICATION_GROUPS.map(g => ({
          id: g.id,
          rows: g.events.map(e => byEvent.get(e)).filter(Boolean),
        })).filter(g => g.rows.length > 0);
        const claimed = new Set(NOTIFICATION_GROUPS.flatMap(g => g.events));
        const orphans = visiblePrefs.filter(p => !claimed.has(p.event_type));
        if (orphans.length) grouped.push({ id: 'other', rows: orphans });

        const renderRow = (p) => (
          <div key={p.event_type} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px', padding: '14px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
            <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{t('notifications.event_' + p.event_type, p.event_type)}</div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => toggle(p.event_type, 'in_app')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.in_app ? '#059669' : '#cbd5e1' }}>
                {p.in_app ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => toggle(p.event_type, 'email')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.email ? '#059669' : '#cbd5e1' }}>
                {p.email ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => openPreview(p.event_type)}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                {t('notifications.preview', 'Aperçu')}
              </button>
            </div>
          </div>
        );

        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {grouped.map((g, gi) => (
              <div key={g.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px', background: '#f8fafc', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
                  <div>{t('notifications.group_' + g.id, g.id)}</div>
                  {gi === 0 ? (
                    <>
                      <div style={{ textAlign: 'center' }}>{t('notifications.in_app')}</div>
                      <div style={{ textAlign: 'center' }}>{t('notifications.email')}</div>
                      <div style={{ textAlign: 'center' }}>{t('notifications.preview', 'Aperçu')}</div>
                    </>
                  ) : <><div /><div /><div /></>}
                </div>
                {g.rows.map(renderRow)}
              </div>
            ))}
          </div>
        );
      })()}

      {preview && (
        <EmailPreviewModal preview={preview} onClose={() => setPreview(null)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: 'var(--rb-primary, #059669)', color: '#fff',
          fontWeight: 600, fontSize: 14, cursor: 'pointer',
          opacity: saving ? 0.7 : 1,
        }}>{saving ? t('common.saving') : t('common.save')}</button>
        {savedAt > 0 && Date.now() - savedAt < 3000 && (
          <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={14} /> {t('common.saved')}
          </span>
        )}
      </div>
    </div>
  );
}


// Renders the server-generated email HTML inside a sandboxed iframe so
// the template's CSS doesn't leak into the Settings page. Admin-only
// affordance from the Notifications et emails tab.
function EmailPreviewModal({ preview, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 720, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Aperçu email</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
              {preview.loading ? '…' : (preview.subject || preview.error || 'Aperçu')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 18 }}
          >×</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: 12, background: '#f1f5f9' }}>
          {preview.loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
          ) : preview.error ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{preview.error}</div>
          ) : (
            <iframe
              title="Aperçu email"
              srcDoc={preview.html}
              sandbox=""
              style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8, background: '#fff' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ TRACKING FEATURES ═══
// Feature toggles + tracking configuration. Admin-scoped, sits inside
// the pipeline/Programme tab. Each toggle independently enables a
// downstream surface (partner referral link card, promo codes table,
// embeddable script). Config fields (redirect URL, cookie days, copy
// script snippet) only show when at least one feature is on.
function TrackingFeaturesTab() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getTenantFeatures()
      .then(f => setFlags(f.features))
      .catch(() => setFlags({ feature_referral_links: false }))
      .finally(() => setLoading(false));
  }, []);

  const patch = async (diff) => {
    setSaving(true);
    try {
      const { features } = await api.updateTenantFeatures(diff);
      setFlags(features);
    } catch (e) { showToast.error(e.message); }
    setSaving(false);
  };

  if (loading || !flags) return <div style={{ color: '#94a3b8' }}>…</div>;

  // One feature card, soft-green icon tile on the left, brand-green
  // toggle on the right. Same white-card styling as other settings
  // tabs (Profile, Integrations, etc.).
  const FeatureCard = ({ icon: Icon, title, desc, on, onChange }) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: on ? '#f0fdf4' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} color={on ? '#059669' : '#64748b'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
        </div>
        <button
          onClick={() => onChange(!on)}
          disabled={saving}
          aria-pressed={on}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: on ? '#059669' : '#cbd5e1', padding: 0, lineHeight: 0 }}
        >
          {on ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{t('features.tracking_title')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('features.tracking_subtitle')}
      </p>

      <FeatureCard
        icon={Link2}
        title={t('features.referral_links')}
        desc={t('features.referral_links_desc')}
        on={flags.feature_referral_links}
        onChange={v => patch({ feature_referral_links: v })}
      />
    </div>
  );
}

// ═══ PARTNER CATEGORIES ═══
// Admin editor for the list of partner categories. Drag-and-drop
// reorder; inline edit on name/description; colour picker; star-toggle
// for the default; delete with guard (disabled when partners are
// assigned or when the category is the default one).
function PartnerCategoriesTab() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const reload = () => {
    setLoading(true);
    api.getPartnerCategories()
      .then(d => setCategories(d.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const updateInline = async (id, patch) => {
    setCategories(list => list.map(c => c.id === id ? { ...c, ...patch } : c));
    try { await api.updatePartnerCategory(id, patch); }
    catch (e) { setErr(e.message); reload(); }
  };

  const setDefault = async (id) => {
    try {
      await api.setDefaultPartnerCategory(id);
      reload();
    } catch (e) { setErr(e.message); }
  };

  const del = async (c) => {
    if (c.partners_count > 0 || c.is_default) return;
    const ok = await showConfirm({
      title: t('partner_category.delete', 'Supprimer cette catégorie ?'),
      message: c.name,
      variant: 'danger',
      confirmLabel: t('common.delete', 'Supprimer'),
    });
    if (!ok) return;
    try { await api.deletePartnerCategory(c.id); reload(); }
    catch (e) { setErr(e.message || t('partner_category.cannot_delete_has_partners', { count: c.partners_count || 0 })); }
  };

  const add = async () => {
    const name = await showPrompt({
      title: t('partner_category.add', 'Ajouter une catégorie'),
      label: t('partner_category.name', 'Nom de la catégorie'),
      placeholder: t('partner_category.name', 'Nom de la catégorie'),
      confirmLabel: t('common.add', 'Ajouter'),
    });
    if (!name || !name.trim()) return;
    try {
      await api.createPartnerCategory({ name: name.trim(), color: '#6B7280' });
      reload();
    } catch (e) { setErr(e.message); }
  };

  const onDrop = async (e, targetId) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    const srcIdx = categories.findIndex(c => c.id === draggingId);
    const dstIdx = categories.findIndex(c => c.id === targetId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = categories.slice();
    const [moved] = next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, moved);
    const withPos = next.map((c, i) => ({ ...c, position: i }));
    setCategories(withPos);
    setDraggingId(null);
    try {
      await api.reorderPartnerCategories(withPos.map(c => ({ id: c.id, position: c.position })));
    } catch (err) { setErr(err.message); reload(); }
  };

  if (loading) return <div style={{ color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('partner_category.title')}</h3>
        <button onClick={add} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + {t('partner_category.add')}
        </button>
      </div>
      {err && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{err}</div>}

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {categories.map(c => (
          <div
            key={c.id}
            draggable
            onDragStart={() => setDraggingId(c.id)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onDrop(e, c.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 2fr 80px 80px',
              gap: 10, alignItems: 'center',
              padding: '12px 14px',
              borderTop: '1px solid #f1f5f9',
              background: draggingId === c.id ? '#f8fafc' : '#fff',
              cursor: 'move',
            }}
          >
            <input
              type="color"
              value={c.color || '#6B7280'}
              onChange={e => updateInline(c.id, { color: e.target.value })}
              style={{ width: 28, height: 28, padding: 0, border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
              title={t('partner_category.color')}
            />
            <input
              defaultValue={c.name}
              onBlur={e => e.target.value.trim() && e.target.value !== c.name && updateInline(c.id, { name: e.target.value.trim() })}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}
            />
            <input
              defaultValue={c.description || ''}
              placeholder={t('partner_category.description')}
              onBlur={e => e.target.value !== (c.description || '') && updateInline(c.id, { description: e.target.value })}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}
            />
            <button
              onClick={() => !c.is_default && setDefault(c.id)}
              title={c.is_default ? t('partner_category.default') : t('partner_category.set_default')}
              style={{ background: 'none', border: 'none', cursor: c.is_default ? 'default' : 'pointer', color: c.is_default ? '#f59e0b' : '#cbd5e1', fontSize: 22, lineHeight: 1, padding: 0 }}
            >
              {c.is_default ? '★' : '☆'}
            </button>
            <button
              onClick={() => del(c)}
              disabled={c.is_default || c.partners_count > 0}
              title={
                c.is_default
                  ? t('partner_category.cannot_delete_default')
                  : c.partners_count > 0
                    ? t('partner_category.cannot_delete_has_partners', { count: c.partners_count })
                    : t('partner_category.delete')
              }
              style={{
                background: 'none', border: 'none',
                cursor: (c.is_default || c.partners_count > 0) ? 'not-allowed' : 'pointer',
                color: (c.is_default || c.partners_count > 0) ? '#cbd5e1' : '#dc2626',
                fontSize: 14, fontWeight: 600,
              }}
            >
              {c.partners_count > 0 ? `${c.partners_count} 👥` : '🗑'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


// ═══ Pipedrive push errors detail modal ═══
// Opened from the "X/Y referrals poussés (Z échec(s))" pill. Lists
// every failed referral with its prospect name, the step that blew
// up (organization / person / deal / load), the Pipedrive HTTP
// status, and the truncated body so the admin can fix the underlying
// data or scope without re-running the push.
function PipedrivePushErrorsModal({ errors, onClose, t }) {
  const list = Array.isArray(errors) ? errors : [];
  const STEP_LABEL = {
    organization: t('pipedrive.step_organization', 'Organisation'),
    person:       t('pipedrive.step_person', 'Personne'),
    deal:         t('pipedrive.step_deal', 'Affaire'),
    load:         t('pipedrive.step_load', 'Chargement'),
  };
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 2000,
        background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 720, maxHeight: '88vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(15,23,42,0.25)',
        }}
      >
        <div style={{ padding: '20px 24px 12px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: '#0f172a' }}>
              {t('pipedrive.push_errors_title', 'Détail des échecs Pipedrive')}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#64748b' }}>
              {t('pipedrive.push_errors_subtitle', { count: list.length, defaultValue: '{{count}} referral(s) en échec' })}
            </p>
          </div>
          <button
            type="button" onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
          >×</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 24px 24px' }}>
          {list.length === 0 ? (
            <div style={{ padding: 16, color: '#64748b', fontSize: 13, textAlign: 'center' }}>
              {t('pipedrive.push_errors_empty', 'Aucune erreur à afficher.')}
            </div>
          ) : list.map((e, i) => (
            <div key={e.referralId || i} style={{
              padding: '12px 14px', marginBottom: 10,
              border: '1px solid #fecaca', background: '#fef2f2',
              borderRadius: 10, color: '#7f1d1d',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 14, color: '#7f1d1d' }}>
                  {e.prospect_name || e.referralId || '—'}
                </span>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 999,
                  background: '#fff', border: '1px solid #fecaca', color: '#b91c1c',
                }}>
                  {STEP_LABEL[e.step] || e.step || t('pipedrive.step_unknown', 'Inconnu')}
                  {e.pipedrive_status ? ` · ${e.pipedrive_status}` : ''}
                </span>
              </div>
              {e.error_message && (
                <div style={{ fontSize: 12, marginBottom: 4 }}>{e.error_message}</div>
              )}
              {e.pipedrive_body && (
                <details style={{ marginTop: 4 }}>
                  <summary style={{ fontSize: 11, color: '#9f1239', cursor: 'pointer' }}>
                    {t('pipedrive.push_errors_show_body', 'Voir la réponse Pipedrive')}
                  </summary>
                  <pre style={{
                    margin: '6px 0 0', padding: 10, background: '#fff',
                    border: '1px solid #fecaca', borderRadius: 6,
                    fontSize: 11, color: '#7f1d1d',
                    whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                    maxHeight: 160, overflowY: 'auto',
                  }}>
                    {typeof e.pipedrive_body === 'string' ? e.pipedrive_body : JSON.stringify(e.pipedrive_body, null, 2)}
                  </pre>
                </details>
              )}
              {e.referralId && (
                <div style={{ fontSize: 10, color: '#9f1239', marginTop: 6, fontFamily: 'monospace' }}>
                  {e.referralId}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══ Notion connect modal — 3 databases ═══
// Token + up to three database IDs (Transactions required, Contacts
// and Companies optional). Hitting "Connecter" validates everything
// server-side; errors for individual DBs are surfaced per-field.
function NotionConnectModal({ onClose, onConnected }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ token: '', dbTransactions: '', dbContacts: '', dbCompanies: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.token.trim() || !form.dbTransactions.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.connectNotion({
        token: form.token.trim(),
        dbTransactions: form.dbTransactions.trim(),
        dbContacts:     form.dbContacts.trim()  || undefined,
        dbCompanies:    form.dbCompanies.trim() || undefined,
      });
      onConnected();
    } catch (e) {
      setErr(e.message || t('notion.invalid_token'));
    } finally { setBusy(false); }
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, marginTop: 12 };
  const hint = { fontSize: 11, color: '#94a3b8', marginTop: 4 };

  const canSubmit = form.token.trim() && form.dbTransactions.trim();

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{t('notion.title')} — {t('notion.connect')}</h3>
          <button type="button" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16}/>
          </button>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {t('notion.setup_instructions')}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: '#475569', fontSize: 12, lineHeight: 1.7 }}>
            <li>{t('notion.step1')} — <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 600 }}>notion.so/my-integrations</a></li>
            <li>{t('notion.step2')}</li>
            <li>{t('notion.step3')}</li>
            <li>{t('notion.step4')}</li>
          </ol>
        </div>

        <label style={lbl}>{t('notion.token')}</label>
        {/* Notion internal-integration tokens (ntn_... / secret_...)
            are API tokens, not passwords. Keeping type="password" here
            (a) hides the value so the admin can't verify a paste, and
            (b) triggers 1Password / iCloud Keychain to auto-fill the
            saved site password over it. type="text" + autoComplete
            off + the 1P opt-out attr keep the paste visible and
            leave the manager alone. */}
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          value={form.token}
          onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
          placeholder="ntn_..."
          style={{ ...inp, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />

        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 18, marginBottom: 4 }}>
          Configurez vos bases de données
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          L'ID se trouve dans l'URL de votre base Notion (les 32 caractères après le dernier /).
        </div>

        <label style={lbl}>Base Transactions (Deals) *</label>
        <input value={form.dbTransactions} onChange={e => setForm(f => ({ ...f, dbTransactions: e.target.value }))} placeholder="32-char hex" style={inp}/>

        <label style={lbl}>Base Contacts <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
        <input value={form.dbContacts} onChange={e => setForm(f => ({ ...f, dbContacts: e.target.value }))} placeholder="32-char hex" style={inp}/>

        <label style={lbl}>Base Entreprises <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
        <input value={form.dbCompanies} onChange={e => setForm(f => ({ ...f, dbCompanies: e.target.value }))} placeholder="32-char hex" style={inp}/>

        {err && <div style={{ marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t('common.cancel') || 'Annuler'}
          </button>
          <button type="button" onClick={submit} disabled={busy || !canSubmit} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy || !canSubmit ? 0.6 : 1 }}>
            {busy ? '…' : t('notion.connect')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══ Notion mapping modal — 3 tabs ═══
// One tab per Notion database (Transactions, Contacts, Entreprises).
// Each tab's dropdown list is populated from GET /properties/:type.
// Missing optional databases are marked "non configurée" and their
// tab is disabled.
function NotionMappingModal({ onClose }) {
  const { t } = useTranslation();
  // i18next returns the key name itself when a key is missing, so
  // `t('foo') || fallback` NEVER hits the fallback — the missing-key
  // echo ("crm.field_status") is truthy. `t(key, { defaultValue })`
  // is the correct pattern: if the key is missing, i18next substitutes
  // the default, and a future missing key still renders a human
  // string instead of leaking the key.
  const tf = (k, fallback) => t(k, { defaultValue: fallback });
  const TABS = [
    { id: 'transactions', label: 'Transactions', fields: [
      // In the Transactions tab the prospect_name field IS the deal
      // title — every Notion DB has exactly one Title property, and
      // a B2B pipeline row's header is the deal it represents. Label
      // reads "Nom du deal" here to match that semantic; the Contacts
      // tab below keeps the "Nom du prospect" label because there it
      // really is the contact person's name.
      { key: 'prospect_name', label: tf('crm.field_deal_name',     'Nom du deal'),     hints: ['name', 'nom', 'title', 'titre', 'deal', 'transaction'] },
      { key: 'status',        label: tf('crm.field_status',        'Statut'),          hints: ['status', 'statut'] },
      { key: 'mrr',           label: tf('crm.field_mrr',           'MRR / Montant'),   hints: ['mrr', 'amount', 'montant', 'prix'] },
      { key: 'notes',         label: tf('crm.field_notes',         'Notes'),           hints: ['notes', 'note'] },
      { key: 'partner_name',  label: tf('crm.field_partner_name',  'Nom du partenaire'), hints: ['partner', 'partenaire'] },
    ] },
    { id: 'contacts', label: 'Contacts', fields: [
      { key: 'prospect_name', label: tf('crm.field_prospect_name', 'Nom'),             hints: ['name', 'nom', 'title', 'titre'] },
      { key: 'email',         label: tf('crm.field_email',         'Email'),           hints: ['email', 'e-mail', 'mail'] },
      { key: 'phone',         label: tf('crm.field_phone',         'Téléphone'),       hints: ['phone', 'téléphone', 'telephone', 'tel'] },
      { key: 'role',          label: tf('crm.field_role',          'Rôle'),            hints: ['role', 'poste', 'title', 'titre'] },
    ] },
    { id: 'companies', label: 'Entreprises', fields: [
      { key: 'company',       label: tf('crm.field_company',       'Entreprise'),      hints: ['name', 'nom', 'company', 'société', 'entreprise'] },
    ] },
  ];

  const [active, setActive] = useState('transactions');
  const [status, setStatus] = useState({ databases: { transactions: null, contacts: null, companies: null } });
  const [propsByType, setPropsByType] = useState({ transactions: [], contacts: [], companies: [] });
  const [mappings, setMappings] = useState({ transactions: {}, contacts: {}, companies: {} });
  // RefBoost canonical stage slug → Notion Status/Select option name.
  // Empty string = "don't map this stage" → sync will omit the status
  // field for referrals in that stage.
  const [statusMapping, setStatusMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  // The 6 RefBoost pipeline stages (canonical slugs). Kept stable so
  // the JSONB in DB always has the same keys regardless of locale.
  const REFBOOST_STATUSES = [
    { slug: 'new',        labelKey: 'notion.status_new',        fallback: 'Nouveau' },
    { slug: 'contacted',  labelKey: 'notion.status_contacted',  fallback: 'Contacté' },
    { slug: 'qualified',  labelKey: 'notion.status_qualified',  fallback: 'Qualifié' },
    { slug: 'proposal',   labelKey: 'notion.status_proposal',   fallback: 'Proposition' },
    { slug: 'won',        labelKey: 'notion.status_won',        fallback: 'Gagné' },
    { slug: 'lost',       labelKey: 'notion.status_lost',       fallback: 'Perdu' },
  ];

  useEffect(() => {
    (async () => {
      try {
        const [st, m] = await Promise.all([
          api.getNotionStatus(),
          api.getNotionMappings().catch(() => ({ mappings: {} })),
        ]);
        setStatus(st);

        // Fetch properties for each configured DB in parallel; skip
        // the unconfigured ones.
        const tasks = ['transactions', 'contacts', 'companies']
          .filter(t => st.databases?.[t])
          .map(async type => {
            try { const p = await api.getNotionProperties(type); return [type, p.properties || []]; }
            catch { return [type, []]; }
          });
        const results = await Promise.all(tasks);
        const byType = { transactions: [], contacts: [], companies: [] };
        for (const [type, props] of results) byType[type] = props;
        setPropsByType(byType);

        // Auto-suggest: anything not already mapped gets a best-guess
        // match against property names via per-field `hints`.
        const merged = { transactions: {}, contacts: {}, companies: {} };
        for (const tab of TABS) {
          const props = byType[tab.id] || [];
          const byLower = Object.fromEntries(props.map(p => [p.name.toLowerCase(), p.name]));
          const saved = m.mappings?.[tab.id] || {};
          for (const f of tab.fields) {
            if (saved[f.key]) { merged[tab.id][f.key] = saved[f.key]; continue; }
            const found = f.hints.map(h => byLower[h]).find(Boolean);
            merged[tab.id][f.key] = found || '';
          }
        }
        setMappings(merged);
        setStatusMapping(m.statusMapping || {});
      } catch (e) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setErr(''); setSavedOk(false);
    try {
      await api.updateNotionMappings(mappings, statusMapping);
      // Show the green confirmation and auto-close after 1.3s. Admins
      // who want to keep tweaking can click the X / backdrop before
      // the timer fires.
      setSavedOk(true);
      setTimeout(() => { onClose(); }, 1300);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  const currentTab = TABS.find(t => t.id === active);
  const currentProps = propsByType[active] || [];
  const currentDbConfigured = !!status.databases?.[active];

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{t('notion.title')} — {t('notion.field_mapping')}</h3>
          <button type="button" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 14 }}>
          {TABS.map(tab => {
            const configured = !!status.databases?.[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                disabled={!configured}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
                  cursor: configured ? 'pointer' : 'not-allowed',
                  fontSize: 12, fontWeight: 600,
                  background: active === tab.id ? '#fff' : 'transparent',
                  color: !configured ? '#cbd5e1' : active === tab.id ? '#0f172a' : '#64748b',
                  boxShadow: active === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {tab.label}{!configured && ' —'}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>…</div>
        ) : !currentDbConfigured ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Base non configurée. Ajoutez l'ID dans la connexion Notion pour activer ce mapping.
          </div>
        ) : (
          <>
            <table style={{ width: '100%', marginBottom: 16 }}>
              <thead>
                <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.refboost_field')}</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.notion_property')}</th>
                </tr>
              </thead>
              <tbody>
                {currentTab.fields.map(f => (
                  <tr key={f.key}>
                    <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{f.label}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <select
                        value={mappings[active]?.[f.key] || ''}
                        onChange={e => setMappings(m => ({ ...m, [active]: { ...m[active], [f.key]: e.target.value } }))}
                        style={inp}
                      >
                        <option value="">—</option>
                        {currentProps.map(p => (
                          <option key={p.id || p.name} value={p.name}>{p.name} ({p.type})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ─── Status value mapping (Transactions tab only) ─────
                Lets the admin map each of the 6 canonical RefBoost
                stages to the matching option of their Notion Status
                or Select property. Without this, pushing
                `{ status: 'new' }` to a Notion Status property whose
                options are "Prospect" / "Signé" / etc. fails — Notion
                Status options are fixed and can't be auto-created.
                Dropdown values come from the Notion property the user
                picked in the field-mapping row above (status row). */}
            {active === 'transactions' && (() => {
              const statusPropName = mappings.transactions?.status;
              const statusProp = currentProps.find(p => p.name === statusPropName);
              const options = Array.isArray(statusProp?.options) ? statusProp.options : [];
              return (
                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{t('notion.status_mapping_title')}</h4>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b', lineHeight: 1.55 }}>{t('notion.status_mapping_hint')}</p>
                  {!statusPropName ? (
                    <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, fontSize: 12 }}>
                      {t('notion.status_mapping_pick_property')}
                    </div>
                  ) : !options.length ? (
                    <div style={{ padding: 12, background: '#f1f5f9', color: '#475569', borderRadius: 8, fontSize: 12 }}>
                      {t('notion.status_mapping_no_options')}
                    </div>
                  ) : (
                    <table style={{ width: '100%' }}>
                      <thead>
                        <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.status_col_refboost')}</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.status_col_notion')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {REFBOOST_STATUSES.map(s => (
                          <tr key={s.slug}>
                            <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{t(s.labelKey) || s.fallback}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <select
                                value={statusMapping[s.slug] || ''}
                                onChange={e => setStatusMapping(sm => ({ ...sm, [s.slug]: e.target.value }))}
                                style={inp}
                              >
                                <option value="">{t('notion.status_ignore')}</option>
                                {options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}
        {savedOk && (
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#047857', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
            {t('notion.mapping_saved')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t('common.close') || 'Fermer'}
          </button>
          <button type="button" onClick={save} disabled={saving || savedOk} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving || savedOk ? 0.6 : 1 }}>
            {saving ? '…' : savedOk ? (t('notion.mapping_saved_short') || 'OK') : (t('common.save') || 'Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══ Partner notification preferences ═══
// Six email toggles; in-app delivery is always on per product spec
// so the UI only exposes the email column. Writes straight to
// partners.notification_preferences.
// Per-event partner email toggles, grouped by domain so the
// preferences card mirrors the v26 admin layout. In-app delivery
// stays always-on for partners (no per-partner in-app gating in
// the backend yet — see partnerNotificationPrefs.js for the
// per-key set we persist).
const PARTNER_NOTIF_GROUPS = [
  {
    id: 'mes_referrals',
    keys: [
      { key: 'email_new_form_lead',   label: 'partner_notifications.new_form_lead',   defaultLabel: 'Nouveau lead via mon lien de formulaire' },
      { key: 'email_referral_status', label: 'partner_notifications.referral_status', defaultLabel: "Changement de statut d'un referral" },
      { key: 'email_referral_won',    label: 'partner_notifications.referral_won',    defaultLabel: 'Deal gagné' },
    ],
  },
  {
    id: 'commissions',
    keys: [
      { key: 'email_commission_new',      label: 'partner_notifications.commission_new',      defaultLabel: 'Nouvelle commission disponible' },
      { key: 'email_commission_approved', label: 'partner_notifications.commission_approved', defaultLabel: 'Commission approuvée' },
      { key: 'email_payment_completed',   label: 'partner_notifications.payment_completed',   defaultLabel: 'Paiement effectué' },
      { key: 'email_commission_deleted',  label: 'partner_notifications.commission_deleted',  defaultLabel: 'Commission supprimée' },
    ],
  },
  {
    id: 'mon_compte',
    keys: [
      { key: 'email_tier_change',    label: 'partner_notifications.tier_change',    defaultLabel: 'Changement de niveau partenaire' },
      { key: 'email_access_revoked', label: 'partner_notifications.access_revoked', defaultLabel: 'Accès révoqué' },
    ],
  },
  {
    id: 'communication',
    keys: [
      { key: 'email_news',        label: 'partner_notifications.news',        defaultLabel: 'Nouvelle actualité publiée' },
      { key: 'email_new_message', label: 'partner_notifications.new_message', defaultLabel: 'Nouveau message' },
    ],
  },
];

function PartnerNotificationsTab() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    api.getPartnerNotificationPreferences()
      .then(d => setPrefs(d.preferences || {}))
      .catch(() => setPrefs({}));
  }, []);

  const toggle = (k) => setPrefs(p => ({ ...p, [k]: !p[k] }));
  const save = async () => {
    setSaving(true);
    try { await api.updatePartnerNotificationPreferences(prefs); setSavedAt(Date.now()); }
    catch (err) { showToast.error(err.message); }
    setSaving(false);
  };

  if (!prefs) return <div style={{ padding: 24, color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {t('partner_notifications.title', 'Notifications')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('partner_notifications.subtitle', 'Choisissez les emails que vous souhaitez recevoir. Les notifications dans l\'application restent toujours actives.')}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {PARTNER_NOTIF_GROUPS.map((g, gi) => (
          <div key={g.id} style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', background: '#f8fafc', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 1 }}>
              <div>{t('partner_notifications.group_' + g.id, g.id.replace('_', ' '))}</div>
              <div style={{ textAlign: 'center' }}>{gi === 0 ? t('notifications.email', 'E-mail') : ''}</div>
            </div>
            {g.keys.map(row => (
              <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', padding: '14px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
                <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>
                  {t(row.label, row.defaultLabel)}
                </div>
                <div style={{ textAlign: 'center' }}>
                  <button
                    onClick={() => toggle(row.key)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: prefs[row.key] ? '#059669' : '#cbd5e1' }}
                  >
                    {prefs[row.key] ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: 'var(--rb-primary, #059669)', color: '#fff',
          fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1,
        }}>{saving ? t('common.saving', 'Enregistrement…') : t('common.save', 'Enregistrer')}</button>
        {savedAt > 0 && Date.now() - savedAt < 3000 && (
          <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={14} /> {t('common.saved', 'Enregistré')}
          </span>
        )}
      </div>
    </div>
  );
}

// ═══ INFORMATIONS BANCAIRES (vue partenaire) ═══
// Default VAT rate per country — pre-fills the rate input when the
// user picks a country and their saved rate doesn't match. The user
// can override (we keep the input editable). Only EU countries we
// explicitly support; others can be entered manually if Qonto rolls
// out new corridors. Source: standard rates 2026.
// Standard 2026 VAT rates. CH and UK aren't EU but partners abroad
// may still need a rate captured for their accounting; US is included
// as 0 % so a partner can mark themselves "subject" with a rate of 0
// (i.e. they file VAT but the rate is zero on this corridor); OTHER
// is a sentinel for any country we don't list yet — backend treats it
// as "country unknown, rate is whatever the partner typed".
const VAT_DEFAULT_RATES = {
  FR: 20, DE: 19, ES: 21, IT: 22, NL: 21, PT: 23, BE: 21, LU: 17, AT: 20, IE: 23,
  CH: 8.1, UK: 20, US: 0, OTHER: 0,
};
const VAT_COUNTRIES = ['FR', 'DE', 'ES', 'IT', 'NL', 'PT', 'BE', 'LU', 'AT', 'IE', 'CH', 'UK', 'US', 'OTHER'];
const COUNTRY_FLAGS = {
  FR: '🇫🇷', DE: '🇩🇪', ES: '🇪🇸', IT: '🇮🇹', NL: '🇳🇱',
  PT: '🇵🇹', BE: '🇧🇪', LU: '🇱🇺', AT: '🇦🇹', IE: '🇮🇪',
  CH: '🇨🇭', UK: '🇬🇧', US: '🇺🇸', OTHER: '🌍',
};

function PartnerBankInfoTab() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    account_holder: '', iban: '', bic: '', bank_name: '',
    tax_subject: false, tax_country: '', tax_rate: '', tax_id: '',
  });
  const [saved, setSaved] = useState(null);
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getMyBankInfo()
      .then(d => {
        const info = d.bank_info || {};
        setSaved(info);
        setForm({
          account_holder: info.account_holder || '',
          iban: info.iban || '',
          bic: info.bic || '',
          bank_name: info.bank_name || '',
          tax_subject: !!info.tax_subject,
          tax_country: info.tax_country || '',
          tax_rate: info.tax_rate != null ? String(info.tax_rate) : '',
          tax_id: info.tax_id || '',
        });
        setEditing(!info.iban);
      })
      .catch(() => setEditing(true))
      .finally(() => setLoading(false));
  }, []);

  const formatIban = (v) => v.replace(/\s/g, '').replace(/(.{4})/g, '$1 ').trim();

  // When the user picks a country, suggest the default rate IF either
  // the rate is empty or it matches the previous country's default.
  // We never overwrite a hand-edited rate without asking.
  const handleCountryChange = (next) => {
    setForm(f => {
      const prevDefault = VAT_DEFAULT_RATES[f.tax_country];
      const currentRate = f.tax_rate ? parseFloat(f.tax_rate) : null;
      const shouldAlign = currentRate == null
        || (prevDefault != null && currentRate === prevDefault);
      const aligned = shouldAlign && VAT_DEFAULT_RATES[next] != null
        ? String(VAT_DEFAULT_RATES[next])
        : f.tax_rate;
      return { ...f, tax_country: next, tax_rate: aligned };
    });
  };

  const handleSave = async () => {
    setErr('');
    // Client-side guard mirroring the server validation so the user
    // sees the issue immediately instead of after a 400 round-trip.
    if (form.tax_subject) {
      if (!form.tax_country) { setErr(t('settings.bankInfo.tax.errors.countryMissing')); return; }
      const rateNum = parseFloat(form.tax_rate);
      if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum > 30) {
        setErr(t('settings.bankInfo.tax.errors.rateMissing'));
        return;
      }
    }
    setSaving(true);
    try {
      const payload = {
        account_holder: form.account_holder.trim() || null,
        iban: form.iban.replace(/\s/g, '').toUpperCase() || null,
        bic: form.bic.toUpperCase() || null,
        bank_name: form.bank_name.trim() || null,
        tax_subject: !!form.tax_subject,
        tax_country: form.tax_subject ? (form.tax_country || null) : null,
        tax_rate: form.tax_subject ? (parseFloat(form.tax_rate) || null) : null,
        tax_id: form.tax_id?.trim() || null,
      };
      const res = await api.updateMyBankInfo(payload);
      setSaved(res.bank_info);
      setEditing(false);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(e.message || 'Erreur');
    }
    setSaving(false);
  };

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  if (loading) return <div style={{ padding: 24, color: '#94a3b8' }}>…</div>;

  const hasSaved = !!(saved && saved.iban);

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {t('partnerBankInfo.title', 'Informations bancaires')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('partnerBankInfo.subtitle', 'Ajoutez vos coordonnées bancaires pour recevoir vos paiements plus rapidement.')}
      </p>

      {err && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 13 }}>
          {err}
        </div>
      )}

      {!editing && hasSaved ? (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
            <Field label={t('partnerBankInfo.account_holder', 'Titulaire du compte')} value={saved.account_holder || '—'} />
            <Field label={t('partnerBankInfo.bank_name', 'Nom de la banque')} value={saved.bank_name || '—'} />
            <Field
              label={t('partnerBankInfo.iban', 'IBAN')}
              value={<span style={{ fontFamily: 'monospace', letterSpacing: 1 }}>{formatIban(saved.iban)}</span>}
            />
            <Field
              label={t('partnerBankInfo.bic', 'BIC / SWIFT')}
              value={<span style={{ fontFamily: 'monospace' }}>{saved.bic || '—'}</span>}
            />
          </div>
          {/* VAT summary line — only shown when subject. Keeps the
              read-only view compact for non-subject partners (the
              vast majority). */}
          {saved.tax_subject && (
            <div style={{ padding: '12px 14px', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985', fontSize: 13, marginBottom: 18 }}>
              <strong>{t('settings.bankInfo.tax.title')}</strong> · {COUNTRY_FLAGS[saved.tax_country] || ''} {saved.tax_country || '—'} · {saved.tax_rate || 0}%
              {saved.tax_id && <> · {saved.tax_id}</>}
            </div>
          )}
          <button onClick={() => setEditing(true)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10,
            background: '#fff', border: '1px solid #e2e8f0', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}>
            <Edit2 size={14} /> {t('common.edit', 'Modifier')}
          </button>
        </div>
      ) : (
        <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={labelStyle}>{t('partnerBankInfo.account_holder', 'Titulaire du compte')}</label>
            <input
              value={form.account_holder}
              onChange={e => setForm(f => ({ ...f, account_holder: e.target.value }))}
              placeholder={t('partnerBankInfo.account_holder_ph', 'Nom et prénom')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('partnerBankInfo.iban', 'IBAN')}</label>
            <input
              value={form.iban}
              onChange={e => setForm(f => ({ ...f, iban: e.target.value.toUpperCase() }))}
              placeholder="FR76 3000 1007 9412 3456 7890 185"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>{t('partnerBankInfo.bic', 'BIC / SWIFT')}</label>
              <input
                value={form.bic}
                onChange={e => setForm(f => ({ ...f, bic: e.target.value.toUpperCase() }))}
                placeholder="BNPAFRPP"
                style={{ ...inputStyle, fontFamily: 'monospace' }}
              />
            </div>
            <div>
              <label style={labelStyle}>
                {t('partnerBankInfo.bank_name', 'Nom de la banque')}
                <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>({t('common.optional', 'optionnel')})</span>
              </label>
              <input
                value={form.bank_name}
                onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                placeholder={t('partnerBankInfo.bank_name_ph', 'BNP Paribas')}
                style={inputStyle}
              />
            </div>
          </div>
          {/* ─── VAT section ──────────────────────────────────────── */}
          <div style={{ marginTop: 16, paddingTop: 20, borderTop: '1px solid #e2e8f0' }}>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 12px' }}>
              {t('settings.bankInfo.tax.title')}
            </h3>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#334155', cursor: 'pointer', marginBottom: 12 }}>
              <input
                type="checkbox"
                checked={form.tax_subject}
                onChange={e => setForm(f => ({ ...f, tax_subject: e.target.checked }))}
                style={{ width: 16, height: 16, cursor: 'pointer' }}
              />
              <span>{t('settings.bankInfo.tax.subjectToggle')}</span>
            </label>
            {form.tax_subject && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 12 }}>
                  <div>
                    <label style={labelStyle}>{t('settings.bankInfo.tax.countryLabel')}</label>
                    <select
                      value={form.tax_country}
                      onChange={e => handleCountryChange(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">—</option>
                      {VAT_COUNTRIES.map(cc => (
                        <option key={cc} value={cc}>
                          {COUNTRY_FLAGS[cc]} {cc} ({VAT_DEFAULT_RATES[cc]}%)
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{t('settings.bankInfo.tax.rateLabel')}</label>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      step="0.01"
                      value={form.tax_rate}
                      onChange={e => setForm(f => ({ ...f, tax_rate: e.target.value }))}
                      placeholder="20.00"
                      style={inputStyle}
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={labelStyle}>
                    {t('settings.bankInfo.tax.taxIdLabel')}
                    <span style={{ color: '#94a3b8', fontWeight: 400, marginLeft: 4 }}>({t('common.optional', 'optionnel')})</span>
                  </label>
                  <input
                    value={form.tax_id}
                    onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))}
                    placeholder="FR12345678901"
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                  />
                </div>
                <div style={{ padding: '10px 12px', borderRadius: 10, background: '#f0f9ff', border: '1px solid #bae6fd', color: '#075985', fontSize: 12, lineHeight: 1.5 }}>
                  {t('settings.bankInfo.tax.helperBanner')}
                </div>
              </>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
            <button onClick={handleSave} disabled={saving} style={{
              padding: '10px 20px', borderRadius: 10, border: 'none',
              background: 'var(--rb-primary, #059669)', color: '#fff',
              fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <Save size={14} /> {saving ? t('common.saving', 'Enregistrement…') : t('common.save', 'Enregistrer')}
            </button>
            {hasSaved && (
              <button onClick={() => { setEditing(false); setForm({
                account_holder: saved.account_holder || '',
                iban: saved.iban || '',
                bic: saved.bic || '',
                bank_name: saved.bank_name || '',
                tax_subject: !!saved.tax_subject,
                tax_country: saved.tax_country || '',
                tax_rate: saved.tax_rate != null ? String(saved.tax_rate) : '',
                tax_id: saved.tax_id || '',
              }); }} disabled={saving} style={{
                padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
                background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}>
                {t('common.cancel', 'Annuler')}
              </button>
            )}
            {savedAt > 0 && Date.now() - savedAt < 3000 && (
              <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <CheckCircle size={14} /> {t('common.saved', 'Enregistré')}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ CONFIDENTIALITÉ — inline in Profil et sécurité ═══
//
// Replaces the old standalone "Confidentialité" tab. Decides visibility
// via /api/auth/account-info:
//
//   - partner            → export-data (JSON) + delete-account
//   - admin owner        → export-data (ZIP)  + delete-tenant
//   - admin invited / commercial / superadmin → nothing rendered
//
// The deletion modal is a 2-step flow: feedback radio + free text on
// step 1, then a typed-name confirmation on step 2. Step 1 is optional
// for partners (their tenant deletion requires a tenant-name match;
// partners just confirm with their email like before).
function PrivacySection({ user }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [info, setInfo] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [step, setStep] = useState(0); // 0 = closed, 1 = feedback, 2 = confirm
  const [reasonCode, setReasonCode] = useState('');
  const [freeText, setFreeText] = useState('');
  const [confirmInput, setConfirmInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    api.getAccountInfo()
      .then(d => setInfo(d))
      .catch(() => setInfo({ can_delete_self: false }));
  }, []);

  if (!info) return null;
  if (!info.can_delete_self) return null;

  const isTenantOwner = info.delete_kind === 'tenant';
  const expectedConfirm = isTenantOwner ? (info.tenant_name || '') : (user?.email || '');
  const confirmValid = confirmInput.trim() === expectedConfirm;

  const REASONS = [
    { code: 'price',      label: t('settings.privacy.reason_price',     'Prix trop élevé') },
    { code: 'features',   label: t('settings.privacy.reason_features',  'Manque de fonctionnalités') },
    { code: 'competitor', label: t('settings.privacy.reason_competitor', 'Je passe à un concurrent') },
    { code: 'no_need',    label: t('settings.privacy.reason_no_need',   "Je n'en ai plus besoin") },
    { code: 'other',      label: t('settings.privacy.reason_other',     'Autre') },
  ];

  const handleExport = async () => {
    setExporting(true);
    try {
      if (isTenantOwner) await api.exportAccountData();
      else await api.exportData();
      showToast(t('settings.export.toast_success', 'Export téléchargé'), 'success');
    } catch (e) {
      showToast(e.message || 'Erreur', 'error');
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    setErr('');
    if (!confirmValid) {
      setErr(isTenantOwner
        ? t('settings.privacy.tenant_name_mismatch', 'Le nom saisi ne correspond pas.')
        : t('settings.delete_account.confirm_email_mismatch', "L'email saisi ne correspond pas à votre compte."));
      return;
    }
    setDeleting(true);
    try {
      const body = {
        reason_code: reasonCode || undefined,
        free_text: freeText || undefined,
      };
      if (isTenantOwner) {
        body.confirm_name = confirmInput.trim();
        await api.deleteTenant(body);
      } else {
        await api.deleteAccount(body);
      }
      showToast(t('settings.delete_account.toast_success', 'Demande de suppression enregistrée.'), 'success');
      api.logout();
      navigate('/', { replace: true });
      setTimeout(() => window.location.reload(), 100);
    } catch (e) {
      setErr(e.message || 'Erreur');
      setDeleting(false);
    }
  };

  const deleteLabel = isTenantOwner
    ? t('settings.privacy.delete_tenant_cta', 'Supprimer mon compte entreprise')
    : t('settings.privacy.delete_account_cta', 'Supprimer mon compte');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Shield size={16} color="#6366f1" />
        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>
          {t('settings.privacy.title', 'Confidentialité')}
        </h4>
      </div>
      <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px', lineHeight: 1.55 }}>
        {t('settings.privacy.subtitle', 'Vos droits RGPD : exportez vos données ou supprimez votre compte à tout moment.')}
      </p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button onClick={handleExport} disabled={exporting}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6, opacity: exporting ? 0.6 : 1 }}>
          <Download size={14} /> {exporting ? t('common.loading', 'Chargement…') : t('settings.privacy.export_cta', 'Exporter mes données')}
        </button>
        <button onClick={() => { setStep(1); setReasonCode(''); setFreeText(''); setConfirmInput(''); setErr(''); }}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1.5px solid #fecaca', background: '#fff', color: '#dc2626', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Trash2 size={14} /> {deleteLabel}
        </button>
      </div>

      {step > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => !deleting && setStep(0)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 16, width: 520, maxWidth: '100%', padding: 28, boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            {step === 1 && (
              <>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {t('settings.privacy.feedback_title', 'Nous sommes désolés de vous voir partir')}
                </h3>
                <p style={{ margin: '0 0 18px', color: '#475569', fontSize: 14 }}>
                  {t('settings.privacy.feedback_body', 'Pouvez-vous nous dire pourquoi ? Cela nous aide à améliorer RefBoost.')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                  {REASONS.map(r => (
                    <label key={r.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: '1.5px solid ' + (reasonCode === r.code ? '#0f172a' : '#e2e8f0'), background: reasonCode === r.code ? '#f8fafc' : '#fff', cursor: 'pointer' }}>
                      <input type="radio" name="delete_reason" checked={reasonCode === r.code} onChange={() => setReasonCode(r.code)} />
                      <span style={{ fontSize: 14, color: '#0f172a' }}>{r.label}</span>
                    </label>
                  ))}
                </div>
                <label style={{ display: 'block', fontSize: 12, color: '#475569', fontWeight: 600, marginBottom: 6 }}>
                  {t('settings.privacy.feedback_free_label', 'Commentaire (optionnel)')}
                </label>
                <textarea rows={3} value={freeText} onChange={e => setFreeText(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box', resize: 'vertical' }} />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button onClick={() => setStep(0)} style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('common.cancel', 'Annuler')}
                  </button>
                  <button onClick={() => setStep(2)}
                    style={{ padding: '9px 16px', borderRadius: 10, background: '#0f172a', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('settings.privacy.continue', 'Continuer')}
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
                  {t('settings.privacy.confirm_title', 'Confirmer la suppression définitive')}
                </h3>
                <p style={{ margin: '0 0 16px', color: '#475569', fontSize: 14, lineHeight: 1.5 }}>
                  {isTenantOwner
                    ? t('settings.privacy.confirm_body_tenant', 'Cette action supprimera définitivement votre compte entreprise, vos partenaires, vos referrals, vos commissions, et toutes les données associées. Vos accès partenaires chez d\'autres clients RefBoost ne seront PAS affectés. Cette opération est irréversible.')
                    : t('settings.privacy.confirm_body_partner', 'Cette action supprimera définitivement votre compte. Cette opération est irréversible.')
                  }
                </p>
                <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>
                  {isTenantOwner
                    ? t('settings.privacy.confirm_name_label', { name: info.tenant_name, defaultValue: 'Pour confirmer, tapez le nom de votre entreprise (ex : {{name}}) :' })
                    : t('settings.delete_account.confirm_email_label', 'Confirmez en saisissant votre email')
                  }
                </label>
                <input type="text" value={confirmInput} onChange={e => setConfirmInput(e.target.value)}
                  placeholder={expectedConfirm}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1.5px solid ' + (err ? '#dc2626' : '#e2e8f0'), fontSize: 14, fontFamily: 'inherit', boxSizing: 'border-box' }} />
                {err && <div style={{ color: '#dc2626', fontSize: 12, marginTop: 6 }}>{err}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 18 }}>
                  <button onClick={() => setStep(0)} disabled={deleting}
                    style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>
                    {t('common.cancel', 'Annuler')}
                  </button>
                  <button onClick={handleDelete} disabled={deleting || !confirmValid}
                    style={{ padding: '9px 16px', borderRadius: 10, background: confirmValid ? '#dc2626' : '#e2e8f0', color: confirmValid ? '#fff' : '#94a3b8', border: 'none', fontWeight: 600, fontSize: 13, cursor: confirmValid && !deleting ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}>
                    {deleting ? t('common.loading', 'Chargement…') : t('settings.privacy.delete_definitive', 'Supprimer définitivement')}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ CONFIDENTIALITÉ — partner GDPR controls ═══
// Two GDPR self-service flows live here:
//   - Article 20 (data portability): one-click JSON export of profile,
//     referrals, commissions, messages.
//   - Article 17 (right to erasure): account deletion with a typed
//     email confirmation + 30-day grace period before permanent purge.
function PartnerPrivacyTab({ user }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [exporting, setExporting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [emailInput, setEmailInput] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [err, setErr] = useState('');

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportData();
      showToast.success(t('settings.export.toast_success', 'Export téléchargé'));
    } catch (e) {
      showToast.error(e.message || 'Erreur');
    }
    setExporting(false);
  };

  const handleDelete = async () => {
    setErr('');
    if (emailInput.trim().toLowerCase() !== (user?.email || '').toLowerCase()) {
      setErr(t('settings.delete_account.confirm_email_mismatch', "L'email saisi ne correspond pas à votre compte."));
      return;
    }
    setDeleting(true);
    try {
      await api.deleteAccount();
      showToast.success(t('settings.delete_account.toast_success', 'Demande de suppression enregistrée.'));
      // Wipe local session and bounce to the public landing.
      api.logout();
      navigate('/', { replace: true });
      // A reload guarantees every cached hook (Auth, Tenant) re-reads
      // the now-empty localStorage instead of holding the deleted user.
      setTimeout(() => window.location.reload(), 100);
    } catch (e) {
      setErr(e.message || 'Erreur');
      setDeleting(false);
    }
  };

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {t('settings.tab_privacy', 'Confidentialité')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('settings.privacy.subtitle', 'Vos droits RGPD : exportez vos données ou supprimez votre compte à tout moment.')}
      </p>

      {/* Export — Article 20 */}
      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>
          {t('settings.export.title', 'Exporter mes données')}
        </h3>
        <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
          {t('settings.export.description', 'Téléchargez un fichier JSON contenant votre profil, vos recommandations, vos commissions et vos messages.')}
        </p>
        <button
          onClick={handleExport}
          disabled={exporting}
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: 'var(--rb-primary, #059669)', color: '#fff',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: exporting ? 0.7 : 1,
          }}
        >
          {exporting ? t('common.loading', 'Chargement…') : t('settings.export.cta', 'Exporter mes données')}
        </button>
      </div>

      {/* Delete — Article 17 */}
      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: '#991b1b', marginBottom: 6 }}>
          {t('settings.delete_account.title', 'Supprimer mon compte')}
        </h3>
        <p style={{ color: '#7f1d1d', fontSize: 13, lineHeight: 1.5, marginBottom: 14 }}>
          {t('settings.delete_account.description', 'Cette action déclenche une suppression définitive de vos données dans 30 jours. Vous pouvez annuler en contactant dpo@refboost.io durant ce délai.')}
        </p>
        <button
          onClick={() => { setConfirmOpen(true); setEmailInput(''); setErr(''); }}
          style={{
            padding: '10px 18px', borderRadius: 10, border: 'none',
            background: '#dc2626', color: '#fff',
            fontWeight: 600, fontSize: 14, cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Trash2 size={14} /> {t('settings.delete_account.cta', 'Supprimer mon compte')}
        </button>
      </div>

      {/* Confirmation modal — Article 17 */}
      {confirmOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div onClick={() => !deleting && setConfirmOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 16, width: 480, maxWidth: '100%', padding: 24, boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>
              {t('settings.delete_account.modal_title', 'Supprimer mon compte')}
            </h3>
            <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.5, marginBottom: 16 }}>
              {t('settings.delete_account.modal_body', 'Cette action est irréversible. Toutes vos données seront supprimées dans 30 jours.')}
            </p>
            <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>
              {t('settings.delete_account.confirm_email_label', 'Confirmez en saisissant votre email')}
            </label>
            <input
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              placeholder={user?.email || 'vous@exemple.com'}
              disabled={deleting}
              style={{
                width: '100%', padding: '10px 14px', borderRadius: 10,
                border: '2px solid #e2e8f0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box',
              }}
            />
            {err && (
              <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontSize: 13 }}>
                {err}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={deleting}
                style={{
                  padding: '10px 16px', borderRadius: 10, border: '1px solid #e2e8f0',
                  background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 14, cursor: 'pointer',
                }}
              >
                {t('settings.delete_account.cancel', 'Annuler')}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '10px 18px', borderRadius: 10, border: 'none',
                  background: '#dc2626', color: '#fff',
                  fontWeight: 700, fontSize: 14, cursor: 'pointer', opacity: deleting ? 0.7 : 1,
                }}
              >
                {deleting ? t('common.loading', 'Chargement…') : t('settings.delete_account.confirm', 'Supprimer définitivement')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══ ENTREPRISE — billing details ═══
// Admin-only tab. Persisted on tenants.billing_* columns added in
// v33. Read-only twin renders on /partner/payments at the top of
// the page so partners can address their invoice.
function CompanyBillingTab() {
  const { t } = useTranslation();
  const [form, setForm] = useState({
    billing_company_name: '', billing_address: '', billing_city: '',
    billing_postal_code: '', billing_country: 'France', billing_siret: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    api.getBillingInfo()
      .then(d => {
        const b = d.billing || {};
        setForm({
          billing_company_name: b.billing_company_name || '',
          billing_address:      b.billing_address      || '',
          billing_city:         b.billing_city         || '',
          billing_postal_code:  b.billing_postal_code  || '',
          billing_country:      b.billing_country      || 'France',
          billing_siret:        b.billing_siret        || '',
        });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.updateBillingInfo({
        billing_company_name: form.billing_company_name.trim() || null,
        billing_address:      form.billing_address.trim()      || null,
        billing_city:         form.billing_city.trim()         || null,
        billing_postal_code:  form.billing_postal_code.trim()  || null,
        billing_country:      form.billing_country.trim()      || null,
        billing_siret:        form.billing_siret.trim()        || null,
      });
      setSavedAt(Date.now());
    } catch (err) {
      showToast.error(err.message || 'Error');
    }
    setSaving(false);
  };

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 6 };

  if (loading) return <div style={{ padding: 24, color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {t('settings.company_tab', 'Entreprise')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('settings.company_subtitle', 'Ces informations sont affichées sur la page de paiement de chaque partenaire pour qu\'il puisse vous facturer correctement.')}
      </p>
      <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={labelStyle}>{t('settings.billing_company_name', 'Nom de la structure')}</label>
          <input value={form.billing_company_name} onChange={e => setForm(f => ({ ...f, billing_company_name: e.target.value }))} placeholder="SKIPCALL SAS" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{t('settings.billing_address', 'Adresse')}</label>
          <input value={form.billing_address} onChange={e => setForm(f => ({ ...f, billing_address: e.target.value }))} placeholder="15 rue de la Paix" style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 12 }}>
          <div>
            <label style={labelStyle}>{t('settings.billing_postal_code', 'Code postal')}</label>
            <input value={form.billing_postal_code} onChange={e => setForm(f => ({ ...f, billing_postal_code: e.target.value }))} placeholder="06000" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>{t('settings.billing_city', 'Ville')}</label>
            <input value={form.billing_city} onChange={e => setForm(f => ({ ...f, billing_city: e.target.value }))} placeholder="Nice" style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={labelStyle}>{t('settings.billing_country', 'Pays')}</label>
          <input value={form.billing_country} onChange={e => setForm(f => ({ ...f, billing_country: e.target.value }))} placeholder="France" style={inputStyle} />
        </div>
        <div>
          <label style={labelStyle}>{t('settings.billing_siret', 'N° SIRET')}</label>
          <input value={form.billing_siret} onChange={e => setForm(f => ({ ...f, billing_siret: e.target.value }))} placeholder="912 345 678 00015" style={{ ...inputStyle, fontFamily: 'monospace' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 8 }}>
          <button onClick={save} disabled={saving} style={{
            padding: '10px 20px', borderRadius: 10, border: 'none',
            background: 'var(--rb-primary, #059669)', color: '#fff',
            fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            <Save size={14} /> {saving ? t('common.saving', 'Enregistrement…') : t('common.save', 'Enregistrer')}
          </button>
          {savedAt > 0 && Date.now() - savedAt < 3000 && (
            <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={14} /> {t('common.saved', 'Enregistré')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}


function Field({ label, value }) {
  return (
    <div>
      <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 600, marginTop: 4 }}>{value}</div>
    </div>
  );
}
