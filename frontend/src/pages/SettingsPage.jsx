import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import {
  X, User, Users, Lock, Eye, EyeOff, UserPlus, Shield, Briefcase,
  CheckCircle, Copy, ToggleLeft, ToggleRight, Plug, Key, Trash2, ExternalLink,
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
    ] : []),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{
        position: 'relative', background: '#fff', borderRadius: 24, width: 920, maxWidth: '100%',
        height: '85vh', maxHeight: 700, display: 'flex', overflow: 'hidden',
        boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
      }}>
        {/* Left sidebar */}
        <div style={{ width: 220, background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '28px 12px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', padding: '0 12px', marginBottom: 20 }}>Paramètres</h2>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map(item => (
              <button key={item.id} onClick={() => setTab(item.id)} style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 10,
                border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left',
                background: tab === item.id ? '#fff' : 'transparent',
                color: tab === item.id ? '#0f172a' : '#64748b',
                boxShadow: tab === item.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
                <item.icon size={16} /> {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Right content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <button onClick={handleClose} style={{
            position: 'absolute', top: 24, right: 24, width: 36, height: 36, borderRadius: 10, zIndex: 10,
            background: '#f1f5f9', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <X size={18} color="#475569" />
          </button>
          <div style={{ padding: '32px 32px 32px 32px', paddingRight: 64 }}>
            {tab === 'account' && <AccountTab user={user} />}
            {tab === 'members' && isAdmin && <MembersTab />}
            {tab === 'integrations' && isAdmin && <IntegrationsTab />}
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
    try {
      await api.changePassword(pwForm.current, pwForm.newPw);
      setPwMsg({ type: 'success', text: 'Mot de passe mis à jour !' });
      setPwForm({ current: '', newPw: '', confirm: '' });
    } catch (err) { setPwMsg({ type: 'error', text: err.message }); }
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
      {pwMsg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500,
          background: pwMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: pwMsg.type === 'success' ? '#16a34a' : '#dc2626',
          border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>{pwMsg.text}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
        <div>
          <label style={labelStyle}>Mot de passe actuel</label>
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} style={inputStyle} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
              {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>
        <div><label style={labelStyle}>Nouveau mot de passe</label><input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder="Minimum 8 caractères" style={inputStyle} /></div>
        <div><label style={labelStyle}>Confirmer</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} /></div>
        <button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} style={{
          padding: '11px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: pwSaving ? 0.7 : 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: 'fit-content',
        }}><Lock size={14} /> {pwSaving ? 'Mise à jour...' : 'Mettre à jour'}</button>
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

  const load = async () => { try { const u = await api.getAdminUsers(); setUsers(u.users); } catch {} setLoading(false); };
  useEffect(() => { load(); }, []);

  const handleInvite = async () => {
    setSending(true); setInviteResult(null);
    try {
      const data = await api.inviteUser(inviteForm);
      setInviteResult({ email: data.email || inviteForm.email, tempPassword: data.tempPassword });
      setInviteForm({ email: '', full_name: '', role: 'commercial' }); load();
    } catch (err) { alert(err.message); }
    setSending(false);
  };

  const copyToClipboard = (t) => { navigator.clipboard.writeText(t); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement...</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>Membres</h3>
        <button onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }} style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10,
          background: showInvite ? '#f1f5f9' : 'linear-gradient(135deg,#6366f1,#8b5cf6)',
          color: showInvite ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>{showInvite ? <X size={14} /> : <UserPlus size={14} />} {showInvite ? 'Annuler' : 'Ajouter'}</button>
      </div>
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
                    <button onClick={() => copyToClipboard(inviteResult.tempPassword)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 5, padding: 4, cursor: 'pointer', display: 'flex' }}>
                      {copied ? <CheckCircle size={12} color="#16a34a" /> : <Copy size={12} color="#6366f1" />}
                    </button>
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
                  {u.is_active ? <ToggleRight size={18} color="#16a34a" /> : <ToggleLeft size={18} color="#dc2626" />}
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

  const load = async () => {
    try {
      const [k, p] = await Promise.all([api.getApiKeys(), api.getPartners()]);
      setApiKeys(k.apiKeys || []);
      setPartners(p.partners || []);
    } catch {} setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const data = await api.createApiKey({ name: keyName, partner_id: partnerId || null });
      setNewKey(data.apiKey);
      setKeyName(''); setPartnerId('');
      load();
    } catch (err) { alert(err.message); }
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

      {/* CRM cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 28 }}>
        {CRM_CARDS.map(crm => (
          <div key={crm.name} style={{ padding: 20, borderRadius: 14, border: '1px solid #e2e8f0', background: '#fff', position: 'relative', opacity: 0.7 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: crm.color + '15', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 16, color: crm.color }}>{crm.name[0]}</div>
              <div>
                <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 15 }}>{crm.name}</div>
                {crm.soon && <span style={{ fontSize: 10, fontWeight: 600, color: '#f59e0b', background: '#fffbeb', padding: '2px 6px', borderRadius: 4 }}>Bientôt</span>}
              </div>
            </div>
            <p style={{ color: '#64748b', fontSize: 13, lineHeight: 1.5 }}>{crm.desc}</p>
          </div>
        ))}
      </div>

      {/* Open API */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Key size={16} color="#6366f1" />
        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Open API</h4>
      </div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>
        Créez des clés API pour intégrer Skipcall avec vos outils (Zapier, Make, n8n, custom).
        Documentation : <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>POST /api/v1/referrals</code> · <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>GET /api/v1/referrals</code>
      </p>

      {/* New key display */}
      {newKey && (
        <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #fde68a' }} className="fade-in">
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 8 }}>Copiez cette clé maintenant — elle ne sera plus affichée</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ background: '#fff', padding: '8px 12px', borderRadius: 8, color: '#0f172a', fontWeight: 600, fontSize: 14, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{newKey}</code>
            <button onClick={() => copyToClipboard(newKey)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>
              {copied ? <CheckCircle size={16} color="#16a34a" /> : <Copy size={16} color="#6366f1" />}
            </button>
          </div>
        </div>
      )}

      {/* Create key form */}
      {showCreate ? (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom de la clé *</label>
              <input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder="Ex: Zapier Integration" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Lier à un partenaire (optionnel)</label>
              <select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}>
                <option value="">Aucun (accès global)</option>
                {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={creating || !keyName} style={{ padding: '8px 16px', borderRadius: 8, background: '#6366f1', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Key size={13} /> {creating ? 'Création...' : 'Générer la clé'}
            </button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Annuler</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowCreate(true); setNewKey(null); }} style={{ padding: '8px 16px', borderRadius: 10, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}>
          <Key size={14} /> Créer une clé API
        </button>
      )}

      {/* API keys list */}
      {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>Chargement...</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apiKeys.filter(k => k.is_active).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Key size={16} color="#6366f1" />
                <div>
                  <div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{k.name}</div>
                  <div style={{ color: '#94a3b8', fontSize: 11 }}>
                    <code>{k.key_prefix}</code> · {k.partner_name || 'Global'} · Créée {fmtDate(k.created_at)}
                    {k.last_used_at && <> · Dernière utilisation {fmtDate(k.last_used_at)}</>}
                  </div>
                </div>
              </div>
              <button onClick={() => handleRevoke(k.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}>
                <Trash2 size={14} color="#dc2626" />
              </button>
            </div>
          ))}
          {apiKeys.filter(k => k.is_active).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: 16, textAlign: 'center' }}>Aucune clé API active</div>}
        </div>
      )}
    </div>
  );
}
