import { useState, useEffect } from 'react';
import api from '../lib/api';
const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
import { Settings, UserPlus, Shield, Briefcase, Mail, X, CheckCircle, Clock, Copy, Trash2, ToggleLeft, ToggleRight } from 'lucide-react';

const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: '#dc2626', bg: '#fef2f2' },
  commercial: { label: 'Membre', icon: Briefcase, color: '#0891b2', bg: '#ecfeff' },
};

export default function AdminSettingsPage() {
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'commercial' });
  const [sending, setSending] = useState(false);
  const [inviteSuccess, setInviteSuccess] = useState(null);
  const [tab, setTab] = useState('users');

  const load = async () => {
    try {
      const [u, i] = await Promise.all([api.getAdminUsers(), api.getInvitations()]);
      setUsers(u.users);
      setInvitations(i.invitations);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    setSending(true);
    setInviteSuccess(null);
    try {
      const data = await api.inviteUser(inviteForm);
      setInviteSuccess(data.setupUrl);
      setInviteForm({ email: '', full_name: '', role: 'commercial' });
      load();
    } catch (err) { alert(err.message); }
    setSending(false);
  };

  const handleToggleActive = async (user) => {
    try {
      await api.updateAdminUser(user.id, { is_active: !user.is_active });
      load();
    } catch (err) { alert(err.message); }
  };

  const handleRoleChange = async (user, newRole) => {
    try {
      await api.updateAdminUser(user.id, { role: newRole });
      load();
    } catch (err) { alert(err.message); }
  };

  const handleDeleteInvitation = async (id) => {
    try {
      await api.deleteInvitation(id);
      load();
    } catch (err) { alert(err.message); }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Paramètres</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>Gestion des utilisateurs et des accès</p>
        </div>
        <button onClick={() => { setShowInvite(!showInvite); setInviteSuccess(null); }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12,
          background: showInvite ? '#f1f5f9' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: showInvite ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }}>
          {showInvite ? <X size={16} /> : <UserPlus size={16} />}
          {showInvite ? 'Annuler' : 'Inviter un utilisateur'}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', marginBottom: 24 }} className="fade-in">
          {inviteSuccess ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <Mail size={24} color="#16a34a" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Invitation envoyée !</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                Un email a été envoyé avec un lien pour créer le mot de passe.
              </p>
              <div style={{ background: '#f8fafc', borderRadius: 10, padding: 12, display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center' }}>
                <code style={{ fontSize: 12, color: '#6366f1', wordBreak: 'break-all' }}>{inviteSuccess}</code>
                <button onClick={() => copyToClipboard(inviteSuccess)} style={{ background: '#eef2ff', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}>
                  <Copy size={14} color="#6366f1" />
                </button>
              </div>
              <button onClick={() => { setShowInvite(false); setInviteSuccess(null); }} style={{ marginTop: 16, padding: '10px 20px', borderRadius: 10, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
            </div>
          ) : (
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', marginBottom: 20 }}>Nouvel utilisateur</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>Nom complet *</label>
                  <input value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Prénom Nom"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>Email *</label>
                  <input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="email@skipcall.com" type="email"
                    style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>Rôle *</label>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                      <button key={k} onClick={() => setInviteForm(f => ({ ...f, role: k }))} style={{
                        flex: 1, padding: '10px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600,
                        border: inviteForm.role === k ? `2px solid ${v.color}` : '2px solid #e2e8f0',
                        background: inviteForm.role === k ? v.bg : '#fff', color: v.color,
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      }}>
                        <v.icon size={14} /> {v.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={handleInvite} disabled={sending || !inviteForm.email || !inviteForm.full_name} style={{
                padding: '12px 24px', borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: sending ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <Mail size={16} /> {sending ? 'Envoi...' : 'Envoyer l\'invitation'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        {[{ id: 'users', label: `Utilisateurs (${users.length})` }, { id: 'invitations', label: `Invitations (${invitations.filter(i => !i.accepted_at).length})` }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0f172a' : '#64748b',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'users' && (
        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', border: '1px solid #e2e8f0' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Utilisateur', 'Rôle', 'Statut', 'Créé le', 'Actions'].map((h, i) => (
                  <th key={i} style={{ padding: '13px 16px', textAlign: 'left', fontWeight: 600, color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(u => {
                const role = ROLE_CONFIG[u.role];
                return (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f8fafc', opacity: u.is_active ? 1 : 0.5 }}>
                    <td style={{ padding: '13px 16px' }}>
                      <div style={{ fontWeight: 600, color: '#0f172a' }}>{u.full_name}</div>
                      <div style={{ color: '#94a3b8', fontSize: 12 }}>{u.email}</div>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <select value={u.role} onChange={e => handleRoleChange(u, e.target.value)}
                        style={{ padding: '4px 8px', borderRadius: 6, border: `1px solid ${role.color}30`, background: role.bg, color: role.color, fontWeight: 600, fontSize: 12, cursor: 'pointer' }}>
                        <option value="admin">Admin</option>
                        <option value="commercial">Membre</option>
                      </select>
                    </td>
                    <td style={{ padding: '13px 16px' }}>
                      <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: u.is_active ? '#f0fdf4' : '#fef2f2', color: u.is_active ? '#16a34a' : '#dc2626' }}>
                        {u.is_active ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td style={{ padding: '13px 16px', color: '#64748b', fontSize: 13 }}>{fmtDate(u.created_at)}</td>
                    <td style={{ padding: '13px 16px' }}>
                      <button onClick={() => handleToggleActive(u)} title={u.is_active ? 'Désactiver' : 'Activer'} style={{
                        background: 'transparent', border: 'none', cursor: 'pointer', color: u.is_active ? '#64748b' : '#16a34a', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600,
                      }}>
                        {u.is_active ? <ToggleRight size={20} color="#16a34a" /> : <ToggleLeft size={20} color="#dc2626" />}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'invitations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {invitations.length === 0 ? (
            <div style={{ background: '#fff', borderRadius: 16, padding: 48, textAlign: 'center', border: '1px solid #e2e8f0' }}>
              <p style={{ color: '#94a3b8' }}>Aucune invitation</p>
            </div>
          ) : invitations.map(inv => {
            const role = ROLE_CONFIG[inv.role];
            const expired = new Date(inv.expires_at) < new Date();
            const accepted = !!inv.accepted_at;
            return (
              <div key={inv.id} style={{ background: '#fff', borderRadius: 14, padding: 18, border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: accepted || expired ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: role.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <role.icon size={18} color={role.color} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, color: '#0f172a' }}>{inv.full_name}</div>
                    <div style={{ color: '#94a3b8', fontSize: 12 }}>{inv.email} · {role.label} · invité par {inv.invited_by_name}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {accepted ? (
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#f0fdf4', color: '#16a34a' }}>Acceptée</span>
                  ) : expired ? (
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#fef2f2', color: '#dc2626' }}>Expirée</span>
                  ) : (
                    <span style={{ padding: '4px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, background: '#fffbeb', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: 4 }}>
                      <Clock size={12} /> En attente
                    </span>
                  )}
                  {!accepted && (
                    <button onClick={() => handleDeleteInvitation(inv.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}>
                      <Trash2 size={14} color="#dc2626" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
