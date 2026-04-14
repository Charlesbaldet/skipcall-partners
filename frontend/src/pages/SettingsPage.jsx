import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import {
  Trophy, Plus, Edit2,
  Palette,
  Link2,
  X, User, Users, Lock, Eye, EyeOff, UserPlus, Shield, Briefcase,
  CheckCircle, Copy, ToggleLeft, ToggleRight, Plug, Key, Trash2, ExternalLink, Globe, Store,
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

const ROLE_CONFIG = {
  admin: { label: 'Admin', icon: Shield, color: '#dc2626', bg: '#fef2f2' },
  commercial: { label: 'Membre', icon: Briefcase, color: '#0891b2', bg: '#ecfeff' },
};


const SECTORS_MKT = ['SaaS / Logiciel','Conseil & Services','Finance & Fintech','RH & Recrutement','Marketing & Communication','Immobilier','Santé','E-commerce','Formation','Juridique','Comptabilité','Industrie','Autre'];

function MarketplaceTab() {
  const { t } = useTranslation();
  const [settings, setSettings] = useState({ sector:'', website:'', icp:'', short_description:'', marketplace_visible:false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.getMarketplaceSettings().then(d=>setSettings(s=>({...s,...d.settings}))).catch(()=>{/* route not yet on backend */}).finally(()=>setLoading(false));
  }, []);

  const set = (k,v) => setSettings(s=>({...s,[k]:v}));

  const handleSave = async () => {
    setError(''); setSuccess(''); setSaving(true);
    try {
      const d = await api.updateMarketplaceSettings(settings);
      setSettings(s=>({...s,...d.settings}));
      setSuccess('Paramètres marketplace mis à jour.');
      setTimeout(()=>setSuccess(''), 3500);
    } catch(e) { setError(e.message?.includes('DOCTYPE') ? 'Route API non disponible - déployez le backend feat/marketplace' : e.message); } finally { setSaving(false); }
  };

  const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:14, fontFamily:'inherit', color:'#0f172a', outline:'none', boxSizing:'border-box', transition:'border-color .2s' };

  if (loading) return <div style={{textAlign:'center',padding:48,color:'#64748b'}}>Chargement…</div>;
  return (
    <div style={{maxWidth:640}}>
      <div style={{marginBottom:28}}>
        <h2 style={{fontSize:20,fontWeight:800,color:'#0f172a',margin:'0 0 6px'}}>{t('settings.marketplace_section')}</h2>
        <p style={{color:'#64748b',fontSize:14,margin:0,lineHeight:1.6}}>{t('settings.marketplace_desc')}</p>
      </div>
      {/* Toggle visibilité */}
      <div onClick={()=>set('marketplace_visible',!settings.marketplace_visible)} style={{background:settings.marketplace_visible?'linear-gradient(135deg,#ecfdf5,#d1fae5)':'#f8fafc',border:`1.5px solid ${settings.marketplace_visible?'#059669':'#e2e8f0'}`,borderRadius:12,padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28,cursor:'pointer',transition:'all .3s'}}>
        <div style={{display:'flex',alignItems:'center',gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:settings.marketplace_visible?'#059669':'#e2e8f0',display:'flex',alignItems:'center',justifyContent:'center',transition:'background .3s'}}>
            <Globe size={18} color={settings.marketplace_visible?'#fff':'#94a3b8'}/>
          </div>
          <div>
            <div style={{fontWeight:700,fontSize:14,color:'#0f172a'}}>{t('settings.marketplace_visible')}</div>
            <div style={{fontSize:12,color:'#64748b'}}>{settings.marketplace_visible?t('settings.marketplace_visible_shown'):t('settings.marketplace_hidden')}</div>
          </div>
        </div>
        <div style={{width:48,height:26,borderRadius:13,background:settings.marketplace_visible?'#059669':'#cbd5e1',position:'relative',transition:'background .3s',flexShrink:0}}>
          <div style={{position:'absolute',top:3,left:settings.marketplace_visible?24:3,width:20,height:20,borderRadius:'50%',background:'#fff',boxShadow:'0 1px 4px rgba(0,0,0,.2)',transition:'left .3s'}}/>
        </div>
      </div>
      {/* Secteur */}
      <div style={{marginBottom:20}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_sector')}*</label>
        <select value={settings.sector} onChange={e=>set('sector',e.target.value)} style={{...inp,background:'#fff'}} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}>
          <option value="">{t('settings.marketplace_choose_sector')}</option>
          {SECTORS_MKT.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {/* {t('settings.marketplace_website')} */}
      <div style={{marginBottom:20}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_website')} *</label>
        <input type="url" value={settings.website} onChange={e=>set('website',e.target.value)} placeholder={t('settings.marketplace_website_ph')} style={inp} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
      </div>
      {/* ICP */}
      <div style={{marginBottom:20}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_icp')} <span style={{fontWeight:400,color:'#6474b'}}>({t('common.optional')})</span></label>
        <input value={settings.icp} onChange={e=>set('icp',e.target.value)} placeholder={t('settings.marketplace_target_ph')} style={inp} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
      </div>
      {/* Description */}
      <div style={{marginBottom:28}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_desc_label')} *</label>
        <textarea value={settings.short_description} onChange={e=>set('short_description',e.target.value)} placeholder={t('settings.marketplace_desc_ph')} rows={4} style={{...inp,resize:'vertical',lineHeight:1.6}} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
        <p style={{fontSize:11,color:'#94a3b8',margin:'4px 0 0'}}>{settings.short_description?.length||0}/500 {t('settings.marketplace_chars')}</p>
      </div>
      {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'12px 16px',color:'#dc2626',fontSize:13,marginBottom:16}}>{error}</div>}
      {success && <div style={{background:'#ecfdf5',border:'1px solid #6ee7b7',borderRadius:10,padding:'12px 16px',color:'#059669',fontSize:13,marginBottom:16}}>{success}</div>}
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <button onClick={handleSave} disabled={saving} style={{padding:'12px 28px',borderRadius:10,border:'none',background:saving?'#94a3b8':'linear-gradient(135deg,#059669,#10b981)',color:'#fff',fontWeight:700,fontSize:14,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',boxShadow:saving?'none':'0 4px 16px rgba(5,150,105,.35)'}}>
          {saving?t('settings.saving'):t('settings.save')}
        </button>
        <a href="/marketplace" target="_blank" rel="noopener noreferrer" style={{display:'flex',alignItems:'center',gap:6,padding:'12px 20px',borderRadius:10,border:'1.5px solid #059669',color:'#059669',fontWeight:600,fontSize:13,textDecoration:'none'}}>
          <Globe size={14}/>{t('settings.marketplace_view')}
        </a>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const isSuperadmin = user?.role === 'superadmin';
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'account');
  const handleClose = () => navigate(-1);

  const NAV = [
    { id: 'account', icon: User, label: t('settings.tab_account') },
    ...(isSuperadmin ? [
      { id: 'superadmins', icon: Users, label: t('settings.tab_members') },
    ] : []),
    ...(isAdmin ? [
    { id: 'marketplace', icon: Store, label: t('settings.tab_marketplace') },
      { id: 'members', icon: Users, label: t('settings.tab_members') },
      { id: 'integrations', icon: Plug, label: t('settings.tab_integrations') },
      { id: 'public-link', icon: Link2, label: t('settings.tab_public_link') },
      { id: 'appearance', icon: Palette, label: t('settings.tab_appearance') },
    ] : []),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 920, maxWidth: '100%', height: '85vh', maxHeight: 700, display: 'flex', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        {/* Left sidebar */}
        <div style={{ width: 220, background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '28px 12px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', padding: '0 12px', marginBottom: 20 }}>{t('settings.title')}</h2>
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
            {tab === 'superadmins' && <SuperAdminsTab />}
            {tab === 'members' && isAdmin && <MembersTab />}
            {tab === 'integrations' && isAdmin && <IntegrationsTab />}
              {tab === 'public-link' && isAdmin && <PublicLinkTab />}
              {tab === 'appearance' && isAdmin && <AppearanceTab />}
              {tab === 'program' && isAdmin && <ProgramTab />}
              {tab === 'marketplace' && isAdmin && <MarketplaceTab />}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══ MON COMPTE ═══
function AccountTab({ user }) {
  const { t } = useTranslation();
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);
  const [showPw, setShowPw] = useState(false);
  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  const handlePasswordChange = async () => {
    if (pwForm.newPw.length < 8) { setPwMsg({ type: 'error', text: t('settings.password_min8') }); return; }
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({ type: 'error', text: 'Les mots de passe ne correspondent pas' }); return; }
    setPwSaving(true); setPwMsg(null);
    try { await api.changePassword(pwForm.current, pwForm.newPw); setPwMsg({ type: 'success', text: t('settings.password_updated') }); setPwForm({ current: '', newPw: '', confirm: '' }); }
    catch (err) { setPwMsg({ type: 'error', text: err.message }); }
    setPwSaving(false);
  };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>{t('settings.tab_account')}</h3>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: 20, background: '#f8fafc', borderRadius: 14, marginBottom: 28, border: '1px solid #e2e8f0' }}>
        <div style={{ width: 48, height: 48, borderRadius: 14, background: user?.role === 'admin' ? '#6366f1' : user?.role === 'commercial' ? '#0891b2' : '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 20 }}>
          {user?.fullName?.charAt(0) || '?'}
        </div>
        <div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 16 }}>{user?.fullName}</div>
          <div style={{ color: '#64748b', fontSize: 13 }}>{user?.email} · <span style={{ textTransform: 'capitalize', color: 'var(--rb-primary, #059669)', fontWeight: 600 }}>{user?.role}</span></div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <Lock size={16} color="#6366f1" />
        <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{t('settings.change_pwd')}</h4>
      </div>
      {pwMsg && (<div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 14, fontSize: 13, fontWeight: 500, background: pwMsg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: pwMsg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${pwMsg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>{pwMsg.text}</div>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
        <div>
          <label style={labelStyle}>{t('changePwd.current')}</label>
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} style={inputStyle} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div><label style={labelStyle}>{t('changePwd.new_pwd')}</label><input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder={t('settings.password_min8')} style={inputStyle} /></div>
        <div><label style={labelStyle}>{t('changePwd.confirm')}</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} /></div>
        <button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} style={{ padding: '11px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: pwSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: 'fit-content' }}><Lock size={14} /> {pwSaving ? t('settings.saving') : t('settings.update')}</button>
      </div>
    </div>
  );
}

// ═══ SUPER ADMINS (vue superadmin) ═══
function SuperAdminsTab() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [superadmins, setSuperadmins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saEmail, setSaEmail] = useState('');
  const [saName, setSaName] = useState('');
  const [saSubmitting, setSaSubmitting] = useState(false);

  const loadSuperadmins = async () => {
    setLoading(true);
    try {
      const data = await api.request('/super-admin/superadmins');
      setSuperadmins(data.superadmins || []);
    } catch (e) {
      console.error('Failed to load superadmins:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadSuperadmins(); }, []);

  const handleInvite = async () => {
    if (!saEmail) return;
    setSaSubmitting(true);
    try {
      await api.request('/super-admin/invite-superadmin', { method: 'POST', body: JSON.stringify({ email: saEmail, full_name: saName || saEmail }), headers: { 'Content-Type': 'application/json' } });
      alert('✅ Super admin invité ! Email envoyé à ' + saEmail);
      setSaEmail('');
      setSaName('');
      loadSuperadmins();
    } catch (e) {
      alert('❌ Erreur : ' + e.message);
    }
    setSaSubmitting(false);
  };

  const handleDeleteSA = async (sa) => {
    if (!window.confirm(t('settings.confirm_remove_superadmin', {name: sa.full_name || sa.email}))) return;
    try {
      await api.request('/super-admin/delete-superadmin/' + sa.id, { method: 'DELETE' });
      alert('Super admin supprim\u00e9');
      loadSuperadmins();
    } catch (e) {
      alert('Erreur : ' + e.message);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{t('settings.superadmins_title')}</h2>
        <p style={{ margin: 0, fontSize: 14, color: '#64748b' }}>{t('settings.superadmins_desc')}</p>
      </div>

      <div style={{ marginBottom: 24, padding: 20, background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 12 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 700, color: '#581c87' }}>{t('settings.invite_superadmin')}</h3>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b21a8' }}>Donne accès à la gestion de tous les tenants de la plateforme.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="email" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder="email@exemple.com" style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box' }} />
          <input type="text" value={saName} onChange={e => setSaName(e.target.value)} placeholder={t('onboarding.full_name')} style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box' }} />
          <button disabled={saSubmitting || !saEmail} onClick={handleInvite} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saSubmitting ? 'not-allowed' : 'pointer', opacity: saSubmitting ? 0.6 : 1, whiteSpace: 'nowrap' }}>{saSubmitting ? 'Envoi...' : 'Inviter'}</button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>Liste ({superadmins.length})</h3>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>Chargement...</div>
        ) : superadmins.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>Aucun super administrateur</div>
        ) : (
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            {superadmins.map((sa, idx) => (
              <div key={sa.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderTop: idx === 0 ? 'none' : '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#7c3aed', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14 }}>{(sa.full_name || sa.email).charAt(0).toUpperCase()}</div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#0f172a' }}>{sa.full_name || '—'}</div>
                    <div style={{ fontSize: 13, color: '#64748b' }}>{sa.email}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: sa.is_active ? '#d1fae5' : '#fee2e2', color: sa.is_active ? '#065f46' : '#991b1b', fontSize: 12, fontWeight: 600 }}>{sa.is_active ? 'Actif' : 'Inactif'}</span>
                  {sa.id !== user?.id && <button onClick={() => handleDeleteSA(sa)} style={{ padding: '4px 10px', borderRadius: 999, background: '#fee2e2', color: '#991b1b', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}>{t('common.delete')}</button>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ MEMBRES ═══
function MembersTab() {
  const { t } = useTranslation();
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
  const founderAdminId = users.filter(u => u.role === 'admin').sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0]?.id;

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
        <button onClick={() => { setShowInvite(!showInvite); setInviteResult(null); }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: showInvite ? '#f1f5f9' : 'var(--rb-primary, #059669)', color: showInvite ? '#475569' : '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          {showInvite ? <X size={14} /> : <UserPlus size={14} />} {showInvite ? t('settings.cancel') : t('settings.add')}
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
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontSize: 11 }}>{t('settings.temp_password')}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <code style={{ background: '#eef2ff', padding: '4px 10px', borderRadius: 6, color: 'var(--rb-primary, #059669)', fontWeight: 700, fontSize: 15 }}>{inviteResult.tempPassword}</code>
                    <button onClick={() => copyToClipboard(inviteResult.tempPassword)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 5, padding: 4, cursor: 'pointer', display: 'flex' }}>{copied ? <CheckCircle size={12} color="#16a34a" /> : <Copy size={12} color="#6366f1" />}</button>
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 12 }}><button onClick={() => { setShowInvite(false); setInviteResult(null); }} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>OK</button></div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom *</label><input value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} placeholder="Prénom Nom" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Email *</label><input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder="email@skipcall.com" type="email" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
              </div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.role')} *</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {Object.entries(ROLE_CONFIG).map(([k, v]) => (
                    <button key={k} onClick={() => setInviteForm(f => ({ ...f, role: k }))} style={{ padding: '8px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600, border: inviteForm.role === k ? `2px solid ${v.color}` : '2px solid #e2e8f0', background: inviteForm.role === k ? v.bg : '#fff', color: v.color, display: 'flex', alignItems: 'center', gap: 5 }}><v.icon size={13} /> {v.label}</button>
                  ))}
                </div>
              </div>
              <button onClick={handleInvite} disabled={sending || !inviteForm.email || !inviteForm.full_name} style={{ padding: '10px 20px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: sending ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6, width: 'fit-content' }}><UserPlus size={14} /> {sending ? t('settings.creating') : t('settings.create')}</button>
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
            <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{t('settings.delete_user_confirm')}</h3>
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Cette action est irréversible.</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteUserConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('settings.cancel')}</button>
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
                {u.role !== 'admin' && (<button onClick={() => api.updateAdminUser(u.id, { is_active: !u.is_active }).then(load)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', display: 'flex' }}>
                  {u.is_active ? <ToggleRight size={24} color="#16a34a" /> : <ToggleLeft size={24} color="#dc2626" />}
                </button>)}
                {u.id !== founderAdminId && (<button onClick={() => setDeleteUserConfirm(u.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 5, cursor: 'pointer', display: 'flex' }}>
                  <Trash2 size={14} color="#dc2626" />
                </button>)}
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
  const { t } = useTranslation();
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
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>Nom *</label><input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder={t('settings.integrations_zapier_ph')} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.role_partner')} ({t('common.optional')})</label><select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}><option value="">Aucun</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={creating || !keyName} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}><Key size={13} /> {creating ? t('settings.creating') : t('settings.api_generate')}</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowCreate(true); setNewKey(null); }} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}><Key size={14} /> {t('settings.api_key_create')}</button>
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

// ═══ LIEN PUBLIC ═══
function PublicLinkTab() {
  const { t } = useTranslation();
  const [tenant, setTenant] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    api.getMyTenant()
      .then(d => setTenant(d.tenant))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement...</div>;
  if (!tenant) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Impossible de charger les infos du tenant.</div>;

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const directLink = origin + '/r/' + (tenant.slug || '');
  const embedCode = '<iframe src="' + directLink + '" width="100%" height="700" frameborder="0" style="border-radius:12px;"></iframe>';

  const copy = (key, text) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.public_link_title')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Partage ce lien avec tes apporteurs d'affaires pour qu'ils puissent s'inscrire eux-mêmes. Tu valideras leurs candidatures depuis ton dashboard.</p>

      <div style={{ marginBottom: 28 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Lien direct</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <code style={{ flex: 1, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{directLink}</code>
          <button onClick={() => copy('link', directLink)} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: copied === 'link' ? '#dcfce7' : 'var(--rb-primary, #059669)',
            color: copied === 'link' ? '#166534' : '#fff',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {copied === 'link' ? <><CheckCircle size={14}/>{t('settings.link_copied')}</> : <><Copy size={14}/>{t('settings.copy_link')}</>}
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Tu peux le mettre dans tes emails, signatures, posts LinkedIn, etc.</p>
      </div>

      <div>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>Code à intégrer (iframe)</h4>
        <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <code style={{ display: 'block', fontSize: 12, color: '#0f172a', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.6 }}>{embedCode}</code>
          <button onClick={() => copy('embed', embedCode)} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: copied === 'embed' ? '#dcfce7' : 'var(--rb-primary, #059669)',
            color: copied === 'embed' ? '#166534' : '#fff',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {copied === 'embed' ? <><CheckCircle size={14}/>{t('settings.link_copied')}</> : <><Copy size={14}/> Copier le code</>}
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>Colle ce snippet dans ton site (WordPress, Webflow, Notion, etc.) pour intégrer le formulaire directement.</p>
      </div>
    </div>
  );
}

// ═══ APPARENCE ═══
function AppearanceTab() {
  const { t } = useTranslation();
  const [form, setForm] = useState({ name: '', revenue_model: 'CA', primary_color: '#059669', accent_color: '#f97316', logo_url: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    api.getMyTenant()
      .then(d => {
        if (d && d.tenant) {
          setForm({
            name: d.tenant.name || '',
            primary_color: d.tenant.primary_color || '#059669',
            revenue_model: d.tenant.revenue_model || 'CA',
            accent_color: d.tenant.accent_color || '#f97316',
            logo_url: d.tenant.logo_url || '',
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function slugify(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 50);
  }

  const save = async () => {
    setSaving(true); setMsg(null);
    try {
      const slug = slugify(form.name);
      const payload = { ...form, slug: slug || undefined };
      await api.updateMyTenant(payload);
      if (typeof window !== 'undefined' && window.__rbLoadTheme) window.__rbLoadTheme();
      setMsg({ type: 'success', text: slug ? `Apparence mise à jour ✓ Nouveau lien : /r/${slug}` : 'Apparence mise à jour ✓' });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur lors de la sauvegarde' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement...</div>;

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.tab_appearance')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.branding_desc')}</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <div>
          <label style={labelStyle}>{t('settings.branding_name')}</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Mon entreprise" style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>Modèle de revenus</label>
          <select value={form.revenue_model || 'CA'} onChange={e => setForm(f => ({ ...f, revenue_model: e.target.value }))} style={inputStyle}>
            <option value="MRR">MRR — Revenu mensuel récurrent</option>
            <option value="ARR">ARR — Revenu annuel récurrent</option>
            <option value="CA">CA — Chiffre d'affaires (one-shot)</option>
            <option value="Other">Autre</option>
          </select>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>Type de revenus principal — utilisé pour adapter les libellés du dashboard</p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div>
            <label style={labelStyle}>{t('settings.branding_primary')}</label>
            <input type="color" value={form.primary_color} onChange={e => setForm(f => ({ ...f, primary_color: e.target.value }))} style={{ ...inputStyle, height: 44, padding: 4, cursor: 'pointer' }} />
          </div>
          <div>
            <label style={labelStyle}>{t('settings.branding_accent')}</label>
            <input type="color" value={form.accent_color} onChange={e => setForm(f => ({ ...f, accent_color: e.target.value }))} style={{ ...inputStyle, height: 44, padding: 4, cursor: 'pointer' }} />
          </div>
        </div>

        <div>
          <label style={labelStyle}>{t('settings.branding_logo')}</label>
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder="https://exemple.com/logo.png" style={inputStyle} />
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>Colle l'URL d'une image hébergée. Format recommandé : PNG transparent, hauteur ~80px.</p>
          {form.logo_url && (
            <div style={{ marginTop: 12, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <img src={form.logo_url} alt="Aperçu" style={{ maxHeight: 60, maxWidth: '100%' }} onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}
        </div>

        <button onClick={save} disabled={saving} style={{
          padding: '12px 24px', borderRadius: 10, border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 700, fontSize: 14,
          width: 'fit-content', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Palette size={16} /> {saving ? 'Sauvegarde...' : t('settings.save')}
        </button>
      </div>
    </div>
  );
}

// ═══ PROGRAMME ═══
function ProgramTab() {
  const { t } = useTranslation();
  const [data, setData] = useState({ levels: [], threshold_type: 'deals' });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // level id or 'new'
  const [form, setForm] = useState({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10 });
  const [msg, setMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getTenantLevels();
      setData({ levels: d.levels || [], threshold_type: d.threshold_type || 'deals' });
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur' });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setType = async (type) => {
    try {
      await api.setTenantLevelThresholdType(type);
      setData(d => ({ ...d, threshold_type: type }));
      setMsg({ type: 'success', text: 'Critère mis à jour ✓' });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const startEdit = (l) => {
    setForm({
      name: l.name || '',
      icon: l.icon || '⭐',
      color: l.color || '#94a3b8',
      min_threshold: parseFloat(l.min_threshold) || 0,
      commission_rate: parseFloat(l.commission_rate) || 10,
    });
    setEditing(l.id);
  };

  const startNew = () => {
    setForm({ name: '', icon: '⭐', color: '#94a3b8', min_threshold: 0, commission_rate: 10 });
    setEditing('new');
  };

  const save = async () => {
    if (!form.name) { setMsg({ type: 'error', text: 'Le nom est requis' }); return; }
    try {
      if (editing === 'new') {
        await api.createTenantLevel({ ...form, position: data.levels.length });
      } else {
        await api.updateTenantLevel(editing, form);
      }
      setEditing(null);
      await load();
      setMsg({ type: 'success', text: t('settings.level_saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || 'Erreur' });
    }
  };

  const del = async (id) => {
    if (!window.confirm(t('settings.confirm_delete_level'))) return;
    try {
      await api.deleteTenantLevel(id);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const reset = async () => {
    if (!window.confirm(t('settings.levels_reset_confirm'))) return;
    try {
      await api.resetTenantLevels();
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>Chargement...</div>;

  const isDeal = data.threshold_type === 'deals';
  const unitLabel = isDeal ? t('programme.unit_deals') : t('programme.unit_volume');
  const thresholdInputLabel = isDeal ? t('programme.threshold_deals') : t('programme.threshold_volume');

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 11, marginBottom: 4 };

  const formBlock = (
    <div style={{ padding: 16, background: '#fffbeb', borderRadius: 12, border: '2px dashed #fbbf24', marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>Nom</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Bronze, Diamant..." />
        </div>
        <div>
          <label style={labelStyle}>{t('programme.level_icon')}</label>
          <input style={{ ...inputStyle, textAlign: 'center', fontSize: 18 }} value={form.icon} onChange={e => setForm(f => ({ ...f, icon: e.target.value }))} maxLength="2" />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '70px 1fr 1fr', gap: 10, marginBottom: 12 }}>
        <div>
          <label style={labelStyle}>{t('programme.level_color')}</label>
          <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} style={{ ...inputStyle, height: 36, padding: 2, cursor: 'pointer' }} />
        </div>
        <div>
          <label style={labelStyle}>{thresholdInputLabel}</label>
          <input type="number" min="0" step={isDeal ? '1' : '100'} style={inputStyle} value={form.min_threshold} onChange={e => setForm(f => ({ ...f, min_threshold: parseFloat(e.target.value) || 0 }))} />
        </div>
        <div>
          <label style={labelStyle}>{t('programme.level_rate')}</label>
          <input type="number" min="0" max="100" step="0.5" style={inputStyle} value={form.commission_rate} onChange={e => setForm(f => ({ ...f, commission_rate: parseFloat(e.target.value) || 0 }))} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={save} style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.save')}</button>
        <button onClick={() => setEditing(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.cancel')}</button>
      </div>
    </div>
  );

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.program_section')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>Configure les niveaux et les commissions de ton programme. Les partenaires montent de niveau automatiquement selon leur performance.</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      {/* Threshold type */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 10 }}>Critère de progression</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setType('deals')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: isDeal ? '#f0fdf4' : '#fff', color: isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>🎯 Nombre de deals gagnés</button>
          <button onClick={() => setType('volume')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (!isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: !isDeal ? '#f0fdf4' : '#fff', color: !isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>💰 Volume d'affaires (€)</button>
        </div>
      </div>

      {/* Levels list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
        {data.levels.map(l => editing === l.id ? (
          <div key={l.id}>{formBlock}</div>
        ) : (
          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: (l.color || '#94a3b8') + '20', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{l.icon || '⭐'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, color: l.color || '#0f172a', fontSize: 15 }}>{l.name}</div>
              <div style={{ color: '#64748b', fontSize: 12 }}>{t('programme.level_desc', {min: parseFloat(l.min_threshold), unit: unitLabel, rate: parseFloat(l.commission_rate)})}</div>
            </div>
            <button onClick={() => startEdit(l)} title="Éditer" style={{ padding: 8, borderRadius: 8, border: 'none', background: '#eef2ff', cursor: 'pointer', display: 'flex' }}><Edit2 size={14} color="#6366f1" /></button>
            <button onClick={() => del(l.id)} title="Supprimer" style={{ padding: 8, borderRadius: 8, border: 'none', background: '#fef2f2', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
          </div>
        ))}
        {editing === 'new' && formBlock}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <button onClick={startNew} disabled={editing !== null} style={{
          padding: '10px 18px', borderRadius: 10, border: 'none',
          background: editing !== null ? '#e2e8f0' : 'var(--rb-primary, #059669)',
          color: editing !== null ? '#94a3b8' : '#fff',
          fontWeight: 600, fontSize: 13, cursor: editing !== null ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', gap: 6,
        }}><Plus size={14} />{t('programme.add_level')}</button>
        <button onClick={reset} style={{
          padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>Réinitialiser aux valeurs par défaut</button>
      </div>
    </div>
  );
}
