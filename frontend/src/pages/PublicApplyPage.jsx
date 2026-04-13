import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';
import api from '../lib/api';
const C={p:'#059669',pl:'#10b981',s:'#0f172a',m:'#64748b',bg:'#fafbfc'};
const g=`linear-gradient(135deg,${C.p},${C.pl})`;
export default function PublicApplyPage(){
  const{t}=useTranslation();
  const{slug}=useParams();const[tenant,setTenant]=useState(null);const[loading,setLoading]=useState(true);const[step,setStep]=useState(1);const[sent,setSent]=useState(false);const[submitting,setSubmitting]=useState(false);
  const[form,setForm]=useState({company_name:'',contact_name:'',email:'',phone:'',company_website:'',company_size:'',motivation:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  useEffect(()=>{api.request(`/public/apply/${slug||''}`).then(d=>setTenant(d.tenant||d)).catch(()=>{}).finally(()=>setLoading(false));},[slug]);
  const handleSubmit=async(e)=>{e.preventDefault();setSubmitting(true);try{await api.request(`/public/apply/${slug||''}`,{method:'POST',body:JSON.stringify(form)});setSent(true);}catch(err){alert(err.message);}setSubmitting(false);};
  const accent=tenant?.primary_color||C.p;
  if(loading)return<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg}}><p style={{color:C.m}}>{t('publicApply.loading')||t('common.loading')}</p></div>;
  if(sent)return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:24,background:C.bg}}><div style={{maxWidth:480,width:'100%',textAlign:'center',background:'#fff',borderRadius:24,padding:48,boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}><div style={{fontSize:56,marginBottom:20}}>🎉</div><h2 style={{fontSize:26,fontWeight:800,color:C.s,marginBottom:12}}>{t('publicApply.sent_title')}</h2><p style={{color:C.m,lineHeight:1.6,marginBottom:28}}>{t('publicApply.sent_text')}</p><button onClick={()=>{setSent(false);setForm({company_name:'',contact_name:'',email:'',phone:'',company_website:'',company_size:'',motivation:''});setStep(1);}} style={{padding:'12px 28px',borderRadius:12,background:accent,color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>{t('publicApply.sent_back')}</button></div></div>);
  return(<div style={{minHeight:'100vh',background:C.bg,fontFamily:'inherit'}}>
    <div style={{background:accent,padding:'32px 24px',textAlign:'center'}}>
      {tenant?.logo_url&&<img src={tenant.logo_url} alt={tenant.name} style={{height:48,marginBottom:16,borderRadius:8}}/>}
      <h1 style={{color:'#fff',fontSize:26,fontWeight:800,marginBottom:8}}>{tenant?.name||'RefBoost'}</h1>
      <p style={{color:'rgba(255,255,255,0.85)',fontSize:16}}>{t('publicApply.title')}</p>
    </div>
    <div style={{maxWidth:560,margin:'0 auto',padding:'32px 24px'}}>
      <div style={{background:'#fff',borderRadius:20,padding:32,boxShadow:'0 4px 20px rgba(0,0,0,0.06)',border:'1px solid #e2e8f0'}}>
        {step===1&&(<>
          <h2 style={{fontSize:20,fontWeight:700,color:C.s,marginBottom:24}}>{t('publicApply.step1_title')}</h2>
          <div style={{display:'flex',flexDirection:'column',gap:16}}>
            {[[t('publicApply.field_company'),'company_name','text',true],[t('publicApply.field_contact'),'contact_name','text',true],[t('publicApply.field_email'),'email','email',true],[t('publicApply.field_phone'),'phone','tel',false],[t('publicApply.field_website'),'company_website','url',false]].map(([label,key,type,req])=>(<div key={key}><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{label}</label><input type={type} value={form[key]} onChange={e=>set(key,e.target.value)} required={req} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:C.s,outline:'none',boxSizing:'border-box'}}/></div>))}
            <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.field_size')}</label><select value={form.company_size} onChange={e=>set('company_size',e.target.value)} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:C.s,background:'#fff',cursor:'pointer'}}><option value="">—</option>{[['1-10','size_1'],['10-50','size_2'],['50-200','size_3'],['200+','size_4']].map(([val,key])=><option key={key} value={val}>{t(`publicApply.${key}`)}</option>)}</select></div>
          </div>
          <button onClick={()=>setStep(2)} disabled={!form.company_name||!form.contact_name||!form.email} style={{width:'100%',marginTop:24,padding:'14px',borderRadius:12,border:'none',background:accent,color:'#fff',fontWeight:700,fontSize:15,cursor:'pointer',opacity:(!form.company_name||!form.contact_name||!form.email)?0.5:1}}>{t('publicApply.continue')}</button>
        </>)}
        {step===2&&(<form onSubmit={handleSubmit}>
          <h2 style={{fontSize:20,fontWeight:700,color:C.s,marginBottom:24}}>{t('publicApply.step2_title')}</h2>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.field_motivation')}</label><textarea value={form.motivation} onChange={e=>set('motivation',e.target.value)} rows={5} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:C.s,outline:'none',boxSizing:'border-box',resize:'vertical',fontFamily:'inherit'}}/></div>
          <div style={{display:'flex',gap:12,marginTop:24}}>
            <button type="button" onClick={()=>setStep(1)} style={{flex:1,padding:'14px',borderRadius:12,background:'#f1f5f9',color:'#475569',border:'none',fontWeight:600,fontSize:15,cursor:'pointer'}}>{t('publicApply.back')}</button>
            <button type="submit" disabled={submitting} style={{flex:2,padding:'14px',borderRadius:12,border:'none',background:submitting?'#94a3b8':accent,color:'#fff',fontWeight:700,fontSize:15,cursor:submitting?'not-allowed':'pointer'}}>{submitting?t('publicApply.submitting'):t('publicApply.submit')}</button>
          </div>
        </form>)}
      </div>
    </div>
  </div>);
}