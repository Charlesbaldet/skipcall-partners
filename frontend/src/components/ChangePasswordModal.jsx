import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';

const C = { p:'#059669', s:'#0f172a', m:'#64748b' };

export default function ChangePasswordModal({ user, onSuccess }) {
  const { t } = useTranslation();
  const [current, setCurrent] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPwd !== confirm) { setError(t('changePwd.mismatch')); return; }
    if (newPwd.length < 8) { setError(t('changePwd.weak')); return; }
    setLoading(true); setError('');
    try {
      await api.request('/auth/change-password', { method:'POST', body:JSON.stringify({ currentPassword:current, newPassword:newPwd }) });
      onSuccess?.();
    } catch(err) { setError(err.message || t('common.error')); }
    setLoading(false);
  };

  const inputStyle = { width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:C.s,outline:'none',boxSizing:'border-box',fontFamily:'inherit' };

  return (
    <div style={{ position:'fixed',inset:0,zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:'rgba(15,23,42,0.7)',backdropFilter:'blur(8px)' }}>
      <div style={{ background:'#fff',borderRadius:24,padding:40,width:'100%',maxWidth:440,boxShadow:'0 25px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ fontSize:40,textAlign:'center',marginBottom:16 }}>🔐</div>
        <h2 style={{ fontSize:22,fontWeight:800,color:C.s,textAlign:'center',margin:'0 0 8px' }}>{t('changePwd.title')}</h2>
        <p style={{ color:C.m,textAlign:'center',margin:'0 0 28px',fontSize:14 }}>{t('changePwd.subtitle')}</p>
        {error && <div style={{ background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 14px',color:'#b91c1c',fontSize:13,marginBottom:16 }}>{error}</div>}
        <form onSubmit={handleSubmit} style={{ display:'flex',flexDirection:'column',gap:14 }}>
          <div>
            <label style={{ display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6 }}>{t('changePwd.current')}</label>
            <input type="password" value={current} onChange={e=>setCurrent(e.target.value)} required style={inputStyle}/>
          </div>
          <div>
            <label style={{ display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6 }}>{t('changePwd.new_pwd')}</label>
            <input type="password" value={newPwd} onChange={e=>setNewPwd(e.target.value)} required style={inputStyle}/>
          </div>
          <div>
            <label style={{ display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6 }}>{t('changePwd.confirm')}</label>
            <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required style={inputStyle}/>
          </div>
          <button type="submit" disabled={loading}
            style={{ padding:'14px',borderRadius:12,border:'none',background:loading?'#94a3b8':C.p,color:'#fff',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer',marginTop:4 }}>
            {loading ? t('changePwd.submitting') : t('changePwd.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}