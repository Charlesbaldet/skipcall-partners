import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { Globe, Users, Shield, Plus, X, Pencil, Activity, ChevronRight, ToggleRight, ToggleLeft, Trash2, AlertTriangle, Briefcase, Target, TrendingUp, BarChart3 } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

export default function SuperAdminPage() {
  const [tab, setTab] = useState('tenants');
  const [stats, setStats] = useState({});
  const [timeline, setTimeline] = useState([]);
  const [activeMetric, setActiveMetric] = useState('volume_won');
  const [tenants, setTenants] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', domain: '', primary_color: 'var(--rb-primary, #059669)', secondary_color: '#8b5cf6', accent_color: '#f59e0b', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showInviteSaModal, setShowInviteSaModal] = useState(false);
  const [saInviteForm, setSaInviteForm] = useState({ email: '', full_name: '' });
  const [saInviteSubmitting, setSaInviteSubmitting] = useState(false);
  const navigate = useNavigate();

  const load = async () => {
    try {
      const [s, t, tl] = await Promise.all([
        api.request('/super-admin/stats'),
        api.request('/super-admin/tenants'),
        api.request('/super-admin/timeline').catch(() => ({ series: [] })),
      ]);
      setStats(s); setTenants(t.tenants || []);
      setTimeline((tl && tl.series) || []);
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

      {/* Timeline chart with metric tabs */}
      <TimelineChart series={timeline} active={activeMetric} setActive={setActiveMetric} />

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
            <button onClick={() => setShowInviteSaModal(true)} style={{style={{ padding: '8px 16px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', marginLeft: 8 }}>
              + Inviter super admin
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
    
      {showInviteSaModal && (
        <div onClick={() => setShowInviteSaModal(false)} style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.5)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}}>
          <div onClick={e => e.stopPropagation()} style={{background:'white',borderRadius:12,padding:24,minWidth:400,maxWidth:500,boxShadow:'0 20px 60px rgba(0,0,0,0.3)'}}>
            <h3 style={{margin:'0 0 16px',fontSize:18,fontWeight:600,color:'#0f172a'}}>Inviter un super admin</h3>
            <div style={{display:'flex',flexDirection:'column',gap:12}}>
              <div>
                <label style={{display:'block',fontSize:13,color:'#64748b',marginBottom:4}}>Email</label>
                <input type="email" value={saInviteForm.email} onChange={e => setSaInviteForm({...saInviteForm, email: e.target.value})} placeholder="email@exemple.com" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,boxSizing:'border-box'}} autoFocus />
              </div>
              <div>
                <label style={{display:'block',fontSize:13,color:'#64748b',marginBottom:4}}>Nom complet</label>
                <input type="text" value={saInviteForm.full_name} onChange={e => setSaInviteForm({...saInviteForm, full_name: e.target.value})} placeholder="Jean Dupont" style={{width:'100%',padding:'10px 12px',borderRadius:8,border:'1px solid #e2e8f0',fontSize:14,boxSizing:'border-box'}} />
              </div>
            </div>
            <div style={{display:'flex',gap:8,justifyContent:'flex-end',marginTop:20}}>
              <button onClick={() => { setShowInviteSaModal(false); setSaInviteForm({email:'',full_name:''}); }} style={{padding:'8px 16px',background:'white',color:'#64748b',border:'1px solid #e2e8f0',borderRadius:6,fontSize:13,fontWeight:600,cursor:'pointer'}}>Annuler</button>
              <button disabled={saInviteSubmitting || !saInviteForm.email} onClick={async () => { setSaInviteSubmitting(true); try { await api.request('/super-admin/invite-superadmin', { method: 'POST', body: JSON.stringify({ email: saInviteForm.email, full_name: saInviteForm.full_name || saInviteForm.email }), headers: { 'Content-Type': 'application/json' } }); alert('✅ Super admin invité ! Email envoyé à ' + saInviteForm.email); setShowInviteSaModal(false); setSaInviteForm({email:'',full_name:''}); } catch (e) { alert('❌ Erreur : ' + e.message); } setSaInviteSubmitting(false); }} style={{padding:'8px 16px',background:'#7c3aed',color:'white',border:'none',borderRadius:6,fontSize:13,fontWeight:600,cursor:saInviteSubmitting?'not-allowed':'pointer',opacity:saInviteSubmitting?0.6:1}}>{saInviteSubmitting ? 'Envoi...' : 'Inviter'}</button>
            </div>
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
  // Y axis ticks (4 levels)
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
            <button
              key={m.key}
              onClick={() => setActive(m.key)}
              style={{
                background: active === m.key ? m.color : '#f1f5f9',
                color: active === m.key ? '#fff' : '#475569',
                border: 'none',
                borderRadius: 8,
                padding: '6px 12px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
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
          {/* Y grid lines + labels */}
          {yTicks.map((v, i) => (
            <g key={i}>
              <line x1={padL} x2={W - padR} y1={y(v)} y2={y(v)} stroke="#f1f5f9" strokeWidth="1" />
              <text x={padL - 8} y={y(v) + 4} fontSize="10" fill="#94a3b8" textAnchor="end">
                {active === 'volume_won' ? new Intl.NumberFormat('fr-FR', { notation: 'compact' }).format(v) : Math.round(v)}
              </text>
            </g>
          ))}
          {/* X labels */}
          {series.map((p, i) => (
            i % Math.max(1, Math.ceil(series.length / 6)) === 0 && (
              <text key={i} x={x(i)} y={H - 10} fontSize="10" fill="#94a3b8" textAnchor="middle">{p.label}</text>
            )
          ))}
          {/* Area + line */}
          <path d={areaPath} fill={`url(#grad-${active})`} />
          <path d={path} fill="none" stroke={activeM.color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
          {/* Points */}
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
