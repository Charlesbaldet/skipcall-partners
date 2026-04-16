import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { STATUS_CONFIG, LEVEL_CONFIG, fmt, fmtDate } from '../lib/constants';
import { ChevronRight, LayoutGrid, List } from 'lucide-react';
export default function PartnerMyReferrals(){
  const {t}=useTranslation();
  const [referrals,setReferrals]=useState([]); const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState('all'); const [viewMode,setViewMode]=useState('kanban');
  useEffect(()=>{api.getReferrals().then(d=>setReferrals(d.referrals||[])).catch(console.error).finally(()=>setLoading(false));},[]);
  const filtered=filter==='all'?referrals:referrals.filter(r=>r.status===filter);
  const grouped={};filtered.forEach(r=>{if(!grouped[r.status])grouped[r.status]=[];grouped[r.status].push(r);});
  return(<div className="fade-in">
    <div style={{marginBottom:24}}><h1 style={{fontSize:28,fontWeight:800,color:'#0f172a',letterSpacing:-0.5}}>{t('partnerReferrals.title')}</h1><p style={{color:'#64748b',marginTop:4}}>{t('partnerReferrals.subtitle')}</p></div>
    <div style={{display:'flex',gap:10,marginBottom:24,alignItems:'center'}}>
      <div style={{display:'flex',gap:2,background:'#f1f5f9',borderRadius:10,padding:3}}>
        <button onClick={()=>setViewMode('kanban')} style={{padding:'7px 12px',borderRadius:8,border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,background:viewMode==='kanban'?'#fff':'transparent',color:viewMode==='kanban'?'#0f172a':'#94a3b8',fontWeight:600,fontSize:12}}><LayoutGrid size={14}/>{t('partnerReferrals.view_kanban')}</button>
        <button onClick={()=>setViewMode('table')} style={{padding:'7px 12px',borderRadius:8,border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:4,background:viewMode==='table'?'#fff':'transparent',color:viewMode==='table'?'#0f172a':'#94a3b8',fontWeight:600,fontSize:12}}><List size={14}/>{t('partnerReferrals.view_table')}</button>
      </div>
      <select value={filter} onChange={e=>setFilter(e.target.value)} style={{padding:'8px 14px',borderRadius:10,border:'2px solid #e2e8f0',fontSize:13,fontWeight:600,color:'#334155',background:'#fff',cursor:'pointer'}}>
        <option value="all">{t('partnerReferrals.all_statuses')}</option>
        {Object.entries(STATUS_CONFIG).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
      </select>
    </div>
    {loading?<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('partnerReferrals.loading')}</div>
    :filtered.length===0?<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('partnerReferrals.no_result')}</div>
    :viewMode==='table'?(<div style={{background:'#fff',borderRadius:16,overflow:'hidden',border:'1px solid #e2e8f0'}}>
      <table style={{width:'100%',borderCollapse:'collapse',fontSize:14}}><thead><tr style={{background:'#f8fafc'}}>
        {[t('partnerReferrals.tbl_prospect'),t('partnerReferrals.tbl_company'),t('partnerReferrals.tbl_status'),t('partnerReferrals.tbl_value'),t('partnerReferrals.tbl_date')].map((h,i)=>(
          <th key={i} style={{padding:'13px 16px',textAlign:'center',fontWeight:600,color:'#64748b',fontSize:11,textTransform:'uppercase',letterSpacing:0.5,borderBottom:'1px solid #e2e8f0'}}>{h}</th>))}
      </tr></thead><tbody>
        {filtered.map(r=>{const sc=STATUS_CONFIG[r.status];return(<tr key={r.id} style={{borderBottom:'1px solid #f8fafc'}}>
          <td style={{padding:'13px 16px',fontWeight:600,color:'#0f172a'}}>{r.prospect_name}</td>
          <td style={{padding:'13px 16px',color:'#475569'}}>{r.prospect_company||'—'}</td>
          <td style={{padding:'13px 16px'}}>{sc&&<span style={{padding:'4px 10px',borderRadius:8,fontSize:12,fontWeight:600,background:sc.bg,color:sc.color}}>{sc.label}</span>}</td>
          <td style={{padding:'13px 16px',fontWeight:600,color:'#0f172a'}}>{r.deal_value>0?fmt(r.deal_value):'—'}</td>
          <td style={{padding:'13px 16px',color:'#94a3b8',fontSize:13}}>{fmtDate(r.created_at)}</td>
        </tr>);})}
      </tbody></table>
    </div>):(<div style={{display:'flex',gap:10,overflowX:'auto',paddingBottom:8}}>
      {Object.entries(STATUS_CONFIG).map(([status,sc])=>{const cards=grouped[status]||[];return(<div key={status} style={{minWidth:240,width:240,flexShrink:0,background:'#f8fafc',borderRadius:16,padding:12,border:'1px solid #e2e8f0'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,padding:'8px 10px',background:'#fff',borderRadius:10}}><div style={{display:'flex',alignItems:'center',gap:8}}><div style={{width:8,height:8,borderRadius:'50%',background:sc.color}}/><span style={{fontWeight:700,fontSize:13,color:'#0f172a'}}>{sc.label}</span></div><span style={{background:sc.bg,color:sc.color,fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:10}}>{cards.length}</span></div>
        <div style={{display:'flex',flexDirection:'column',gap:8}}>
          {cards.map(r=>(<div key={r.id} style={{background:'#fff',borderRadius:12,padding:12,border:'1px solid #e2e8f0'}}>
            <div style={{fontWeight:600,color:'#0f172a',fontSize:14,marginBottom:4}}>{r.prospect_name}</div>
            {r.prospect_company&&<div style={{color:'#94a3b8',fontSize:11,marginBottom:6}}>{r.prospect_company}</div>}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}><span style={{color:'#94a3b8',fontSize:11}}>{fmtDate(r.created_at)}</span>{r.deal_value>0&&<span style={{fontWeight:700,color:'#0f172a',fontSize:13}}>{fmt(r.deal_value)}</span>}</div>
          </div>))}
          {cards.length===0&&<div style={{padding:16,textAlign:'center',color:'#cbd5e1',fontSize:12}}>—</div>}
        </div></div>);})}
    </div>)}
  </div>);}