import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../hooks/useAuth.jsx';
import LanguageSwitcher from '../components/LanguageSwitcher';
import PipelineStagesEditor from '../components/PipelineStagesEditor.jsx';
import WebhooksSection from '../components/WebhooksSection.jsx';
import {
  Trophy, Plus, Edit2,
  Palette,
  Link2,
  X, User, Users, Lock, Eye, EyeOff, UserPlus, Shield, Briefcase,
  CheckCircle, Copy, ToggleLeft, ToggleRight, Plug, Key, Trash2, ExternalLink, Globe, Store,
  Bell,
} from 'lucide-react';

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

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
      setSuccess(t('settings.marketplace_saved_long'));
      setTimeout(()=>setSuccess(''), 3500);
    } catch(e) { setError(e.message?.includes('DOCTYPE') ? t('settings.marketplace_api_unavailable') : e.message); } finally { setSaving(false); }
  };

  const inp = { width:'100%', padding:'12px 14px', borderRadius:10, border:'1.5px solid #e2e8f0', fontSize:14, fontFamily:'inherit', color:'#0f172a', outline:'none', boxSizing:'border-box', transition:'border-color .2s' };

  if (loading) return <div style={{textAlign:'center',padding:48,color:'#64748b'}}>{t('settings.loading')}</div>;
  return (
    <div style={{maxWidth:640}}>
      <div style={{marginBottom:28}}>
        <h2 style={{fontSize:20,fontWeight:800,color:'#0f172a',margin:'0 0 6px'}}>{t('settings.marketplace_program_title')}</h2>
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
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_sector_required')}</label>
        <select value={settings.sector} onChange={e=>set('sector',e.target.value)} style={{...inp,background:'#fff'}} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}>
          <option value="">{t('settings.marketplace_choose_sector')}</option>
          {SECTORS_MKT.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      {/* Site web */}
      <div style={{marginBottom:20}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_website_required')}</label>
        <input type="url" value={settings.website} onChange={e=>set('website',e.target.value)} placeholder={t('settings.marketplace_website_ph')} style={inp} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
      </div>
      {/* ICP */}
      <div style={{marginBottom:20}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_icp')} <span style={{fontWeight:400,color:'#64748b'}}>{t('settings.marketplace_icp_optional_label')}</span></label>
        <input value={settings.icp} onChange={e=>set('icp',e.target.value)} placeholder={t('settings.marketplace_target_ph')} style={inp} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
      </div>
      {/* Description */}
      <div style={{marginBottom:28}}>
        <label style={{fontSize:13,fontWeight:700,color:'#0f172a',display:'block',marginBottom:6}}>{t('settings.marketplace_desc_required')}</label>
        <textarea value={settings.short_description} onChange={e=>set('short_description',e.target.value)} placeholder={t('settings.marketplace_desc_ph')} rows={4} style={{...inp,resize:'vertical',lineHeight:1.6}} onFocus={e=>e.target.style.borderColor='#059669'} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
        <p style={{fontSize:11,color:'#94a3b8',margin:'4px 0 0'}}>{settings.short_description?.length||0}/500 {t('settings.marketplace_chars')}</p>
      </div>
      {error && <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'12px 16px',color:'#dc2626',fontSize:13,marginBottom:16}}>{error}</div>}
      {success && <div style={{background:'#ecfdf5',border:'1px solid #6ee7b7',borderRadius:10,padding:'12px 16px',color:'#059669',fontSize:13,marginBottom:16}}>{success}</div>}
      <div style={{display:'flex',gap:12,alignItems:'center'}}>
        <button onClick={handleSave} disabled={saving} style={{padding:'12px 28px',borderRadius:10,border:'none',background:saving?'#94a3b8':'linear-gradient(135deg,#059669,#10b981)',color:'#fff',fontWeight:700,fontSize:14,cursor:saving?'not-allowed':'pointer',fontFamily:'inherit',boxShadow:saving?'none':'0 4px 16px rgba(5,150,105,.35)'}}>
          {saving?t('settings.marketplace_saving'):t('settings.marketplace_save')}
        </button>
        <a href="/marketplace" target="_blank" rel="noopener noreferrer" style={{display:'flex',alignItems:'center',gap:6,padding:'12px 20px',borderRadius:10,border:'1.5px solid #059669',color:'#059669',fontWeight:600,fontSize:13,textDecoration:'none'}}>
          <Globe size={14}/> {t('settings.marketplace_view')}
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
  const isPartner = user?.role === 'partner';
  const isSuperadmin = user?.role === 'superadmin';
  const [searchParams] = useSearchParams();
  // Map legacy tab IDs (deep-links, bookmarks, old emails) to the new
  // grouped tab IDs so existing URLs keep working.
  const LEGACY_TAB_MAP = {
    account: 'profile',
    members: 'team',
    superadmins: 'team',
    appearance: 'branding',
    'public-link': 'public-marketplace',
    marketplace: 'public-marketplace',
  };
  const initialTab = LEGACY_TAB_MAP[searchParams.get('tab')] || searchParams.get('tab') || 'profile';
  const [tab, setTab] = useState(initialTab);
  const handleClose = () => navigate(-1);

  // Grouped nav: each entry is either { section: 'label' } or a tab.
  // Admin sees all three sections; superadmin only sees COMPTE (since
  // they don't have program/preferences tabs wired).
  const NAV = [
    { section: t('layout.section.account') },
    { id: 'profile', icon: User, label: t('settings.tab_profile') },
    ...((isAdmin || isSuperadmin) ? [
      { id: 'team', icon: Users, label: t('settings.tab_team') },
    ] : []),
    ...(isAdmin ? [
      { section: t('layout.section.programme') },
      { id: 'branding', icon: Palette, label: t('settings.tab_branding') },
      { id: 'pipeline', icon: Trophy, label: t('settings.tab_pipeline') },
      { id: 'public-marketplace', icon: Store, label: t('settings.tab_public_marketplace') },

      { section: t('layout.section.preferences') },
      { id: 'notifications', icon: Bell, label: t('settings.tab_notifications_emails') },
      { id: 'integrations', icon: Plug, label: t('settings.tab_integrations') },
    ] : []),
    ...(isPartner ? [
      { section: t('layout.section.preferences') },
      { id: 'partner-notifications', icon: Bell, label: t('partner_notifications.tab', 'Notifications') },
    ] : []),
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div onClick={handleClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,23,42,0.6)', backdropFilter: 'blur(8px)' }} />
      <div className="fade-in" style={{ position: 'relative', background: '#fff', borderRadius: 24, width: 920, maxWidth: '100%', height: '85vh', maxHeight: 700, display: 'flex', overflow: 'hidden', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        {/* Left sidebar */}
        <div style={{ width: 240, background: '#f8fafc', borderRight: '1px solid #e2e8f0', padding: '28px 12px', display: 'flex', flexDirection: 'column' }}>
          <h2 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', padding: '0 12px', marginBottom: 20 }}>{t('settings.title')}</h2>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {NAV.map((item, i) => {
              if (item.section) {
                return (
                  <div
                    key={'sec-' + i}
                    style={{
                      fontSize: 10, textTransform: 'uppercase', letterSpacing: 1,
                      color: '#475569', fontWeight: 700,
                      padding: '12px 12px 4px',
                      marginTop: i === 0 ? 0 : 8,
                    }}
                  >
                    {item.section}
                  </div>
                );
              }
              return (
                <button key={item.id} onClick={() => setTab(item.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px 10px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 500, textAlign: 'left',
                  background: tab === item.id ? '#fff' : 'transparent', color: tab === item.id ? '#0f172a' : '#64748b',
                  boxShadow: tab === item.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}><item.icon size={16} /> {item.label}</button>
              );
            })}
          </nav>
        </div>
        {/* Right content */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          <button onClick={handleClose} style={{ position: 'absolute', top: 24, right: 24, width: 36, height: 36, borderRadius: 10, zIndex: 10, background: '#f1f5f9', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <X size={18} color="#475569" />
          </button>
          {/* Extra bottom padding so dropdowns near the bottom (e.g. the
              language switcher in Profil) aren't clipped by the
              scroll container's overflow: auto. */}
          <div style={{ padding: '72px 32px 120px 32px' }}>
            {tab === 'profile' && <AccountTab user={user} />}
            {tab === 'team' && isSuperadmin && <SuperAdminsTab />}
            {tab === 'team' && isAdmin && <MembersTab />}
            {tab === 'notifications' && isAdmin && <NotificationsTab />}
            {tab === 'partner-notifications' && isPartner && <PartnerNotificationsTab />}
            {tab === 'integrations' && isAdmin && <IntegrationsTab />}
            {tab === 'branding' && isAdmin && <AppearanceTab />}
            {tab === 'pipeline' && isAdmin && (
              <>
                <PipelineStagesEditor />
                <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />
                <PartnerCategoriesTab />
              </>
            )}
            {tab === 'public-marketplace' && isAdmin && (
              <>
                <MarketplaceTab />
                <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />
                <PublicLinkTab />
                <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />
                <TrackingFeaturesTab />
              </>
            )}
            {tab === 'program' && isAdmin && <ProgramTab />}
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
    if (pwForm.newPw !== pwForm.confirm) { setPwMsg({ type: 'error', text: t('settings.password_mismatch') }); return; }
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
          <label style={labelStyle}>{t('settings.pwd_current')}</label>
          <div style={{ position: 'relative' }}>
            <input type={showPw ? 'text' : 'password'} value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} style={inputStyle} />
            <button onClick={() => setShowPw(!showPw)} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>{showPw ? <EyeOff size={16} /> : <Eye size={16} />}</button>
          </div>
        </div>
        <div><label style={labelStyle}>{t('settings.pwd_new')}</label><input type="password" value={pwForm.newPw} onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))} placeholder={t('settings.password_min8')} style={inputStyle} /></div>
        <div><label style={labelStyle}>{t('settings.pwd_confirm')}</label><input type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} style={inputStyle} /></div>
        <button onClick={handlePasswordChange} disabled={pwSaving || !pwForm.current || !pwForm.newPw} style={{ padding: '11px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: pwSaving ? 0.7 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: 'fit-content' }}><Lock size={14} /> {pwSaving ? t('settings.updating') : t('settings.update')}</button>
      </div>

      {/* Language — moved out of the sidebar so the only language entry
          point lives in the user's account settings. */}
      <div style={{ marginTop: 36, paddingTop: 28, borderTop: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <Globe size={16} color="#6366f1" />
          <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('settings.language') || 'Langue'}</h4>
        </div>
        <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 14px', lineHeight: 1.55 }}>
          {t('settings.language_help') || 'Choisissez la langue d\'affichage de l\'interface.'}
        </p>
        <div style={{ maxWidth: 260 }}>
          <LanguageSwitcher direction="up" dark={false} style={{ width: '100%' }}/>
        </div>
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
      alert('✅ ' + t('settings.sa_invited_prefix') + saEmail);
      setSaEmail('');
      setSaName('');
      loadSuperadmins();
    } catch (e) {
      alert('❌ ' + t('settings.erreur_prefix') + e.message);
    }
    setSaSubmitting(false);
  };

  const handleDeleteSA = async (sa) => {
    if (!window.confirm(t('settings.confirm_remove_superadmin', { name: sa.full_name || sa.email }))) return;
    try {
      await api.request('/super-admin/delete-superadmin/' + sa.id, { method: 'DELETE' });
      alert(t('settings.sa_deleted'));
      loadSuperadmins();
    } catch (e) {
      alert(t('settings.erreur_prefix') + e.message);
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
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6b21a8' }}>{t('settings.invite_sa_long')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input type="email" value={saEmail} onChange={e => setSaEmail(e.target.value)} placeholder={t('settings.email_ph_example')} style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box' }} />
          <input type="text" value={saName} onChange={e => setSaName(e.target.value)} placeholder={t('settings.full_name')} style={{ flex: '1 1 200px', padding: '10px 12px', borderRadius: 8, border: '1px solid #e9d5ff', fontSize: 14, boxSizing: 'border-box' }} />
          <button disabled={saSubmitting || !saEmail} onClick={handleInvite} style={{ padding: '10px 20px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saSubmitting ? 'not-allowed' : 'pointer', opacity: saSubmitting ? 0.6 : 1, whiteSpace: 'nowrap' }}>{saSubmitting ? t('settings.sending') : t('settings.invite')}</button>
        </div>
      </div>

      <div>
        <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: 0.5 }}>{t('settings.list_label')} ({superadmins.length})</h3>
        {loading ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>{t('settings.loading')}</div>
        ) : superadmins.length === 0 ? (
          <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', background: '#f8fafc', borderRadius: 12, border: '1px dashed #e2e8f0' }}>{t('settings.no_super_admin')}</div>
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
                  <span style={{ padding: '4px 10px', borderRadius: 999, background: sa.is_active ? '#d1fae5' : '#fee2e2', color: sa.is_active ? '#065f46' : '#991b1b', fontSize: 12, fontWeight: 600 }}>{sa.is_active ? t('settings.active') : t('settings.inactive')}</span>
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
  const ROLE_CONFIG = {
    admin: { label: t('settings.role_admin_short'), icon: Shield, color: '#dc2626', bg: '#fef2f2' },
    commercial: { label: t('settings.role_member'), icon: Briefcase, color: '#0891b2', bg: '#ecfeff' },
  };
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

  const copyToClipboard = (tx) => { navigator.clipboard.writeText(tx); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{t('settings.members_title')}</h3>
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
              <h4 style={{ fontWeight: 700, color: '#0f172a', marginBottom: 12 }}>{t('settings.member_created')}</h4>
              <div style={{ background: '#fff', borderRadius: 10, padding: 16, display: 'inline-block', textAlign: 'left', border: '1px solid #e2e8f0' }}>
                <div style={{ marginBottom: 8 }}><span style={{ color: '#64748b', fontSize: 11 }}>{t('settings.email')}</span><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{inviteResult.email}</div></div>
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
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.name_required_label')}</label><input value={inviteForm.full_name} onChange={e => setInviteForm(f => ({ ...f, full_name: e.target.value }))} placeholder={t('settings.full_name_ph')} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
                <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.email_required_label')}</label><input value={inviteForm.email} onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))} placeholder={t('settings.email_ph_work')} type="email" style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
              </div>
              <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.role_label')}</label>
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
            <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.irreversible_action')}</p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button onClick={() => setDeleteUserConfirm(null)} style={{ flex: 1, padding: 13, borderRadius: 12, border: '2px solid #e2e8f0', background: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>{t('settings.cancel')}</button>
              <button onClick={() => handleDeleteUser(deleteUserConfirm)} style={{ flex: 1, padding: 13, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#dc2626,#b91c1c)', color: '#fff', fontWeight: 600, cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}><Trash2 size={16} /> {t('common.delete')}</button>
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
                  <option value="admin">{t('settings.role_admin_short')}</option><option value="commercial">{t('settings.role_member')}</option>
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
    if (!confirm(t('settings.revoke_confirm'))) return;
    try { await api.revokeApiKey(id); load(); } catch (err) { alert(err.message); }
  };

  const copyToClipboard = (tx) => { navigator.clipboard.writeText(tx); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 24 }}>{t('settings.tab_integrations')}</h3>

      {/* CRM integrations (HubSpot / Salesforce / Webhook). Lives in
          its own component so the existing Open API block below stays
          unchanged. */}
      <CrmIntegrations />
      <div style={{ height: 1, background: '#e2e8f0', margin: '32px 0' }} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}><Key size={16} color="#6366f1" /><h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>Open API</h4></div>
      <p style={{ color: '#64748b', fontSize: 13, marginBottom: 16 }}>{t('settings.api_desc')} <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>POST /api/v1/referrals</code> · <code style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>GET /api/v1/referrals</code></p>

      {newKey && (
        <div style={{ background: '#fffbeb', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #fde68a' }} className="fade-in">
          <div style={{ fontWeight: 700, color: '#92400e', fontSize: 13, marginBottom: 8 }}>{t('settings.copy_this_key_now')}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <code style={{ background: '#fff', padding: '8px 12px', borderRadius: 8, color: '#0f172a', fontWeight: 600, fontSize: 14, fontFamily: 'monospace', flex: 1, wordBreak: 'break-all' }}>{newKey}</code>
            <button onClick={() => copyToClipboard(newKey)} style={{ background: copied ? '#f0fdf4' : '#eef2ff', border: 'none', borderRadius: 6, padding: 8, cursor: 'pointer', display: 'flex', flexShrink: 0 }}>{copied ? <CheckCircle size={16} color="#16a34a" /> : <Copy size={16} color="#6366f1" />}</button>
          </div>
        </div>
      )}

      {showCreate ? (
        <div style={{ background: '#f8fafc', borderRadius: 12, padding: 16, marginBottom: 16, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.name_required_label')}</label><input value={keyName} onChange={e => setKeyName(e.target.value)} placeholder={t('settings.integrations_zapier_ph')} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }} /></div>
            <div><label style={{ display: 'block', fontWeight: 600, color: '#334155', fontSize: 12, marginBottom: 4 }}>{t('settings.partner_optional')}</label><select value={partnerId} onChange={e => setPartnerId(e.target.value)} style={{ width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box' }}><option value="">{t('settings.none_option')}</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleCreate} disabled={creating || !keyName} style={{ padding: '8px 16px', borderRadius: 8, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', opacity: creating ? 0.7 : 1, display: 'flex', alignItems: 'center', gap: 6 }}><Key size={13} /> {creating ? t('settings.creating') : t('settings.api_generate')}</button>
            <button onClick={() => setShowCreate(false)} style={{ padding: '8px 16px', borderRadius: 8, background: '#f1f5f9', border: 'none', color: '#475569', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>{t('settings.cancel')}</button>
          </div>
        </div>
      ) : (
        <button onClick={() => { setShowCreate(true); setNewKey(null); }} style={{ padding: '8px 16px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16 }}><Key size={14} /> {t('settings.api_key_create')}</button>
      )}

      {loading ? <div style={{ color: '#94a3b8', padding: 20 }}>{t('settings.loading')}</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apiKeys.filter(k => k.is_active).map(k => (
            <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Key size={16} color="#6366f1" />
                <div><div style={{ fontWeight: 600, color: '#0f172a', fontSize: 14 }}>{k.name}</div><div style={{ color: '#94a3b8', fontSize: 11 }}><code>{k.key_prefix}</code> · {k.partner_name || t('settings.global_label')} · {t('settings.created_on')} {fmtDate(k.created_at)}{k.last_used_at && <> · {t('settings.used_on')} {fmtDate(k.last_used_at)}</>}</div></div>
              </div>
              <button onClick={() => handleRevoke(k.id)} style={{ background: '#fef2f2', border: 'none', borderRadius: 6, padding: 6, cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
            </div>
          ))}
          {apiKeys.filter(k => k.is_active).length === 0 && <div style={{ color: '#94a3b8', fontSize: 13, padding: 16, textAlign: 'center' }}>{t('settings.api_no_keys')}</div>}
        </div>
      )}
    </div>
  );
}

// ═══ CRM INTEGRATIONS (HubSpot / Salesforce / Webhook) ═══
//
// Business-plan only — the GET /crm/integrations endpoint also
// returns the tenant plan so we can render the upgrade prompt without
// a second round-trip.
function CrmIntegrations() {
  const { t } = useTranslation();
  const [data, setData] = useState({ integrations: [], plan: 'starter' });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('');
  const [testMsg, setTestMsg] = useState('');
  const [err, setErr] = useState('');
  const [mappingFor, setMappingFor] = useState(null); // integration object
  const [syncLog, setSyncLog] = useState([]);
  const [notion, setNotion] = useState(null);
  const [showNotionConnect, setShowNotionConnect] = useState(false);
  const [showNotionMappings, setShowNotionMappings] = useState(false);
  // Transient status banner for Notion sync / disconnect actions.
  // Shape: { tone: 'success' | 'error', text: string } | null.
  const [notionMsg, setNotionMsg] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api.getCrmIntegrations();
      setData(d);
      const wh = (d.integrations || []).find(i => i.provider === 'webhook');
      if (wh && wh.webhook_url) setWebhookUrl(wh.webhook_url);
      const log = await api.getCrmSyncLog().catch(() => ({ log: [] }));
      setSyncLog(log.log || []);
      const n = await api.getNotionStatus().catch(() => null);
      setNotion(n);
    } catch (e) {
      setErr(e.message);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const isBusiness = data.plan === 'business';
  const byProvider = (p) => (data.integrations || []).find(i => i.provider === p);

  // All CRM click handlers accept the event and call stopPropagation +
  // preventDefault. The handlers run from inside the SettingsPage
  // modal (which has a backdrop onClick={handleClose}) — we don't
  // want a bubbled click to both run the handler AND close the modal,
  // and we don't want ANY handler to trigger the OAuth redirect
  // except the explicit Connect buttons.
  const stopEv = (e) => { if (e && typeof e.stopPropagation === 'function') { e.stopPropagation(); e.preventDefault(); } };

  const connectHubspot = async (e) => {
    stopEv(e);
    setBusy(true); setErr('');
    try {
      const { url } = await api.getHubspotAuthUrl();
      if (url) window.location.href = url;
    } catch (e) {
      if (e?.data?.error === 'plan_upgrade_required') setErr(t('crm.upgrade_required_body'));
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const disconnectHubspot = async (e) => {
    stopEv(e);
    setBusy(true); try { await api.disconnectHubspot(); load(); } catch (e) { setErr(e.message); } setBusy(false);
  };

  const connectSalesforce = async (e) => {
    stopEv(e);
    setBusy(true); setErr('');
    try {
      const { url } = await api.getSalesforceAuthUrl();
      if (url) window.location.href = url;
    } catch (e) {
      if (e?.data?.error === 'plan_upgrade_required') setErr(t('crm.upgrade_required_body'));
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const disconnectSalesforce = async (e) => {
    stopEv(e);
    setBusy(true); try { await api.disconnectSalesforce(); load(); } catch (e) { setErr(e.message); } setBusy(false);
  };

  const saveWebhook = async (e) => {
    stopEv(e);
    setBusy(true); setErr('');
    try {
      await api.createCrmIntegration({ provider: 'webhook', webhook_url: webhookUrl });
      load();
    } catch (e) {
      if (e?.data?.error === 'plan_upgrade_required') setErr(t('crm.upgrade_required_body'));
      else setErr(e.message);
    } finally { setBusy(false); }
  };
  const testWebhook = async (e) => {
    stopEv(e);
    const wh = byProvider('webhook');
    if (!wh) return;
    setTestMsg('…');
    try {
      const r = await api.testCrmWebhook(wh.id);
      setTestMsg(r.ok ? t('crm.test_ok') : t('crm.test_failed'));
    } catch (e) {
      setTestMsg(t('crm.test_failed'));
    }
    setTimeout(() => setTestMsg(''), 4000);
  };
  const removeIntegration = async (ev, id) => {
    stopEv(ev);
    setBusy(true);
    try { await api.deleteCrmIntegration(id); load(); }
    catch (e) { setErr(e.message); }
    finally { setBusy(false); }
  };

  if (loading) return <div style={{ color: '#94a3b8', padding: 16 }}>{t('settings.loading')}</div>;

  // Upgrade prompt when not on Business.
  if (!isBusiness) {
    return (
      <div style={{ padding: 24, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 14, marginBottom: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>
          {t('crm.upgrade_required_title')}
        </div>
        <p style={{ color: '#92400e', fontSize: 14, lineHeight: 1.55, margin: '0 0 16px' }}>
          {t('crm.upgrade_required_body')}
        </p>
        <a href="/billing" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 10, background: '#059669', color: '#fff', fontWeight: 700, fontSize: 13, textDecoration: 'none' }}>
          {t('crm.upgrade_cta')} →
        </a>
      </div>
    );
  }

  const hubspot = byProvider('hubspot');
  const salesforce = byProvider('salesforce');
  const webhook = byProvider('webhook');

  const Card = ({ title, desc, color, children, status }) => (
    <div style={{ padding: 18, borderRadius: 12, border: '1px solid #e2e8f0', background: '#fff', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: color + '15', color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800 }}>
            {title[0]}
          </div>
          <div style={{ fontWeight: 700, color: '#0f172a', fontSize: 14 }}>{title}</div>
        </div>
        <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: status ? '#f0fdf4' : '#f1f5f9', color: status ? '#059669' : '#64748b' }}>
          {status ? t('crm.connected') : t('crm.not_connected')}
        </span>
      </div>
      <p style={{ margin: 0, color: '#64748b', fontSize: 12, lineHeight: 1.55 }}>{desc}</p>
      <div style={{ marginTop: 'auto' }}>{children}</div>
    </div>
  );

  return (
    <div>
      <h4 style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', margin: '0 0 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Plug size={16} color="#6366f1"/> {t('crm.integrations')}
      </h4>
      {err && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '10px 14px', borderRadius: 10, fontSize: 13, marginBottom: 14 }}>{err}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 18 }}>
        <Card title={t('crm.hubspot')} desc={t('crm.hubspot_desc')} color="#ff7a59" status={hubspot?.is_active}>
          {hubspot?.is_active ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={(e) => { stopEv(e); setMappingFor(hubspot); }} disabled={busy} style={btnSecondary}>{t('crm.configure')}</button>
              <button type="button" onClick={disconnectHubspot} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>{t('crm.disconnect')}</button>
            </div>
          ) : (
            <button type="button" onClick={connectHubspot} disabled={busy} style={btnPrimary}>{t('crm.connect')}</button>
          )}
        </Card>
        <Card title={t('notion.title')} desc={t('notion.description')} color="#111827" status={!!notion?.connected}>
          {notion?.connected ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {notion.databaseName && (
                <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{notion.databaseName}</div>
              )}
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button type="button" onClick={(e) => { stopEv(e); setShowNotionMappings(true); }} disabled={busy} style={btnSecondary}>{t('notion.configure_mappings')}</button>
                <button type="button" onClick={async (e) => {
                  stopEv(e); setBusy(true); setNotionMsg(null);
                  try {
                    // Bidirectional sync: push every RefBoost referral
                    // to Notion first (create/update pages in the
                    // Transactions DB), then pull any changes that
                    // happened directly inside Notion back into
                    // RefBoost. Mirrors how the HubSpot "Sync now"
                    // button behaves. Each individual referral push
                    // logs its own row in crm_sync_log so the history
                    // view fills in live.
                    const pushRes = await api.pushToNotion();
                    if (!pushRes.ok) throw new Error(pushRes.error || 'push_failed');
                    let pullUpdated = 0;
                    try {
                      const pullRes = await api.pullFromNotion();
                      if (pullRes.ok && typeof pullRes.updated === 'number') pullUpdated = pullRes.updated;
                    } catch { /* pull is opportunistic — don't fail the whole sync */ }
                    load();
                    setNotionMsg({ tone: 'success', text: t('notion.sync_ok_push', {
                      pushed: pushRes.pushed ?? 0,
                      total: pushRes.total ?? 0,
                      pulled: pullUpdated,
                    }) });
                    setTimeout(() => setNotionMsg(null), 6000);
                  } catch (err) {
                    setNotionMsg({ tone: 'error', text: err.message || t('notion.sync_failed') });
                  } finally { setBusy(false); }
                }} disabled={busy} style={btnSecondary}>{t('notion.sync_now')}</button>
                <button type="button" onClick={async (e) => {
                  stopEv(e); setBusy(true); setNotionMsg(null);
                  try {
                    await api.disconnectNotion();
                    load();
                    setNotionMsg({ tone: 'success', text: t('notion.disconnect_ok') });
                    setTimeout(() => setNotionMsg(null), 4000);
                  } catch (err) {
                    setNotionMsg({ tone: 'error', text: err.message });
                  } finally { setBusy(false); }
                }} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>{t('notion.disconnect')}</button>
              </div>
              {notionMsg && (
                <div style={{
                  marginTop: 8,
                  padding: '7px 10px',
                  borderRadius: 8,
                  fontSize: 12,
                  fontWeight: 600,
                  background: notionMsg.tone === 'success' ? '#ecfdf5' : '#fef2f2',
                  border: notionMsg.tone === 'success' ? '1px solid #6ee7b7' : '1px solid #fecaca',
                  color: notionMsg.tone === 'success' ? '#047857' : '#b91c1c',
                }}>{notionMsg.text}</div>
              )}
            </div>
          ) : (
            <button type="button" onClick={(e) => { stopEv(e); setShowNotionConnect(true); }} disabled={busy} style={btnPrimary}>{t('notion.connect')}</button>
          )}
        </Card>
        <Card title={t('crm.salesforce')} desc={t('crm.salesforce_desc')} color="#00a1e0" status={salesforce?.is_active}>
          {salesforce?.is_active ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={(e) => { stopEv(e); setMappingFor(salesforce); }} disabled={busy} style={btnSecondary}>{t('crm.configure')}</button>
              <button type="button" onClick={disconnectSalesforce} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>{t('crm.disconnect')}</button>
            </div>
          ) : (
            <button type="button" onClick={connectSalesforce} disabled={busy} style={btnPrimary}>{t('crm.connect')}</button>
          )}
        </Card>
        <Card title={t('crm.webhook')} desc={t('crm.webhook_desc')} color="#6366f1" status={webhook?.is_active}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <input
              value={webhookUrl}
              onChange={e => setWebhookUrl(e.target.value)}
              placeholder={t('crm.webhook_url_ph')}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 12, fontFamily: 'inherit', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" onClick={saveWebhook} disabled={busy || !webhookUrl} style={btnPrimary}>{t('crm.save_webhook')}</button>
              {webhook && <button type="button" onClick={testWebhook} disabled={busy} style={btnSecondary}>{t('crm.test_webhook')}</button>}
              {webhook && <button type="button" onClick={(e) => removeIntegration(e, webhook.id)} disabled={busy} style={{ ...btnSecondary, color: '#b91c1c', borderColor: '#fecaca' }}>{t('crm.disconnect')}</button>}
            </div>
            {testMsg && <div style={{ fontSize: 11, color: testMsg.startsWith('✓') ? '#059669' : '#b91c1c', fontWeight: 600 }}>{testMsg}</div>}
          </div>
        </Card>
      </div>

      {mappingFor && (
        <CrmMappingModal integration={mappingFor} onClose={() => { setMappingFor(null); load(); }}/>
      )}

      {showNotionConnect && (
        <NotionConnectModal
          onClose={() => setShowNotionConnect(false)}
          onConnected={() => {
            // After a successful /connect, close the connect modal
            // and immediately hand off to the mapping modal so the
            // admin can finish wiring field + status mappings without
            // hunting for the "Configurer" button a second time.
            setShowNotionConnect(false);
            load();
            setShowNotionMappings(true);
          }}
        />
      )}

      {showNotionMappings && (
        <NotionMappingModal
          onClose={() => { setShowNotionMappings(false); load(); }}
        />
      )}

      {/* Sync log */}
      <h5 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '20px 0 10px' }}>{t('crm.sync_log')}</h5>
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 10, padding: 4 }}>
        {syncLog.length === 0
          ? <div style={{ color: '#94a3b8', fontSize: 12, padding: 14, textAlign: 'center' }}>{t('crm.no_sync_yet')}</div>
          : (
            <div style={{ maxHeight: 220, overflowY: 'auto' }}>
              {syncLog.map(row => (
                <div key={row.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 12px', fontSize: 12, borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', overflow: 'hidden', minWidth: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: row.status === 'success' ? '#f0fdf4' : '#fef2f2', color: row.status === 'success' ? '#059669' : '#b91c1c', textTransform: 'uppercase' }}>
                      {row.action}
                    </span>
                    <span style={{ color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.prospect_name || '—'}</span>
                    <span style={{ color: '#94a3b8' }}>· {row.provider}</span>
                  </div>
                  <span style={{ color: '#94a3b8', whiteSpace: 'nowrap' }}>{fmtDate(row.created_at)}</span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Outgoing webhooks — shares the Intégrations tab with the CRM
          block above. Lives on its own component so we can keep
          SettingsPage lean. */}
      <WebhooksSection />
    </div>
  );
}

// ─── Field + stage mapping modal ────────────────────────────────────
const REFBOOST_FIELDS = ['prospect_name', 'prospect_company', 'email', 'phone', 'deal_value', 'notes'];
const REFBOOST_STATUSES = ['new', 'contacted', 'qualified', 'proposal', 'meeting', 'won', 'lost'];

function CrmMappingModal({ integration, onClose }) {
  const { t } = useTranslation();
  const [fields, setFields] = useState([]);
  const [stages, setStages] = useState([]);
  const [crmFields, setCrmFields] = useState([]);
  const [crmStages, setCrmStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');

  // HubSpot-only multi-object mapping. Each tab owns its own property
  // list (fetched from /crm/hubspot/properties/:object) + its own
  // map. Salesforce/webhook fall through to the single-tab mode.
  const isHubspot = integration.provider === 'hubspot';
  const [activeTab, setActiveTab] = useState('transaction');
  const [contactProps, setContactProps] = useState([]);
  const [companyProps, setCompanyProps] = useState([]);
  const [contactMap, setContactMap] = useState({});
  const [companyMap, setCompanyMap] = useState({});

  const [tenantStages, setTenantStages] = useState([]);
  useEffect(() => {
    (async () => {
      try {
        // Load the tenant's custom pipeline stages so the stage-mapping
        // table iterates over the actual columns they built (not the
        // hardcoded default set).
        const sr = await api.getPipelineStages().catch(() => ({ stages: [] }));
        const pipelineStages = sr.stages || [];
        setTenantStages(pipelineStages);

        const m = await api.getCrmMappings(integration.id);
        // Initialise mapping rows for every RefBoost field/status, even
        // those without an existing CRM mapping yet.
        const fmap = new Map((m.fields || []).map(f => [f.refboost_field, f.crm_field]));
        const smap = new Map((m.stages || []).map(s => [s.refboost_status, s.crm_stage]));
        setFields(REFBOOST_FIELDS.map(f => ({ refboost_field: f, crm_field: fmap.get(f) || '' })));
        const sourceStatuses = pipelineStages.length
          ? pipelineStages.map(s => s.slug)
          : REFBOOST_STATUSES;
        setStages(sourceStatuses.map(s => ({ refboost_status: s, crm_stage: smap.get(s) || '' })));

        if (integration.provider === 'hubspot') {
          const [f, p, cP, coP, om] = await Promise.all([
            api.getHubspotFields(),
            api.getHubspotPipelines(),
            api.getHubspotProperties('contacts').catch(() => ({ properties: [] })),
            api.getHubspotProperties('companies').catch(() => ({ properties: [] })),
            api.getHubspotObjectMappings().catch(() => ({ contacts: {}, companies: {} })),
          ]);
          setCrmFields(f.fields || []);
          setContactProps(cP.properties || []);
          setCompanyProps(coP.properties || []);

          // Auto-suggest any unmapped Contact/Company field by name
          // match against HubSpot property names. Saved mappings
          // always win.
          const byLower = (list) => Object.fromEntries((list || []).map(p => [p.name.toLowerCase(), p.name]));
          const cLook = byLower(cP.properties);
          const coLook = byLower(coP.properties);
          setContactMap({
            firstname: om.contacts?.firstname || cLook.firstname || '',
            lastname:  om.contacts?.lastname  || cLook.lastname  || '',
            email:     om.contacts?.email     || cLook.email     || '',
            phone:     om.contacts?.phone     || cLook.phone     || '',
            jobtitle:  om.contacts?.jobtitle  || cLook.jobtitle  || '',
          });
          setCompanyMap({
            company: om.companies?.company || coLook.name   || '',
            domain:  om.companies?.domain  || coLook.domain || '',
          });

          // Flatten pipelines → stages list (use first pipeline by default).
          const allStages = [];
          for (const pl of p.pipelines || []) {
            for (const st of pl.stages || []) allStages.push({ id: st.id, label: pl.label + ' · ' + st.label });
          }
          setCrmStages(allStages);
        } else if (integration.provider === 'salesforce') {
          const [f, s] = await Promise.all([api.getSalesforceFields(), api.getSalesforceStages()]);
          setCrmFields(f.fields || []);
          setCrmStages(s.stages || []);
        }
      } catch (e) {
        // Best-effort — modal still works, dropdowns just become empty
        console.error('[crm.mapping.load]', e);
      } finally { setLoading(false); }
    })();
  }, [integration.id, integration.provider]);

  const save = async () => {
    setSaving(true);
    try {
      if (activeTab === 'transaction') {
        await api.updateCrmMappings(integration.id, {
          fields: fields.filter(f => f.crm_field),
          stages: stages.filter(s => s.crm_stage),
        });
      } else if (activeTab === 'contact') {
        await api.updateHubspotObjectMappings({ contacts: contactMap });
      } else if (activeTab === 'company') {
        await api.updateHubspotObjectMappings({ companies: companyMap });
      }
      setSavedMsg(t('crm.saved'));
      setTimeout(() => setSavedMsg(''), 2000);
    } catch (e) {
      alert(e.message);
    } finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 640, maxHeight: '88vh', overflowY: 'auto', padding: 24, boxShadow: '0 25px 80px rgba(15,23,42,0.25)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#0f172a' }}>
            {t('crm.configure')} — {t('crm.' + integration.provider)}
          </h3>
          <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16}/>
          </button>
        </div>

        {loading ? <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>…</div> : (
          <>
            {isHubspot && (
              <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 16 }}>
                {[
                  { id: 'transaction', label: 'Transaction' },
                  { id: 'contact',     label: 'Contact' },
                  { id: 'company',     label: 'Entreprise' },
                ].map(tab => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setActiveTab(tab.id); }}
                    style={{
                      flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
                      cursor: 'pointer', fontSize: 12, fontWeight: 600,
                      background: activeTab === tab.id ? '#fff' : 'transparent',
                      color: activeTab === tab.id ? '#059669' : '#64748b',
                      boxShadow: activeTab === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                    }}
                  >{tab.label}</button>
                ))}
              </div>
            )}

            {isHubspot && activeTab !== 'transaction' ? (
              <ObjectMappingTable
                type={activeTab}
                properties={activeTab === 'contact' ? contactProps : companyProps}
                mapping={activeTab === 'contact' ? contactMap : companyMap}
                onChange={activeTab === 'contact' ? setContactMap : setCompanyMap}
              />
            ) : (
              <TransactionMappingContent
                fields={fields} setFields={setFields}
                stages={stages} setStages={setStages}
                crmFields={crmFields} crmStages={crmStages}
                tenantStages={tenantStages} t={t}
              />
            )}
          </>
        )}
        {!loading && (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, alignItems: 'center', marginTop: 4 }}>
            {savedMsg && <span style={{ color: '#059669', fontSize: 12, fontWeight: 600 }}>{savedMsg}</span>}
            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); onClose(); }} disabled={saving} style={btnSecondary}>{t('settings.cancel')}</button>
            <button type="button" onClick={(e) => { e.stopPropagation(); e.preventDefault(); save(); }} disabled={saving} style={btnPrimary}>{saving ? '…' : t('crm.save_mappings')}</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══ Transaction (Deal) mapping content ═══
