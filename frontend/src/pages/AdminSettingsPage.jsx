import { useState, useEffect } from 'react';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import { Settings, UserPlus, Shield, Briefcase, Mail, X, CheckCircle, Clock, Copy, Trash2, ToggleLeft, ToggleRight, Lock, Eye, EyeOff } from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: '#dc2626', bg: '#fef2f2' },
  commercial: { label: 'Membre', icon: Briefcase, color: '#0891b2', bg: '#ecfeff' },
};

export default function AdminSettingsPage() {
  const { user } = useAuth();
  const [users, setUsers] = useState([]);
  const [invitations, setInvitations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'commercial' });
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [tab, setTab] = useState('users');
  const [copied, setCopied] = useState(false);

  // Password change
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [showPw, setShowPw] = useState(false);

  const isAdmin = user?.role === 'admin';

  const load = async () => {
    if (isAdmin) {
      try {
        const [u, i] = await Promise.all([api.getAdminUsers(), api.getInvitations()]);
        setUsers(u.users);
        setInvitations(i.invitations);
      } catch (err) { console.error(err); }
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    setSending(true);
    setInviteResult(null);
    try {
      const data = await api.inviteUser(inviteForm);
      setInviteResult({ email: data.email || inviteForm.email, tempPassword: data.tempPassword });
      setInviteForm({ email: '', full_name: '', role: 'commercial' });
      load();
    } catch (err) { alert(err.message); }
    setSending(false);
  };

  const handleToggleActive = async (u) => {
    try { await api.updateAdminUser(u.id, { is_active: !u.is_active }); load(); } catch (err) { alert(err.message); }
  };

  const handleRoleChange = async (u, newRole) => {
    try { await api.updateAdminUser(u.id, { role: newRole }); load(); } catch (err) { alert(err.message); }
  };

  const handleDeleteInvitation = async (id) => {
    try { await api.deleteInvitation(id); load(); } catch (err) { alert(err.message); }
  };

  const handlePasswordChange = async () => {
    if (pwForm.newPw.length < 8) { setPwMsg({ type: 'error', text: 'Minimum 8 caractères' }); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' }); return; }
    setPwSaving(true); setPwMsg(null);
    try {
      await api.changePassword(pwForm.current, pwForm.newPw);
      setPwMsg({ type: 'success', text: 'Mot de passe mis à jour !' });
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) { setPwMsg({ type: 'error', text: err.message }); }
    setPwSaving(false);
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div style={{ padding: 48, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>;

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: -0.5 }}>Paramètres</h1>
          <p style={{ color: '#64748b', marginTop: 4 }}>{isAdmin ? 'Gestion des utilisateurs et des accès' : 'Mon compte'}</p>
        </div>
        {isAdmin && (
        <button onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12,
          background: showInvite ? '#f1f5f9' : 'var(--rb-primary, #059669)',
          color: showInvite ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer',
        }}>
          {showInvite ? <X size={16} /> : <UserPlus size={16} />}
          {showInvite ? 'Annuler' : 'Ajouter un utilisateur'}
        </button>
        )}
      </div>

      {/* Invite form */}
      {isAdmin && showInvite && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', marginBottom: 24 }} className="fade-in">
          {inviteResult ? (
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                <CheckCircle size={24} color="#16a34a" />
              </div>
              <h3 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>Utilisateur créé !</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 16 }}>
                Partagez ces identifiants de connexion :
              </p>
              <div style={{ background: '#f8fafc', borderRadius: 12, padding: 20, display: 'inline-block', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: 10 }}>
                  <span style={{ color: '#64748b', fontSize: 12 }}>Email</span>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 15 }}>{inviteResult.email}</div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <span style={{ color: '#64748b', fontSize: 12 }}>Mot de passe provisoire</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <code style={{ background: '#eef2ff', padding: '6px 12px', borderRadius: 8, color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 16, letterSpacing: 1 }}>{inviteResult.tempPassword}</code>
                    <button onClick={() => copyToClipboard(inviteResult.tempPassword)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}>
                      {copied ? <CheckCircle size={14} color="#16a34a" /> : <Copy size={14} color="#6366f1" />}
                    </button>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: '#f59e0b', background: '#fffbeb', padding: '6px 10px', borderRadius: 6 }}>
                  L'utilisateur pourra changer ce mot de passe dans Paramètres.
                </div>
              </div>
              <div style={{ marginTop: 16 }}>
                <button onClick={() => { setShowInvite(false); setInviteResult(null); }} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, cursor: 'pointer' }}>Fermer</button>
              </div>
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
                padding: '12px 24px', borderRadius: 12, background: 'var(--rb-primary, #059669)',
                color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: sending ? 0.7 : 1,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <UserPlus size={16} /> {sending ? 'Création...' : 'Créer l\'utilisateur'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      {isAdmin && (
      <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 24, width: 'fit-content' }}>
        {[
          { id: 'users', label: `Membres (${users.length})` },
          { id: 'password', label: 'Mon compte' },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            background: tab === t.id ? '#fff' : 'transparent', color: tab === t.id ? '#0f172a' : '#64748b',
            boxShadow: tab === t.id ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
          }}>{t.label}</button>
        ))}
      </div>
      )}

      {isAdmin && tab === 'users' && (
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
                        background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center',
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

      {(tab === 'password' || !isAdmin) && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 28, border: '1px solid #e2e8f0', maxWidth: 480 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
            <Lock size={20} color="#6366f1" />
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Changer mon mot de passe</h3>
          </div>

          {pwMsg && (
            <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500,
              background: pwMsg.type === 'success' ? '#f0fdf4' : '#fef2f2',
              color: pwMsg.type === 'success' ? '#16a34a' : '#dc2626',
              border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}`,
            }}>{pwMsg.text}</div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>Mot de passe actuel</label>
              <div style={{ position: 'relative' }}>
                <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
                  style={{ width: '100%', padding: '10px 40px 10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
                <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>Nouveau mot de passe</label>
              <input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder="Minimum 8 caractères"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 }}>Confirmer</label>
              <input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} placeholder="Retapez le mot de passe"
                style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' }} />
            </div>
            <button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} style={{
              padding: '12px', borderRadius: 12, background: 'var(--rb-primary, #059669)',
              color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: pwSaving ? 0.7 : 1,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
              <Lock size={16} /> {pwSaving ? 'Mise à jour...' : 'Mettre à jour'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
