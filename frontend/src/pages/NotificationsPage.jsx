import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Bell, Newspaper, Tag, Package, Calendar,
  FileText, DollarSign, UserPlus, Trophy,
} from 'lucide-react';
import api from '../lib/api';

// Visual palette for the icon tiles — each event type gets a distinct
// soft background + saturated icon colour so items are recognisable at
// a glance even without reading the title.
const PALETTE = {
  new_referral:     { bg: '#E6F1FB', fg: '#378ADD', Icon: FileText },
  referral_update:  { bg: '#E1F5EE', fg: '#0f766e', Icon: FileText },
  deal_won:         { bg: '#EAF3DE', fg: '#16a34a', Icon: Trophy },
  commission:       { bg: '#EAF3DE', fg: '#16a34a', Icon: DollarSign },
  new_application:  { bg: '#FAEEDA', fg: '#b45309', Icon: UserPlus },
  news:             { bg: '#EEEDFE', fg: '#7c3aed', Icon: Newspaper },
  promo:            { bg: '#FAEEDA', fg: '#b45309', Icon: Tag },
  kit:              { bg: '#E0F7FA', fg: '#0891b2', Icon: Package },
  event:            { bg: '#FEF3C7', fg: '#d97706', Icon: Calendar },
};

// Filter pills — each one maps to a set of notification types that
// should appear when selected. The order matches the user's spec.
const FILTERS = [
  { id: 'all',          key: 'all',          types: null },
  { id: 'news',         key: 'news',         types: ['news', 'promo', 'kit', 'event'] },
  { id: 'referrals',    key: 'referrals',    types: ['referral_update', 'new_referral', 'deal_won'] },
  { id: 'payments',     key: 'payments',     types: ['commission'] },
  { id: 'applications', key: 'applications', types: ['new_application'] },
];

// Date buckets. `startOf` is a ms-epoch threshold; anything >= threshold
// belongs to the bucket. Computed fresh per render so "today" is accurate
// without remounting when the clock rolls over.
function dateGroups(now = Date.now()) {
  const d = new Date(now);
  const startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const startOfYesterday = startOfToday - 86400000;
  const startOfWeek = startOfToday - 6 * 86400000; // 7-day rolling window.
  return [
    { id: 'today',     from: startOfToday },
    { id: 'yesterday', from: startOfYesterday },
    { id: 'this_week', from: startOfWeek },
    { id: 'earlier',   from: -Infinity },
  ];
}

function timeAgo(iso, t) {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diffMs / 60000);
  if (m < 1) return t('notifications.just_now');
  if (m < 60) return t('notifications.ago_m', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('notifications.ago_h', { n: h });
  const d = Math.floor(h / 24);
  return t('notifications.ago_d', { n: d });
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    api.getNotifications()
      .then(d => setItems(d.notifications || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  const markAll = async () => {
    try { await api.markAllNotificationsRead(); } catch {}
    setItems(list => list.map(n => ({ ...n, is_read: true })));
  };

  const onClickItem = async (n) => {
    if (!n.is_read) {
      try { await api.markNotificationRead(n.id); } catch {}
      setItems(list => list.map(x => x.id === n.id ? { ...x, is_read: true } : x));
    }
    if (n.link) navigate(n.link);
  };

  // Apply the active filter, then bucket into date groups.
  const filtered = useMemo(() => {
    const f = FILTERS.find(x => x.id === filter);
    if (!f || !f.types) return items;
    return items.filter(n => f.types.includes(n.type));
  }, [items, filter]);

  const grouped = useMemo(() => {
    const groups = dateGroups();
    const byGroup = Object.fromEntries(groups.map(g => [g.id, []]));
    for (const n of filtered) {
      const ts = n.created_at ? new Date(n.created_at).getTime() : 0;
      for (const g of groups) {
        if (ts >= g.from) { byGroup[g.id].push(n); break; }
      }
    }
    return groups.map(g => ({ ...g, items: byGroup[g.id] })).filter(g => g.items.length);
  }, [filtered]);

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>
          {t('notifications.title')}
        </h1>
        <button
          onClick={markAll}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#378ADD', fontWeight: 600, fontSize: 13,
          }}
        >
          {t('notifications.mark_all_read')}
        </button>
      </div>

      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 22, flexWrap: 'wrap' }}>
        {FILTERS.map(f => {
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                padding: '5px 14px', borderRadius: 20, border: 'none',
                background: isActive ? '#0f172a' : '#f1f5f9',
                color: isActive ? '#fff' : '#64748b',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'background .15s',
              }}
            >{t('notifications.filter_' + f.key)}</button>
          );
        })}
      </div>

      {/* Body */}
      {loading ? (
        <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>…</div>
      ) : grouped.length === 0 ? (
        <EmptyState t={t} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {grouped.map(g => (
            <section key={g.id}>
              <div style={{
                fontSize: 11, fontWeight: 600, color: '#94a3b8',
                textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8,
              }}>{t('notifications.group_' + g.id)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {g.items.map(n => <Row key={n.id} n={n} t={t} onClick={() => onClickItem(n)} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ n, t, onClick }) {
  const p = PALETTE[n.type] || PALETTE.news;
  const Icon = p.Icon;
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', cursor: 'pointer',
        background: n.is_read ? '#fff' : '#F0F7FE',
        border: '1px solid #e2e8f0',
        borderLeft: n.is_read ? '1px solid #e2e8f0' : '3px solid #378ADD',
        borderRadius: 12, padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        opacity: n.is_read ? 0.72 : 1,
        transition: 'opacity .15s, background .15s',
      }}
    >
      <div style={{
        width: 32, height: 32, flexShrink: 0,
        borderRadius: 8, background: p.bg, color: p.fg,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={15} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontWeight: 700, fontSize: 13, color: '#0f172a',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{n.title}</div>
        {n.message && (
          <div style={{
            fontSize: 12, color: '#64748b', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{n.message}</div>
        )}
      </div>
      <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>
        {timeAgo(n.created_at, t)}
      </div>
    </button>
  );
}

function EmptyState({ t }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14,
      padding: '56px 24px', textAlign: 'center',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%', background: '#f1f5f9',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        color: '#94a3b8', marginBottom: 14,
      }}>
        <Bell size={22} />
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#0f172a' }}>
        {t('notifications.no_notifications')}
      </div>
    </div>
  );
}
