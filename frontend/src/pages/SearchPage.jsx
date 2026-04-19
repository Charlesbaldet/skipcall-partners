import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, DollarSign, Newspaper, ChevronRight, Compass } from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';

// Static navigation index — pages, settings tabs, and other actions
// the user can jump to. Filtered locally on every keystroke; no API
// call. `roles` gates which entries each user sees: partners get the
// /partner/* destinations, admins/commercials get the back-office.
const NAVIGATION_ITEMS = [
  // ─── Admin / commercial pages ───
  { title: 'Dashboard',   subtitle: "Vue d'ensemble",                 url: '/dashboard',    keywords: ['dashboard', 'accueil', 'overview', 'home'],            roles: ['admin', 'commercial', 'superadmin'] },
  { title: 'Referrals',   subtitle: 'Pipeline et Kanban',             url: '/referrals',    keywords: ['referrals', 'pipeline', 'kanban', 'leads', 'prospects'], roles: ['admin', 'commercial', 'superadmin'] },
  { title: 'Partenaires', subtitle: 'Gérer vos partenaires',          url: '/partners',     keywords: ['partenaires', 'partners', 'apporteurs'],                roles: ['admin', 'commercial', 'superadmin'] },
  { title: 'Commissions', subtitle: 'Suivi des commissions',          url: '/commissions',  keywords: ['commissions', 'paiements', 'payments'],                  roles: ['admin', 'commercial', 'superadmin'] },
  { title: 'Messagerie',  subtitle: 'Conversations',                  url: '/messaging',    keywords: ['messagerie', 'messages', 'chat', 'conversations'],       roles: ['admin', 'commercial', 'superadmin', 'partner'] },
  { title: 'Actualités',  subtitle: 'News et mises à jour',           url: '/news',         keywords: ['actualités', 'news', 'updates', 'publications'],         roles: ['admin', 'commercial', 'superadmin'] },
  { title: 'Programme',   subtitle: 'Configuration du programme',     url: '/programme',    keywords: ['programme', 'program', 'configuration', 'niveaux', 'levels'], roles: ['admin', 'commercial', 'superadmin'] },
  { title: 'Facturation', subtitle: 'Plans et abonnements',           url: '/billing',      keywords: ['facturation', 'billing', 'abonnement', 'plan', 'tarifs', 'prix', 'stripe'], roles: ['admin', 'superadmin'] },
  { title: 'Notifications', subtitle: 'Centre de notifications',      url: '/notifications', keywords: ['notifications', 'alertes'],                              roles: ['admin', 'commercial', 'superadmin', 'partner'] },

  // ─── Partner pages ───
  { title: 'Dashboard',         subtitle: 'Mes referrals',             url: '/partner/referrals', keywords: ['dashboard', 'mes referrals', 'pipeline', 'mes leads'], roles: ['partner'] },
  { title: 'Soumettre un lead', subtitle: 'Nouveau referral',          url: '/partner/submit',    keywords: ['soumettre', 'nouveau', 'lead', 'referral', 'ajouter'], roles: ['partner'] },
  { title: 'Mes paiements',     subtitle: 'Mes commissions',           url: '/partner/payments',  keywords: ['paiements', 'commissions', 'payments', 'argent'],      roles: ['partner'] },
  { title: 'Actualités',        subtitle: 'News du programme',         url: '/partner/news',      keywords: ['actualités', 'news', 'mises à jour'],                  roles: ['partner'] },
  { title: 'Marketplace',       subtitle: "Découvrir d'autres programmes", url: '/marketplace',   keywords: ['marketplace', 'programmes', 'découvrir', 'explorer'],  roles: ['partner'] },

  // ─── Settings tabs (admin/superadmin) ───
  { title: 'Profil et sécurité',          subtitle: 'Paramètres → Compte',         url: '/settings?tab=profile',             keywords: ['profil', 'mot de passe', 'password', 'sécurité', 'email', 'compte', 'langue', 'language'], roles: ['admin', 'commercial', 'superadmin', 'partner'] },
  { title: 'Équipe et membres',           subtitle: 'Paramètres → Compte',         url: '/settings?tab=team',                keywords: ['équipe', 'membres', 'team', 'admin', 'utilisateurs', 'inviter', 'users'], roles: ['admin', 'superadmin'] },
  { title: 'Apparence et branding',       subtitle: 'Paramètres → Programme',      url: '/settings?tab=branding',            keywords: ['apparence', 'branding', 'logo', 'couleurs', 'thème', 'design'],          roles: ['admin', 'superadmin'] },
  { title: 'Pipeline et statuts',         subtitle: 'Paramètres → Programme',      url: '/settings?tab=pipeline',            keywords: ['pipeline', 'statuts', 'colonnes', 'kanban', 'stages', 'étapes', 'status'], roles: ['admin', 'superadmin'] },
  { title: 'Lien public et marketplace',  subtitle: 'Paramètres → Programme',      url: '/settings?tab=public-marketplace',  keywords: ['lien public', 'public link', 'marketplace', 'inscription', 'formulaire', 'candidature', 'apply'], roles: ['admin', 'superadmin'] },
  { title: 'Notifications et emails',     subtitle: 'Paramètres → Préférences',    url: '/settings?tab=notifications',       keywords: ['notifications', 'emails', 'préférences', 'alertes', 'preferences'],     roles: ['admin', 'superadmin'] },
  { title: 'Intégrations',                subtitle: 'Paramètres → Préférences',    url: '/settings?tab=integrations',        keywords: ['intégrations', 'crm', 'hubspot', 'salesforce', 'webhook', 'api'],       roles: ['admin', 'superadmin'] },
];