// The original modal body, now extracted into a subcomponent so
// CrmMappingModal can render it inside a tab layout.
function TransactionMappingContent({ fields, setFields, stages, setStages, crmFields, crmStages, tenantStages, t }) {
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  return (
    <>
      <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('crm.field_mappings')}
      </h4>
      <table style={{ width: '100%', marginBottom: 20 }}>
        <thead>
          <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.refboost_field')}</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.crm_field')}</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((row, i) => (
            <tr key={row.refboost_field}>
              <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{t('crm.field_' + row.refboost_field)}</td>
              <td style={{ padding: '4px 8px' }}>
                {crmFields.length > 0 ? (
                  <select value={row.crm_field} onChange={e => setFields(f => f.map((x, j) => j === i ? { ...x, crm_field: e.target.value } : x))} style={inp}>
                    <option value="">{t('crm.select_field')}</option>
                    {crmFields.map(c => <option key={c.name} value={c.name}>{c.label || c.name}</option>)}
                  </select>
                ) : (
                  <input value={row.crm_field} onChange={e => setFields(f => f.map((x, j) => j === i ? { ...x, crm_field: e.target.value } : x))} placeholder={t('crm.crm_field')} style={inp} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h4 style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '4px 0 10px', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {t('crm.stage_mappings')}
      </h4>
      <table style={{ width: '100%', marginBottom: 20 }}>
        <thead>
          <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.refboost_status')}</th>
            <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('crm.crm_stage')}</th>
          </tr>
        </thead>
        <tbody>
          {stages.map((row, i) => (
            <tr key={row.refboost_status}>
              <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>
                {(tenantStages.find(s => s.slug === row.refboost_status)?.name) || t('crm.status_' + row.refboost_status)}
              </td>
              <td style={{ padding: '4px 8px' }}>
                {crmStages.length > 0 ? (
                  <select value={row.crm_stage} onChange={e => setStages(s => s.map((x, j) => j === i ? { ...x, crm_stage: e.target.value } : x))} style={inp}>
                    <option value="">{t('crm.select_field')}</option>
                    {crmStages.map(c => <option key={c.id} value={c.id}>{c.label || c.id}</option>)}
                  </select>
                ) : (
                  <input value={row.crm_stage} onChange={e => setStages(s => s.map((x, j) => j === i ? { ...x, crm_stage: e.target.value } : x))} placeholder={t('crm.crm_stage')} style={inp} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

// ═══ Contact / Company mapping tab ═══
// Simple two-column table. One row per RefBoost field; right side is
// a dropdown populated from HubSpot's contacts/companies property
// list. Auto-suggested pairings happen upstream in the parent.
function ObjectMappingTable({ type, properties, mapping, onChange }) {
  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  const rows = type === 'contact'
    ? [
        { key: 'firstname', label: 'Prénom' },
        { key: 'lastname',  label: 'Nom' },
        { key: 'email',     label: 'Email' },
        { key: 'phone',     label: 'Téléphone' },
        { key: 'jobtitle',  label: 'Poste / Rôle' },
      ]
    : [
        { key: 'company', label: "Nom de l'entreprise" },
        { key: 'domain',  label: 'Domaine' },
      ];

  return (
    <table style={{ width: '100%', marginBottom: 20 }}>
      <thead>
        <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Champ RefBoost</th>
          <th style={{ padding: '6px 8px', fontWeight: 600 }}>Propriété HubSpot</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(r => (
          <tr key={r.key}>
            <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{r.label}</td>
            <td style={{ padding: '4px 8px' }}>
              <select
                value={mapping[r.key] || ''}
                onChange={e => onChange({ ...mapping, [r.key]: e.target.value })}
                style={inp}
              >
                <option value="">—</option>
                {properties.map(p => (
                  <option key={p.name} value={p.name}>{p.label || p.name}</option>
                ))}
              </select>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const btnPrimary = {
  padding: '8px 14px', borderRadius: 8, border: 'none',
  background: 'linear-gradient(135deg, #059669, #10b981)',
  color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
};
const btnSecondary = {
  padding: '8px 14px', borderRadius: 8, border: '1.5px solid #e2e8f0',
  background: '#fff', color: '#0f172a', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
};

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

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;
  if (!tenant) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.tenant_load_error')}</div>;

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
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.public_link_full_desc')}</p>

      <div style={{ marginBottom: 28 }}>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{t('settings.direct_link')}</h4>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <code style={{ flex: 1, fontSize: 13, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{directLink}</code>
          <button onClick={() => copy('link', directLink)} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: copied === 'link' ? '#dcfce7' : 'var(--rb-primary, #059669)',
            color: copied === 'link' ? '#166534' : '#fff',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {copied === 'link' ? <><CheckCircle size={14}/> {t('settings.copied_short')}</> : <><Copy size={14}/> {t('settings.copy_short')}</>}
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>{t('settings.link_share_hint')}</p>
      </div>

      <div>
        <h4 style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 10 }}>{t('settings.embed_code')}</h4>
        <div style={{ padding: 14, background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0' }}>
          <code style={{ display: 'block', fontSize: 12, color: '#0f172a', marginBottom: 12, fontFamily: 'monospace', wordBreak: 'break-all', lineHeight: 1.6 }}>{embedCode}</code>
          <button onClick={() => copy('embed', embedCode)} style={{
            padding: '8px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
            background: copied === 'embed' ? '#dcfce7' : 'var(--rb-primary, #059669)',
            color: copied === 'embed' ? '#166534' : '#fff',
            fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {copied === 'embed' ? <><CheckCircle size={14}/> {t('settings.copied_short')}</> : <><Copy size={14}/> {t('settings.copy_code')}</>}
          </button>
        </div>
        <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 8 }}>{t('settings.embed_hint')}</p>
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
      setMsg({ type: 'success', text: slug ? t('settings.appearance_saved_with_link', { slug }) : t('settings.appearance_saved') });
      setTimeout(() => setMsg(null), 3000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('settings.save_error') });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  const inputStyle = { width: '100%', padding: '10px 14px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 13, marginBottom: 6 };

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('settings.tab_appearance')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('settings.appearance_desc_full')}</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 480 }}>
        <div>
          <label style={labelStyle}>{t('settings.general_company')}</label>
          <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('settings.company_ph')} style={inputStyle} />
        </div>

        <div>
          <label style={labelStyle}>{t('settings.revenue_model')}</label>
          <select value={form.revenue_model || 'CA'} onChange={e => setForm(f => ({ ...f, revenue_model: e.target.value }))} style={inputStyle}>
            <option value="MRR">{t('onboarding.mrr_label')}</option>
            <option value="ARR">{t('onboarding.arr_label')}</option>
            <option value="CA">{t('onboarding.ca_label')}</option>
            <option value="Other">{t('onboarding.revenue_other')}</option>
          </select>
          <p style={{ margin: '6px 0 0', fontSize: 12, color: '#64748b' }}>{t('settings.revenue_model_hint')}</p>
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
          <input value={form.logo_url} onChange={e => setForm(f => ({ ...f, logo_url: e.target.value }))} placeholder={t('settings.logo_ph')} style={inputStyle} />
          <p style={{ color: '#94a3b8', fontSize: 12, marginTop: 6 }}>{t('settings.logo_hint')}</p>
          {form.logo_url && (
            <div style={{ marginTop: 12, padding: 16, background: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0', textAlign: 'center' }}>
              <img src={form.logo_url} alt={t('settings.preview')} style={{ maxHeight: 60, maxWidth: '100%' }} onError={e => { e.target.style.display = 'none'; }} />
            </div>
          )}
        </div>

        <button onClick={save} disabled={saving} style={{
          padding: '12px 24px', borderRadius: 10, border: 'none', cursor: saving ? 'wait' : 'pointer',
          background: 'var(--rb-primary, #059669)', color: '#fff', fontWeight: 700, fontSize: 14,
          width: 'fit-content', display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Palette size={16} /> {saving ? t('settings.saving_short') : t('settings.save')}
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
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const setType = async (type) => {
    try {
      await api.setTenantLevelThresholdType(type);
      setData(d => ({ ...d, threshold_type: type }));
      setMsg({ type: 'success', text: t('programme.saved') });
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
    if (!form.name) { setMsg({ type: 'error', text: t('programme.name_required') }); return; }
    try {
      if (editing === 'new') {
        await api.createTenantLevel({ ...form, position: data.levels.length });
      } else {
        await api.updateTenantLevel(editing, form);
      }
      setEditing(null);
      await load();
      setMsg({ type: 'success', text: t('programme.level_saved') });
      setTimeout(() => setMsg(null), 2000);
    } catch (e) {
      setMsg({ type: 'error', text: e.message || t('common.error') });
    }
  };

  const del = async (id) => {
    if (!window.confirm(t('programme.delete_confirm'))) return;
    try {
      await api.deleteTenantLevel(id);
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  const reset = async () => {
    if (!window.confirm(t('programme.reset_confirm'))) return;
    try {
      await api.resetTenantLevels();
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    }
  };

  if (loading) return <div style={{ textAlign: 'center', color: '#94a3b8', padding: 40 }}>{t('settings.loading')}</div>;

  const isDeal = data.threshold_type === 'deals';
  const unitLabel = isDeal ? t('programme.unit_deals') : t('programme.unit_volume');
  const thresholdInputLabel = isDeal ? t('programme.threshold_deals') : t('programme.threshold_volume');

  const inputStyle = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, boxSizing: 'border-box', fontFamily: 'inherit' };
  const labelStyle = { display: 'block', fontWeight: 600, color: '#334155', fontSize: 11, marginBottom: 4 };

  const formBlock = (
    <div style={{ padding: 16, background: '#fffbeb', borderRadius: 12, border: '2px dashed #fbbf24', marginBottom: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 60px', gap: 10, marginBottom: 10 }}>
        <div>
          <label style={labelStyle}>{t('programme.level_name')}</label>
          <input style={inputStyle} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={t('programme.level_name_placeholder')} />
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
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 8 }}>{t('programme.title_full')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('programme.subtitle_full')}</p>

      {msg && (
        <div style={{ padding: '10px 14px', borderRadius: 10, marginBottom: 16, fontSize: 13, fontWeight: 500, background: msg.type === 'success' ? '#f0fdf4' : '#fef2f2', color: msg.type === 'success' ? '#16a34a' : '#dc2626', border: `1px solid ${msg.type === 'success' ? '#bbf7d0' : '#fecaca'}` }}>
          {msg.text}
        </div>
      )}

      {/* Threshold type */}
      <div style={{ marginBottom: 28 }}>
        <label style={{ display: 'block', fontWeight: 600, color: '#0f172a', fontSize: 13, marginBottom: 10 }}>{t('programme.crit_title')}</label>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setType('deals')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: isDeal ? '#f0fdf4' : '#fff', color: isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('programme.crit_deals')}</button>
          <button onClick={() => setType('volume')} style={{
            flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid ' + (!isDeal ? 'var(--rb-primary, #059669)' : '#e2e8f0'),
            background: !isDeal ? '#f0fdf4' : '#fff', color: !isDeal ? '#0f172a' : '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>{t('programme.crit_volume')}</button>
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
              <div style={{ color: '#64748b', fontSize: 12 }}>{t('programme.level_desc', { min: parseFloat(l.min_threshold), unit: unitLabel, rate: parseFloat(l.commission_rate) })}</div>
            </div>
            <button onClick={() => startEdit(l)} title={t('common.edit')} style={{ padding: 8, borderRadius: 8, border: 'none', background: '#eef2ff', cursor: 'pointer', display: 'flex' }}><Edit2 size={14} color="#6366f1" /></button>
            <button onClick={() => del(l.id)} title={t('common.delete')} style={{ padding: 8, borderRadius: 8, border: 'none', background: '#fef2f2', cursor: 'pointer', display: 'flex' }}><Trash2 size={14} color="#dc2626" /></button>
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
        }}><Plus size={14} /> {t('programme.add_level')}</button>
        <button onClick={reset} style={{
          padding: '10px 18px', borderRadius: 10, border: '1px solid #e2e8f0',
          background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer',
        }}>{t('programme.reset_defaults')}</button>
      </div>
    </div>
  );
}

function NotificationsTab() {
  const { t } = useTranslation();
  const [prefs, setPrefs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [preview, setPreview] = useState(null); // { loading, subject, html, event_type, error }

  useEffect(() => {
    api.getNotificationPreferences()
      .then(d => setPrefs(d.preferences || []))
      .catch(() => setPrefs([]))
      .finally(() => setLoading(false));
  }, []);

  const openPreview = async (event_type) => {
    setPreview({ loading: true, event_type });
    try {
      const { subject, html } = await api.previewEmailTemplate(event_type);
      setPreview({ loading: false, event_type, subject, html });
    } catch (err) {
      setPreview({ loading: false, event_type, error: err.message || 'Aperçu indisponible' });
    }
  };

  const toggle = (event_type, field) => {
    setPrefs(list => list.map(p => p.event_type === event_type ? { ...p, [field]: !p[field] } : p));
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.updateNotificationPreferences({ preferences: prefs });
      setSavedAt(Date.now());
    } catch (err) { alert(err.message); }
    setSaving(false);
  };

  if (loading) return <div style={{ padding: 24, color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>{t('notifications.preferences')}</h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>{t('notifications.preferences_desc')}</p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px', background: '#f8fafc', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <div>{t('notifications.event')}</div>
          <div style={{ textAlign: 'center' }}>{t('notifications.in_app')}</div>
          <div style={{ textAlign: 'center' }}>{t('notifications.email')}</div>
          <div style={{ textAlign: 'center' }}>Aperçu</div>
        </div>
        {prefs.map(p => (
          <div key={p.event_type} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 90px 100px', padding: '14px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
            <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{t('notifications.event_' + p.event_type)}</div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => toggle(p.event_type, 'in_app')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.in_app ? '#059669' : '#cbd5e1' }}>
                {p.in_app ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button onClick={() => toggle(p.event_type, 'email')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: p.email ? '#059669' : '#cbd5e1' }}>
                {p.email ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => openPreview(p.event_type)}
                style={{
                  padding: '6px 12px', borderRadius: 8,
                  border: '1px solid #e2e8f0', background: '#fff',
                  color: '#475569', fontWeight: 600, fontSize: 12, cursor: 'pointer',
                }}
              >
                Aperçu
              </button>
            </div>
          </div>
        ))}
      </div>

      {preview && (
        <EmailPreviewModal preview={preview} onClose={() => setPreview(null)} />
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: 'var(--rb-primary, #059669)', color: '#fff',
          fontWeight: 600, fontSize: 14, cursor: 'pointer',
          opacity: saving ? 0.7 : 1,
        }}>{saving ? t('common.saving') : t('common.save')}</button>
        {savedAt && Date.now() - savedAt < 3000 && (
          <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={14} /> {t('common.saved')}
          </span>
        )}
      </div>
    </div>
  );
}


// Renders the server-generated email HTML inside a sandboxed iframe so
// the template's CSS doesn't leak into the Settings page. Admin-only
// affordance from the Notifications et emails tab.
function EmailPreviewModal({ preview, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 3000,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 16,
          width: '100%', maxWidth: 720, maxHeight: '90vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 25px 80px rgba(0,0,0,0.25)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>Aperçu email</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a', marginTop: 2 }}>
              {preview.loading ? '…' : (preview.subject || preview.error || 'Aperçu')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: '#f1f5f9', border: 'none', width: 36, height: 36, borderRadius: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#475569', fontSize: 18 }}
          >×</button>
        </div>
        <div style={{ flex: 1, overflow: 'hidden', padding: 12, background: '#f1f5f9' }}>
          {preview.loading ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Chargement…</div>
          ) : preview.error ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>{preview.error}</div>
          ) : (
            <iframe
              title="Aperçu email"
              srcDoc={preview.html}
              sandbox=""
              style={{ width: '100%', height: '70vh', border: 'none', borderRadius: 8, background: '#fff' }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ TRACKING FEATURES ═══
// Feature toggles + tracking configuration. Admin-scoped, sits inside
// the pipeline/Programme tab. Each toggle independently enables a
// downstream surface (partner referral link card, promo codes table,
// embeddable script). Config fields (redirect URL, cookie days, copy
// script snippet) only show when at least one feature is on.
function TrackingFeaturesTab() {
  const { t } = useTranslation();
  const [flags, setFlags] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getTenantFeatures()
      .then(f => setFlags(f.features))
      .catch(() => setFlags({ feature_referral_links: false }))
      .finally(() => setLoading(false));
  }, []);

  const patch = async (diff) => {
    setSaving(true);
    try {
      const { features } = await api.updateTenantFeatures(diff);
      setFlags(features);
    } catch (e) { alert(e.message); }
    setSaving(false);
  };

  if (loading || !flags) return <div style={{ color: '#94a3b8' }}>…</div>;

  // One feature card, soft-green icon tile on the left, brand-green
  // toggle on the right. Same white-card styling as other settings
  // tabs (Profile, Integrations, etc.).
  const FeatureCard = ({ icon: Icon, title, desc, on, onChange }) => (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 14, padding: 20, marginBottom: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: on ? '#f0fdf4' : '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={18} color={on ? '#059669' : '#64748b'} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{title}</div>
          <div style={{ fontSize: 13, color: '#64748b', marginTop: 2, lineHeight: 1.5 }}>{desc}</div>
        </div>
        <button
          onClick={() => onChange(!on)}
          disabled={saving}
          aria-pressed={on}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: on ? '#059669' : '#cbd5e1', padding: 0, lineHeight: 0 }}
        >
          {on ? <ToggleRight size={34} /> : <ToggleLeft size={34} />}
        </button>
      </div>
    </div>
  );

  return (
    <div>
      <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', marginBottom: 6 }}>{t('features.tracking_title')}</h3>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('features.tracking_subtitle')}
      </p>

      <FeatureCard
        icon={Link2}
        title={t('features.referral_links')}
        desc={t('features.referral_links_desc')}
        on={flags.feature_referral_links}
        onChange={v => patch({ feature_referral_links: v })}
      />
    </div>
  );
}

// ═══ PARTNER CATEGORIES ═══
// Admin editor for the list of partner categories. Drag-and-drop
// reorder; inline edit on name/description; colour picker; star-toggle
// for the default; delete with guard (disabled when partners are
// assigned or when the category is the default one).
function PartnerCategoriesTab() {
  const { t } = useTranslation();
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  const reload = () => {
    setLoading(true);
    api.getPartnerCategories()
      .then(d => setCategories(d.categories || []))
      .catch(() => setCategories([]))
      .finally(() => setLoading(false));
  };
  useEffect(reload, []);

  const updateInline = async (id, patch) => {
    setCategories(list => list.map(c => c.id === id ? { ...c, ...patch } : c));
    try { await api.updatePartnerCategory(id, patch); }
    catch (e) { setErr(e.message); reload(); }
  };

  const setDefault = async (id) => {
    try {
      await api.setDefaultPartnerCategory(id);
      reload();
    } catch (e) { setErr(e.message); }
  };

  const del = async (c) => {
    if (c.partners_count > 0 || c.is_default) return;
    if (!window.confirm(t('partner_category.delete') + ' ?')) return;
    try { await api.deletePartnerCategory(c.id); reload(); }
    catch (e) { setErr(e.message || t('partner_category.cannot_delete_has_partners', { count: c.partners_count || 0 })); }
  };

  const add = async () => {
    const name = window.prompt(t('partner_category.name'));
    if (!name || !name.trim()) return;
    try {
      await api.createPartnerCategory({ name: name.trim(), color: '#6B7280' });
      reload();
    } catch (e) { setErr(e.message); }
  };

  const onDrop = async (e, targetId) => {
    e.preventDefault();
    if (!draggingId || draggingId === targetId) return;
    const srcIdx = categories.findIndex(c => c.id === draggingId);
    const dstIdx = categories.findIndex(c => c.id === targetId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const next = categories.slice();
    const [moved] = next.splice(srcIdx, 1);
    next.splice(dstIdx, 0, moved);
    const withPos = next.map((c, i) => ({ ...c, position: i }));
    setCategories(withPos);
    setDraggingId(null);
    try {
      await api.reorderPartnerCategories(withPos.map(c => ({ id: c.id, position: c.position })));
    } catch (err) { setErr(err.message); reload(); }
  };

  if (loading) return <div style={{ color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: 0 }}>{t('partner_category.title')}</h3>
        <button onClick={add} style={{ padding: '8px 14px', borderRadius: 10, background: 'var(--rb-primary, #059669)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + {t('partner_category.add')}
        </button>
      </div>
      {err && <div style={{ marginBottom: 10, padding: '8px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', fontSize: 13 }}>{err}</div>}

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        {categories.map(c => (
          <div
            key={c.id}
            draggable
            onDragStart={() => setDraggingId(c.id)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => onDrop(e, c.id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '32px 1fr 2fr 80px 80px',
              gap: 10, alignItems: 'center',
              padding: '12px 14px',
              borderTop: '1px solid #f1f5f9',
              background: draggingId === c.id ? '#f8fafc' : '#fff',
              cursor: 'move',
            }}
          >
            <input
              type="color"
              value={c.color || '#6B7280'}
              onChange={e => updateInline(c.id, { color: e.target.value })}
              style={{ width: 28, height: 28, padding: 0, border: '1px solid #e2e8f0', borderRadius: 8, cursor: 'pointer', background: 'transparent' }}
              title={t('partner_category.color')}
            />
            <input
              defaultValue={c.name}
              onBlur={e => e.target.value.trim() && e.target.value !== c.name && updateInline(c.id, { name: e.target.value.trim() })}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, fontWeight: 600, color: '#0f172a' }}
            />
            <input
              defaultValue={c.description || ''}
              placeholder={t('partner_category.description')}
              onBlur={e => e.target.value !== (c.description || '') && updateInline(c.id, { description: e.target.value })}
              style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12, color: '#475569' }}
            />
            <button
              onClick={() => !c.is_default && setDefault(c.id)}
              title={c.is_default ? t('partner_category.default') : t('partner_category.set_default')}
              style={{ background: 'none', border: 'none', cursor: c.is_default ? 'default' : 'pointer', color: c.is_default ? '#f59e0b' : '#cbd5e1', fontSize: 22, lineHeight: 1, padding: 0 }}
            >
              {c.is_default ? '★' : '☆'}
            </button>
            <button
              onClick={() => del(c)}
              disabled={c.is_default || c.partners_count > 0}
              title={
                c.is_default
                  ? t('partner_category.cannot_delete_default')
                  : c.partners_count > 0
                    ? t('partner_category.cannot_delete_has_partners', { count: c.partners_count })
                    : t('partner_category.delete')
              }
              style={{
                background: 'none', border: 'none',
                cursor: (c.is_default || c.partners_count > 0) ? 'not-allowed' : 'pointer',
                color: (c.is_default || c.partners_count > 0) ? '#cbd5e1' : '#dc2626',
                fontSize: 14, fontWeight: 600,
              }}
            >
              {c.partners_count > 0 ? `${c.partners_count} 👥` : '🗑'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


// ═══ Notion connect modal — 3 databases ═══
// Token + up to three database IDs (Transactions required, Contacts
// and Companies optional). Hitting "Connecter" validates everything
// server-side; errors for individual DBs are surfaced per-field.
function NotionConnectModal({ onClose, onConnected }) {
  const { t } = useTranslation();
  const [form, setForm] = useState({ token: '', dbTransactions: '', dbContacts: '', dbCompanies: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.token.trim() || !form.dbTransactions.trim()) return;
    setBusy(true); setErr('');
    try {
      await api.connectNotion({
        token: form.token.trim(),
        dbTransactions: form.dbTransactions.trim(),
        dbContacts:     form.dbContacts.trim()  || undefined,
        dbCompanies:    form.dbCompanies.trim() || undefined,
      });
      onConnected();
    } catch (e) {
      setErr(e.message || t('notion.invalid_token'));
    } finally { setBusy(false); }
  };

  const inp = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontSize: 13, fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' };
  const lbl = { display: 'block', fontSize: 12, fontWeight: 600, color: '#64748b', marginBottom: 4, marginTop: 12 };
  const hint = { fontSize: 11, color: '#94a3b8', marginTop: 4 };

  const canSubmit = form.token.trim() && form.dbTransactions.trim();

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{t('notion.title')} — {t('notion.connect')}</h3>
          <button type="button" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16}/>
          </button>
        </div>

        <div style={{ background: '#f8fafc', borderRadius: 10, padding: 14, marginBottom: 12, border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.3 }}>
            {t('notion.setup_instructions')}
          </div>
          <ol style={{ margin: 0, paddingLeft: 20, color: '#475569', fontSize: 12, lineHeight: 1.7 }}>
            <li>{t('notion.step1')} — <a href="https://www.notion.so/my-integrations" target="_blank" rel="noreferrer" style={{ color: '#059669', fontWeight: 600 }}>notion.so/my-integrations</a></li>
            <li>{t('notion.step2')}</li>
            <li>{t('notion.step3')}</li>
            <li>{t('notion.step4')}</li>
          </ol>
        </div>

        <label style={lbl}>{t('notion.token')}</label>
        {/* Notion internal-integration tokens (ntn_... / secret_...)
            are API tokens, not passwords. Keeping type="password" here
            (a) hides the value so the admin can't verify a paste, and
            (b) triggers 1Password / iCloud Keychain to auto-fill the
            saved site password over it. type="text" + autoComplete
            off + the 1P opt-out attr keep the paste visible and
            leave the manager alone. */}
        <input
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-1p-ignore
          data-lpignore="true"
          data-form-type="other"
          value={form.token}
          onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
          placeholder="ntn_..."
          style={{ ...inp, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
        />

        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', marginTop: 18, marginBottom: 4 }}>
          Configurez vos bases de données
        </div>
        <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
          L'ID se trouve dans l'URL de votre base Notion (les 32 caractères après le dernier /).
        </div>

        <label style={lbl}>Base Transactions (Deals) *</label>
        <input value={form.dbTransactions} onChange={e => setForm(f => ({ ...f, dbTransactions: e.target.value }))} placeholder="32-char hex" style={inp}/>

        <label style={lbl}>Base Contacts <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
        <input value={form.dbContacts} onChange={e => setForm(f => ({ ...f, dbContacts: e.target.value }))} placeholder="32-char hex" style={inp}/>

        <label style={lbl}>Base Entreprises <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optionnel)</span></label>
        <input value={form.dbCompanies} onChange={e => setForm(f => ({ ...f, dbCompanies: e.target.value }))} placeholder="32-char hex" style={inp}/>

        {err && <div style={{ marginTop: 14, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t('common.cancel') || 'Annuler'}
          </button>
          <button type="button" onClick={submit} disabled={busy || !canSubmit} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: busy || !canSubmit ? 0.6 : 1 }}>
            {busy ? '…' : t('notion.connect')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══ Notion mapping modal — 3 tabs ═══
// One tab per Notion database (Transactions, Contacts, Entreprises).
// Each tab's dropdown list is populated from GET /properties/:type.
// Missing optional databases are marked "non configurée" and their
// tab is disabled.
function NotionMappingModal({ onClose }) {
  const { t } = useTranslation();
  // i18next returns the key name itself when a key is missing, so
  // `t('foo') || fallback` NEVER hits the fallback — the missing-key
  // echo ("crm.field_status") is truthy. `t(key, { defaultValue })`
  // is the correct pattern: if the key is missing, i18next substitutes
  // the default, and a future missing key still renders a human
  // string instead of leaking the key.
  const tf = (k, fallback) => t(k, { defaultValue: fallback });
  const TABS = [
    { id: 'transactions', label: 'Transactions', fields: [
      // In the Transactions tab the prospect_name field IS the deal
      // title — every Notion DB has exactly one Title property, and
      // a B2B pipeline row's header is the deal it represents. Label
      // reads "Nom du deal" here to match that semantic; the Contacts
      // tab below keeps the "Nom du prospect" label because there it
      // really is the contact person's name.
      { key: 'prospect_name', label: tf('crm.field_deal_name',     'Nom du deal'),     hints: ['name', 'nom', 'title', 'titre', 'deal', 'transaction'] },
      { key: 'status',        label: tf('crm.field_status',        'Statut'),          hints: ['status', 'statut'] },
      { key: 'mrr',           label: tf('crm.field_mrr',           'MRR / Montant'),   hints: ['mrr', 'amount', 'montant', 'prix'] },
      { key: 'notes',         label: tf('crm.field_notes',         'Notes'),           hints: ['notes', 'note'] },
      { key: 'partner_name',  label: tf('crm.field_partner_name',  'Nom du partenaire'), hints: ['partner', 'partenaire'] },
    ] },
    { id: 'contacts', label: 'Contacts', fields: [
      { key: 'prospect_name', label: tf('crm.field_prospect_name', 'Nom'),             hints: ['name', 'nom', 'title', 'titre'] },
      { key: 'email',         label: tf('crm.field_email',         'Email'),           hints: ['email', 'e-mail', 'mail'] },
      { key: 'phone',         label: tf('crm.field_phone',         'Téléphone'),       hints: ['phone', 'téléphone', 'telephone', 'tel'] },
      { key: 'role',          label: tf('crm.field_role',          'Rôle'),            hints: ['role', 'poste', 'title', 'titre'] },
    ] },
    { id: 'companies', label: 'Entreprises', fields: [
      { key: 'company',       label: tf('crm.field_company',       'Entreprise'),      hints: ['name', 'nom', 'company', 'société', 'entreprise'] },
    ] },
  ];

  const [active, setActive] = useState('transactions');
  const [status, setStatus] = useState({ databases: { transactions: null, contacts: null, companies: null } });
  const [propsByType, setPropsByType] = useState({ transactions: [], contacts: [], companies: [] });
  const [mappings, setMappings] = useState({ transactions: {}, contacts: {}, companies: {} });
  // RefBoost canonical stage slug → Notion Status/Select option name.
  // Empty string = "don't map this stage" → sync will omit the status
  // field for referrals in that stage.
  const [statusMapping, setStatusMapping] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [savedOk, setSavedOk] = useState(false);

  // The 6 RefBoost pipeline stages (canonical slugs). Kept stable so
  // the JSONB in DB always has the same keys regardless of locale.
  const REFBOOST_STATUSES = [
    { slug: 'new',        labelKey: 'notion.status_new',        fallback: 'Nouveau' },
    { slug: 'contacted',  labelKey: 'notion.status_contacted',  fallback: 'Contacté' },
    { slug: 'qualified',  labelKey: 'notion.status_qualified',  fallback: 'Qualifié' },
    { slug: 'proposal',   labelKey: 'notion.status_proposal',   fallback: 'Proposition' },
    { slug: 'won',        labelKey: 'notion.status_won',        fallback: 'Gagné' },
    { slug: 'lost',       labelKey: 'notion.status_lost',       fallback: 'Perdu' },
  ];

  useEffect(() => {
    (async () => {
      try {
        const [st, m] = await Promise.all([
          api.getNotionStatus(),
          api.getNotionMappings().catch(() => ({ mappings: {} })),
        ]);
        setStatus(st);

        // Fetch properties for each configured DB in parallel; skip
        // the unconfigured ones.
        const tasks = ['transactions', 'contacts', 'companies']
          .filter(t => st.databases?.[t])
          .map(async type => {
            try { const p = await api.getNotionProperties(type); return [type, p.properties || []]; }
            catch { return [type, []]; }
          });
        const results = await Promise.all(tasks);
        const byType = { transactions: [], contacts: [], companies: [] };
        for (const [type, props] of results) byType[type] = props;
        setPropsByType(byType);

        // Auto-suggest: anything not already mapped gets a best-guess
        // match against property names via per-field `hints`.
        const merged = { transactions: {}, contacts: {}, companies: {} };
        for (const tab of TABS) {
          const props = byType[tab.id] || [];
          const byLower = Object.fromEntries(props.map(p => [p.name.toLowerCase(), p.name]));
          const saved = m.mappings?.[tab.id] || {};
          for (const f of tab.fields) {
            if (saved[f.key]) { merged[tab.id][f.key] = saved[f.key]; continue; }
            const found = f.hints.map(h => byLower[h]).find(Boolean);
            merged[tab.id][f.key] = found || '';
          }
        }
        setMappings(merged);
        setStatusMapping(m.statusMapping || {});
      } catch (e) { setErr(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const save = async () => {
    setSaving(true); setErr(''); setSavedOk(false);
    try {
      await api.updateNotionMappings(mappings, statusMapping);
      // Show the green confirmation and auto-close after 1.3s. Admins
      // who want to keep tweaking can click the X / backdrop before
      // the timer fires.
      setSavedOk(true);
      setTimeout(() => { onClose(); }, 1300);
    } catch (e) { setErr(e.message); }
    finally { setSaving(false); }
  };

  const inp = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1.5px solid #e2e8f0', fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box' };
  const currentTab = TABS.find(t => t.id === active);
  const currentProps = propsByType[active] || [];
  const currentDbConfigured = !!status.databases?.[active];

  return (
    <div onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 3000, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 620, maxHeight: '90vh', overflowY: 'auto', padding: 24 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: '#0f172a' }}>{t('notion.title')} — {t('notion.field_mapping')}</h3>
          <button type="button" onClick={onClose} style={{ background: '#f1f5f9', border: 'none', borderRadius: 8, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
            <X size={16}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#f1f5f9', borderRadius: 10, padding: 3, marginBottom: 14 }}>
          {TABS.map(tab => {
            const configured = !!status.databases?.[tab.id];
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActive(tab.id)}
                disabled={!configured}
                style={{
                  flex: 1, padding: '7px 10px', borderRadius: 8, border: 'none',
                  cursor: configured ? 'pointer' : 'not-allowed',
                  fontSize: 12, fontWeight: 600,
                  background: active === tab.id ? '#fff' : 'transparent',
                  color: !configured ? '#cbd5e1' : active === tab.id ? '#0f172a' : '#64748b',
                  boxShadow: active === tab.id ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                }}
              >
                {tab.label}{!configured && ' —'}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>…</div>
        ) : !currentDbConfigured ? (
          <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Base non configurée. Ajoutez l'ID dans la connexion Notion pour activer ce mapping.
          </div>
        ) : (
          <>
            <table style={{ width: '100%', marginBottom: 16 }}>
              <thead>
                <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.refboost_field')}</th>
                  <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.notion_property')}</th>
                </tr>
              </thead>
              <tbody>
                {currentTab.fields.map(f => (
                  <tr key={f.key}>
                    <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{f.label}</td>
                    <td style={{ padding: '4px 8px' }}>
                      <select
                        value={mappings[active]?.[f.key] || ''}
                        onChange={e => setMappings(m => ({ ...m, [active]: { ...m[active], [f.key]: e.target.value } }))}
                        style={inp}
                      >
                        <option value="">—</option>
                        {currentProps.map(p => (
                          <option key={p.id || p.name} value={p.name}>{p.name} ({p.type})</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ─── Status value mapping (Transactions tab only) ─────
                Lets the admin map each of the 6 canonical RefBoost
                stages to the matching option of their Notion Status
                or Select property. Without this, pushing
                `{ status: 'new' }` to a Notion Status property whose
                options are "Prospect" / "Signé" / etc. fails — Notion
                Status options are fixed and can't be auto-created.
                Dropdown values come from the Notion property the user
                picked in the field-mapping row above (status row). */}
            {active === 'transactions' && (() => {
              const statusPropName = mappings.transactions?.status;
              const statusProp = currentProps.find(p => p.name === statusPropName);
              const options = Array.isArray(statusProp?.options) ? statusProp.options : [];
              return (
                <div style={{ marginTop: 20, paddingTop: 18, borderTop: '1px solid #e2e8f0' }}>
                  <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{t('notion.status_mapping_title')}</h4>
                  <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b', lineHeight: 1.55 }}>{t('notion.status_mapping_hint')}</p>
                  {!statusPropName ? (
                    <div style={{ padding: 12, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, fontSize: 12 }}>
                      {t('notion.status_mapping_pick_property')}
                    </div>
                  ) : !options.length ? (
                    <div style={{ padding: 12, background: '#f1f5f9', color: '#475569', borderRadius: 8, fontSize: 12 }}>
                      {t('notion.status_mapping_no_options')}
                    </div>
                  ) : (
                    <table style={{ width: '100%' }}>
                      <thead>
                        <tr style={{ fontSize: 11, color: '#64748b', textAlign: 'left' }}>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.status_col_refboost')}</th>
                          <th style={{ padding: '6px 8px', fontWeight: 600 }}>{t('notion.status_col_notion')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {REFBOOST_STATUSES.map(s => (
                          <tr key={s.slug}>
                            <td style={{ padding: '4px 8px', fontSize: 13, color: '#334155' }}>{t(s.labelKey) || s.fallback}</td>
                            <td style={{ padding: '4px 8px' }}>
                              <select
                                value={statusMapping[s.slug] || ''}
                                onChange={e => setStatusMapping(sm => ({ ...sm, [s.slug]: e.target.value }))}
                                style={inp}
                              >
                                <option value="">{t('notion.status_ignore')}</option>
                                {options.map(opt => (
                                  <option key={opt} value={opt}>{opt}</option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })()}
          </>
        )}

        {err && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12 }}>{err}</div>}
        {savedOk && (
          <div style={{ background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#047857', padding: '8px 12px', borderRadius: 8, fontSize: 12, marginBottom: 12, fontWeight: 600 }}>
            {t('notion.mapping_saved')}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button type="button" onClick={onClose} style={{ padding: '10px 18px', borderRadius: 10, border: '1.5px solid #e2e8f0', background: '#fff', color: '#0f172a', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            {t('common.close') || 'Fermer'}
          </button>
          <button type="button" onClick={save} disabled={saving || savedOk} style={{ padding: '10px 18px', borderRadius: 10, border: 'none', background: '#059669', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving || savedOk ? 0.6 : 1 }}>
            {saving ? '…' : savedOk ? (t('notion.mapping_saved_short') || 'OK') : (t('common.save') || 'Enregistrer')}
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══ Partner notification preferences ═══
// Six email toggles; in-app delivery is always on per product spec
// so the UI only exposes the email column. Writes straight to
// partners.notification_preferences.
function PartnerNotificationsTab() {
  const { t } = useTranslation();
  const KEYS = [
    { key: 'email_referral_status',   label: t('partner_notifications.referral_status',   'Nouveau statut de mon referral') },
    { key: 'email_referral_won',      label: t('partner_notifications.referral_won',      'Referral gagné / commission déclenchée') },
    { key: 'email_commission_update', label: t('partner_notifications.commission_update', 'Commission approuvée / payée') },
    { key: 'email_new_message',       label: t('partner_notifications.new_message',       'Nouveau message') },
    { key: 'email_news',              label: t('partner_notifications.news',              'Actualité publiée') },
    { key: 'email_tier_change',       label: t('partner_notifications.tier_change',       'Changement de niveau') },
  ];
  const [prefs, setPrefs] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    api.getPartnerNotificationPreferences()
      .then(d => setPrefs(d.preferences || {}))
      .catch(() => setPrefs({}));
  }, []);

  const toggle = (k) => setPrefs(p => ({ ...p, [k]: !p[k] }));
  const save = async () => {
    setSaving(true);
    try { await api.updatePartnerNotificationPreferences(prefs); setSavedAt(Date.now()); }
    catch (err) { alert(err.message); }
    setSaving(false);
  };

  if (!prefs) return <div style={{ padding: 24, color: '#94a3b8' }}>…</div>;

  return (
    <div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
        {t('partner_notifications.title', 'Notifications')}
      </h2>
      <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24 }}>
        {t('partner_notifications.subtitle', 'Choisissez les emails que vous souhaitez recevoir. Les notifications dans l\'application restent toujours actives.')}
      </p>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', background: '#f8fafc', padding: '12px 16px', fontSize: 11, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>
          <div>{t('notifications.event', 'Événement')}</div>
          <div style={{ textAlign: 'center' }}>Email</div>
        </div>
        {KEYS.map(row => (
          <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '1fr 90px', padding: '14px 16px', borderTop: '1px solid #f1f5f9', alignItems: 'center' }}>
            <div style={{ fontSize: 14, color: '#0f172a', fontWeight: 500 }}>{row.label}</div>
            <div style={{ textAlign: 'center' }}>
              <button
                onClick={() => toggle(row.key)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: prefs[row.key] ? '#059669' : '#cbd5e1' }}
              >
                {prefs[row.key] ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 20 }}>
        <button onClick={save} disabled={saving} style={{
          padding: '10px 20px', borderRadius: 10, border: 'none',
          background: 'var(--rb-primary, #059669)', color: '#fff',
          fontWeight: 600, fontSize: 14, cursor: 'pointer', opacity: saving ? 0.7 : 1,
        }}>{saving ? t('common.saving', 'Enregistrement…') : t('common.save', 'Enregistrer')}</button>
        {savedAt && Date.now() - savedAt < 3000 && (
          <span style={{ color: '#16a34a', fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
            <CheckCircle size={14} /> {t('common.saved', 'Enregistré')}
          </span>
        )}
      </div>
    </div>
  );
}
