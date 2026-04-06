import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import {
  X, User, Users, Lock, Eye, EyeOff, UserPlus, Shield, Briefcase,
  CheckCircle, Copy, ToggleLeft, ToggleRight, Plug, Key, Trash2, ExternalLink, Globe, Palette, Plus,
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: '#dc2626', bg: '#fef2f2' },
  commercial: { label: 'Membre', icon: Briefcase, color: '#0891b2', bg: '#ecfeff' },
};

export default function SettingsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState('account');
  const handleClose = () => navigate(-1);

  const NAV = [
    { id: 'account', icon: User, label: 'Mon compte' },
    ...(isAdmin ? [
      { id: 'members', icon: Users, label: 'Membres' },
      { id: 'integrations', icon: Plug, label: 'Intégrations' },
      { id: 'tenants', icon: Globe, label: 'Tenants' },
    ] : []),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 920, maxWidth: '100%', height: '85vh', maxHeight: 700, display: 'flex', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        {/* Left sidebar */}
        <div style={{ width: 220, background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '28px 12px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', padding: '0 12px', marginBottom: 20 }}>Paramètres</h2>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left',
                background: tab === item.id ? '#fff' : 'transparent', color: tab === item.id ? '#0f172a' : '#64748b',
                boxShadow: tab === item.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}><item.icon size={16} /> {item.label}</button>
            ))}
          </nav>
        </div>
        {/* Right content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <button onClick={handleClose} style={{ position: 'absolute', top: 24, right: 24, width: 36, height: 36, borderRadius: 10, zIndex: 10, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color="#475569" />
          </button>
          <div style={{ padding: '72px 32px 32px 32px' }}>
            {tab === 'account' && <AccountTab user={user} />}
            {tab === 'members' && isAdmin && <MembersTab />}
            {tab === 'integrations' && isAdmin && <IntegrationsTab />}
            {tab === 'tenants' && isAdmin && <TenantsTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ MON COMPTE ═══
function AccountTab({ user }) {
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  const handlePasswordChange = async () => {
    if (pwForm.newPw.length < 8) { setPwMsg({ type: 'error', text: 'Minimum 8 caractères' }); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' }); return; }
    setPwSaving(true); setPwMsg(null);
    try { await api.changePassword(pwForm.current, pwForm.newPw); setPwMsg({ type: 'success', text: 'Mot de passe mis à jour !' }); setPwForm({ current: '', newPw: '', confirm: '' }); }
    catch (err) { setPwMsg({ type: 'error', text: err.message }); }
    setPwSaving(false);
  };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>Mon compte</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 20, background: '#f8fafc', borderRadius: 14, marginBottom: 28, border: '1px solid #e2e8f0' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: user?.role === 'admin' ? '#6366f1' : user?.role === 'commercial' ? '#0891b2' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>
          {user?.fullName?.charAt(0) || '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{user?.fullName}</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{user?.email} · <span style={{ textTransform: 'capitalize', color: '#6366f1', fontWeight: 600 }}>{user?.role}</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Lock size={16} color="#6366f1" />
        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Changer le mot de passe</h4>
      </div>
      {pwMsg && (<div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500, background: pwMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: pwMsg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>{pwMsg.text}</div>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
        <div>
          <label style={labelStyle}>Mot de passe actuel</label>
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} style={inputStyle} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div><label style={labelStyle}>Nouveau mot de passe</label><input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder="Minimum 8 caractères" style={inputStyle} /></div>
        <div><label style={labelStyle}>Confirmer</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} /></div>
        <button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} style={{ padding: '11px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: pwSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: 'fit-content' }}><Lock size={14} /> {pwSaving ? 'Mise à jour...' : 'Mettre à jour'}</button>
      </div>
    </div>
  );
}

// ═══ MEMBRES ═══
function MembersTab() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteForm, setInviteForm] = useState({ email: '', full_name: '', role: 'commercial' });
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [deleteUserConfirm, setDeleteUserConfirm] = useState(null);

  const handleDeleteUser = async (id) => {
    try { await api.request('/admin/users/' + id, { method: 'DELETE' }); setDeleteUserConfirm(null); load(); }
    catch (err) { alert(err.message); }
  };

  const load = async () => { try { const u = await api.getAdminUsers(); setUsers(u.users); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    setSending(true); setInviteResult(null);
    try { const data = await api.inviteUser(inviteForm); setInviteResult({ email: data.email || inviteForm.email, tempPassword: data.tempPassword }); setInviteForm({ email: '', full_name: '', role: 'commercial' }); load(); }
    catch (err) { alert(err.message); }
    setSending(false);
  };

  const copyToClipboard = (t) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Membres</h3>
        <button onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: showInvite ? '#f1f5f9' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: showInvite ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {showInvite ? <X size={14} /> : <UserPlus size={14} />} {showInvite ? 'Annuler' : 'Ajouter'}
        </button>
      </div>

      {/* Invite form */}
      {showInvite && (
        <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' }} className="fade-in">
          {inviteResult ? (
            <div style={{ textAlign: 'center' }}>
              <CheckCircle size={32} color="#16a34a" style={{ marginBottom: 10 }} />
              <h4 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>Membre créé !</h4>
              <div style={{ background: '#fff', borderRadius: 10, padding: 16, display: 'inline-block', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontSize: 11 }}>Email</span><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{inviteResult.email}</div></div>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontSize: 11 }}>Mot de passe provisoire</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ background: '#eef2ff', padding: '4px 10px', borderRadius: 6, color: '#6366f1', fontWeight: 700, fontSize: 15 }}>{inviteResult.tempPassword}</code>
                    <button onClick={() => copyToClipboard(inviteResult.tempPassword)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 5, padding: 4, cursor: 'pointer', display: 'flex' }}>{copied ? <CheckCircle size={12} color="#16a34a" /> : <Copy size={12} color="#6366f1" />}</button>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}><button onClick={() => { setShowInvite(false); setInviteResult(null); }} style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>OK</button></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom *</label><input value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Prénom Nom" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Email *</label><input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="email@skipcall.com" type="email" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
              </div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Rôle *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setInviteForm(f => ({ ...f, role: k }))} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: inviteForm.role === k ? `2px solid ${v.color}` : '2px solid #e2e8f0', background: inviteForm.role === k ? v.bg : '#fff', color: v.color, display: 'flex', alignItems: 'center', gap: 5 }}><v.icon size={13} /> {v.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleInvite} disabled={sending || !inviteForm.email || !inviteForm.full_name} style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: sending ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content' }}><UserPlus size={14} /> {sending ? 'Création...' : 'Créer'}</button>
            </div>
          )}
        </div>
      )}

      {/* Delete user confirmation modal */}
      {deleteUserConfirm && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteUserConfirm(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 400, boxShadow: '0 25px 80px rgba(0,0,0,0.25)', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}><Trash2 size={28} color="#dc2626" /></div>
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>Supprimer cet utilisateur ?</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Cette action est irréversible.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteUserConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Annuler</button>
              <button onClick={() => handleDeleteUser(deleteUserConfirm)} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={16} /> Supprimer</button>
            </div>
          </div>
        </div>
      )}

      {/* Users list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {users.map(u => {
          const role = ROLE_CONFIG[u.role];
          return (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, opacity: u.is_active ? 1 : 0.5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 34, height: 34, borderRadius: 10, background: role.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><role.icon size={15} color={role.color} /></div>
                <div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{u.full_name}</div><div style={{ color: '#94a3b8', fontSize: 11 }}>{u.email}</div></div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select value={u.role} onChange={e => api.updateAdminUser(u.id, { role: e.target.value }).then(load)} style={{ padding: '3px 6px', borderRadius: 6, border: `1px solid ${role.color}30`, background: role.bg, color: role.color, fontWeight: 600, fontSize: 11, cursor: 'pointer' }}>
                  <option value="admin">Admin</option><option value="commercial">Membre</option>
                </select>
                <button onClick={() => api.updateAdminUser(u.id, { is_active: !u.is_active }).then(load)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                  {u.is_active ? <ToggleRight size={24} color="#16a34a" /> : <ToggleLeft size={24} color="#dc2626" />}
                </button>
                <button onClick={() => setDeleteUserConfirm(u.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={14} color="#dc2626" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══ INTÉGRATIONS ═══
function IntegrationsTab() {
  const [apiKeys, setApiKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [partnerId, setPartnerId] = useState('');
  const [partners, setPartners] = useState([]);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState(null);
  const [copied, setCopied] = useState(false);

  const load = async () => { try { const [k, p] = await Promise.all([api.getApiKeys(), api.getPartners()]); setApiKeys(k.apiKeys || []); setPartners(p.partners || []); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try { const data = await api.createApiKey({ name: keyName, partner_id: partnerId || null }); setNewKey(data.apiKey); setKeyName(''); setPartnerId(''); load(); }
    catch (err) { alert(err.message); }
    setCreating(false);
  };

  const handleRevoke = async (id) => {
    if (!confirm('Révoquer cette clé API ?')) return;
    try { await api.revokeApiKey(id); load(); } catch (err) { alert(err.message); }
  };

  const copyToClipboard = (t) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  const CRM_CARDS = [
    { name: 'HubSpot', desc: 'Synchronisez vos contacts et deals automatiquement', color: '#ff7a59', soon: true },
    { name: 'Pipedrive', desc: 'Importez vos prospects et suivez vos deals', color: '#017737', soon: true },
  ];

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>Intégrations</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        {CRM_CARDS.map(crm => (
          <div key={crm.name} style={{ padding: 20, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', opacity: 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: crm.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: crm.color }}>{crm.name[0]}</div>
              <div><div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{crm.name}</div>{crm.soon && <span style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', background: '#fffbeb', padding: '2px 6px', borderRadius: 4 }}>Bientôt</span>}</div>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>{crm.desc}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Key size={16} color="#6366f1" /><h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Open API</h4></div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>Créez des clés API pour intégrer Skipcall avec vos outils. <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>POST /api/v1/referrals</code> · <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>GET /api/v1/referrals</code></p>

      {newKey && (
        <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #fde68a' }} className="fade-in">
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 8 }}>Copiez cette clé maintenant</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ background: '#fff', padding: '8px 12px', borderRadius: 8, color: '#0f172a', fontWeight: 600, fontSize: 14, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{newKey}</code>
            <button onClick={() => copyToClipboard(newKey)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>{copied ? <CheckCircle size={16} color="#16a34a" /> : <Copy size={16} color="#6366f1" />}</button>
          </div>
        </div>
      )}

      {showCreate ? (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom *</label><input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Ex: Zapier" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Partenaire (optionnel)</label><select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}><option value="">Aucun</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={creating || !keyName} style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}><Key size={13} /> {creating ? 'Création...' : 'Générer'}</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowCreate(true); setNewKey(null); }} style={{ padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}><Key size={14} /> Créer une clé API</button>
      )}

      {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>Chargement...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apiKeys.filter(k => k.is_active).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Key size={16} color="#6366f1" />
                <div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{k.name}</div><div style={{ color: '#94a3b8', fontSize: 11 }}><code>{k.key_prefix}</code> · {k.partner_name || 'Global'} · Créée {fmtDate(k.created_at)}{k.last_used_at && <> · Utilisée {fmtDate(k.last_used_at)}</>}</div></div>
              </div>
              <button onClick={() => handleRevoke(k.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
            </div>
          ))}
          {apiKeys.filter(k => k.is_active).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: 16, textAlign: 'center' }}>Aucune clé API active</div>}
        </div>
      )}
    </div>
  );
}

// ═══ TENANTS (Super Admin) ═══
function TenantsTab() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: '', slug: '', domain: '', primary_color: '#6366f1', secondary_color: '#8b5cf6', logo_url: '' });
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});

  const load = async () => {
    try { const d = await api.request('/tenants'); setTenants(d.tenants || []); } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!form.name || !form.slug) return;
    setSaving(true);
    try {
      await api.request('/tenants', { method: 'POST', body: JSON.stringify(form), headers: { 'Content-Type': 'application/json' } });
      setShowCreate(false); setForm({ name: '', slug: '', domain: '', primary_color: '#6366f1', secondary_color: '#8b5cf6', logo_url: '' }); load();
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  const startEdit = (t) => { setEditingId(t.id); setEditForm({ name: t.name, domain: t.domain || '', primary_color: t.primary_color, secondary_color: t.secondary_color, accent_color: t.accent_color || '#f59e0b', logo_url: t.logo_url || '' }); };

  const saveEdit = async () => {
    try {
      await api.request('/tenants/' + editingId, { method: 'PUT', body: JSON.stringify(editForm), headers: { 'Content-Type': 'application/json' } });
      setEditingId(null); load();
    } catch (e) { alert(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Tenants</h3>
          <p style={{ color: '#64748b', fontSize: 13, marginTop: 4 }}>Gérez vos clients en white-label</p>
        </div>
        <button onClick={() => setShowCreate(!showCreate)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: showCreate ? '#f1f5f9' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: showCreate ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {showCreate ? <X size={14} /> : <Plus size={14} />} {showCreate ? 'Annuler' : 'Nouveau tenant'}
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div style={{ background: '#f8fafc', borderRadius: 14, padding: 20, marginBottom: 20, border: '1px solid #e2e8f0' }} className="fade-in">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom *</label><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mon Client SaaS" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Slug *</label><input value={form.slug} onChange={e => setForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="mon-client" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'monospace' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Domaine</label><input value={form.domain} onChange={e => setForm(f => ({ ...f, domain: e.target.value }))} placeholder="app.monclient.com" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>URL Logo</label><input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://..." style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Couleur primaire</label><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }} /><code style={{ fontSize: 12, color: '#64748b' }}>{form.primary_color}</code></div></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Couleur secondaire</label><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="color" value={form.secondary_color} onChange={e => setForm(f => ({ ...f, secondary_color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }} /><code style={{ fontSize: 12, color: '#64748b' }}>{form.secondary_color}</code></div></div>
          </div>
          <button onClick={handleCreate} disabled={saving || !form.name || !form.slug} style={{ padding: '10px 20px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>{saving ? 'Création...' : 'Créer le tenant'}</button>
        </div>
      )}

      {/* Edit modal */}
      {editingId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setEditingId(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
          <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, padding: 32, width: 520, maxWidth: '90%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
            <h3 style={{ fontSize: 20, fontWeight: 800, marginBottom: 24, color: '#0f172a' }}>Modifier le tenant</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Nom</label><input value={editForm.name || ''} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>Domaine</label><input value={editForm.domain || ''} onChange={e => setEditForm(f => ({ ...f, domain: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
              <div style={{ gridColumn: '1 / -1' }}><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>URL Logo</label><input value={editForm.logo_url || ''} onChange={e => setEditForm(f => ({ ...f, logo_url: e.target.value }))} style={{ width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', marginTop: 4 }} /></div>
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 16 }}>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Primaire</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={editForm.primary_color || '#6366f1'} onChange={e => setEditForm(f => ({ ...f, primary_color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }} /><code style={{ fontSize: 11 }}>{editForm.primary_color}</code></div></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Secondaire</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={editForm.secondary_color || '#8b5cf6'} onChange={e => setEditForm(f => ({ ...f, secondary_color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }} /><code style={{ fontSize: 11 }}>{editForm.secondary_color}</code></div></div>
              <div><label style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>Accent</label><div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}><input type="color" value={editForm.accent_color || '#f59e0b'} onChange={e => setEditForm(f => ({ ...f, accent_color: e.target.value }))} style={{ width: 36, height: 36, border: 'none', borderRadius: 8, cursor: 'pointer' }} /><code style={{ fontSize: 11 }}>{editForm.accent_color}</code></div></div>
            </div>
            {/* Preview */}
            <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', marginBottom: 8 }}>Aperçu</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, background: editForm.primary_color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>{(editForm.name || 'T')[0]}</div>
                <div><div style={{ fontWeight: 700, color: '#0f172a' }}>{editForm.name || 'Tenant'}</div><div style={{ fontSize: 12, color: '#94a3b8' }}>{editForm.domain || 'aucun domaine'}</div></div>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.primary_color }} title="Primaire" />
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.secondary_color }} title="Secondaire" />
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: editForm.accent_color }} title="Accent" />
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
              <button onClick={() => setEditingId(null)} style={{ flex: 1, padding: 12, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Annuler</button>
              <button onClick={saveEdit} style={{ flex: 1, padding: 12, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>Sauvegarder</button>
            </div>
          </div>
        </div>
      )}

      {/* Tenants list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {tenants.map(t => (
          <div key={t.id} onClick={() => startEdit(t)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0', cursor: 'pointer', transition: 'all 0.15s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor = '#c7d2fe'} onMouseLeave={e => e.currentTarget.style.borderColor = '#e2e8f0'}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 42, height: 42, borderRadius: 12, background: t.primary_color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 18 }}>
                {t.logo_url ? <img src={t.logo_url} alt="" style={{ width: 24, height: 24, borderRadius: 4 }} /> : t.name[0]}
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{t.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
                  <code style={{ fontSize: 11, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: 4 }}>{t.slug}</code>
                  {t.domain && <span style={{ fontSize: 12, color: '#64748b' }}>{t.domain}</span>}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ display: 'flex', gap: 3 }}>
                <div style={{ width: 16, height: 16, borderRadius: 3, background: t.primary_color || '#6366f1' }} />
                <div style={{ width: 16, height: 16, borderRadius: 3, background: t.secondary_color || '#8b5cf6' }} />
                <div style={{ width: 16, height: 16, borderRadius: 3, background: t.accent_color || '#f59e0b' }} />
              </div>
              <span style={{ padding: '3px 10px', borderRadius: 8, fontSize: 11, fontWeight: 600, background: t.is_active ? '#f0fdf4' : '#fef2f2', color: t.is_active ? '#16a34a' : '#dc2626' }}>{t.is_active ? 'Actif' : 'Inactif'}</span>
            </div>
          </div>
        ))}
        {tenants.length === 0 && <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontSize: 14 }}>Aucun tenant configuré</div>}
      </div>
    </div>
  );
}
