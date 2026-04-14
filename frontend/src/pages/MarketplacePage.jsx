import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import api from '../lib/api';
const C={p:'#059669',pl:'#10b981',s:'#0f172a',m:'#64748b',bg:'#fafbfc'};
export default function MarketplacePage(){
  const{t}=useTranslation();const navigate=useNavigate();
  const[programs,setPrograms]=useState([]);const[loading,setLoading]=useState(true);const[search,setSearch]=useState('');const[sector,setSector]=useState('');const[sectors,setSectors]=useState([]);
  useEffect(()=>{api.request('/marketplace').then(d=>{const ps=d.partners||d.programs||[];setPrograms(ps);const unique=[...new Set(ps.map(p=>p.sector).filter(Boolean))];setSectors(unique);}).catch(console.error).finally(()=>setLoading(false));},[]);
  const filtered=programs.filter(p=>{const matchSearch=!search||p.name?.toLowerCase().includes(search.toLowerCase())||p.short_description?.toLowerCase().includes(search.toLowerCase());const matchSector=!sector||p.sector===sector;return matchSearch&&matchSector;});
  if(loading)return<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('marketplace.loading')}</div>;
  return(<div className="fade-in">
    <div style={{marginBottom:32}}>
      <h1 style={{fontSize:28,fontWeight:800,color:C.s,letterSpacing:-0.5,marginBottom:8}}>{t('marketplace.title')}</h1>
      <p style={{color:C.m,fontSize:15}}>{t('marketplace.subtitle')}</p>
    </div>
    <div style={{display:'flex',gap:12,marginBottom:28,flexWrap:'wrap'}}>
      <input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('marketplace.search_ph')} style={{flex:'1 1 240px',padding:'10px 16px',borderRadius:10,border:'2px solid #e2e8f0',fontSize:14,color:C.s,outline:'none'}}/>
      <select value={sector} onChange={e=>setSector(e.target.value)} style={{padding:'10px 16px',borderRadius:10,border:'2px solid #e2e8f0',fontSize:14,fontWeight:600,color:C.s,background:'#fff',cursor:'pointer'}}>
        <option value="">{t('marketplace.all')}</option>
        {sectors.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      {(search||sector)&&<button onClick={()=>{setSearch('');setSector('');}} style={{padding:'10px 16px',borderRadius:10,border:'2px solid #e2e8f0',background:'#fff',color:C.m,fontWeight:600,fontSize:14,cursor:'pointer'}}>{t('marketplace.reset')}</button>}
    </div>
    {filtered.length===0?<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('marketplace.no_result')}</div>:(
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:20}}>
        {filtered.map(p=>{const initials=p.name?.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()||'?';const color=p.primary_color||C.p;return(
          <div key={p.id} style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',boxShadow:'0 2px 10px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column'}}>
            <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:16}}>
              {p.logo_url?<img src={p.logo_url} alt={p.name} style={{width:48,height:48,borderRadius:12,objectFit:'contain',border:'1px solid #e2e8f0'}}/>:<div style={{width:48,height:48,borderRadius:12,background:color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color}}>{initials}</div>}
              <div><div style={{fontWeight:700,color:C.s,fontSize:16}}>{p.name}</div>{p.sector&&<span style={{fontSize:11,fontWeight:600,color,background:color+'15',borderRadius:20,padding:'2px 8px'}}>{p.sector}</span>}</div>
            </div>
            {p.target_profile&&<div style={{fontSize:12,color:C.m,marginBottom:8}}><strong>{t('marketplace.target')}</strong> {p.target_profile}</div>}
            <p style={{fontSize:13,color:C.m,lineHeight:1.6,marginBottom:16,flex:1,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}}>{p.short_description}</p>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              {p.commission_rate&&<span style={{fontSize:13,fontWeight:700,color,background:color+'15',padding:'4px 10px',borderRadius:8}}>{p.commission_rate}%</span>}
              <button onClick={()=>navigate(`/apply/${p.slug||p.id}`)} style={{padding:'8px 16px',borderRadius:10,background:color,color:'#fff',border:'none',fontWeight:600,fontSize:13,cursor:'pointer'}}>{t('marketplace.join')}</button>
            </div>
          </div>
        );})}
      </div>
    )}
  </div>);
}