const CATEGORIES = [
  { key: 'navigation',  icon: Compass,    color: '#0EA5E9' },
  { key: 'referrals',   icon: FileText,   color: '#3B82F6' },
  { key: 'partners',    icon: Users,      color: '#059669' },
  { key: 'commissions', icon: DollarSign, color: '#F59E0B' },
  { key: 'news',        icon: Newspaper,  color: '#8B5CF6' },
];

// Case-insensitive highlight helper: wraps the portion of `text` that
// matches `query` with a green-tinted <mark>. Escapes regex metachars
// in the query so punctuation in user input doesn't explode.
function Highlight({ text, query }) {
  if (!text || !query || query.length < 2) return text || null;
  const safe = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try {
    const re = new RegExp('(' + safe + ')', 'ig');
    const parts = String(text).split(re);
    return (
      <>
        {parts.map((p, i) =>
          re.test(p)
            ? <mark key={i} style={{ background: 'rgba(5,150,105,0.15)', color: 'inherit', padding: 0, borderRadius: 2 }}>{p}</mark>
            : <span key={i}>{p}</span>
        )}
      </>
    );
  } catch {
    return text;
  }
}

function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

export default function SearchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const role = user?.role || 'admin';
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);     // null = before first search, {} = after
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const debounced = useDebounced(query, 300);

  // Autofocus on mount so Cmd+K → immediately typeable.
  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const q = debounced.trim();
    if (q.length < 2) {
      setResults(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true); setError('');
    api.globalSearch(q)
      .then(data => { if (!cancelled) setResults(data); })
      .catch(e => { if (!cancelled) setError(e.message || 'Erreur'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [debounced]);

  // Local navigation match. Case-insensitive includes against title,
  // subtitle, and the keyword aliases. Role-gated so partners see
  // /partner/* destinations and admins see the back-office. Capped
  // at 8 to avoid drowning the data results below.
  const navHits = useMemo(() => {
    const q = debounced.trim().toLowerCase();
    if (q.length < 2) return [];
    return NAVIGATION_ITEMS
      .filter(it => it.roles.includes(role))
      .filter(it => {
        if (it.title.toLowerCase().includes(q)) return true;
        if (it.subtitle && it.subtitle.toLowerCase().includes(q)) return true;
        return (it.keywords || []).some(k => k.toLowerCase().includes(q));
      })
      .slice(0, 8)
      .map(it => ({
        id: 'nav-' + it.url,
        title: it.title,
        subtitle: it.subtitle,
        url: it.url,
      }));
  }, [debounced, role]);

  const groups = useMemo(() => {
    return CATEGORIES
      .map(cat => {
        if (cat.key === 'navigation') return { ...cat, items: navHits };
        return { ...cat, items: results?.results?.[cat.key] || [] };
      })
      .filter(g => g.items.length > 0);
  }, [results, navHits]);

  const total = (results?.total || 0) + navHits.length;
  // Navigation matches alone are enough to consider the search non-
  // empty — even if the backend returned zero data hits.
  const showEmpty = !loading && debounced.trim().length >= 2 && total === 0 && (results !== null || navHits.length === 0);

  return (
    <div style={{ maxWidth: 820, margin: '0 auto' }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5, marginBottom: 20 }}>
        {t('search.title')}
      </h1>

      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 32 }}>
        <Search
          size={20}
          color="#94a3b8"
          style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('search.placeholder')}
          style={{
            width: '100%', height: 48, padding: '0 16px 0 48px',
            borderRadius: 12, border: '1.5px solid #e2e8f0',
            fontSize: 15, fontFamily: 'inherit', color: '#0f172a',
            outline: 'none', background: '#fff',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.target.style.borderColor = '#059669'; }}
          onBlur={(e) => { e.target.style.borderColor = '#e2e8f0'; }}
        />
        {/* Cmd+K hint chip on the right */}
        <span style={{
          position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
          fontSize: 11, color: '#94a3b8', background: '#f1f5f9', padding: '4px 8px',
          borderRadius: 6, border: '1px solid #e2e8f0', pointerEvents: 'none',
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        }}>
          {t('search.shortcut_hint')}
        </span>
      </div>

      {error && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '12px 16px', borderRadius: 10, fontSize: 13, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {/* Empty state before typing */}
      {!results && !loading && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#94a3b8', fontSize: 14 }}>
          {t('search.empty_hint')}
        </div>
      )}

      {loading && debounced.trim().length >= 2 && (
        <div style={{ textAlign: 'center', padding: '24px', color: '#94a3b8', fontSize: 14 }}>
          {t('search.searching')}
        </div>
      )}

      {showEmpty && (
        <div style={{ textAlign: 'center', padding: '40px 20px', color: '#64748b', fontSize: 14 }}>
          {t('search.no_results')} <strong style={{ color: '#0f172a' }}>“{debounced}”</strong>
        </div>
      )}

      {/* Grouped results */}
      {groups.map(group => {
        const Icon = group.icon;
        return (
          <section key={group.key} style={{ marginBottom: 28 }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{
                width: 26, height: 26, borderRadius: 8,
                background: group.color + '15', color: group.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}>
                <Icon size={14}/>
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#334155' }}>
                {t('search.' + group.key)}
              </span>
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                ({group.items.length})
              </span>
            </header>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {group.items.map(item => (
                <button
                  key={group.key + '-' + item.id}
                  type="button"
                  onClick={() => navigate(item.url)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    width: '100%', textAlign: 'left',
                    background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
                    padding: '12px 14px', cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'background .12s',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      <Highlight text={item.title} query={debounced}/>
                    </div>
                    {item.subtitle && (
                      <div style={{ fontSize: 12, color: '#64748b', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <Highlight text={item.subtitle} query={debounced}/>
                      </div>
                    )}
                  </div>
                  {item.status && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 999,
                      background: (item.statusColor || group.color) + '15',
                      color: item.statusColor || group.color,
                      whiteSpace: 'nowrap',
                    }}>
                      {item.status}
                    </span>
                  )}
                  <ChevronRight size={16} color="#cbd5e1" style={{ flexShrink: 0 }}/>
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
