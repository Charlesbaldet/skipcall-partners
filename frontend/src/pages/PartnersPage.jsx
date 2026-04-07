import { useState, useEffect } from 'react';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { Plus, X, Users, Archive, Trash2, Pencil, ArchiveRestore, UserPlus, CheckCircle, XCircle, Clock, User, AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth.jsx';

export default function PartnersPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('partners');
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', company_website: '', commission_rate: 10 });
  const [saving, setSaving] = useState(false);
  const [tempPwd, setTempPwd] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  // Candidatures state
  const [applications, setApplications] = useState([]);
  const [appFilter, setAppFilter] = useState('pending');
  const [appLoading, setAppLoading] = useState(false);
  const [selectedApp, setSelectedApp] = useState(null);
  const [commissionRate, setCommissionRate] = useState(10);
  const [rejectReason, setRejectReason] = useState('');

  const loadPartners = async (showAll) => {
    try { const qs = showAll ? '?show=all' : ''; const d = await api.request('/partners' + qs); setPartners(d.partners); } catch(e) { console.error(e); }
  };

  const loadApplications = async (filter) => {
    setAppLoading(true);
    try { const d = await api.getApplications(filter || appFilter); setApplications(d.applications || []); } catch(e) { console.error(e); }
    setAppLoading(false);
  };

  useEffect(() => { loadPartners(false).finally(() => setLoading(false)); }, []);
  useEffect(() => { if (tab === 'candidatures' && isAdmin) loadApplications(); }, [tab, appFilter]);

  const handleArchive = async (id) => { try { await api.archivePartner(id); await loadPartners(showArchived); } catch(e) { alert(e.message); } };
  const handleDeletePartner = async (id) => { try { await api.deletePartner(id); setPartners(prev => prev.filter(p => p.id !== id)); } catch(e) { alert(e.message); } };

  const startEdit = (p) => { setEditingId(p.id); setEditForm({ name: p.name, contact_name: p.contact_name, email: p.email, phone: p.phone || '', company_website: p.company_website || '', commission_rate: p.commission_rate, iban: p.iban || '', bic: p.bic || '', account_holder: p.account_holder || '' }); };
  const saveEdit = async () => { try { await api.updatePartner(editingId, editForm); setEditingId(null); await loadPartners(showArchived); } catch(e) { alert(e.message); } };

  const handleSubmit = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const data = await api.createPartner(form);
      setPartners(prev => [...prev, { ...data.partner, total_referrals: '0', won_deals: '0', total_revenue: '0' }]);
      setTempPwd(data.tempPassword);
      setForm({ name: '', contact_name: '', email: '', phone: '', company_website: '', commission_rate: 10 });
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  const handleApprove = async () => {
    try { await api.approveApplication(selectedApp.id, commissionRate); setSelectedApp(null); loadApplications(); } catch(e) { alert(e.message); }
  };
  const handleReject = async () => {
    try { await api.rejectApplication(selectedApp.id, rejectReason); setSelectedApp(null); setRejectReason(''); loadApplications(); } catch(e) { alert(e.message); }
  };

  const activePartners = partners.filter(p => p.is_active !== false);
  const archivedPartners = partners.filter(p => p.is_active === false);
  const pendingCount = applications.filter(a => a.status === 'pending').length;

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      {/* Edit modal */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setEditingId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 480, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: '#0f172a' }}>Modifier le partenaire</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {[['name', 'Entreprise'], ['contact_name', 'Contact'], ['email', 'Email'], ['phone', 'Téléphone'], ['company_website', 'Site web'], ['commission_rate', 'Taux (%)'], ['account_holder', 'Titulaire compte'], ['iban', 'IBAN'], ['bic', 'BIC']].map(([key, label]) => (
                <div key={key} style={{ gridColumn: key === 'iban' ? '1 / -1' : undefined }}>
                  <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</label>
                  <input value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))} type={key === 'commission_rate' ? 'number' : 'text'} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4, fontFamily: ['iban', 'bic'].includes(key) ? 'monospace' : 'inherit' }} />
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Annuler</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, var(--rb-primary, #059669), var(--rb-accent, #f97316))', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Sauvegarder</button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 12, borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
              <button onClick={() => { handleArchive(editingId); setEditingId(null); }} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #fcd34d', background: '#fffbeb', color: '#b45309', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Archive size={14} /> Archiver</button>
              <button onClick={() => setDeleteConfirm(editingId)} style={{ flex: 1, padding: 10, borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', fontWeight: 600, cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={14} /> Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Application detail modal */}
      {selectedApp && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setSelectedApp(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 520, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{selectedApp.company_name}</h3>
                <p style={{ color: '#64748b', fontSize: 14 }}>{selectedApp.contact_name} · {selectedApp.email}</p>
              </div>
              <button onClick={() => setSelectedApp(null)} style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={16} /></button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
              <InfoBlock label="Téléphone" value={selectedApp.phone || '—'} />
              <InfoBlock label="Site web" value={selectedApp.company_website || '—'} />
              <InfoBlock label="Taille" value={selectedApp.company_size || '—'} />
              <InfoBlock label="Date" value={fmtDate(selectedApp.created_at)} />
            </div>
            {selectedApp.motivation && (
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 20, border: '1px solid #e2e8f0' }}>
                <div style={{ fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 6 }}>Motivation</div>
                <p style={{ color: '#475569', fontSize: 14, lineHeight: 1.6 }}>{selectedApp.motivation}</p>
              </div>
            )}
            {selectedApp.status === 'pending' && (
              <div>
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6, display: 'block' }}>Taux de commission (%)</label>
                  <input type="number" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} style={{ padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, width: 120 }} />
                </div>
                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={handleApprove} style={{ flex: 1, padding: 13, borderRadius: 12, background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><CheckCircle size={16} /> Accepter</button>
                  <button onClick={handleReject} style={{ flex: 1, padding: 13, borderRadius: 12, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600, fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><XCircle size={16} /> Refuser</button>
                </div>
              </div>
            )}
            {selectedApp.status !== 'pending' && (
              <div style={{ padding: '12px 16px', borderRadius: 10, background: selectedApp.status === 'approved' ? '#f0fdf4' : '#fef2f2', color: selectedApp.status === 'approved' ? '#16a34a' : '#dc2626', fontWeight: 600, fontSize: 14 }}>
                {selectedApp.status === 'approved' ? 'Candidature acceptée' : 'Candidature refusée'}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 420, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <AlertTriangle size={28} color="#dc2626" />
            </div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Supprimer ce partenaire ?</h3>
            <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>Cette action est <strong style={{ color: '#dc2626' }}>irréversible</strong>. Toutes les données associées seront perdues.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, color: '#475569' }}>Annuler</button>
              <button onClick={() => { handleDeletePartner(deleteConfirm); setDeleteConfirm(null); setEditingId(null); }} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg, #dc2626, #b91c1c)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={16} /> Supprimer</button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Partenaires</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>{activePartners.length} partenaire{activePartners.length > 1 ? 's' : ''} actif{activePartners.length > 1 ? 's' : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          {tab === 'partners' && (
            <>
              <button onClick={() => { const next = !showArchived; setShowArchived(next); loadPartners(next); }} style={{ padding: '10px 20px', borderRadius: 12, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '2px solid #e2e8f0', background: showArchived ? '#fef3c7' : '#fff', color: showArchived ? '#b45309' : '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Archive size={14} /> {showArchived ? `Archivés (${archivedPartners.length})` : 'Voir les archivés'}
              </button>
              <button onClick={() => { setShowForm(!showForm); setTempPwd(null); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12, background: showForm ? '#f1f5f9' : 'linear-gradient(135deg, var(--rb-primary, #059669), var(--rb-accent, #f97316))', color: showForm ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                {showForm ? <X size={16} /> : <Plus size={16} />}
                {showForm ? 'Annuler' : 'Ajouter un partenaire'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        <button onClick={() => setTab('partners')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'partners' ? '#fff' : 'transparent', color: tab === 'partners' ? '#0f172a' : '#64748b', boxShadow: tab === 'partners' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Users size={14} /> Partenaires
        </button>
        {isAdmin && (
          <button onClick={() => setTab('candidatures')} style={{ padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: tab === 'candidatures' ? '#fff' : 'transparent', color: tab === 'candidatures' ? '#0f172a' : '#64748b', boxShadow: tab === 'candidatures' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', display: 'flex', alignItems: 'center', gap: 6 }}>
            <UserPlus size={14} /> Candidatures
            {pendingCount > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 8 }}>{pendingCount}</span>}
          </button>
        )}
      </div>

      {tab === 'partners' && (
        <>
          {/* Create form */}
          {showForm && (
            <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', marginBottom: 24 }} className="fade-in">
              {tempPwd ? (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>✓</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Partenaire créé !</h3>
                  <p style={{ color: '#64748b', marginBottom: 16, fontSize: 14 }}>Voici les identifiants temporaires :</p>
                  <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, display: 'inline-block', textAlign: 'left' }}>
                    <p style={{ fontSize: 13, marginBottom: 4 }}><strong>Email :</strong> {form.email || partners[partners.length-1]?.email}</p>
                    <p style={{ fontSize: 13 }}><strong>Mot de passe :</strong> <code style={{ background: '#eef2ff', padding: '2px 8px', borderRadius: 4, color: '#6366f1' }}>{tempPwd}</code></p>
                  </div>
                  <div style={{ marginTop: 20 }}><button onClick={() => { setShowForm(false); setTempPwd(null); }} style={{ padding: '10px 20px', borderRadius: 10, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Fermer</button></div>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>Nouveau partenaire</h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                    <FormField label="Nom de la société *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
                    <FormField label="Contact principal *" value={form.contact_name} onChange={v => setForm(f => ({ ...f, contact_name: v }))} required />
                    <FormField label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" required />
                    <FormField label="Téléphone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
                    <FormField label="Site web" value={form.company_website} onChange={v => setForm(f => ({ ...f, company_website: v }))} />
                    <FormField label="Taux de commission (%)" value={form.commission_rate} onChange={v => setForm(f => ({ ...f, commission_rate: v }))} type="number" />
                  </div>
                  <button type="submit" disabled={saving} style={{ padding: '12px 24px', borderRadius: 12, background: 'linear-gradient(135deg, var(--rb-primary, #059669), var(--rb-accent, #f97316))', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Création...' : 'Créer le partenaire'}</button>
                </form>
              )}
            </div>
          )}

          {/* Partners Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
            {activePartners.map(p => <PartnerCard key={p.id} partner={p} onEdit={startEdit} onArchive={handleArchive} onDelete={handleDeletePartner} />)}
          </div>

          {/* Archived */}
          {showArchived && archivedPartners.length > 0 && (
            <div style={{ marginTop: 36 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Archive size={18} color="#b45309" />
                <h2 style={{ fontSize: 20, fontWeight: 700, color: '#b45309' }}>Archivés</h2>
                <span style={{ padding: '2px 10px', borderRadius: 20, background: '#fef3c7', color: '#b45309', fontSize: 12, fontWeight: 600 }}>{archivedPartners.length}</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
                {archivedPartners.map(p => (
                  <div key={p.id} style={{ background: '#fffbeb', borderRadius: 16, padding: 24, border: '1px solid #fcd34d' }}>
                    <div style={{ fontWeight: 700, color: '#92400e', fontSize: 18 }}>{p.name}</div>
                    <div style={{ color: '#b45309', fontSize: 13, marginTop: 2, marginBottom: 16 }}>{p.contact_name} · {p.email}</div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => handleArchive(p.id)} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#22c55e,#16a34a)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><ArchiveRestore size={14} /> Réactiver</button>
                      <button onClick={() => handleDeletePartner(p.id)} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', display: 'flex', alignItems: 'center' }}><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {tab === 'candidatures' && isAdmin && (
        <>
          {/* Filter */}
          <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 20, width: 'fit-content' }}>
            {[['pending', 'En attente'], ['all', 'Toutes'], ['approved', 'Acceptées'], ['rejected', 'Refusées']].map(([k, label]) => (
              <button key={k} onClick={() => setAppFilter(k)} style={{
                padding: '6px 14px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: appFilter === k ? '#fff' : 'transparent', color: appFilter === k ? '#0f172a' : '#64748b',
                boxShadow: appFilter === k ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
            ))}
          </div>

          {appLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
          ) : applications.length === 0 ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8', background: '#fff', borderRadius: 16, border: '1px solid #e2e8f0' }}>Aucune candidature</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {applications.map(a => {
                const statusColors = { pending: { bg: '#fffbeb', color: '#f59e0b', label: 'En attente' }, approved: { bg: '#f0fdf4', color: '#16a34a', label: 'Acceptée' }, rejected: { bg: '#fef2f2', color: '#dc2626', label: 'Refusée' } };
                const sc = statusColors[a.status] || statusColors.pending;
                return (
                  <div key={a.id} style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', border: '1px solid #e2e8f0', borderLeft: `4px solid ${sc.color}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{a.company_name}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600, background: sc.bg, color: sc.color }}>{sc.label}</span>
                      </div>
                      <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{a.contact_name} · {a.email} · {fmtDate(a.created_at)}</div>
                    </div>
                    <button onClick={() => { setSelectedApp(a); setCommissionRate(10); }} style={{ padding: '6px 14px', borderRadius: 8, background: '#eef2ff', border: 'none', color: '#6366f1', fontWeight: 600, fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <CheckCircle size={12} /> Examiner
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function PartnerCard({ partner: p, onEdit, onArchive, onDelete }) {
  const refs = parseInt(p.total_referrals || 0);
  const won = parseInt(p.won_deals || 0);
  const conv = refs > 0 ? Math.round((won / refs) * 100) : 0;
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18 }}>{p.name}</div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{p.contact_name} · {p.email}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ padding: '4px 10px', borderRadius: 8, background: '#eef2ff', color: '#6366f1', fontWeight: 700, fontSize: 13 }}>{p.commission_rate}%</span>
          <button onClick={(e) => { e.stopPropagation(); onEdit(p); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#64748b', display: 'flex' }}><Pencil size={13} /></button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
        <MiniStat label="Referrals" value={refs} />
        <MiniStat label="Gagnés" value={won} color="#16a34a" />
        <MiniStat label="Conversion" value={`${conv}%`} color="#6366f1" />
        <MiniStat label="CA" value={fmt(p.total_revenue)} color="#0f172a" />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (<div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}><div style={{ fontSize: 17, fontWeight: 800, color: color || '#0f172a' }}>{value}</div><div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>{label}</div></div>);
}
function InfoBlock({ label, value }) {
  return (<div><div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 500 }}>{label}</div><div style={{ color: '#0f172a', fontWeight: 500, marginTop: 2, fontSize: 14 }}>{value}</div></div>);
}
function FormField({ label, value, onChange, type = 'text', required }) {
  return (<div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>{label}</label><input type={type} value={value} onChange={e => onChange(e.target.value)} required={required} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, color: '#0f172a', boxSizing: 'border-box' }} /></div>);
}
