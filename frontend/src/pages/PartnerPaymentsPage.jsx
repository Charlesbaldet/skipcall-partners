import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { DollarSign, Clock, CreditCard } from 'lucide-react';
export default function PartnerPaymentsPage(){
  const{t}=useTranslation();
  const[payments,setPayments]=useState([]);const[totals,setTotals]=useState({total:0,pending:0,paid:0});const[loading,setLoading]=useState(true);const[iban,setIban]=useState('');const[bic,setBic]=useState('');const[holder,setHolder]=useState('');const[savingIban,setSavingIban]=useState(false);const[ibanSaved,setIbanSaved]=useState(false);
  useEffect(()=>{Promise.all([api.getMyCommissions(),api.getMyBankInfo()]).then(([c,b])=>{setPayments(c.commissions||[]);setTotals({total:c.total||0,pending:c.pending||0,paid:c.paid||0});if(b){setIban(b.iban||'');setBic(b.bic||'');setHolder(b.account_holder||'');}}).catch(console.error).finally(()=>setLoading(false));},[]);
  const saveIban=async()=>{setSavingIban(true);try{await api.updateBankInfo({iban,bic,account_holder:holder});setIbanSaved(true);setTimeout(()=>setIbanSaved(false),2000);}catch(e){alert(e.message);}setSavingIban(false);};
  const statusCfg=(t)=>({pending:{label:t('partnerPayments.pending'),color:'#f59e0b',bg:'#fffbeb'},paid:{label:t('partnerPayments.paid'),color:'#16a34a',bg:'#f0fdf4'}});
  if(loading)return<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('common.loading')}</div>;
  const SC=statusCfg(t);
  return(<div className='fade-in'>
    <div style={{marginBottom:24}}><h1 style={{fontSize:28,fontWeight:800,color:'#0f172a',letterSpacing:-0.5}}>{t('partnerPayments.title')}</h1><p style={{color:'#64748b',marginTop:4}}>{t('partnerPayments.subtitle')}</p></div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:28}}>
      <KPI icon={DollarSign} label={t('partnerPayments.kpi_total')} value={fmt(totals.total)} color='var(--rb-primary,#059669)'/>
      <KPI icon={Clock} label={t('partnerPayments.kpi_pending')} value={fmt(totals.pending)} color='#f59e0b'/>
      <KPI icon={CreditCard} label={t('partnerPayments.kpi_paid')} value={fmt(totals.paid)} color='#16a34a'/>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'2fr 1fr',gap:20}}>
      <div style={{background:'#fff',borderRadius:16,overflow:'hidden',border:'1px solid #e2e8f0'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}>
          <thead><tr style={{background:'#f8fafc'}}>{[t('partnerPayments.tbl_prospect'),t('partnerPayments.tbl_deal'),t('partnerPayments.tbl_rate'),t('partnerPayments.tbl_amount'),t('partnerPayments.tbl_status'),t('partnerPayments.tbl_date')].map((h,i)=><th key={i} style={{padding:'13px 16px',textAlign:'center',fontWeight:600,color:'#64748b',fontSize:11,textTransform:'uppercase',letterSpacing:0.5,borderBottom:'1px solid #e2e8f0'}}>{h}</th>)}</tr></thead>
          <tbody>{payments.length===0?<tr><td colSpan={6} style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('partnerPayments.no_data')}</td></tr>:payments.map(p=>{const cs=SC[p.status]||SC.pending;return(<tr key={p.id} style={{borderBottom:'1px solid #f8fafc'}}><td style={{padding:'13px 16px'}}><div style={{fontWeight:600,color:'#0f172a'}}>{p.prospect_name}</div><div style={{color:'#94a3b8',fontSize:12}}>{p.prospect_company}</div></td><td style={{padding:'13px 16px',fontWeight:600}}>{fmt(p.deal_value)}</td><td style={{padding:'13px 16px'}}><span style={{padding:'3px 8px',borderRadius:6,background:'#eef2ff',color:'var(--rb-primary,#059669)',fontWeight:700,fontSize:12}}>{p.rate}%</span></td><td style={{padding:'13px 16px',fontWeight:800,color:'#f59e0b',fontSize:16}}>{fmt(p.amount)}</td><td style={{padding:'13px 16px'}}><span style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:cs.bg,color:cs.color}}>{cs.label}</span></td><td style={{padding:'13px 16px',color:'#94a3b8',fontSize:13}}>{fmtDate(p.created_at)}</td></tr>);})}</tbody>
        </table>
      </div>
      <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',height:'fit-content'}}>
        <h3 style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:20}}>{t('partnerPayments.iban_title')}</h3>
        <div style={{display:'flex',flexDirection:'column',gap:14}}>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#334155',marginBottom:6}}>{t('partnerPayments.iban_label')}</label><input value={iban} onChange={e=>setIban(e.target.value)} placeholder={t('partnerPayments.iban_ph')} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'2px solid #e2e8f0',fontSize:14,fontFamily:'monospace',boxSizing:'border-box'}}/></div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#334155',marginBottom:6}}>{t('partnerPayments.bic_label')}</label><input value={bic} onChange={e=>setBic(e.target.value)} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'2px solid #e2e8f0',fontSize:14,fontFamily:'monospace',boxSizing:'border-box'}}/></div>
          <div><label style={{display:'block',fontWeight:600,fontSize:13,color:'#334155',marginBottom:6}}>{t('partnerPayments.holder_label')}</label><input value={holder} onChange={e=>setHolder(e.target.value)} style={{width:'100%',padding:'12px 14px',borderRadius:10,border:'2px solid #e2e8f0',fontSize:14,boxSizing:'border-box'}}/></div>
          <button onClick={saveIban} disabled={savingIban} style={{padding:'12px',borderRadius:10,background:'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:600,fontSize:14,cursor:'pointer',opacity:savingIban?0.7:1}}>{savingIban?t('partnerPayments.iban_saving'):ibanSaved?t('partnerPayments.iban_saved'):t('partnerPayments.iban_save')}</button>
        </div>
      </div>
    </div>
  </div>);
}
function KPI({icon:Icon,label,value,color}){return(<div style={{padding:20,borderRadius:16,background:'#fff',border:'1px solid #e2e8f0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{color:'#64748b',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>{label}</div><div style={{fontSize:26,fontWeight:800,color,letterSpacing:-1}}>{value}</div></div><div style={{width:40,height:40,borderRadius:10,background:color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon size={20} color={color}/></div></div></div>);}