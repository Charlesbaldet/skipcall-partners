import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
export default function PartnerSubmitPage(){
  const {t}=useTranslation();
  const [step,setStep]=useState(1); const [sent,setSent]=useState(false); const [submitting,setSubmitting]=useState(false);
  const [form,setForm]=useState({name:'',company:'',email:'',phone:'',role:'',notes:''});
  const set=(k,v)=>setForm(f=>({...f,[k]:v}));
  const handleSubmit=async(e)=>{e.preventDefault();setSubmitting(true);try{await api.submitReferral(form);setSent(true);}catch(err){alert(err.message);}setSubmitting(false);};
  const inp=(k,type='text',ph='')=>(<input type={type} value={form[k]} onChange={e=>set(k,e.target.value)} placeholder={ph} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:'#0f172a',outline:'none',boxSizing:'border-box'}}/>);
  if(sent) return(<div style={{maxWidth:560,margin:'0 auto',paddingTop:40,textAlign:'center'}}>
    <div style={{fontSize:52,marginBottom:16}}>✅</div>
    <h2 style={{fontSize:24,fontWeight:800,color:'#0f172a',marginBottom:12}}>{t('partnerSubmit.sent_title')}</h2>
    <p style={{color:'#64748b',marginBottom:24}}>{t('partnerSubmit.sent_text')}</p>
    <button onClick={()=>{setSent(false);setForm({name:'',company:'',email:'',phone:'',role:'',notes:''});setStep(1);}} style={{padding:'12px 28px',borderRadius:12,background:'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer'}}>{t('partnerSubmit.new_recommend')}</button>
  </div>);
  return(<div style={{maxWidth:560,margin:'0 auto',paddingTop:24}}>
    <h1 style={{fontSize:28,fontWeight:800,color:'#0f172a',marginBottom:8}}>{t('partnerSubmit.title')}</h1>
    <p style={{color:'#64748b',marginBottom:32}}>{t('partnerSubmit.subtitle')}</p>
    <form onSubmit={handleSubmit}>
      {step===1&&(<div style={{background:'#fff',borderRadius:20,padding:28,border:'1px solid #e2e8f0',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
        <h2 style={{fontSize:18,fontWeight:700,color:'#0f172a',marginBottom:20}}>{t('partnerSubmit.prospect_info')}</h2>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:6}}>{t('partnerSubmit.name')}</label>{inp('name','text',t('partnerSubmit.name_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:6}}>{t('partnerSubmit.company')}</label>{inp('company','text',t('partnerSubmit.company_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:6}}>{t('partnerSubmit.email')}</label>{inp('email','email',t('partnerSubmit.email_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:6}}>{t('partnerSubmit.phone')}</label>{inp('phone','tel',t('partnerSubmit.phone_ph'))}</div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:6}}>{t('partnerSubmit.role')}</label>{inp('role','text',t('partnerSubmit.role_ph'))}</div>
        </div>
        <button type="button" onClick={()=>setStep(2)} style={{width:'100%',padding:'14px',borderRadius:12,background:'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:'pointer',marginTop:20}}>{t('partnerSubmit.continue')}</button>
      </div>)}
      {step===2&&(<div style={{background:'#fff',borderRadius:20,padding:28,border:'1px solid #e2e8f0',boxShadow:'0 2px 8px rgba(0,0,0,0.04)'}}>
        <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:6}}>{t('partnerSubmit.notes')}</label>
          <textarea value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder={t('partnerSubmit.notes_ph')} rows={5} style={{width:'100%',padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:15,color:'#0f172a',outline:'none',boxSizing:'border-box',resize:'vertical'}}/></div>
        <div style={{display:'flex',gap:12,marginTop:20}}>
          <button type="button" onClick={()=>setStep(1)} style={{flex:1,padding:'14px',borderRadius:12,background:'#f1f5f9',color:'#475569',border:'none',fontWeight:600,fontSize:15,cursor:'pointer'}}>{t('partnerSubmit.back')}</button>
          <button type="submit" disabled={submitting} style={{flex:2,padding:'14px',borderRadius:12,background:submitting?'#94a3b8':'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:700,fontSize:15,cursor:submitting?'not-allowed':'pointer'}}>{submitting?t('partnerSubmit.submitting'):t('partnerSubmit.submit')}</button>
        </div>
      </div>)}
    </form>
  </div>);}