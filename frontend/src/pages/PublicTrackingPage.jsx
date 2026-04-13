import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
export default function PublicTrackingPage(){
  const {t}=useTranslation();
  const [loading,setLoading]=useState(true); const [valid,setValid]=useState(false); const [tenant,setTenant]=useState(null); const [partner,setPartner]=useState(null);
  const [submitted,setSubmitted]=useState(false); const [submitting,setSubmitting]=useState(false);
  const [form,setForm]=useState({full_name:'',email:'',phone:'',company_name:'',role:'',message:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  useEffect(()=>{const p=new URLSearchParams(window.location.search);const ref=p.get('ref')||window.location.pathname.split('/ref/')[1];
    if(!ref){setValid(false);setLoading(false);return;}
    api.getTrackingInfo(ref).then(d=>{if(d.valid){setValid(true);setTenant(d.tenant);setPartner(d.partner);}else{setValid(false);}}).catch(()=>setValid(false)).finally(()=>setLoading(false));},[]);
  const handleSubmit=async(e)=>{e.preventDefault();setSubmitting(true);const p=new URLSearchParams(window.location.search);const ref=p.get('ref')||window.location.pathname.split('/ref/')[1];
    try{await api.submitTracking(ref,form);setSubmitted(true);}catch(err){alert(err.message);}setSubmitting(false);};
  const C={p:tenant?.primary_color||'#059669',s:'#0f172a',m:'#64748b',bg:'#fafbfc'};
  if(loading) return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}><p style={{color:C.m}}>{t('publicTracking.loading')}</p></div>);
  if(!valid) return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg,padding:24}}><div style={{textAlign:'center'}}><div style={{fontSize:40,marginBottom:16}}>🔗</div><p style={{color:'#dc2626'}}>{t('publicTracking.invalid')}</p></div></div>);
  if(submitted) return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg,padding:24}}>
    <div style={{maxWidth:480,width:'100%',background:'#fff',borderRadius:24,padding:48,textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}>
      <div style={{fontSize:52,marginBottom:16}}>✅</div>
      <h2 style={{fontSize:24,fontWeight:800,color:C.s,marginBottom:12}}>{t('publicTracking.thank_you')}</h2>
      <p style={{color:C.m}}>{tenant?.name||''} {t('publicTracking.team_contact')}</p>
    </div></div>);
  const inp=(k,type='text',ph='')=>(<input type={type} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={ph} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>);
  return(<div style={{minHeight:'100vh',background:C.bg}}>
    <div style={{maxWidth:520,margin:'0 auto',padding:'60px 24px'}}>
      <div style={{textAlign:'center',marginBottom:40}}>
        {tenant?.logo_url&&<img src={tenant.logo_url} alt={tenant.name} style={{height:48,marginBottom:16,objectFit:'contain'}}/>}
        {!tenant?.logo_url&&<div style={{fontWeight:800,fontSize:22,color:C.s,marginBottom:8}}>{tenant?.name}</div>}
        <p style={{color:C.m}}>{t('publicTracking.fill_form')}</p>
      </div>
      <div style={{background:'#fff',borderRadius:20,padding:32,border:'1px solid #e2e8f0',boxShadow:'0 4px 20px rgba(0,0,0,0.06)'}}>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.name')}</label>{inp('full_name','text',t('publicTracking.name_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.email')}</label>{inp('email','email',t('publicTracking.email_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.phone')}</label>{inp('phone','tel',t('publicTracking.phone_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.company')}</label>{inp('company_name','text',t('publicTracking.company_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.role')}</label>{inp('role','text',t('publicTracking.role_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.message')}</label><textarea value={form.message} onChange={e=>set('message',e.target.value)} placeholder={t('publicTracking.message_ph')} rows={3} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:'#0f172a',outline:'none',boxSizing:'border-box',resize:'vertical'}}/></div>
          <button type="submit" disabled={submitting} style={{padding:'14px',borderRadius:12,background:submitting?'#94a3b8':C.p,color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:submitting?'not-allowed':'pointer',marginTop:4,boxShadow:'0 8px 30px '+C.p+'30'}}>{submitting?t('publicTracking.submitting'):t('publicTracking.submit')}</button>
        </form>
        <div style={{textAlign:'center',marginTop:16,fontSize:12,color:'#94a3b8'}}>{t('publicTracking.powered_by')} <a href="https://refboost.io" style={{color:'#64748b',fontWeight:600,textDecoration:'none'}}>RefBoost</a></div>
      </div>
    </div></div>);}