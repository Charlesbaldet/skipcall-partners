import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
const C={p:'#059669',s:'#0f172a',m:'#64748b',bg:'#fafbfc'};
export default function SetupPasswordPage() {
  const {t}=useTranslation(); const [sp]=useSearchParams();
  const token=sp.get('token'); const [valid,setValid]=useState(null); const [tenantName,setTenantName]=useState('');
  const [pwd,setPwd]=useState(''); const [confirm,setConfirm]=useState('');
  const [loading,setLoading]=useState(false); const [done,setDone]=useState(false); const [error,setError]=useState('');
  useEffect(()=>{if(!token){setValid(false);return;}
    api.request('/auth/verify-setup-token?token='+encodeURIComponent(token))
      .then(d=>{setValid(true);setTenantName(d.tenantName||'');}).catch(()=>setValid(false));
  },[token]);
  if(valid===null) return (<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}><p style={{color:C.m}}>{t('setupPwd.loading')}</p></div>);
  if(!valid) return (<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}>
    <div style={{textAlign:'center',padding:48}}><p style={{color:'#dc2626',marginBottom:16}}>{t('setupPwd.invalid')}</p>
    <a href="/login" style={{color:C.p,fontWeight:700}}>{t('setupPwd.back_to_login')}</a></div></div>);
  if(done) return (<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}>
    <div style={{textAlign:'center',background:'#fff',borderRadius:24,padding:48,maxWidth:400,boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}>
      <div style={{fontSize:52,marginBottom:16}}>🎉</div>
      <h2 style={{fontWeight:800,fontSize:24,color:C.s,margin:'0 0 12px'}}>{t('setupPwd.success_title')}</h2>
      <p style={{color:C.m,marginBottom:24}}>{t('setupPwd.success_text')}</p>
      <a href="/login" style={{color:C.p,fontWeight:700,textDecoration:'none'}}>{t('setupPwd.back_to_login')}</a></div></div>);
  const handleSubmit=async(e)=>{e.preventDefault();if(pwd!==confirm){setError(t('setupPwd.mismatch'));return;}
    setLoading(true);setError('');
    try{await api.request('/auth/setup-password',{method:'POST',body:JSON.stringify({token,password:pwd})});setDone(true);}
    catch(err){setError(err.message||t('common.error'));}setLoading(false);};
  const inp={width:'100%',padding:'14px 16px',borderRadius:12,border:'1.5px solid #e2e8f0',background:C.bg,fontSize:15,color:C.s,outline:'none',boxSizing:'border-box',marginBottom:16};
  return (<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:C.bg}}>
    <div style={{width:'100%',maxWidth:440,background:'#fff',borderRadius:24,padding:48,boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}>
      <div style={{fontSize:40,textAlign:'center',marginBottom:20}}>🚀</div>
      <h1 style={{fontWeight:800,fontSize:28,color:C.s,margin:'0 0 8px',textAlign:'center'}}>{t('setupPwd.title')}</h1>
      {tenantName&&<p style={{color:C.p,fontWeight:700,textAlign:'center',marginBottom:8}}>{tenantName}</p>}
      <p style={{color:C.m,margin:'0 0 32px',lineHeight:1.6,textAlign:'center'}}>{t('setupPwd.subtitle')}</p>
      {error&&<div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 14px',color:'#b91c1c',fontSize:13,marginBottom:16}}>{error}</div>}
      <form onSubmit={handleSubmit}>
        <label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:8}}>{t('setupPwd.pwd_label')}</label>
        <input type="password" value={pwd} onChange={e=>setPwd(e.target.value)} required style={inp}/>
        <label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:8}}>{t('setupPwd.confirm_label')}</label>
        <input type="password" value={confirm} onChange={e=>setConfirm(e.target.value)} required style={inp}/>
        <button type="submit" disabled={loading} style={{width:'100%',padding:15,borderRadius:12,border:'none',background:loading?'#94a3b8':C.p,color:'#fff',fontWeight:700,fontSize:15,cursor:loading?'not-allowed':'pointer'}}>
          {loading?t('setupPwd.submitting'):t('setupPwd.submit')}</button></form></div></div>);}