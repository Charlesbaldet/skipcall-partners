import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import api from '../lib/api';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', bg: '#f8fafc', border: '#e2e8f0', danger: '#dc2626' };

const STATUS_COLORS = {
  success: { fg: '#047857', bg: '#d1fae5' },
  failed: { fg: '#b91c1c', bg: '#fee2e2' },
  pending: { fg: '#b45309', bg: '#fef3c7' },
};

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString();
}

function CopyButton({ value, t }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      style={{ padding: '4px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, color: copied ? C.p : C.s }}
    >{copied ? t('webhooks.copied') : t('webhooks.copy')}</button>
  );
}

// Renders the webhooks UI (list + add form + per-endpoint delivery log)
// as an inline section inside SettingsPage → Intégrations. Self-contained:
// loads its own data via api.request on mount.
export default function WebhooksSection() {
  const { t } = useTranslation();
  const [endpoints, setEndpoints] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ url: '', events: [] });
  const [creating, setCreating] = useState(false);
  const [newSecret, setNewSecret] = useState(null);

  const [expandedId, setExpandedId] = useState(null);
  const [deliveriesById, setDeliveriesById] = useState({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [e, ev] = await Promise.all([
        api.request('/webhooks/endpoints'),
        api.request('/webhooks/event-types'),
      ]);
      setEndpoints(e.endpoints || []);
      setEvents(ev.events || []);
      setError(null);
    } catch (err) {
      setError(err.message || 'error');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const toggleEvent = (ev) => {
    setForm(f => f.events.includes(ev)
      ? { ...f, events: f.events.filter(e => e !== ev) }
      : { ...f, events: [...f.events, ev] });
  };

  const createEndpoint = async (e) => {
    e.preventDefault();
    setCreating(true);
    setNewSecret(null);
    try {
      const res = await api.request('/webhooks/endpoints', {
        method: 'POST',
        body: JSON.stringify({ url: form.url, events: form.events }),
      });
      setNewSecret({ id: res.endpoint.id, secret: res.endpoint.secret, url: res.endpoint.url });
      setForm({ url: '', events: [] });
      await loadAll();
    } catch (err) {
      alert(err.message || 'error');
    } finally { setCreating(false); }
  };

  const toggleActive = async (ep) => {
    try {
      await api.request(`/webhooks/endpoints/${ep.id}`, {
        method: 'PUT',
        body: JSON.stringify({ is_active: !ep.is_active }),
      });
      await loadAll();
    } catch (err) { alert(err.message); }
  };

  const removeEndpoint = async (ep) => {
    if (!confirm(t('webhooks.confirm_delete'))) return;
    try {
      await api.request(`/webhooks/endpoints/${ep.id}`, { method: 'DELETE' });
      await loadAll();
    } catch (err) { alert(err.message); }
  };

  const loadDeliveries = async (id) => {
    try {
      const res = await api.request(`/webhooks/endpoints/${id}/deliveries`);
      setDeliveriesById(d => ({ ...d, [id]: res.deliveries || [] }));
    } catch (err) { alert(err.message); }
  };

  const toggleExpanded = async (id) => {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    if (!deliveriesById[id]) await loadDeliveries(id);
  };

  const retryDelivery = async (endpointId, deliveryId) => {
    try {
      await api.request(`/webhooks/endpoints/${endpointId}/deliveries/${deliveryId}/retry`, { method: 'POST' });
      await loadDeliveries(endpointId);
    } catch (err) { alert(err.message); }
  };

  return (
    <div style={{ marginTop: 32, paddingTop: 24, borderTop: `1px solid ${C.border}` }}>
      <h4 style={{ fontSize: 15, fontWeight: 700, color: C.s, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Zap size={16} color="#6366f1" /> {t('webhooks.title')}
      </h4>
      <p style={{ margin: '0 0 16px', fontSize: 13, color: C.m, lineHeight: 1.55, maxWidth: 720 }}>{t('webhooks.subtitle')}</p>

      {/* Secret just-created callout */}
      {newSecret && (
        <div style={{ padding: 16, borderRadius: 12, background: '#ecfdf5', border: `1px solid ${C.pl}`, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: C.s, marginBottom: 6, fontSize: 13 }}>{t('webhooks.secret_created')}</div>
          <div style={{ fontSize: 12, color: C.m, marginBottom: 10 }}>{t('webhooks.secret_shown_once')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#fff', padding: 8, borderRadius: 8, border: `1px solid ${C.border}`, fontFamily: 'monospace', fontSize: 12 }}>
            <span style={{ wordBreak: 'break-all', flex: 1, color: C.s }}>{newSecret.secret}</span>
            <CopyButton value={newSecret.secret} t={t} />
          </div>
          <button onClick={() => setNewSecret(null)} style={{ marginTop: 10, padding: '5px 12px', borderRadius: 6, border: 'none', background: C.s, color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>{t('webhooks.close')}</button>
        </div>
      )}

      {/* Endpoints list */}
      {loading ? (
        <div style={{ color: C.m, fontSize: 13 }}>{t('common.loading')}</div>
      ) : error ? (
        <div style={{ color: C.danger, fontSize: 13 }}>{error}</div>
      ) : !endpoints.length ? (
        <div style={{ padding: 20, textAlign: 'center', background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, color: C.m, fontSize: 13, marginBottom: 16 }}>{t('webhooks.empty')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {endpoints.map(ep => (
            <div key={ep.id} style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'monospace', fontSize: 13, color: C.s, wordBreak: 'break-all' }}>{ep.url}</div>
                  <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {ep.events.map(ev => (
                      <span key={ev} style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 7px', borderRadius: 10, background: C.bg, color: C.s, border: `1px solid ${C.border}` }}>{ev}</span>
                    ))}
                  </div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: C.m, cursor: 'pointer' }}>
                  <input type="checkbox" checked={ep.is_active} onChange={() => toggleActive(ep)} />
                  {ep.is_active ? t('webhooks.active') : t('webhooks.inactive')}
                </label>
                <button onClick={() => toggleExpanded(ep.id)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.border}`, background: '#fff', cursor: 'pointer', fontSize: 12, color: C.s }}>
                  {expandedId === ep.id ? t('webhooks.hide_log') : t('webhooks.view_log')}
                </button>
                <button onClick={() => removeEndpoint(ep)} style={{ padding: '5px 10px', borderRadius: 6, border: `1px solid ${C.danger}`, background: '#fff', cursor: 'pointer', fontSize: 12, color: C.danger }}>
                  {t('webhooks.delete')}
                </button>
              </div>

              {expandedId === ep.id && (
                <div style={{ borderTop: `1px solid ${C.border}`, background: C.bg, padding: 14 }}>
                  <div style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: C.s, textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('webhooks.recent_deliveries')}</div>
                  {!deliveriesById[ep.id] ? (
                    <div style={{ color: C.m, fontSize: 12 }}>{t('common.loading')}</div>
                  ) : !deliveriesById[ep.id].length ? (
                    <div style={{ color: C.m, fontSize: 12 }}>{t('webhooks.no_deliveries')}</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                        <thead>
                          <tr style={{ textAlign: 'left', color: C.m, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                            <th style={{ padding: '6px 8px' }}>{t('webhooks.col_event')}</th>
                            <th style={{ padding: '6px 8px' }}>{t('webhooks.col_when')}</th>
                            <th style={{ padding: '6px 8px' }}>{t('webhooks.col_status')}</th>
                            <th style={{ padding: '6px 8px' }}>{t('webhooks.col_http')}</th>
                            <th style={{ padding: '6px 8px' }}>{t('webhooks.col_attempts')}</th>
                            <th style={{ padding: '6px 8px' }}>{t('webhooks.col_actions')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {deliveriesById[ep.id].map(d => {
                            const stKey = d.success ? 'success' : (d.response_status == null || d.response_status === 0 ? 'pending' : 'failed');
                            const stColors = STATUS_COLORS[stKey];
                            return (
                              <tr key={d.id} style={{ borderTop: `1px solid ${C.border}` }}>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: C.s }}>{d.event_type}</td>
                                <td style={{ padding: '6px 8px', color: C.m }}>{fmtDate(d.created_at)}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 700, background: stColors.bg, color: stColors.fg }}>
                                    {d.success ? t('webhooks.st_success') : (stKey === 'pending' ? t('webhooks.st_pending') : t('webhooks.st_failed'))}
                                  </span>
                                </td>
                                <td style={{ padding: '6px 8px', fontFamily: 'monospace', color: C.s }}>{d.response_status ?? '—'}</td>
                                <td style={{ padding: '6px 8px', color: C.s }}>{d.attempts}</td>
                                <td style={{ padding: '6px 8px' }}>
                                  {!d.success && (
                                    <button onClick={() => retryDelivery(ep.id, d.id)} style={{ padding: '3px 8px', borderRadius: 6, border: `1px solid ${C.p}`, background: '#fff', cursor: 'pointer', fontSize: 11, color: C.p, fontWeight: 600 }}>
                                      {t('webhooks.retry')}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add form */}
      <div style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.s, marginBottom: 12 }}>{t('webhooks.add_title')}</div>
        <form onSubmit={createEndpoint}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.s, marginBottom: 4 }}>{t('webhooks.url_label')}</label>
          <input
            type="url"
            required
            placeholder="https://your-endpoint.example.com/webhooks/refboost"
            value={form.url}
            onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
            style={{ width: '100%', padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' }}
          />
          <div style={{ fontSize: 11, color: C.m, marginTop: 4 }}>{t('webhooks.url_hint')}</div>

          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.s, marginBottom: 8 }}>{t('webhooks.events_label')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 6 }}>
              {events.map(ev => (
                <label key={ev} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 6, border: `1px solid ${C.border}`, cursor: 'pointer', background: form.events.includes(ev) ? '#ecfdf5' : '#fff' }}>
                  <input type="checkbox" checked={form.events.includes(ev)} onChange={() => toggleEvent(ev)} />
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: C.s }}>{ev}</span>
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={creating || !form.url || !form.events.length}
            style={{ marginTop: 14, padding: '9px 18px', borderRadius: 8, border: 'none', background: `linear-gradient(135deg,${C.p},${C.pl})`, color: '#fff', fontWeight: 700, fontSize: 13, cursor: creating ? 'wait' : 'pointer', opacity: (!form.url || !form.events.length) ? 0.5 : 1, fontFamily: 'inherit' }}
          >{creating ? t('webhooks.creating') : t('webhooks.add_button')}</button>
        </form>
      </div>

      {/* Signature verification doc */}
      <details style={{ background: '#fff', borderRadius: 12, border: `1px solid ${C.border}`, padding: '10px 14px' }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: C.s }}>{t('webhooks.doc_title')}</summary>
        <p style={{ margin: '10px 0 12px', fontSize: 12, color: C.m, lineHeight: 1.6 }}>{t('webhooks.doc_intro')}</p>
        <pre style={{ margin: 0, padding: 14, background: C.s, color: '#e2e8f0', borderRadius: 8, fontSize: 11, overflowX: 'auto', lineHeight: 1.6 }}>{`// Node.js verification
const crypto = require('crypto');

function verifyRefBoostSignature(rawBody, headerValue, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');
  const a = Buffer.from(headerValue);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}`}</pre>
      </details>
    </div>
  );
}
