import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { showConfirm, showToast } from '../components/Dialogs.jsx';
import { Globe, Users, Shield, Plus, X, Pencil, Activity, ChevronRight, ChevronDown, Calendar, ToggleRight, ToggleLeft, Trash2, AlertTriangle, Briefcase, Target, TrendingUp, BarChart2, BarChart3 } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import ConfirmModal from '../components/ConfirmModal.jsx';
import Pagination from '../components/Pagination.jsx';

// ─── Period helpers (Stats tab) ──────────────────────────────────────
// One function maps a preset key to a concrete {from, to} window so
// every other piece of code (initial state, picker, refetch) can stay
// dumb about the math. preset='all' carries from=null so the backend
// treats it as "depuis le début".
function periodFromPreset(preset) {
  const now = new Date();
  const toIso = now.toISOString().slice(0, 10);
  if (preset === 'all') return { preset, from: null, to: toIso };
  const out = new Date(now);
  switch (preset) {
    case '7d':  out.setDate(out.getDate() - 7); break;
    case '30d': out.setDate(out.getDate() - 30); break;
    case '3m':  out.setMonth(out.getMonth() - 3); break;
    case '12m': out.setMonth(out.getMonth() - 12); break;
    default:    out.setDate(out.getDate() - 30); preset = '30d';
  }
  return { preset, from: out.toISOString().slice(0, 10), to: toIso };
}

