import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
export default function PublicApplyPage(){
  const {t}=useTranslation();
  const [step,setStep]=useState(1); const [sent,setSent]=useState(false); const [submitting,setSubmitting]=useState(false);
  const [tenant,setTenant]=useState(null);
  const [form,setForm]=useState({full_name:'',company_name:'',email:'',phone:'',company_size:'',role:'',motivation:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  useEffect(()=>{const host=window.location.hostname;const parts=host.split('.');const sub=parts.length>=3?parts[0]:null;if(sub&&sub!=='www')api.getTenantByDomain(sub).then(d=>setTenant(d.tenant||d)).catch(()=>{});
    const params=new URLSearchParams(window.location.search);const tid=params.get('tenant');if(tid)api.getTenantById(tid).then(d=>setTenant(d.tenant||d)).catch(()=>{});},[]);
  const handleSubmit=async(e)=>{e.preventDefault();setSubmitting(true);try{await api.applyPartner({...form,tenant_id:tenant?.id});setSent(true);}catch(err){alert(err.message);}setSubmitting(false);};
  const inp=(k,type='text',ph='',req=false)=>(<input type={type} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={ph} required={req} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>);
  const C={p:tenant?.primary_color||'#059669',s:'#0f172a',m:'#64748b',bg:'#fafbfc'};
  if(sent) return(<div style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:C.bg,padding:24}}>
    <div style={{maxWidth:480,width:'100%',background:'#fff',borderRadius:24,padding:48,textAlign:'center',boxShadow:'0 20px 60px rgba(0,0,0,0.08)'}}>
      <div style={{fontSize:52,marginBottom:16}}>🎉</div>
      <h2 style={{fontSize:24,fontWeight:800,color:C.s,marginBottom:12}}>{t('publicApply.sent_title')}</h2>
      <p style={{color:C.m,lineHeight:1.6}}>{t('publicApply.sent_text')}</p>
    </div></div>);
  return(<div style={{minHeight:'100vh',background:C.bg}}>
    <Helmet><title>{tenant?.name?tenant.name+' — ':''}{t('publicApply.title')}</title></Helmet>
    <div style={{maxWidth:900,margin:'0 auto',padding:'40px 24px'}}>
      <div style={{textAlign:'center',marginBottom:40}}>
        {tenant?.logo_url&&<img src={tenant.logo_url} alt={tenant.name} style={{height:48,marginBottom:16,objectFit:'contain'}}/>}
        <h1 style={{fontSize:32,fontWeight:800,color:C.s,marginBottom:8}}>{t('publicApply.title')}</h1>
        <p style={{color:C.m,fontSize:17}}>{t('publicApply.subtitle')}</p>
        <p style={{marginTop:12,fontSize:14,color:C.m}}>{t('publicApply.already')} <a href="/login" style={{color:C.p,fontWeight:600,textDecoration:'none'}}>{t('publicApply.login_link')}</a></p>
      </div>
      <form onSubmit={handleSubmit}>
        <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:24,alignItems:'start'}}>
          <div style={{background:'#fff',borderRadius:20,padding:32,border:'1px solid #e2e8f0',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
            {step===1&&(<div>
              <h2 style={{fontSize:18,fontWeight:700,color:C.s,marginBottom:20}}>{t('publicApply.step1')}</h2>
              <div style={{display:'flex',flexDirection:'column',gap:14}}>
                <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.name')}</label>{inp('full_name','text',t('publicApply.name_ph'),true)}</div>
                <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.company')}</label>{inp('company_name','text',t('publicApply.company_ph'),true)}</div>
                <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.email')}</label>{inp('email','email',t('publicApply.email_ph'),true)}</div>
                <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.phone')}</label>{inp('phone','tel',t('publicApply.phone_ph'))}</div>
                <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.size')}</label>
                  <select value={form.company_size} onChange={e=>set('company_size',e.target.value)} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:form.company_size?'#0f172a':'#94a3b8',background:'#fff',outline:'none'}}>
                    <option value="">{t('publicApply.size_ph')}</option>
                    {['1-10','11-50','51-200','200+'].map(s=><option key={s} value={s}>{s}</option>)}
                  </select></div>
                <div><label style={{display:'block',fontWeight:600,fontSize:13,color:C.s,marginBottom:6}}>{t('publicApply.role')}</label>{inp('role','text',t('publicApply.role_ph'))}</div>
              </div>
              <button type="button" onClick={()=>setStep(2)} style={{width:'100%',padding:'14px',borderRadius:12,background:C.p,color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer',marginTop:20}}>{t('publicApply.continue')}</button>
            </div>)}
            {step===2&&(<div>
              <h2 style={{fontSize:18,fontWeight:700,color:C.s,marginBottom:20}}>{t('publicApply.step2')}</h2>
              <textarea value={form.motivation} onChange={e=>set('motivation',e.target.value)} placeholder={t('publicApply.motivation_ph')} rows={6} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:'#0f172a',outline:'none',boxSizing:'border-box',resize:'vertical'}}/>
              <div style={{display:'flex',gap:12,marginTop:20}}>
                <button type="button" onClick={()=>setStep(1)} style={{flex:1,padding:'14px',borderRadius:12,background:'#f1f5f9',color:'#475569',border:'none',fontWeight:600,fontSize:15,cursor:'pointer'}}>{t('publicApply.back')}</button>
                <button type="submit" disabled={submitting} style={{flex:2,padding:'14px',borderRadius:12,background:submitting?'#94a3b8':C.p,color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:submitting?'not-allowed':'pointer'}}>{submitting?t('publicApply.submitting'):t('publicApply.submit')}</button>
              </div>
            </div>)}
          </div>
          <div style={{background:'#fff',borderRadius:20,padding:24,border:'1px solid #e2e8f0',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
            <h3 style={{fontSize:16,fontWeight:700,color:C.s,marginBottom:16}}>{t('publicApply.why_title')}</h3>
            {[['💰','Commissions attractives'],['📊','Dashboard dédié'],['🔗','Lien de tracking unique'],['💬','Support dédié']].map(([icon,txt])=>(<div key={txt} style={{display:'flex',alignItems:'center',gap:10,marginBottom:12}}><span style={{fontSize:20}}>{icon}</span><span style={{color:C.m,fontSize:14}}>{txt}</span></div>))}
          </div>
        </div>
      </form>
    </div></div>);}