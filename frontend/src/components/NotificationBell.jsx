import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Bell, Newspaper, Tag, Package, Calendar, FileText, DollarSign, UserPlus, Trophy } from 'lucide-react';
import api from '../lib/api';

const POLL_MS = 30000;

// Group notification types into the filter tabs shown at the top of
// the dropdown.
const TAB_BUCKETS = {
  all: null,
  news: new Set(['news', 'promo', 'kit', 'event']),
  referrals: new Set(['referral_update', 'new_referral', 'deal_won']),
  commissions: new Set(['commission']),
  applications: new Set(['new_application']),
};
const TABS = ['all', 'news', 'referrals', 'commissions', 'applications'];

function iconFor(type) {
  if (type === 'promo') return Tag;
  if (type === 'kit') return Package;
  if (type === 'event') return Calendar;
  if (type === 'referral_update' || type === 'new_referral') return FileText;
  if (type === 'commission') return DollarSign;
  if (type === 'new_application') return UserPlus;
  if (type === 'deal_won') return Trophy;
  return Newspaper;
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

export default function NotificationBell() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef(null);

  const fetchUnread = async () => {
    try {
      const data = await api.getUnreadNotificationCount();
      setUnread(data.count || 0);
    } catch { /* ignore — guest or offline */ }
  };

  useEffect(() => {
    fetchUnread();
    pollRef.current = setInterval(fetchUnread, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, []);

  const openPanel = async () => {
    setOpen(o => !o);
    if (open) return;
    setLoading(true);
    try {
      const data = await api.getNotifications();
      setItems(data.notifications || []);
    } catch { setItems([]); }
    setLoading(false);
  };

  const markAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnread(0);
    } catch {}
  };

  const clickItem = async (n) => {
    if (!n.is_read) {
      try {
        await api.markNotificationRead(n.id);
        setItems(prev => prev.map(x => x.id === n.id ? { ...x, is_read: true } : x));
        setUnread(c => Math.max(0, c - 1));
      } catch {}
    }
    setOpen(false);
    if (n.link) navigate(n.link);
  };

  return (
    <div style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={openPanel}
        aria-label={t('notifications.title')}
        style={{
          background: 'transparent', border: 'none', cursor: 'pointer',
          padding: 8, borderRadius: 10, display: 'flex', alignItems: 'center',
          position: 'relative', color: '#475569',
        }}
      >
        <Bell size={20} />
        {unread > 0 && (
          <span style={{
            position: 'absolute', top: 4, right: 4,
            minWidth: 16, height: 16, borderRadius: 8,
            background: '#dc2626', color: '#fff',
            fontSize: 10, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '0 4px', lineHeight: 1,
          }}>{unread > 99 ? '99+' : unread}</span>
        )}
      </button>

      {open && (
        <>
          <div onClick={() => setOpen(false)}
            style={{ position: 'fixed', inset: 0, zIndex: 998 }} />
          <div style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0,
            width: 360, maxWidth: 'calc(100vw - 32px)',
            background: '#fff', border: '1px solid #e2e8f0',
            borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.12)',
            zIndex: 999, overflow: 'hidden',
          }}>
            <div style={{
              padding: '12px 16px', borderBottom: '1px solid #f1f5f9',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>
                {t('notifications.title')}
              </div>
              {unread > 0 && (
                <button onClick={markAll} style={{
                  background: 'none', border: 'none', color: '#059669',
                  fontWeight: 600, fontSize: 12, cursor: 'pointer', padding: 0,
                }}>{t('notifications.mark_all_read')}</button>
              )}
            </div>

            {/* Filter tabs */}
            <div style={{
              display: 'flex', gap: 4, padding: '8px 10px',
              borderBottom: '1px solid #f1f5f9', overflowX: 'auto',
            }}>
              {TABS.map(tab => {
                const isActive = activeTab === tab;
                const bucket = TAB_BUCKETS[tab];
                const count = tab === 'all'
                  ? items.filter(n => !n.is_read).length
                  : items.filter(n => !n.is_read && bucket && bucket.has(n.type)).length;
                return (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    style={{
                      padding: '4px 10px', borderRadius: 8, border: 'none',
                      background: isActive ? '#059669' : '#f1f5f9',
                      color: isActive ? '#fff' : '#475569',
                      fontSize: 11, fontWeight: 600, cursor: 'pointer',
                      whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {t('notifications.tab_' + tab)}
                    {count > 0 && (
                      <span style={{
                        fontSize: 10, padding: '1px 5px', borderRadius: 8,
                        background: isActive ? 'rgba(255,255,255,0.3)' : '#ef4444',
                        color: '#fff', fontWeight: 700,
                      }}>{count}</span>
                    )}
                  </button>
                );
              })}
            </div>

            <div style={{ maxHeight: 400, overflowY: 'auto' }}>
              {(() => {
                const bucket = TAB_BUCKETS[activeTab];
                const visible = bucket ? items.filter(n => bucket.has(n.type)) : items;
                if (loading) return (
                  <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>…</div>
                );
                if (visible.length === 0) return (
                  <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                    {t('notifications.no_notifications')}
                  </div>
                );
                return visible.map(n => {
                  const Icon = iconFor(n.type);
                  return (
                    <button
                      key={n.id}
                      onClick={() => clickItem(n)}
                      style={{
                        width: '100%', textAlign: 'left',
                        padding: '12px 16px',
                        background: n.is_read ? 'transparent' : '#f0fdf4',
                        border: 'none', borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer', display: 'flex', gap: 12,
                        alignItems: 'flex-start',
                      }}
                    >
                      <div style={{
                        width: 32, height: 32, flexShrink: 0,
                        background: n.is_read ? '#f1f5f9' : '#dcfce7',
                        color: n.is_read ? '#64748b' : '#059669',
                        borderRadius: 8, display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Icon size={16} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: n.is_read ? 500 : 700,
                          fontSize: 13, color: '#0f172a',
                          overflow: 'hidden', textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}>{n.title}</div>
                        {n.message && (
                          <div style={{
                            color: '#64748b', fontSize: 12, marginTop: 2,
                            overflow: 'hidden', textOverflow: 'ellipsis',
                            display: '-webkit-box', WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                          }}>{n.message}</div>
                        )}
                        <div style={{ color: '#94a3b8', fontSize: 11, marginTop: 4 }}>
                          {timeAgo(n.created_at, t)}
                        </div>
                      </div>
                    </button>
                  );
                });
              })()}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