// ─── Number formatting helpers (Stats tab) ───────────────────────────
const fmtEUR = (v) => `${Math.round(v || 0).toLocaleString('fr-FR')} €`;
const fmtEURCompact = (v) => {
  const n = Number(v) || 0;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace('.', ',')} k€`;
  return `${Math.round(n)} €`;
};
const fmtDeltaAbs = (v) => {
  if (v == null) return null;
  const sign = v >= 0 ? '+' : '−';
  return `${sign}${Math.abs(v).toLocaleString('fr-FR')}`;
};
const fmtDeltaEUR = (v) => {
  if (v == null) return null;
  const sign = v >= 0 ? '+' : '−';
  return `${sign}${Math.abs(Math.round(v)).toLocaleString('fr-FR')} €`;
};
const fmtDeltaPct = (v) => {
  if (v == null) return null;
  const sign = v >= 0 ? '+' : '−';
  return `${sign}${Math.abs(v)} %`;
};

export default function SuperAdminPage() {
  const { t } = useTranslation();
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString(t('admin.fmt_locale'), { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString(t('admin.fmt_locale'), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'clients';
  const [stats, setStats] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [activeMetric, setActiveMetric] = useState('tenants_cumul');
  // Single source of period for the Stats tab. preset='30d' is the
  // default; from/to are ISO dates 'YYYY-MM-DD'. preset='all' means
  // "depuis le début" (from=null on the wire). preset='custom' carries
  // a user-picked range.
  const [period, setPeriod] = useState(() => periodFromPreset('30d'));
  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);
  // Audit logs pagination — 25 rows/page. Numbered pages (not "load more")
  // because the dataset grows but doesn't churn: revisiting a known time
  // window deserves a stable URL contract, plus the back-end already
  // returns `total` so paging is essentially free.
  const AUDIT_LOGS_PAGE_SIZE = 25;
  const [auditLogsPage, setAuditLogsPage] = useState(1);
  const [auditLogsTotal, setAuditLogsTotal] = useState(0);
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deleteBlogId, setDeleteBlogId] = useState(null);
  const [forceDeleteTenant, setForceDeleteTenant] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [blogPosts, setBlogPosts] = useState([]);
  const [blogForm, setBlogForm] = useState({ title: '', slug: '', excerpt: '', content: '', author: 'RefBoost', category: '', tags: '', cover_image_url: '', published: false, meta_title: '', meta_description: '' });
  const [blogEditId, setBlogEditId] = useState(null);
  const [blogSaving, setBlogSaving] = useState(false);
  const [blogShowForm, setBlogShowForm] = useState(false);
  const [blogMsg, setBlogMsg] = useState('');
  // Blog auto-translate: kicked off by the "Traduire les articles"
  // button in the header, polled at 10s while running. running ===
  // true the moment we POST and stays that way until /status reports
  // finishedAt. translateStatus shadows the backend payload.
  const [blogTranslating, setBlogTranslating] = useState(false);
  const [blogTranslateStatus, setBlogTranslateStatus] = useState(null);
  const navigate = useNavigate();

  // Build ?from=…&to=… for /stats and /timeline. 'all' is the sentinel
  // for "depuis le début" (no lower bound) — sent literally so the
  // backend can drop the WHERE clause without ambiguity.
  const buildPeriodQuery = (p) => {
    const params = new URLSearchParams();
    params.set('from', p.from || 'all');
    if (p.to) params.set('to', p.to);
    return '?' + params.toString();
  };

  const load = async () => {
    try {
      const q = buildPeriodQuery(period);
      const [s, tn, tl] = await Promise.all([
        api.request('/super-admin/stats' + q),
        api.request('/super-admin/tenants'),
        api.request('/super-admin/timeline' + q).catch(() => ({ series: [] })),
      ]);
      setStats(s);
      setTenants(tn.tenants || []);
      setTimeline((tl && tl.series) || []);
    } catch (err) {
      if (err.message?.includes('403')) navigate('/dashboard');
      console.error(err);
    }
    setLoading(false);
  };

  const loadBlog = async () => {
    try {
      const d = await api.request('/blog/admin/posts');
      setBlogPosts(d.posts || []);
    } catch(e) {}
  };

  // Wakes up the running-job poller — useful when the user
  // refreshes the page while a translation is mid-flight, AND on
  // every blog tab mount so the badge can show "running" state
  // immediately.
  const refreshBlogTranslateStatus = async () => {
    try {
      const s = await api.getBlogTranslateStatus();
      setBlogTranslateStatus(s);
      if (s?.running && !s.running.finishedAt) {
        setBlogTranslating(true);
      } else {
        setBlogTranslating(false);
      }
      return s;
    } catch (e) {
      return null;
    }
  };

  const handleTranslateBlog = async () => {
    if (blogTranslating) return;
    setBlogTranslating(true);
    try {
      await api.translateBlog('blog');
      showToast(t('admin.translate_started', 'Traduction lancée en arrière-plan'), 'success', 4000);
      // Kick the poller. We stop polling either when the backend
      // reports finishedAt OR when the page tab unmounts (no
      // explicit cleanup — the closure naturally collapses on
      // navigation because the next load resets state).
      const tick = async () => {
        const s = await refreshBlogTranslateStatus();
        if (s?.running && !s.running.finishedAt) {
          setTimeout(tick, 10000);
          return;
        }
        // Run finished — refetch the list so badges update.
        loadBlog();
        const missing = s?.blog_progress?.totalMissing ?? null;
        if (missing === 0) {
          showToast(t('admin.translate_done', 'Tous les articles sont traduits ✓'), 'success', 5000);
        } else if (missing != null) {
          showToast(t('admin.translate_partial', { n: missing, defaultValue: '{{n}} traductions restantes — relancez si nécessaire' }), 'info', 6000);
        }
      };
      setTimeout(tick, 10000);
    } catch (err) {
      const msg = err?.data?.error === 'anthropic_key_missing'
        ? 'ANTHROPIC_API_KEY manquant côté serveur'
        : err?.data?.error === 'already_running'
          ? t('admin.translate_already_running', 'Une traduction est déjà en cours')
          : err.message || 'Erreur';
      showToast(msg, 'error', 5000);
      // Re-sync state from the server in case a concurrent run
      // already started — keeps the spinner in step with reality.
      refreshBlogTranslateStatus();
    }
  };

  const saveBlogPost = async () => {
    setBlogSaving(true);
    setBlogMsg('');
    try {
      const payload = { ...blogForm, tags: blogForm.tags ? blogForm.tags.split(',').map(t => t.trim()).filter(Boolean) : [] };
      if (blogEditId) {
        await api.request('/blog/admin/posts/' + blogEditId, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await api.request('/blog/admin/posts', { method: 'POST', body: JSON.stringify(payload) });
      }
      setBlogMsg('\u2705 ' + t('admin.article_saved'));
      setBlogShowForm(false);
      setBlogEditId(null);
      setBlogForm({ title: '', slug: '', excerpt: '', content: '', author: 'RefBoost', category: '', tags: '', cover_image_url: '', published: false, meta_title: '', meta_description: '' });
      loadBlog();
    } catch(e) {
      setBlogMsg('\u274c ' + (e.message || t('admin.error')));
    }
    setBlogSaving(false);
  };

  const deleteBlogPost = (id) => setDeleteBlogId(id);
  const confirmDeleteBlogPost = async () => {
    if (!deleteBlogId) return;
    try {
      await api.request('/blog/admin/posts/' + deleteBlogId, { method: 'DELETE' });
      loadBlog();
    } finally {
      setDeleteBlogId(null);
    }
  };

  const editBlogPost = (p) => {
    setBlogEditId(p.id);
    setBlogForm({ title: p.title, slug: p.slug, excerpt: p.excerpt || '', content: p.content || '', author: p.author || 'RefBoost', category: p.category || '', tags: (p.tags || []).join(', '), cover_image_url: p.cover_image_url || '', published: p.published, meta_title: p.meta_title || '', meta_description: p.meta_description || '' });
    setBlogShowForm(true);
  };

  const loadLogs = async (page = 1) => {
    try {
      const offset = (page - 1) * AUDIT_LOGS_PAGE_SIZE;
      const d = await api.request(`/super-admin/audit-logs?limit=${AUDIT_LOGS_PAGE_SIZE}&offset=${offset}`);
      setLogs(d.logs || []);
      setAuditLogsTotal(d.total || 0);
    } catch {}
  };

  useEffect(() => { load(); loadBlog(); refreshBlogTranslateStatus(); }, []);
  // Reset to page 1 every time the tab is entered, then load that page.
  // Subsequent paging happens via onPageChange below.
  useEffect(() => { if (tab === 'logs') { setAuditLogsPage(1); loadLogs(1); } }, [tab]);
  // Refetch /stats + /timeline whenever the period selection changes.
  // loadBlog / tenants don't depend on period so they stay in the
  // initial mount-only useEffect above.
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [period.from, period.to]);

  const handleCreate = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    try {
      await api.request('/super-admin/tenants', { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } });
      setShowCreate(false);
      setForm({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' });
      load();
    } catch (e) { showToast.error(e.message); }
    setSaving(false);
  };

  const startEdit = (tn) => {
    setEditingId(tn.id);
    setEditForm({ name: tn.name, domain: tn.domain || '', primary_color: tn.primary_color, secondary_color: tn.secondary_color, accent_color: tn.accent_color || '#f59e0b', logo_url: tn.logo_url || '', is_active: tn.is_active });
  };

  const saveEdit = async () => {
    try {
      await api.request('/super-admin/tenants/' + editingId, { method: 'PUT', body: JSON.stringify(editForm), headers: { 'Content-Type': 'application/json' } });
      setEditingId(null);
      load();
    } catch (e) { showToast.error(e.message); }
  };

  const handleDelete = async (id, force = false) => {
    try {
      await api.request('/super-admin/tenants/' + id + (force ? '?force=true' : ''), { method: 'DELETE' });
      setDeleteConfirm(null);
      load();
    } catch (e) {
      if (e.message?.includes('utilisateur')) {
        setForceDeleteTenant({ id, reason: e.message });
      } else { showToast.error(e.message); }
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><p style={{ color: '#94a3b8' }}>{t('admin.loading')}</p></div>;

  return (
    <div className="fade-in">
      <ConfirmModal
        isOpen={!!deleteBlogId}
        title={t('admin.delete_article_confirm')}
        message={t('admin.delete_article_confirm')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={confirmDeleteBlogPost}
        onCancel={() => setDeleteBlogId(null)}
      />
      <ConfirmModal
        isOpen={!!forceDeleteTenant}
        title={t('admin.tenant_users_in_use') || 'Force delete'}
        message={forceDeleteTenant ? `${forceDeleteTenant.reason}\n\n${t('admin.tenant_users_in_use') || ''}` : ''}
        confirmLabel={t('common.delete')}
        cancelLabel={t('partners.cancel') || 'Annuler'}
        variant="danger"
        onConfirm={() => {
          const pending = forceDeleteTenant;
          setForceDeleteTenant(null);
          if (pending) handleDelete(pending.id, true);
        }}
        onCancel={() => setForceDeleteTenant(null)}
      />

      {tab === 'stats' && (<>
        {/* Header: title + period picker right-aligned. The picker
            controls every metric below (except the snapshot section
            'Clients par plan' which is always current state). */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 24, gap: 16, flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: '#0f172a', letterSpacing: -0.4 }}>{t('super_admin.stats.title', 'Statistiques')}</h2>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>{t('super_admin.stats.subtitle', "Vue d'ensemble multi-tenants")}</p>
          </div>
          <PeriodPicker period={period} setPeriod={setPeriod} t={t} />
        </div>

        {/* Section Business — 4 KPI cards driven by the period */}
        <SectionLabel>{t('super_admin.stats.section.business', 'Business')}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          <PeriodKPI
            label={t('super_admin.stats.kpi.mrr', 'MRR')}
            value={fmtEUR(stats.period?.mrr_end ?? stats.mrr_total ?? 0)}
            delta={stats.period?.mrr_end_delta_abs}
            deltaFormat={(v) => fmtDeltaEUR(v)}
            t={t}
          />
          <PeriodKPI
            label={t('super_admin.stats.kpi.tenants_active', 'Tenants actifs')}
            value={stats.period?.tenants_active_end ?? stats.total_tenants ?? 0}
            delta={stats.period?.tenants_active_end_delta_abs}
            deltaFormat={(v) => fmtDeltaAbs(v)}
            t={t}
          />
          <PeriodKPI
            label={t('super_admin.stats.kpi.new_clients', 'Nouveaux clients')}
            value={stats.period?.new_tenants ?? 0}
            delta={stats.period?.new_tenants_delta_pct}
            deltaFormat={(v) => fmtDeltaPct(v)}
            t={t}
          />
          <PeriodKPI
            label={t('super_admin.stats.kpi.conversions', 'Conversions')}
            value={stats.period?.conversions ?? 0}
            hint={t('super_admin.stats.kpi.conversions_total', { n: stats.conversions_total ?? 0, defaultValue: '{{n}} au total' })}
            t={t}
          />
        </div>

        {/* Section Activité — 4 KPI cards driven by the period */}
        <SectionLabel>{t('super_admin.stats.section.activity', 'Activité')}</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 28 }}>
          <PeriodKPI
            label={t('super_admin.stats.kpi.leads_created', 'Leads créés')}
            value={stats.period?.new_leads ?? 0}
            delta={stats.period?.new_leads_delta_pct}
            deltaFormat={(v) => fmtDeltaPct(v)}
            t={t}
          />
          <PeriodKPI
            label={t('super_admin.stats.kpi.volume_won', 'Volume gagné')}
            value={fmtEURCompact(stats.period?.volume_won ?? 0)}
            delta={stats.period?.volume_won_delta_pct}
            deltaFormat={(v) => fmtDeltaPct(v)}
            t={t}
          />
          <PeriodKPI
            label={t('super_admin.stats.kpi.partners', 'Partenaires')}
            value={stats.total_partners ?? 0}
            delta={stats.period?.new_partners_delta_abs}
            deltaFormat={(v) => fmtDeltaAbs(v)}
            t={t}
          />
          <PeriodKPI
            label={t('super_admin.stats.kpi.users', 'Utilisateurs')}
            value={stats.total_users ?? 0}
            delta={stats.period?.new_users_delta_abs}
            deltaFormat={(v) => fmtDeltaAbs(v)}
            t={t}
          />
        </div>

        {/* Section Clients par plan — snapshot, independent of period */}
        <ClientsByPlanCard stats={stats} t={t} />

        {/* Section Évolution — chart driven by the period */}
        <TimelineChart series={timeline} active={activeMetric} setActive={setActiveMetric} t={t} loading={loading} />
      </>)}

      {tab === 'clients' && (<>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setShowCreate(!showCreate)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, background: showCreate ? '#f1f5f9' : 'var(--rb-primary, #059669)', color: showCreate ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {showCreate ? <X size={14} /> : <Plus size={14} />}
            {showCreate ? t('admin.cancel') : t('admin.new_tenant')}
          </button>
        </div>
        {showCreate && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginBottom: 20 }} className="fade-in">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>{t('admin.new_tenant')}</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('admin.name')} *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Acme" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('admin.th_slug')} *</label><input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="my-client" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace' }} /></div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('admin.domain')}</label><input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="app.client.com" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {[['primary_color', t('admin.color_primary')], ['secondary_color', t('admin.color_secondary')], ['accent_color', t('admin.color_accent')]].map(([key, label]) => (
                <div key={key}><label style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{label}</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} /><code style={{ fontSize: 11, color: '#94a3b8' }}>{form[key]}</code></div></div>
              ))}
            </div>
            <button onClick={handleCreate} disabled={saving || !form.name || !form.slug} style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? t('admin.creating') : t('admin.create_tenant')}</button>
          </div>
        )}
        {editingId && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setEditingId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
            <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 520, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: '#0f172a' }}>{t('admin.edit_tenant')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{t('admin.name')}</label><input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{t('admin.domain')}</label><input value={editForm.domain || ''} onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{t('admin.logo_url')}</label><input value={editForm.logo_url || ''} onChange={e => setEditForm(f => ({ ...f, logo_url: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                {[['primary_color', t('admin.color_primary')], ['secondary_color', t('admin.color_secondary')], ['accent_color', t('admin.color_accent')]].map(([key, label]) => (
                  <div key={key}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{label}</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={editForm[key] || '#059669'} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} /><code style={{ fontSize: 11 }}>{editForm[key]}</code></div></div>
                ))}
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: editForm.primary_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>{(editForm.name || 'T')[0]}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: '#0f172a' }}>{editForm.name || t('admin.tenant_placeholder')}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{editForm.domain || t('admin.no_domain')}</div></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.primary_color }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.secondary_color }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.accent_color }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('admin.cancel')}</button>
                <button onClick={saveEdit} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('admin.save')}</button>
              </div>
            </div>
          </div>
        )}
        {deleteConfirm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setDeleteConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
            <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 440, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={28} color="#dc2626" /></div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{t('admin.delete_tenant_title')}</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 4 }}>{t('admin.delete_tenant_confirm')} <strong>{deleteConfirm.name}</strong></p>
              <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 24 }}>{t('admin.delete_tenant_note')}</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('admin.cancel')}</button>
                <button onClick={() => handleDelete(deleteConfirm.id, true)} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('admin.delete')}</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {[t('admin.th_tenant'), t('admin.th_slug'), t('admin.th_admin'), t('admin.th_domain'), t('admin.th_users'), t('admin.th_partners'), t('admin.th_status'), t('admin.th_plan', 'Plan'), t('admin.th_created_at'), t('admin.th_model'), ''].map((h, i) => (
                <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{tenants.map(tn => (
              <tr key={tn.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: tn.primary_color || '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{tn.name[0]}</div>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{tn.name}</span>
                  </div>
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><code style={{ fontSize: 12, color: 'var(--rb-primary, #059669)', background: '#eef2ff', padding: '2px 8px', borderRadius: 4 }}>{tn.slug}</code></td>
                <td style={{ padding: '13px 16px', fontSize: 13 }}><div style={{ fontWeight: 600 }}>{tn.admin_name || '—'}</div>{tn.admin_email && <div style={{ color: '#64748b', fontSize: 12 }}>{tn.admin_email}</div>}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>{tn.domain || '—'}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{tn.active_user_count}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}> / {tn.user_count}</span>
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600 }}>{tn.partner_count}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: tn.is_active ? '#f0fdf4' : '#fef2f2', color: tn.is_active ? '#16a34a' : '#dc2626' }}>{tn.is_active ? t('admin.status_active') : t('admin.status_inactive')}</span></td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  {(() => {
                    const p = tn.plan || 'starter';
                    const c = p === 'business' ? '#1D9E75' : p === 'pro' ? '#378ADD' : '#888780';
                    return <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: `${c}1A`, color: c, textTransform: 'capitalize' }}>{p}</span>;
                  })()}
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{fmtDate(tn.created_at)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 12, color: '#475569' }}>{tn.revenue_model || '—'}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button onClick={() => startEdit(tn)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Pencil size={14} color="#64748b" /></button>
                    <button onClick={() => setDeleteConfirm(tn)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {tenants.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('admin.no_tenants')}</div>}
        </div>
      </>)}

      {tab === 'logs' && (<>
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {[t('admin.th_date'), t('admin.th_user'), t('admin.th_tenant_short'), t('admin.th_action'), t('admin.th_resource'), t('admin.th_ip')].map((h, i) => (
                <th key={i} style={{ padding: '12px 14px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{logs.map(l => (
              <tr key={l.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 12, whiteSpace: 'nowrap' }}>{fmtDateTime(l.created_at)}</td>
                <td style={{ padding: '10px 14px', fontWeight: 500, color: '#0f172a' }}>{l.user_name || l.user_email || '—'}</td>
                <td style={{ padding: '10px 14px', color: 'var(--rb-primary, #059669)', fontSize: 12 }}>{l.tenant_name || '—'}</td>
                <td style={{ padding: '10px 14px' }}><span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: l.action.includes('fail') || l.action.includes('block') ? '#fef2f2' : '#eef2ff', color: l.action.includes('fail') || l.action.includes('block') ? '#dc2626' : '#059669' }}>{l.action}</span></td>
                <td style={{ padding: '10px 14px', color: '#64748b', fontSize: 12 }}>{l.resource_type || '—'}</td>
                <td style={{ padding: '10px 14px', color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{l.ip_address || '—'}</td>
              </tr>
            ))}</tbody>
          </table>
          {logs.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>{t('admin.no_logs')}</div>}
        </div>
        {auditLogsTotal > AUDIT_LOGS_PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <Pagination
              currentPage={auditLogsPage}
              totalPages={Math.ceil(auditLogsTotal / AUDIT_LOGS_PAGE_SIZE)}
              onPageChange={(p) => { setAuditLogsPage(p); loadLogs(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            />
          </div>
        )}
      </>)}

      {tab === 'blog' && (
        <div>
          {/* Globe spinner keyframe — scoped tag, idempotent on
              re-renders. */}
          <style>{`@keyframes rb-spin { to { transform: rotate(360deg); } } .rb-spin { animation: rb-spin 1.6s linear infinite; }`}</style>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{t('admin.blog_articles')}</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                <button
                  onClick={handleTranslateBlog}
                  disabled={blogTranslating}
                  title={t('admin.translate_tooltip', 'Lance la traduction des articles dans 6 langues. Idempotent : ne retraduit pas ce qui est déjà fait.')}
                  style={{
                    padding: '10px 16px', borderRadius: 10,
                    background: blogTranslating ? '#93c5fd' : '#2563eb',
                    color: '#fff', border: 'none',
                    cursor: blogTranslating ? 'wait' : 'pointer',
                    fontWeight: 700, fontSize: 13,
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    opacity: blogTranslating ? 0.85 : 1,
                  }}
                >
                  <Globe size={14} className={blogTranslating ? 'rb-spin' : ''} />
                  {blogTranslating
                    ? t('admin.translate_running', 'Traduction en cours…')
                    : t('admin.translate_button', 'Traduire les articles')}
                </button>
                {blogTranslating && blogTranslateStatus?.running && !blogTranslateStatus.running.finishedAt && (
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                    {(blogTranslateStatus.running.progress?.done || 0)} {t('admin.translate_done_count', 'traduits')}
                    {blogTranslateStatus.blog_progress?.totalMissing != null
                      ? ` · ${blogTranslateStatus.blog_progress.totalMissing} ${t('admin.translate_remaining', 'restants')}`
                      : ''}
                  </div>
                )}
              </div>
              <button onClick={() => { setBlogShowForm(!blogShowForm); setBlogEditId(null); setBlogForm({ title: '', slug: '', excerpt: '', content: '', author: 'RefBoost', category: '', tags: '', cover_image_url: '', published: false, meta_title: '', meta_description: '' }); }}
                style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
                {blogShowForm ? t('admin.cancel') : t('admin.new_article')}
              </button>
            </div>
          </div>
          {blogMsg && <div style={{ padding: '12px 16px', borderRadius: 10, background: blogMsg.startsWith('\u2705') ? '#f0fdf4' : '#fef2f2', color: blogMsg.startsWith('\u2705') ? '#16a34a' : '#dc2626', marginBottom: 20, fontSize: 14 }}>{blogMsg}</div>}
          {blogShowForm && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, marginBottom: 28, border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: 16 }}>{blogEditId ? t('admin.edit_article') : t('admin.new_article')}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  [t('admin.blog_title'), 'title', 'text', t('admin.blog_title_ph')],
                  [t('admin.blog_slug'), 'slug', 'text', t('admin.blog_slug_ph')],
                  [t('admin.blog_category'), 'category', 'text', t('admin.blog_category_ph')],
                  [t('admin.blog_tags'), 'tags', 'text', t('admin.blog_tags_ph')],
                  [t('admin.blog_author'), 'author', 'text', 'RefBoost'],
                  [t('admin.blog_cover'), 'cover_image_url', 'text', t('admin.blog_cover_ph')],
                  [t('admin.blog_meta_title'), 'meta_title', 'text', t('admin.blog_meta_title_ph')],
                  [t('admin.blog_meta_desc'), 'meta_description', 'text', t('admin.blog_meta_desc_ph')],
                ].map(([label, key, type, ph]) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
                    <input type={type} value={blogForm[key]} onChange={e => setBlogForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('admin.blog_excerpt')}</label>
                <textarea value={blogForm.excerpt} onChange={e => setBlogForm(f => ({ ...f, excerpt: e.target.value }))} placeholder={t('admin.blog_excerpt_ph')} rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{t('admin.blog_content')}</label>
                <textarea value={blogForm.content} onChange={e => setBlogForm(f => ({ ...f, content: e.target.value }))} placeholder={t('admin.blog_content_ph')} rows={12}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155', fontSize: 14 }}>
                  <input type="checkbox" checked={blogForm.published} onChange={e => setBlogForm(f => ({ ...f, published: e.target.checked }))} style={{ width: 18, height: 18 }} />
                  {t('admin.blog_publish_now')}
                </label>
              </div>
              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <button onClick={saveBlogPost} disabled={blogSaving || !blogForm.title || !blogForm.content}
                  style={{ padding: '12px 28px', borderRadius: 10, background: (!blogForm.title || !blogForm.content) ? '#e2e8f0' : 'var(--rb-primary, #059669)', color: (!blogForm.title || !blogForm.content) ? '#94a3b8' : '#fff', border: 'none', cursor: (!blogForm.title || !blogForm.content) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15 }}>
                  {blogSaving ? t('admin.blog_saving') : blogEditId ? '\u2705 ' + t('admin.blog_update') : "\ud83d\ude80 " + t('admin.blog_publish_article')}
                </button>
                <button onClick={() => { setBlogShowForm(false); setBlogEditId(null); }}
                  style={{ padding: '12px 20px', borderRadius: 10, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  {t('admin.cancel')}
                </button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {blogPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 16 }}>{t('admin.blog_no_articles')}</p>
              </div>
            ) : blogPosts.map(p => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: p.published ? '#f0fdf4' : '#f8fafc', color: p.published ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                      {p.published ? '● ' + t('admin.blog_published') : '○ ' + t('admin.blog_draft')}
                    </span>
                    {p.category && <span style={{ fontSize: 11, color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{p.category}</span>}
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.reading_time_minutes} {t('admin.blog_min')}</span>
                    {/* Translation badge — 7/7 = green, partial =
                        amber, FR-only = grey. Range 1..7 because
                        French is the source and always counts. */}
                    {(() => {
                      const n = Number(p.translated_count) || 1;
                      const palette = n >= 7
                        ? { bg: '#f0fdf4', fg: '#15803d', dot: '#22c55e' }
                        : n >= 2
                          ? { bg: '#fffbeb', fg: '#a16207', dot: '#f59e0b' }
                          : { bg: '#f1f5f9', fg: '#64748b', dot: '#94a3b8' };
                      return (
                        <span title={t('admin.translate_badge_tooltip', 'Langues couvertes par cet article (FR comprise)')}
                          style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: palette.bg, color: palette.fg, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: palette.dot }} />
                          {n}/7 {t('admin.translate_badge_unit', 'langues')}
                        </span>
                      );
                    })()}
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{p.title}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>/blog/{p.slug} · {p.published_at ? new Date(p.published_at).toLocaleDateString(t('admin.fmt_locale')) : t('admin.blog_not_published')}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={'/blog/' + p.slug} target="_blank" rel="noopener" style={{ padding: '7px 14px', borderRadius: 8, background: '#f1f5f9', color: '#475569', textDecoration: 'none', fontSize: 13 }}> {t('admin.blog_view')}</a>
                  <button onClick={() => editBlogPost(p)} style={{ padding: '7px 14px', borderRadius: 8, background: '#fff3cd', color: '#856404', border: 'none', cursor: 'pointer', fontSize: 13 }}> {t('admin.blog_edit')}</button>
                  <button onClick={() => deleteBlogPost(p.id)} style={{ padding: '7px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 13 }}></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineChart({ series, active, setActive, t, loading = false }) {
  const metrics = [
    { key: 'tenants_cumul',  label: t('admin.timeline_metric_clients'),  color: '#059669', isCurrency: false },
    { key: 'partners_cumul', label: t('admin.timeline_metric_partners'), color: '#0ea5e9', isCurrency: false },
    { key: 'leads_cumul',    label: t('admin.timeline_metric_leads'),    color: '#f59e0b', isCurrency: false },
    { key: 'volume_won',     label: t('admin.timeline_metric_volume'),   color: '#16a34a', isCurrency: true  },
    { key: 'mrr',            label: t('super_admin.stats.evolution.metric.mrr', 'MRR'), color: '#6366f1', isCurrency: true },
  ];
  const activeM = metrics.find((m) => m.key === active) || metrics[0];

  // Card wrapper shared by all three states so the page layout never
  // shifts when data arrives or vanishes.
  const cardStyle = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 20, overflow: 'hidden' };

  // Loading skeleton — distinct from "no data". Renders the same
  // outer card shape + a pulsing block where the chart will land, so
  // the visible height is stable across loading → loaded.
  if (loading) {
    return (
      <div style={cardStyle}>
        <style>{`@keyframes rb-tl-pulse{0%,100%{opacity:.55}50%{opacity:1}}.rb-tl-skel{background:#f1f5f9;border-radius:8;animation:rb-tl-pulse 1.4s ease-in-out infinite}`}</style>
        <div style={{ padding: '14px 18px 0' }}>
          <div className="rb-tl-skel" style={{ width: 160, height: 16, marginBottom: 6 }} />
          <div className="rb-tl-skel" style={{ width: 220, height: 12, marginBottom: 16 }} />
        </div>
        <div style={{ padding: '0 24px 24px' }}>
          <div className="rb-tl-skel" style={{ width: '100%', height: 220 }} />
        </div>
      </div>
    );
  }

  if (!series || series.length === 0) {
    return (
      <div style={{ ...cardStyle, padding: 40, textAlign: 'center', color: '#94a3b8' }}>
        {t('admin.timeline_no_data')}
      </div>
    );
  }

  // Y axis formatter — compact € for currency metrics, integer for
  // counts. Mirrors DashboardPage's `v >= 1000 ? Xk : v` pattern.
  const yTickFormatter = (v) => {
    if (activeM.isCurrency) {
      return v >= 1000 ? `${Math.round(v / 1000)} k €` : `${v} €`;
    }
    return v;
  };

  // Tooltip value formatter — full localised currency for €, integer
  // string for counts. The label (X-axis value) is rendered by
  // recharts above the value list via labelStyle.
  const tooltipFormatter = (v) => {
    if (activeM.isCurrency) {
      return new Intl.NumberFormat(t('admin.fmt_locale'), { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0);
    }
    return String(v ?? 0);
  };

  return (
    <div style={cardStyle}>
      <div style={{ padding: '14px 18px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t('admin.timeline_title')}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>{t('admin.timeline_subtitle')}</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {metrics.map((m) => {
            const isActive = active === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setActive(m.key)}
                style={{
                  padding: '6px 12px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  background: isActive ? `${m.color}15` : 'transparent',
                  color: isActive ? m.color : '#64748b',
                  border: `1px solid ${isActive ? m.color : '#e2e8f0'}`,
                  transition: 'all .15s',
                }}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: '4px 24px 24px' }}>
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={series} margin={{ top: 10, right: 8, left: -8, bottom: 0 }}>
            <defs>
              <linearGradient id={`tl-grad-${active}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={activeM.color} stopOpacity={0.25} />
                <stop offset="100%" stopColor={activeM.color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#94a3b8' }}
              axisLine={false}
              tickLine={false}
              width={48}
              tickFormatter={yTickFormatter}
            />
            <Tooltip
              contentStyle={{ borderRadius: 10, border: '1px solid #e5e7eb', fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}
              labelStyle={{ color: '#64748b', fontSize: 11, marginBottom: 2 }}
              formatter={(v) => [tooltipFormatter(v), activeM.label]}
              cursor={{ stroke: '#e2e8f0', strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey={activeM.key}
              stroke={activeM.color}
              strokeWidth={2}
              fill={`url(#tl-grad-${active})`}
              dot={false}
              activeDot={{ r: 4, stroke: activeM.color, strokeWidth: 2, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 18, fontWeight: 700, color, letterSpacing: -1 }}>{value}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={color} /></div>
      </div>
    </div>
  );
}

// ─── Stats tab — section header label ────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 10 }}>
      {children}
    </div>
  );
}

