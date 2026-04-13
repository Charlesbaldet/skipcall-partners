import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { fmt, fmtDate } from '../lib/constants';
import { DollarSign, Clock, CheckCircle, Banknote } from 'lucide-react';
const COM_STATUS_COLORS={pending:{color:'#f59e0b',bg:'#fffbeb'},approved:{color:'var(--rb-primary,#059669)',bg:'#eef2ff'},paid:{color:'#16a34a',bg:'#f0fdf4'}};
export default function PartnerPaymentsPage(){
  const {t}=useTranslation();
  const [commissions,setCommissions]=useState([]); const [totals,setTotals]=useState({pending:0,paid:0,total:0});
  const [loading,setLoading]=useState(true); const [iban,setIban]=useState(''); const [savingIban,setSavingIban]=useState(false); const [ibanSaved,setIbanSaved]=useState(false);
  useEffect(()=>{Promise.all([api.getMyCommissions(),api.getMyProfile()]).then(([c,p])=>{setCommissions(c.commissions||[]);const total=c.commissions?.reduce((s,x)=>s+parseFloat(x.amount||0),0)||0;const paid=c.commissions?.filter(x=>x.status==='paid').reduce((s,x)=>s+parseFloat(x.amount||0),0)||0;const pending=total-paid;setTotals({pending,paid,total});setIban(p.partner?.iban||p.iban||'');}).catch(console.error).finally(()=>setLoading(false));},[]);
  const saveIban=async()=>{setSavingIban(true);try{await api.updateMyProfile({iban});setIbanSaved(true);setTimeout(()=>setIbanSaved(false),2000);}catch(err){alert(err.message);}setSavingIban(false);};
  if(loading) return <div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('partnerPayments.loading')}</div>;
  return(<div className="fade-in">
    <h1 style={{fontSize:28,fontWeight:800,color:'#0f172a',letterSpacing:-0.5,marginBottom:4}}>{t('partnerPayments.title')}</h1>
    <p style={{color:'#64748b',marginBottom:28}}>{t('partnerPayments.subtitle')}</p>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:16,marginBottom:28}}>
      <KPI icon={Clock} label={t('partnerPayments.kpi_pending')} value={fmt(totals.pending)} color="#f59e0b"/>
      <KPI icon={CheckCircle} label={t('partnerPayments.kpi_paid')} value={fmt(totals.paid)} color="#16a34a"/>
      <KPI icon={DollarSign} label={t('partnerPayments.kpi_total')} value={fmt(totals.total)} color="var(--rb-primary,#059669)"/>
    </div>
    <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',marginBottom:24}}>
      <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:16}}><Banknote size={18} color="#64748b"/><h3 style={{fontSize:16,fontWeight:700,color:'#0f172a'}}>{t('partnerPayments.bank_info')}</h3></div>
      <label style={{display:'block',fontWeight:600,fontSize:13,color:'#0f172a',marginBottom:8}}>{t('partnerPayments.iban_label')}</label>
      <div style={{display:'flex',gap:12}}>
        <input value={iban} onChange={e=>setIban(e.target.value)} placeholder={t('partnerPayments.iban_ph')} style={{flex:1,padding:'12px 16px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:14,fontFamily:'monospace',color:'#0f172a',outline:'none'}}/>
        <button onClick={saveIban} disabled={savingIban} style={{padding:'12px 20px',borderRadius:10,background:ibanSaved?'#16a34a':'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:600,fontSize:13,cursor:'pointer',whiteSpace:'nowrap'}}>{ibanSaved?t('partnerPayments.iban_saved'):savingIban?t('partnerPayments.saving'):t('partnerPayments.save_iban')}</button>
      </div>
    </div>
    <div style={{background:'#fff',borderRadius:16,overflow:'hidden',border:'1px solid #e2e8f0'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}><thead><tr style={{background:'#f8fafc'}}>
        {[t('partnerPayments.tbl_date'),t('partnerPayments.tbl_deal'),t('partnerPayments.tbl_commission'),t('partnerPayments.tbl_rate'),t('partnerPayments.tbl_status')].map((h,i)=>(
          <th key={i} style={{padding:'13px 16px',textAlign:'center',fontWeight:600,color:'#64748b',fontSize:11,textTransform:'uppercase',letterSpacing:0.5,borderBottom:'1px solid #e2e8f0'}}>{h}</th>))}
      </tr></thead><tbody>
        {commissions.length===0?<tr><td colSpan={5} style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('partnerPayments.no_payments')}</td></tr>
        :commissions.map(c=>{const sc=COM_STATUS_COLORS[c.status]||COM_STATUS_COLORS.pending;return(<tr key={c.id} style={{borderBottom:'1px solid #f8fafc'}}>
          <td style={{padding:'13px 16px',color:'#64748b',fontSize:13}}>{fmtDate(c.created_at)}</td>
          <td style={{padding:'13px 16px'}}><div style={{fontWeight:600,color:'#0f172a'}}>{c.prospect_name}</div><div style={{color:'#94a3b8',fontSize:12}}>{c.prospect_company}</div></td>
          <td style={{padding:'13px 16px',fontWeight:800,color:'#f59e0b',fontSize:16}}>{fmt(c.amount)}</td>
          <td style={{padding:'13px 16px'}}><span style={{padding:'3px 8px',borderRadius:6,background:'#eef2ff',color:'var(--rb-primary,#059669)',fontWeight:700,fontSize:12}}>{c.rate}%</span></td>
          <td style={{padding:'13px 16px'}}><span style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:sc.bg,color:sc.color}}>{c.status}</span></td>
        </tr>);})}
      </tbody></table>
    </div>
  </div>);}
function KPI({icon:Icon,label,value,color}){return(<div style={{padding:20,borderRadius:16,background:'#fff',border:'1px solid #e2e8f0'}}><div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}><div><div style={{color:'#64748b',fontSize:11,fontWeight:600,textTransform:'uppercase',letterSpacing:0.5,marginBottom:8}}>{label}</div><div style={{fontSize:26,fontWeight:800,color,letterSpacing:-1}}>{value}</div></div><div style={{width:40,height:40,borderRadius:10,background:color+'15',display:'flex',alignItems:'center',justifyContent:'center'}}><Icon size={20} color={color}/></div></div></div>);}