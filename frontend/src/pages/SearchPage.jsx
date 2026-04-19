import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Search, FileText, Users, DollarSign, Newspaper, ChevronRight } from 'lucide-react';
import api from '../lib/api';

const CATEGORIES = [
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

  const groups = useMemo(() => {
    if (!results) return [];
    return CATEGORIES
      .map(cat => ({ ...cat, items: results.results?.[cat.key] || [] }))
      .filter(g => g.items.length > 0);
  }, [results]);

  const total = results?.total || 0;
  const showEmpty = results && total === 0 && !loading && debounced.trim().length >= 2;

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