// ─── Stats tab — KPI card with optional delta or hint ────────────────
// `delta` is the raw signed number returned by the backend (null when
// the period is "depuis le début"). `deltaFormat` turns it into a
// "+12 %" / "−3" / "+29 €" string. `hint` is a fixed phrase shown when
// there's no period-to-period comparison to make (e.g. "X au total"
// for the cumulative conversions counter).
function PeriodKPI({ label, value, delta, deltaFormat, hint, t }) {
  let hintText = hint || null;
  let hintColor = '#94a3b8';
  if (delta != null && deltaFormat) {
    const arrow = delta > 0 ? '↑ ' : delta < 0 ? '↓ ' : '';
    hintText = `${arrow}${deltaFormat(delta)} ${t('super_admin.stats.delta.vs_previous', 'vs période précédente')}`;
    hintColor = delta > 0 ? '#059669' : delta < 0 ? '#dc2626' : '#94a3b8';
  }
  return (
    <div style={{ padding: 16, borderRadius: 12, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ color: '#64748b', fontSize: 12, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 500, color: '#0f172a', letterSpacing: -0.4 }}>{value}</div>
      {hintText && <div style={{ fontSize: 11, color: hintColor, marginTop: 4 }}>{hintText}</div>}
    </div>
  );
}

// ─── Stats tab — date period dropdown ────────────────────────────────
// Trigger button shows the active range; clicking opens a dropdown
// with 5 presets + a custom range. Custom mode reveals two date inputs
// and an "Appliquer" button. Click-outside + Escape close the dropdown
// — same pattern as the tenant switcher in Layout.
function PeriodPicker({ period, setPeriod, t }) {
  const [open, setOpen] = useState(false);
  const [customMode, setCustomMode] = useState(false);
  const [customFrom, setCustomFrom] = useState(period.from || '');
  const [customTo, setCustomTo] = useState(period.to || '');
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setCustomMode(false); } };
    const onKey = (e) => { if (e.key === 'Escape') { setOpen(false); setCustomMode(false); } };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onClick); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const presets = [
    { key: '7d',  label: t('super_admin.stats.period.7d',  '7 derniers jours') },
    { key: '30d', label: t('super_admin.stats.period.30d', '30 derniers jours') },
    { key: '3m',  label: t('super_admin.stats.period.3m',  '3 derniers mois') },
    { key: '12m', label: t('super_admin.stats.period.12m', '12 derniers mois') },
    { key: 'all', label: t('super_admin.stats.period.all', 'Depuis le début') },
  ];

  const pick = (key) => {
    setPeriod(periodFromPreset(key));
    setOpen(false);
    setCustomMode(false);
  };

  const applyCustom = () => {
    if (!customFrom || !customTo) return;
    setPeriod({ preset: 'custom', from: customFrom, to: customTo });
    setOpen(false);
    setCustomMode(false);
  };

  // Button label: the matching preset's localised name, or a formatted
  // range for 'custom'. Compact range format (12 avr. – 11 mai 2026).
  const label = (() => {
    const p = presets.find(x => x.key === period.preset);
    if (p) return p.label;
    if (period.preset === 'custom' && period.from && period.to) {
      const f = new Date(period.from);
      const tt = new Date(period.to);
      const optDay = { day: 'numeric', month: 'short' };
      const optFull = { day: 'numeric', month: 'short', year: 'numeric' };
      return `${f.toLocaleDateString('fr-FR', optDay)} – ${tt.toLocaleDateString('fr-FR', optFull)}`;
    }
    return t('super_admin.stats.period.30d', '30 derniers jours');
  })();

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px',
          background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10,
          cursor: 'pointer', fontSize: 13, fontWeight: 500, color: '#0f172a',
        }}
      >
        <Calendar size={14} color="#64748b" />
        <span>{label}</span>
        <ChevronDown size={14} color="#94a3b8" style={{ transition: 'transform .15s', transform: open ? 'rotate(180deg)' : 'rotate(0)' }} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
          minWidth: 240, background: '#fff', border: '1px solid #e2e8f0',
          borderRadius: 12, padding: 6,
          boxShadow: '0 12px 32px rgba(15,23,42,0.12)',
        }}>
          {!customMode ? (
            <>
              {presets.map(p => (
                <button
                  key={p.key}
                  onClick={() => pick(p.key)}
                  style={{
                    display: 'block', width: '100%', textAlign: 'left',
                    padding: '8px 12px', border: 'none',
                    background: period.preset === p.key ? '#f1f5f9' : 'transparent',
                    borderRadius: 8, fontSize: 13, fontWeight: 500,
                    color: '#0f172a', cursor: 'pointer',
                  }}
                >
                  {p.label}
                </button>
              ))}
              <div style={{ height: 1, background: '#f1f5f9', margin: '6px 0' }} />
              <button
                onClick={() => setCustomMode(true)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', border: 'none', background: 'transparent',
                  borderRadius: 8, fontSize: 13, fontWeight: 500,
                  color: '#0f172a', cursor: 'pointer',
                }}
              >
                {t('super_admin.stats.period.custom', 'Personnalisé…')}
              </button>
            </>
          ) : (
            <div style={{ padding: 8 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  type="date"
                  value={customFrom}
                  onChange={e => setCustomFrom(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={e => setCustomTo(e.target.value)}
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13 }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={() => setCustomMode(false)}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: 12 }}
                >
                  {t('admin.cancel', 'Annuler')}
                </button>
                <button
                  onClick={applyCustom}
                  disabled={!customFrom || !customTo}
                  style={{ flex: 1, padding: 8, borderRadius: 8, border: 'none', background: '#059669', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600, opacity: (!customFrom || !customTo) ? 0.5 : 1 }}
                >
                  {t('super_admin.stats.period.custom_apply', 'Appliquer')}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Stats tab — Clients par plan card (snapshot, no period dep) ─────
// Bar chart on the left + 3 mini-metrics on the right, separated by a
// vertical border. Bar widths are proportional to total tenant count
// so a tenant with 0 paid clients still renders cleanly (no NaN).
function ClientsByPlanCard({ stats, t }) {
  const plans = stats.clients_by_plan || { starter: 0, pro: 0, business: 0 };
  const total = (plans.starter || 0) + (plans.pro || 0) + (plans.business || 0);
  const paid = (plans.pro || 0) + (plans.business || 0);
  const mrr = stats.mrr_total || 0;
  const partnersPerClient = stats.partners_per_client || 0;
  const rows = [
    { key: 'starter',  label: t('super_admin.stats.plan.starter',  'Starter (gratuit)'), color: '#888780', count: plans.starter || 0, eur: 0 },
    { key: 'pro',      label: t('super_admin.stats.plan.pro',      'Pro (29 €/mois)'),    color: '#378ADD', count: plans.pro || 0,     eur: (plans.pro || 0) * 29 },
    { key: 'business', label: t('super_admin.stats.plan.business', 'Business (79 €/mois)'), color: '#1D9E75', count: plans.business || 0, eur: (plans.business || 0) * 79 },
  ];
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 20, marginBottom: 24 }}>
      <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{t('super_admin.stats.clients_by_plan.title', 'Clients par plan')}</h3>
      <p style={{ margin: '4px 0 16px', fontSize: 12, color: '#64748b' }}>
        {t('super_admin.stats.clients_by_plan.subtitle', { n: total, defaultValue: 'Répartition actuelle des {{n}} tenants' })}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 200px', gap: 24 }}>
        {/* Bar chart */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rows.map(r => {
            const pct = total > 0 ? (r.count / total) * 100 : 0;
            return (
              <div key={r.key}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: r.color }} />
                    <span style={{ fontSize: 13, color: '#0f172a', fontWeight: 500 }}>{r.label}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#64748b' }}>
                    {r.count} · {fmtEUR(r.eur)}
                  </div>
                </div>
                <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: r.color, borderRadius: 4 }} />
                </div>
              </div>
            );
          })}
        </div>
        {/* Right column — 3 mini-metrics */}
        <div style={{ borderLeft: '1px solid #e2e8f0', paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
              {t('super_admin.stats.clients_by_plan.mrr_total', 'MRR total')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#059669', letterSpacing: -0.3 }}>{fmtEUR(mrr)}/mois</div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
              {t('super_admin.stats.clients_by_plan.paid_rate', 'Taux payant')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', letterSpacing: -0.3 }}>
              {total > 0 ? Math.round((paid / total) * 100) : 0} % · {paid}/{total}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 4 }}>
              {t('super_admin.stats.clients_by_plan.partners_per_client', 'Partenaires / client')}
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: '#0f172a', letterSpacing: -0.3 }}>
              {partnersPerClient.toFixed(1)} en moy
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
