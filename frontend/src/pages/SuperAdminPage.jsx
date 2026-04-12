import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { Globe, Users, Shield, Plus, X, Pencil, Activity, ChevronRight, ToggleRight, ToggleLeft, Trash2, AlertTriangle, Briefcase, Target, TrendingUp, BarChart2, BarChart3 } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function SuperAdminPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'clients';
  const [stats, setStats] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [activeMetric, setActiveMetric] = useState('volume_won');
  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [blogPosts, setBlogPosts] = useState([]);
  const [blogForm, setBlogForm] = useState({ title: '', slug: '', excerpt: '', content: '', author: 'RefBoost', category: '', tags: '', cover_image_url: '', published: false, meta_title: '', meta_description: '' });
  const [blogEditId, setBlogEditId] = useState(null);
  const [blogSaving, setBlogSaving] = useState(false);
  const [blogShowForm, setBlogShowForm] = useState(false);
  const [blogMsg, setBlogMsg] = useState('');
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [s, t, tl] = await Promise.all([
        api.request('/super-admin/stats'),
        api.request('/super-admin/tenants'),
        api.request('/super-admin/timeline').catch(() => ({ series: [] })),
      ]);
      setStats(s);
      setTenants(t.tenants || []);
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
      setBlogMsg('\u2705 Article sauvegardé !');
      setBlogShowForm(false);
      setBlogEditId(null);
      setBlogForm({ title: '', slug: '', excerpt: '', content: '', author: 'RefBoost', category: '', tags: '', cover_image_url: '', published: false, meta_title: '', meta_description: '' });
      loadBlog();
    } catch(e) {
      setBlogMsg('\u274c ' + (e.message || 'Erreur'));
    }
    setBlogSaving(false);
  };

  const deleteBlogPost = async (id) => {
    if (!confirm('Supprimer cet article ?')) return;
    await api.request('/blog/admin/posts/' + id, { method: 'DELETE' });
    loadBlog();
  };

  const editBlogPost = (p) => {
    setBlogEditId(p.id);
    setBlogForm({ title: p.title, slug: p.slug, excerpt: p.excerpt || '', content: p.content || '', author: p.author || 'RefBoost', category: p.category || '', tags: (p.tags || []).join(', '), cover_image_url: p.cover_image_url || '', published: p.published, meta_title: p.meta_title || '', meta_description: p.meta_description || '' });
    setBlogShowForm(true);
  };

  const loadLogs = async () => {
    try {
      const d = await api.request('/super-admin/audit-logs?limit=100');
      setLogs(d.logs || []);
    } catch {}
  };

  useEffect(() => { load(); loadBlog(); }, []);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]);

  const handleCreate = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    try {
      await api.request('/super-admin/tenants', { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } });
      setShowCreate(false);
      setForm({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' });
      load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditForm({ name: t.name, domain: t.domain || '', primary_color: t.primary_color, secondary_color: t.secondary_color, accent_color: t.accent_color || '#f59e0b', logo_url: t.logo_url || '', is_active: t.is_active });
  };

  const saveEdit = async () => {
    try {
      await api.request('/super-admin/tenants/' + editingId, { method: 'PUT', body: JSON.stringify(editForm), headers: { 'Content-Type': 'application/json' } });
      setEditingId(null);
      load();
    } catch (e) { alert(e.message); }
  };

  const handleDelete = async (id, force = false) => {
    try {
      await api.request('/super-admin/tenants/' + id + (force ? '?force=true' : ''), { method: 'DELETE' });
      setDeleteConfirm(null);
      load();
    } catch (e) {
      if (e.message?.includes('utilisateur')) {
        if (confirm(e.message + '\n\nVoulez-vous forcer la suppression ?')) handleDelete(id, true);
      } else { alert(e.message); }
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><p style={{ color: '#94a3b8' }}>Chargement...</p></div>;

  const TABS = [
    { id: 'stats', label: '\ud83d\udcca Statistiques' },
    { id: 'clients', label: '\ud83c\udfe2 Clients' },
    { id: 'logs', label: '\ud83d\udccb Logs' },
    { id: 'blog', label: '\u270d\ufe0f Blog' },
  ];

  return (
    <div className="fade-in">
      {/* Nav tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => navigate('?tab=' + t.id)}
            style={{ padding: '8px 18px', borderRadius: 10, border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', transition: 'all 0.15s',
              background: tab === t.id ? 'var(--rb-primary, #059669)' : '#f1f5f9',
              color: tab === t.id ? '#fff' : '#475569' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' && (<>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
          <KPI icon={Globe} label="Tenants actifs" value={stats.total_tenants || 0} color="#059669" />
          <KPI icon={Users} label="Utilisateurs totaux" value={stats.total_users || 0} color="#0ea5e9" />
          <KPI icon={Activity} label="Utilisateurs actifs" value={stats.active_users || 0} color="#16a34a" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
          <KPI icon={Briefcase} label="Partenaires totaux" value={stats.total_partners || 0} color="#f59e0b" />
          <KPI icon={Briefcase} label="Partenaires actifs" value={stats.active_partners || 0} color="#16a34a" />
          <KPI icon={Target} label="Leads totaux" value={stats.total_leads || 0} color="#8b5cf6" />
        </div>
        <TimelineChart series={timeline} active={activeMetric} setActive={setActiveMetric} />
      </>)}

      {tab === 'clients' && (<>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <button onClick={() => setShowCreate(!showCreate)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, background: showCreate ? '#f1f5f9' : 'var(--rb-primary, #059669)', color: showCreate ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
            {showCreate ? <X size={14} /> : <Plus size={14} />}
            {showCreate ? 'Annuler' : 'Nouveau tenant'}
          </button>
        </div>
        {showCreate && (
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0', marginBottom: 20 }} className="fade-in">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Nouveau tenant</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Entreprise Client" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Slug *</label><input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="mon-client" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace' }} /></div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Domaine</label><input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="app.client.com" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {[['primary_color', 'Primaire'], ['secondary_color', 'Secondaire'], ['accent_color', 'Accent']].map(([key, label]) => (
                <div key={key}><label style={{ fontSize: 10, fontWeight: 600, color: '#64748b' }}>{label}</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} /><code style={{ fontSize: 11, color: '#94a3b8' }}>{form[key]}</code></div></div>
              ))}
            </div>
            <button onClick={handleCreate} disabled={saving || !form.name || !form.slug} style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Création...' : 'Créer le tenant'}</button>
          </div>
        )}
        {editingId && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setEditingId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
            <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 520, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
              <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: '#0f172a' }}>Modifier le tenant</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Nom</label><input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Domaine</label><input value={editForm.domain || ''} onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
                <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Logo URL</label><input value={editForm.logo_url || ''} onChange={e => setEditForm(f => ({ ...f, logo_url: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
              </div>
              <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
                {[['primary_color', 'Primaire'], ['secondary_color', 'Secondaire'], ['accent_color', 'Accent']].map(([key, label]) => (
                  <div key={key}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{label}</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={editForm[key] || '#059669'} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} /><code style={{ fontSize: 11 }}>{editForm[key]}</code></div></div>
                ))}
              </div>
              <div style={{ padding: 16, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0', marginBottom: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: editForm.primary_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>{(editForm.name || 'T')[0]}</div>
                  <div style={{ flex: 1 }}><div style={{ fontWeight: 700, color: '#0f172a' }}>{editForm.name || 'Tenant'}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{editForm.domain || 'aucun domaine'}</div></div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.primary_color }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.secondary_color }} />
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.accent_color }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Annuler</button>
                <button onClick={saveEdit} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Sauvegarder</button>
              </div>
            </div>
          </div>
        )}
        {deleteConfirm && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setDeleteConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
            <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 440, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: 16, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><AlertTriangle size={28} color="#dc2626" /></div>
              <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Supprimer ce tenant ?</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 4 }}>Vous allez désactiver <strong>{deleteConfirm.name}</strong></p>
              <p style={{ color: '#94a3b8', fontSize: 12, marginBottom: 24 }}>Tous les utilisateurs de ce tenant seront désactivés. Cette action est réversible.</p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Annuler</button>
                <button onClick={() => handleDelete(deleteConfirm.id, true)} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#dc2626,#ef4444)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Supprimer</button>
              </div>
            </div>
          </div>
        )}
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {['Tenant', 'Slug', 'Admin', 'Domaine', 'Users', 'Partenaires', 'Statut', 'Créé le', 'Modèle', ''].map((h, i) => (
                <th key={i} style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{tenants.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '13px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, background: t.primary_color || '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{t.name[0]}</div>
                    <span style={{ fontWeight: 600, color: '#0f172a' }}>{t.name}</span>
                  </div>
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><code style={{ fontSize: 12, color: 'var(--rb-primary, #059669)', background: '#eef2ff', padding: '2px 8px', borderRadius: 4 }}>{t.slug}</code></td>
                <td style={{ padding: '13px 16px', fontSize: 13 }}><div style={{ fontWeight: 600 }}>{t.admin_name || '—'}</div>{t.admin_email && <div style={{ color: '#64748b', fontSize: 12 }}>{t.admin_email}</div>}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>{t.domain || '—'}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.active_user_count}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12 }}> / {t.user_count}</span>
                </td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600 }}>{t.partner_count}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}><span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: t.is_active ? '#f0fdf4' : '#fef2f2', color: t.is_active ? '#16a34a' : '#dc2626' }}>{t.is_active ? 'Actif' : 'Inactif'}</span></td>
                <td style={{ padding: '13px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{fmtDate(t.created_at)}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center', fontSize: 12, color: '#475569' }}>{t.revenue_model || '—'}</td>
                <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                    <button onClick={() => startEdit(t)} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Pencil size={14} color="#64748b" /></button>
                    <button onClick={() => setDeleteConfirm(t)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {tenants.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucun tenant</div>}
        </div>
      </>)}

      {tab === 'logs' && (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr style={{ background: '#f8fafc' }}>
              {['Date', 'Utilisateur', 'Tenant', 'Action', 'Ressource', 'IP'].map((h, i) => (
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
          {logs.length === 0 && <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Aucun log</div>}
        </div>
      )}

      {tab === 'blog' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Articles de blog</h2>
            <button onClick={() => { setBlogShowForm(!blogShowForm); setBlogEditId(null); setBlogForm({ title: '', slug: '', excerpt: '', content: '', author: 'RefBoost', category: '', tags: '', cover_image_url: '', published: false, meta_title: '', meta_description: '' }); }}
              style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 700 }}>
              {blogShowForm ? 'Annuler' : '+ Nouvel article'}
            </button>
          </div>
          {blogMsg && <div style={{ padding: '12px 16px', borderRadius: 10, background: blogMsg.startsWith('\u2705') ? '#f0fdf4' : '#fef2f2', color: blogMsg.startsWith('\u2705') ? '#16a34a' : '#dc2626', marginBottom: 20, fontSize: 14 }}>{blogMsg}</div>}
          {blogShowForm && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, marginBottom: 28, border: '1px solid #e2e8f0' }}>
              <h3 style={{ margin: '0 0 20px', color: '#0f172a', fontSize: 16 }}>{blogEditId ? "Modifier l'article" : 'Nouvel article'}</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                {[
                  ['Titre *', 'title', 'text', "Titre accrocheur de l'article"],
                  ['Slug URL', 'slug', 'text', 'mon-article-seo'],
                  ['Catégorie', 'category', 'text', 'Stratégie, Guide, Tendances…'],
                  ['Tags (séparés par virgule)', 'tags', 'text', 'partenariat, affiliation, B2B'],
                  ['Auteur', 'author', 'text', 'RefBoost'],
                  ['Image de couverture (URL)', 'cover_image_url', 'text', 'https://...'],
                  ['Meta Title (SEO, 70 car max)', 'meta_title', 'text', 'Titre SEO optimisé'],
                  ['Meta Description (SEO, 160 car)', 'meta_description', 'text', 'Description pour Google…'],
                ].map(([label, key, type, ph]) => (
                  <div key={key}>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>{label}</label>
                    <input type={type} value={blogForm[key]} onChange={e => setBlogForm(f => ({ ...f, [key]: e.target.value }))} placeholder={ph}
                      style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Extrait (résumé court)</label>
                <textarea value={blogForm.excerpt} onChange={e => setBlogForm(f => ({ ...f, excerpt: e.target.value }))} placeholder="Résumé accrocheur de l'article (2-3 phrases)..." rows={3}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 14, boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ marginTop: 16 }}>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 1 }}>Contenu HTML *</label>
                <textarea value={blogForm.content} onChange={e => setBlogForm(f => ({ ...f, content: e.target.value }))} placeholder="<h2>Introduction</h2><p>Votre contenu HTML ici...</p>" rows={12}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '1px solid #e2e8f0', color: '#0f172a', fontSize: 13, fontFamily: 'monospace', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#334155', fontSize: 14 }}>
                  <input type="checkbox" checked={blogForm.published} onChange={e => setBlogForm(f => ({ ...f, published: e.target.checked }))} style={{ width: 18, height: 18 }} />
                  Publier immédiatement
                </label>
              </div>
              <div style={{ marginTop: 24, display: 'flex', gap: 12 }}>
                <button onClick={saveBlogPost} disabled={blogSaving || !blogForm.title || !blogForm.content}
                  style={{ padding: '12px 28px', borderRadius: 10, background: (!blogForm.title || !blogForm.content) ? '#e2e8f0' : 'var(--rb-primary, #059669)', color: (!blogForm.title || !blogForm.content) ? '#94a3b8' : '#fff', border: 'none', cursor: (!blogForm.title || !blogForm.content) ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 15 }}>
                  {blogSaving ? 'Sauvegarde…' : blogEditId ? '\u2705 Mettre à jour' : "\ud83d\ude80 publier l'article"}
                </button>
                <button onClick={() => { setBlogShowForm(false); setBlogEditId(null); }}
                  style={{ padding: '12px 20px', borderRadius: 10, background: '#f1f5f9', color: '#64748b', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Annuler
                </button>
              </div>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {blogPosts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>
                <p style={{ fontSize: 16 }}>Aucun article. Créez votre premier article ci-dessus !</p>
              </div>
            ) : blogPosts.map(p => (
              <div key={p.id} style={{ background: '#fff', borderRadius: 12, padding: '16px 20px', border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, background: p.published ? '#f0fdf4' : '#f8fafc', color: p.published ? '#16a34a' : '#94a3b8', fontWeight: 700 }}>
                      {p.published ? '● Publié' : '○ Brouillon'}
                    </span>
                    {p.category && <span style={{ fontSize: 11, color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{p.category}</span>}
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{p.reading_time_minutes} min</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{p.title}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>/blog/{p.slug} · {p.published_at ? new Date(p.published_at).toLocaleDateString('fr-FR') : 'Non publié'}</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <a href={'/blog/' + p.slug} target="_blank" rel="noopener" style={{ padding: '7px 14px', borderRadius: 8, background: '#f1f5f9', color: '#475569', textDecoration: 'none', fontSize: 13 }}>\ud83d\udc41\ufe0f Voir</a>
                  <button onClick={() => editBlogPost(p)} style={{ padding: '7px 14px', borderRadius: 8, background: '#fff3cd', color: '#856404', border: 'none', cursor: 'pointer', fontSize: 13 }}>\u270f\ufe0f Modifier</button>
                  <button onClick={() => deleteBlogPost(p.id)} style={{ padding: '7px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', border: 'none', cursor: 'pointer', fontSize: 13 }}>\ud83d\uddd1\ufe0f</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineChart({ series, active, setActive }) {
  if (!series || series.length === 0) {
    return (
      <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 40, textAlign: 'center', marginBottom: 28, color: '#94a3b8' }}>
        Aucune donnée temporelle disponible pour le moment.
      </div>
    );
  }
  const metrics = [
    { key: 'tenants_cumul', label: 'Clients', color: '#059669', format: (v) => v },
    { key: 'partners_cumul', label: 'Partenaires', color: '#0ea5e9', format: (v) => v },
    { key: 'leads_cumul', label: 'Leads', color: '#f59e0b', format: (v) => v },
    { key: 'volume_won', label: 'Volume gagné', color: '#16a34a', format: (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(v || 0) },
  ];
  const activeM = metrics.find((m) => m.key === active) || metrics[0];
  const values = series.map((p) => Number(p[active]) || 0);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const W = 800, H = 150, padL = 48, padR = 12, padT = 16, padB = 24;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const x = (i) => padL + (series.length === 1 ? innerW / 2 : (i / (series.length - 1)) * innerW);
  const y = (v) => padT + innerH - ((v - min) / (max - min || 1)) * innerH;
  const path = series.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(values[i])}`).join(' ');
  const areaPath = `${path} L ${x(series.length - 1)} ${padT + innerH} L ${x(0)} ${padT + innerH} Z`;
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((r) => min + (max - min) * r);
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '14px 18px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Évolution sur 12 mois</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Suivez la croissance de votre plateforme</p>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {metrics.map((m) => (
            <button key={m.key} onClick={() => setActive(m.key)}
              style={{ background: active === m.key ? m.color : '#f1f5f9', color: active === m.key ? '#fff' : '#475569', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s' }}>
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 18px 16px' }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
          <defs>
            <linearGradient id={`grad-${active}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={activeM.color} stopOpacity="0.25" />
              <stop offset="100%" stopColor={activeM.color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padL - 8} y={y(v) + 4} fontSize="10" fill="#94a3b8" textAnchor="end">
                {active === 'volume_won' ? new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) : Math.round(v)}
              </text>
            </g>
          ))}
          {series.map((p, i) => (
            i % Math.max(1, Math.ceil(series.length / 6)) === 0 && (
              <text key={i} x={x(i)} y={H - 10} fontSize="10" fill="#94a3b8" textAnchor="middle">{p.label}</text>
            )
          ))}
          <path d={areaPath} fill={`url(#grad-${active})`} />
          <path d={path} fill="none" stroke={activeM.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          {series.map((p, i) => (
            <g key={i}>
              <circle cx={x(i)} cy={y(values[i])} r="3" fill="#fff" stroke={activeM.color} strokeWidth="2" />
              <title>{`${p.label}: ${activeM.format(values[i])}`}</title>
            </g>
          ))}
        </svg>
        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11, color: '#64748b' }}>
          <span>Dernier mois</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: activeM.color }}>{activeM.format(values[values.length - 1] || 0)}</span>
        </div>
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
