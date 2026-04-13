import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { Trash2, Plus } from 'lucide-react';
export default function ProgrammePage(){
  const{t}=useTranslation();
  const[levels,setLevels]=useState([]);const[revenueModel,setRevenueModel]=useState('CA');const[loading,setLoading]=useState(true);const[saving,setSaving]=useState(false);const[saved,setSaved]=useState(false);
  useEffect(()=>{Promise.all([api.getLevels(),api.getMyTenant()]).then(([ld,td])=>{setLevels(ld.levels||[]);const mt=td.tenant||td;setRevenueModel(mt?.revenue_model||'CA');}).catch(console.error).finally(()=>setLoading(false));},[]);
  const addLevel=()=>setLevels(prev=>[...prev,{name:'',min_deals:0,commission_rate:10,icon:'⭐'}]);
  const removeLevel=(idx)=>setLevels(prev=>prev.filter((_,i)=>i!==idx));
  const updateLevel=(idx,key,val)=>setLevels(prev=>prev.map((l,i)=>i===idx?{...l,[key]:val}:l));
  const handleSave=async()=>{setSaving(true);setSaved(false);try{await api.updateLevels({levels,revenue_model:revenueModel});setSaved(true);setTimeout(()=>setSaved(false),2000);}catch(e){alert(e.message);}setSaving(false);};
  if(loading)return<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('common.loading')}</div>;
  return(<div className='fade-in'>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:28}}>
      <div><h1 style={{fontSize:28,fontWeight:800,color:'#0f172a',letterSpacing:-0.5}}>{t('programme.title')}</h1><p style={{color:'#64748b',marginTop:4}}>{t('programme.subtitle')}</p></div>
      <button onClick={handleSave} disabled={saving} style={{padding:'10px 24px',borderRadius:12,background:saved?'#16a34a':'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:600,fontSize:14,cursor:'pointer',opacity:saving?0.7:1}}>{saving?t('programme.saving'):saved?t('programme.saved'):t('programme.save')}</button>
    </div>
    <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',marginBottom:20}}>
      <h3 style={{fontSize:16,fontWeight:700,color:'#0f172a',marginBottom:16}}>{t('programme.revenue_model')}</h3>
      <div style={{display:'flex',gap:10,flexWrap:'wrap'}}>
        {[['MRR',t('programme.revenue_mrr')],['ARR',t('programme.revenue_arr')],['CA',t('programme.revenue_ca')],['Other',t('programme.revenue_other')]].map(([val,label])=>(<button key={val} onClick={()=>setRevenueModel(val)} style={{padding:'10px 20px',borderRadius:10,border:'2px solid',borderColor:revenueModel===val?'var(--rb-primary,#059669)':'#e2e8f0',background:revenueModel===val?'#eef2ff':'#fff',color:revenueModel===val?'var(--rb-primary,#059669)':'#64748b',fontWeight:600,cursor:'pointer',fontSize:14}}>{label}</button>))}
      </div>
    </div>
    <div style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:20}}>
        <h3 style={{fontSize:16,fontWeight:700,color:'#0f172a'}}>{t('programme.title')}</h3>
        <button onClick={addLevel} style={{padding:'8px 16px',borderRadius:10,background:'var(--rb-primary,#059669)',color:'#fff',border:'none',fontWeight:600,fontSize:13,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><Plus size={14}/>{t('programme.add_level')}</button>
      </div>
      {levels.length===0&&<div style={{padding:32,textAlign:'center',color:'#94a3b8'}}>{t('programme.no_levels')}</div>}
      <div style={{display:'flex',flexDirection:'column',gap:12}}>
        {levels.map((l,idx)=>(<div key={idx} style={{display:'grid',gridTemplateColumns:'auto 1fr 1fr 1fr 40px',gap:12,alignItems:'center',padding:16,borderRadius:12,background:'#f8fafc',border:'1px solid #e2e8f0'}}>
          <input value={l.icon||'⭐'} onChange={e=>updateLevel(idx,'icon',e.target.value)} style={{width:40,textAlign:'center',fontSize:20,border:'none',background:'transparent'}}/>
          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5}}>{t('programme.level_name')}</label><input value={l.name} onChange={e=>updateLevel(idx,'name',e.target.value)} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'2px solid #e2e8f0',fontSize:14,marginTop:4,boxSizing:'border-box'}}/></div>
          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5}}>{t('programme.level_min_deals')}</label><input type='number' value={l.min_deals} onChange={e=>updateLevel(idx,'min_deals',e.target.value)} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'2px solid #e2e8f0',fontSize:14,marginTop:4,boxSizing:'border-box'}}/></div>
          <div><label style={{fontSize:11,fontWeight:600,color:'#64748b',textTransform:'uppercase',letterSpacing:0.5}}>{t('programme.level_rate')}</label><input type='number' value={l.commission_rate} onChange={e=>updateLevel(idx,'commission_rate',e.target.value)} style={{width:'100%',padding:'8px 12px',borderRadius:8,border:'2px solid #e2e8f0',fontSize:14,marginTop:4,boxSizing:'border-box'}}/></div>
          <button onClick={()=>removeLevel(idx)} style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:8,padding:8,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',marginTop:16}}><Trash2 size={14} color='#dc2626'/></button>
        </div>))}
      </div>
    </div>
  </div>);
}