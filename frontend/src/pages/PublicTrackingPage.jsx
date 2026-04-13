import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
const C={p:'#059669',pl:'#10b981',s:'#0f172a',m:'#64748b',bg:'#fafbfc'};
export default function PublicTrackingPage(){
  const{t}=useTranslation();
  const{code}=useParams();const[loading,setLoading]=useState(true);const[valid,setValid]=useState(false);const[tenant,setTenant]=useState(null);const[submitted,setSubmitted]=useState(false);const[submitting,setSubmitting]=useState(false);
  const[form,setForm]=useState({name:'',company:'',email:'',phone:'',needs:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  useEffect(()=>{if(!code){setLoading(false);return;}api.request(`/public/track/${code}`).then(d=>{setTenant(d.tenant||d);setValid(true);}).catch(()=>setValid(false)).finally(()=>setLoading(false));},[code]);
  const handleSubmit=async(e)=>{e.preventDefault();setSubmitting(true);try{await api.request(`/public/track/${code}`,{method:'POST',body:JSON.stringify(form)});setSubmitted(true);}catch(err){alert(err.message);}setSubmitting(false);};
  const accent=tenant?.primary_color||C.p;
  if(loading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}><p style={{color:C.m}}>{t('publicTracking.loading')}</p></div>;
  if(!valid)return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:C.bg}}><div style={{maxWidth:440,width:'100%',textAlign:'center',background:'#fff',borderRadius:24,padding:48,boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}><div style={{fontSize:48,marginBottom:16}}>🔗</div><h2 style={{fontWeight:800,fontSize:22,color:C.s,marginBottom:12}}>{t('publicTracking.invalid_title')}</h2><p style={{color:C.m}}>{t('publicTracking.invalid_text')}</p></div></div>);
  if(submitted)return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:C.bg}}><div style={{maxWidth:480,width:'100%',textAlign:'center',background:'#fff',borderRadius:24,padding:48,boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}><div style={{fontSize:56,marginBottom:20}}>✅</div><h2 style={{fontSize:24,fontWeight:800,color:C.s,marginBottom:12}}>{t('publicTracking.thank_you')}</h2><p style={{color:C.m,lineHeight:1.6}}>{t('publicTracking.team_contact')}</p></div></div>);
  return(<div style={{minHeight:'100vh',background:C.bg}}>
    <div style={{background:accent,padding:'32px 24px',textAlign:'center'}}>
      {tenant?.logo_url&&<img src={tenant.logo_url} alt={tenant.name} style={{height:48,marginBottom:16,borderRadius:8}}/>}
      <h1 style={{color:'#fff',fontSize:24,fontWeight:800,marginBottom:8}}>{tenant?.name||'RefBoost'}</h1>
    </div>
    <div style={{maxWidth:520,margin:'0 auto',padding:'32px 24px'}}>
      <div style={{background:'#fff',borderRadius:20,padding:32,boxShadow:'0 4px 20px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0'}}>
        <h2 style={{fontSize:20,fontWeight:700,color:C.s,marginBottom:6}}>{t('publicTracking.thank_you')}</h2>
        <p style={{color:C.m,marginBottom:24,lineHeight:1.6}}>{t('publicTracking.fill_form')}</p>
        <form onSubmit={handleSubmit}>
          <div style={{display:'flex',flexDirection:'column',gap:14}}>
            {[[t('publicTracking.field_name'),'name','text',true],[t('publicTracking.field_company'),'company','text',false],[t('publicTracking.field_email'),'email','email',true],[t('publicTracking.field_phone'),'phone','tel',false]].map(([label,key,type,req])=>(<div key={key}><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{label}</label><input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} required={req} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:C.s,outline:'none',boxSizing:'border-box'}}/></div>))}
            <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicTracking.field_needs')}</label><textarea value={form.needs} onChange={e=>set('needs',e.target.value)} rows={3} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:C.s,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/></div>
          </div>
          <button type="submit" disabled={submitting} style={{width:'100%',marginTop:20,padding:'14px',borderRadius:12,border:'none',background:submitting?'#94a3b8':accent,color:'#fff',fontWeight:700,fontSize:15,cursor:submitting?'not-allowed':'pointer'}}>{submitting?t('publicTracking.submitting'):t('publicTracking.submit')}</button>
        </form>
      </div>
    </div>
  </div>);
}