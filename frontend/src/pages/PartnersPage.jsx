import { useState, useEffect } from 'react';
import api from '../lib/api';
import { Archive, Trash2, Pencil, ArchiveRestore } from 'lucide-react';
import { fmt } from '../lib/constants';
import { Plus, X, Users } from 'lucide-react';

export default function PartnersPage() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', contact_name: '', email: '', phone: '', company_website: '', commission_rate: 10 });
  const [saving, setSaving] = useState(false);
  const [tempPwd, setTempPwd] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const loadPartners = async () => {
    try {
      const d = await api.getPartners();
      setPartners(d.partners);
    } catch(e) {}
  };

  const handleArchive = async (id) => {
    try {
      await api.archivePartner(id);
      await loadPartners();
    } catch(e) { alert(e.message); }
  };

  const handleDeletePartner = async (id) => {
    if (!confirm('Supprimer ce partenaire ? (impossible s\'il a des recommandations)')) return;
    try {
      await api.deletePartner(id);
      setPartners(prev => prev.filter(p => p.id !== id));
    } catch(e) { alert(e.message); }
  };

  const startEdit = (p) => {
    setEditingId(p.id);
    setEditForm({ name: p.name, contact_name: p.contact_name, email: p.email, phone: p.phone || '', company_website: p.company_website || '', commission_rate: p.commission_rate });
  };

  const saveEdit = async () => {
    try {
      await api.updatePartner(editingId, editForm);
      setEditingId(null);
      await loadPartners();
    } catch(e) { alert(e.message); }
  };

  useEffect(() => {
    api.getPartners().then(d => setPartners(d.partners)).catch(console.error).finally(() => setLoading(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await api.createPartner(form);
      setPartners(prev => [...prev, { ...data.partner, total_referrals: '0', won_deals: '0', total_revenue: '0' }]);
      setTempPwd(data.tempPassword);
      setForm({ name: '', contact_name: '', email: '', phone: '', company_website: '', commission_rate: 10 });
    } catch (err) { console.error(err); }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      {/* Edit Modal */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setEditingId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} />
          <div style={{ position: 'relative', background: '#fff', borderRadius: 20, padding: 32, width: 450, maxWidth: '90%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Modifier le partenaire</h3>
            {[['name', 'Entreprise'], ['contact_name', 'Contact'], ['email', 'Email'], ['phone', 'T\u00e9l\u00e9phone'], ['company_website', 'Site web'], ['commission_rate', 'Taux commission (%)']].map(([key, label]) => (
              <div key={key} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>{label}</label>
                <input value={editForm[key] || ''} onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  type={key === 'commission_rate' ? 'number' : 'text'}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, borderRadius: 10, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: 12, borderRadius: 10, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 600, cursor: 'pointer' }}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Partenaires</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>{partners.length} partenaire{partners.length > 1 ? 's' : ''} actif{partners.length > 1 ? 's' : ''}</p>
        </div>
        <button onClick={() => { setShowForm(!showForm); setTempPwd(null); }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12,
          background: showForm ? '#f1f5f9' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: showForm ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }}>
          {showForm ? <X size={16} /> : <Plus size={16} />}
          {showForm ? 'Annuler' : 'Ajouter un partenaire'}
        </button>
      </div>

      {/* Create form */}
      {showForm && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', marginBottom: 24 }} className="fade-in">
          {tempPwd ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 16px' }}>✓</div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Partenaire créé !</h3>
              <p style={{ color: '#64748b', marginBottom: 16, fontSize: 14 }}>Voici les identifiants temporaires à communiquer :</p>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, display: 'inline-block', textAlign: 'left' }}>
                <p style={{ fontSize: 13, marginBottom: 4 }}><strong>Email :</strong> {form.email || partners[partners.length-1]?.email}</p>
                <p style={{ fontSize: 13, marginBottom: 0 }}><strong>Mot de passe :</strong> <code style={{ background: '#eef2ff', padding: '2px 8px', borderRadius: 4, color: '#6366f1' }}>{tempPwd}</code></p>
              </div>
              <div style={{ marginTop: 20 }}>
                <button onClick={() => { setShowForm(false); setTempPwd(null); }} style={{ padding: '10px 20px', borderRadius: 10, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer', fontSize: 13 }}>Fermer</button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>Nouveau partenaire</h3>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowArchived(!showArchived)} style={{
          padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          border: '2px solid #e2e8f0', background: showArchived ? '#fef3c7' : '#fff',
          color: showArchived ? '#b45309' : '#64748b',
        }}>{showArchived ? 'Masquer les archiv\u00e9s' : 'Voir les archiv\u00e9s'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <FormField label="Nom de la société *" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} required />
                <FormField label="Contact principal *" value={form.contact_name} onChange={v => setForm(f => ({ ...f, contact_name: v }))} required />
                <FormField label="Email *" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" required />
                <FormField label="Téléphone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} />
                <FormField label="Site web" value={form.company_website} onChange={v => setForm(f => ({ ...f, company_website: v }))} />
                <FormField label="Taux de commission (%)" value={form.commission_rate} onChange={v => setForm(f => ({ ...f, commission_rate: v }))} type="number" />
              </div>
              <button type="submit" disabled={saving} style={{
                padding: '12px 24px', borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1,
              }}>{saving ? 'Création...' : 'Créer le partenaire'}</button>
            </form>
          )}
        </div>
      )}

      {/* Partners Grid */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowArchived(!showArchived)} style={{
          padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          border: '2px solid #e2e8f0', background: showArchived ? '#fef3c7' : '#fff',
          color: showArchived ? '#b45309' : '#64748b',
        }}>{showArchived ? 'Masquer les archiv\u00e9s' : 'Voir les archiv\u00e9s'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {partners.map(p => {
          const refs = parseInt(p.total_referrals || 0);
          const won = parseInt(p.won_deals || 0);
          const conv = refs > 0 ? Math.round((won / refs) * 100) : 0;
          return (
            <div key={p.id} style={{ background: '#fff', borderRadius: 16, padding: 24, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 18 }}>{p.name}</div>
                  <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{p.contact_name} · {p.email}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  {!p.is_active && <span style={{ padding: '2px 8px', borderRadius: 6, background: '#fef3c7', color: '#b45309', fontSize: 11, fontWeight: 600 }}>Archiv\u00e9</span>}
                  <span style={{ padding: '4px 10px', borderRadius: 8, background: '#eef2ff', color: '#6366f1', fontWeight: 700, fontSize: 13 }}>{p.commission_rate}%</span>
                  <button onClick={(e) => { e.stopPropagation(); startEdit(p); }} title="Modifier" style={{ background: '#f1f5f9', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#64748b', display: 'flex' }}><Pencil size={13} /></button>
                  <button onClick={(e) => { e.stopPropagation(); handleArchive(p.id); }} title={p.is_active ? "Archiver" : "R\u00e9activer"} style={{ background: '#fef3c7', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#b45309', display: 'flex' }}>{p.is_active ? <Archive size={13} /> : <ArchiveRestore size={13} />}</button>
                  <button onClick={(e) => { e.stopPropagation(); handleDeletePartner(p.id); }} title="Supprimer" style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', color: '#dc2626', display: 'flex' }}><Trash2 size={13} /></button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <button onClick={() => setShowArchived(!showArchived)} style={{
          padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          border: '2px solid #e2e8f0', background: showArchived ? '#fef3c7' : '#fff',
          color: showArchived ? '#b45309' : '#64748b',
        }}>{showArchived ? 'Masquer les archiv\u00e9s' : 'Voir les archiv\u00e9s'}</button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 10 }}>
                <MiniStat label="Referrals" value={refs} />
                <MiniStat label="Gagnés" value={won} color="#16a34a" />
                <MiniStat label="Conversion" value={`${conv}%`} color="#6366f1" />
                <MiniStat label="CA" value={fmt(p.total_revenue)} color="#0f172a" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }) {
  return (
    <div style={{ background: '#f8fafc', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: color || '#0f172a' }}>{value}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function FormField({ label, value, onChange, type = 'text', required }) {
  return (
    <div>
      <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} required={required}
        style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, color: '#0f172a', boxSizing: 'border-box' }} />
    </div>
  );
}
