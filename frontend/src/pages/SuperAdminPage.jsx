import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Globe, Users, Shield, Plus, X, Pencil, Activity, ChevronRight, ToggleRight, ToggleLeft, Trash2, AlertTriangle, Briefcase, Target, TrendingUp, BarChart3 } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function SuperAdminPage() {
  const [tab, setTab] = useState('tenants');
  const [stats, setStats] = useState({});
  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [s, t] = await Promise.all([
        api.request('/super-admin/stats'),
        api.request('/super-admin/tenants'),
      ]);
      setStats(s); setTenants(t.tenants || []);
    } catch (err) {
      if (err.message?.includes('403')) navigate('/dashboard');
      console.error(err);
    }
    setLoading(false);
  };

  const loadLogs = async () => {
    try { const d = await api.request('/super-admin/audit-logs?limit=100'); setLogs(d.logs || []); } catch {}
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { if (tab === 'logs') loadLogs(); }, [tab]);

  const handleCreate = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    try {
      await api.request('/super-admin/tenants', { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } });
      setShowCreate(false); setForm({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' }); load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const startEdit = (t) => { setEditingId(t.id); setEditForm({ name: t.name, domain: t.domain || '', primary_color: t.primary_color, secondary_color: t.secondary_color, accent_color: t.accent_color || '#f59e0b', logo_url: t.logo_url || '', is_active: t.is_active }); };

  const saveEdit = async () => {
    try { await api.request('/super-admin/tenants/' + editingId, { method: 'PUT', body: JSON.stringify(editForm), headers: { 'Content-Type': 'application/json' } }); setEditingId(null); load(); }
    catch (e) { alert(e.message); }
  };

  const handleDelete = async (id, force = false) => {
    try {
      await api.request('/super-admin/tenants/' + id + (force ? '?force=true' : ''), { method: 'DELETE' });
      setDeleteConfirm(null); load();
    } catch (e) {
      if (e.message?.includes('utilisateur')) {
        if (confirm(e.message + '\n\nVoulez-vous forcer la suppression ?')) handleDelete(id, true);
      } else { alert(e.message); }
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}><p style={{ color: '#94a3b8' }}>Chargement...</p></div>;

  return (
    <div className="fade-in">
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <Shield size={24} color="#059669" />
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Super Admin</h1>
        </div>
        <p style={{ color: '#64748b' }}>Gestion de la plateforme — données non-sensibles uniquement</p>
      </div>

      {/* KPIs - Row 1: Counts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 16 }}>
        <KPI icon={Globe} label="Tenants actifs" value={stats.total_tenants || 0} color="#059669" />
        <KPI icon={Users} label="Utilisateurs totaux" value={stats.total_users || 0} color="#0ea5e9" />
        <KPI icon={Activity} label="Utilisateurs actifs" value={stats.active_users || 0} color="#16a34a" />
      </div>

      {/* KPIs - Row 2: Partners & Leads */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 28 }}>
        <KPI icon={Briefcase} label="Partenaires totaux" value={stats.total_partners || 0} color="#f59e0b" />
        <KPI icon={Briefcase} label="Partenaires actifs" value={stats.active_partners || 0} color="#16a34a" />
        <KPI icon={Target} label="Leads totaux" value={stats.total_leads || 0} color="#8b5cf6" />
      </div>

      {/* Volume cards */}
      {stats.volume_by_status && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 28 }}>
          <div style={{ background: 'linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)', border: '1px solid #bbf7d0', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ background: '#059669', borderRadius: 8, padding: 8, display: 'flex' }}>
                <TrendingUp size={18} color="#fff" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#065f46', textTransform: 'uppercase', letterSpacing: 0.5 }}>Volume gagné</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#064e3b' }}>
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.volume_by_status.won || 0)}
            </div>
            <div style={{ fontSize: 12, color: '#047857', marginTop: 4 }}>
              {stats.leads_by_status && stats.leads_by_status.won ? `${stats.leads_by_status.won} lead${stats.leads_by_status.won > 1 ? 's' : ''} signé${stats.leads_by_status.won > 1 ? 's' : ''}` : '—'}
            </div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #fefce8 0%, #fef9c3 100%)', border: '1px solid #fde047', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ background: '#ca8a04', borderRadius: 8, padding: 8, display: 'flex' }}>
                <Activity size={18} color="#fff" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#854d0e', textTransform: 'uppercase', letterSpacing: 0.5 }}>Volume pipeline</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#713f12' }}>
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format((stats.volume_by_status.contacted || 0) + (stats.volume_by_status.meeting || 0) + (stats.volume_by_status.proposal || 0))}
            </div>
            <div style={{ fontSize: 12, color: '#a16207', marginTop: 4 }}>
              {(() => { const lbs = stats.leads_by_status || {}; const c = (lbs.contacted || 0) + (lbs.meeting || 0) + (lbs.proposal || 0); return c > 0 ? `${c} en cours` : '—'; })()}
            </div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)', border: '1px solid #fecaca', borderRadius: 12, padding: 20 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{ background: '#dc2626', borderRadius: 8, padding: 8, display: 'flex' }}>
                <X size={18} color="#fff" />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Volume perdu</div>
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#7f1d1d' }}>
              {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(stats.volume_by_status.lost || 0)}
            </div>
            <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 4 }}>
              {stats.leads_by_status && stats.leads_by_status.lost ? `${stats.leads_by_status.lost} lead${stats.leads_by_status.lost > 1 ? 's' : ''} perdu${stats.leads_by_status.lost > 1 ? 's' : ''}` : '—'}
            </div>
          </div>
        </div>
      )}

      {/* Tenants breakdown table */}
      {stats.tenants_breakdown && stats.tenants_breakdown.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, marginBottom: 28, overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={18} color="#059669" />
            <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Activité par tenant</h3>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>Tenant</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Leads</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Volume gagné</th>
                  <th style={{ padding: '12px 20px', fontWeight: 600, color: '#475569', fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'right' }}>Pipeline</th>
                </tr>
              </thead>
              <tbody>
                {stats.tenants_breakdown.map((t) => (
                  <tr key={t.id} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '14px 20px', fontWeight: 600, color: '#0f172a' }}>
                      {t.name}
                      <div style={{ fontSize: 11, fontWeight: 400, color: '#94a3b8' }}>{t.slug}</div>
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', color: '#475569' }}>{t.lead_count}</td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', color: '#059669', fontWeight: 600 }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(t.volume_won || 0)}
                    </td>
                    <td style={{ padding: '14px 20px', textAlign: 'right', color: '#ca8a04' }}>
                      {new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(t.volume_pipeline || 0)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        {[{ id: 'tenants', label: 'Tenants', icon: Globe }, { id: 'logs', label: 'Audit Logs', icon: Activity }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0f172a' : '#64748b', boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'tenants' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={() => setShowCreate(!showCreate)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 20px', borderRadius: 12, background: showCreate ? '#f1f5f9' : 'var(--rb-primary, #059669)', color: showCreate ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              {showCreate ? <X size={14} /> : <Plus size={14} />} {showCreate ? 'Annuler' : 'Nouveau tenant'}
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
                  <div key={key}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{label}</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} style={{ width: 32, height: 32, border: 'none', borderRadius: 6, cursor: 'pointer' }} /><code style={{ fontSize: 11, color: '#94a3b8' }}>{form[key]}</code></div></div>
                ))}
              </div>
              <button onClick={handleCreate} disabled={saving || !form.name || !form.slug} style={{ padding: '10px 24px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Création...' : 'Créer le tenant'}</button>
            </div>
          )}

          {/* Edit modal */}
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
                {/* Preview */}
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

          {/* Delete confirmation modal */}
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

          {/* Tenants list */}
          <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead><tr style={{ background: '#f8fafc' }}>
                {['Tenant', 'Slug', 'Domaine', 'Users', 'Partenaires', 'Statut', 'Créé le', ''].map((h, i) => (
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
                  <td style={{ padding: '13px 16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>{t.domain || '—'}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}>
                    <span style={{ fontWeight: 700, color: '#0f172a' }}>{t.active_user_count}</span>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}> / {t.user_count}</span>
                  </td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', fontWeight: 600 }}>{t.partner_count}</td>
                  <td style={{ padding: '13px 16px', textAlign: 'center' }}><span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: t.is_active ? '#f0fdf4' : '#fef2f2', color: t.is_active ? '#16a34a' : '#dc2626' }}>{t.is_active ? 'Actif' : 'Inactif'}</span></td>
                  <td style={{ padding: '13px 16px', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>{fmtDate(t.created_at)}</td>
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
        </>
      )}

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
    </div>
  );
}

function KPI({ icon: Icon, label, value, color }) {
  return (
    <div style={{ padding: 20, borderRadius: 16, background: '#fff', border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 26, fontWeight: 800, color, letterSpacing: -1 }}>{value}</div>
        </div>
        <div style={{ width: 40, height: 40, borderRadius: 10, background: `${color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon size={20} color={color} /></div>
      </div>
    </div>
  );
}
