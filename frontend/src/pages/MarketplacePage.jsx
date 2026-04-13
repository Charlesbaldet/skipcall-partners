import { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';
import api from '../lib/api';
import { Search, Filter, X } from 'lucide-react';
export default function MarketplacePage(){
  const {t}=useTranslation();
  const [programs,setPrograms]=useState([]); const [loading,setLoading]=useState(true); const [search,setSearch]=useState('');
  const [sector,setSector]=useState(''); const [sectors,setSectors]=useState([]);
  useEffect(()=>{api.getMarketplace().then(d=>{const ps=d.partners||[];setPrograms(ps);const s=[...new Set(ps.map(p=>p.sector).filter(Boolean))];setSectors(s);}).catch(console.error).finally(()=>setLoading(false));},[]);
  const filtered=programs.filter(p=>{const matchSearch=!search||p.name?.toLowerCase().includes(search.toLowerCase())||p.short_description?.toLowerCase().includes(search.toLowerCase());const matchSector=!sector||p.sector===sector;return matchSearch&&matchSector;});
  return(<div>
    <Helmet><title>{t('marketplace.helmet_title')}</title></Helmet>
    <div style={{marginBottom:32}}>
      <h1 style={{fontSize:28,fontWeight:800,color:'#0f172a',letterSpacing:-0.5,marginBottom:4}}>{t('marketplace.title')}</h1>
      <p style={{color:'#64748b'}}>{t('marketplace.subtitle')}</p>
    </div>
    <div style={{display:'flex',gap:12,marginBottom:28,flexWrap:'wrap'}}>
      <div style={{flex:1,minWidth:240,position:'relative'}}><Search size={16} color="#94a3b8" style={{position:'absolute',left:12,top:'50%',transform:'translateY(-50%)'}}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('marketplace.search_ph')} style={{width:'100%',padding:'10px 10px 10px 36px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:14,color:'#0f172a',outline:'none',boxSizing:'border-box'}}/></div>
      <select value={sector} onChange={e=>setSector(e.target.value)} style={{padding:'10px 14px',borderRadius:10,border:'1.5px solid #e2e8f0',fontSize:14,color:'#334155',background:'#fff',cursor:'pointer'}}>
        <option value="">{t('marketplace.all')}</option>
        {sectors.map(s=><option key={s} value={s}>{s}</option>)}
      </select>
      {(search||sector)&&<button onClick={()=>{setSearch('');setSector('');}} style={{padding:'10px 16px',borderRadius:10,background:'#f1f5f9',border:'none',color:'#64748b',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:6}}><X size={14}/>{t('marketplace.reset')}</button>}
    </div>
    {loading?<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('marketplace.loading')}</div>
    :filtered.length===0?<div style={{padding:48,textAlign:'center',color:'#94a3b8'}}>{t('marketplace.no_result')}</div>
    :<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:20}}>
      {filtered.map(p=>{const initials=p.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();const color=p.primary_color||'#059669';return(<div key={p.id} style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',boxShadow:'0 2px 10px rgba(0,0,0,0.04)',display:'flex',flexDirection:'column'}}>
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
          {p.logo_url?<img src={p.logo_url} alt={p.name} style={{width:44,height:44,borderRadius:10,objectFit:'contain'}}/> :<div style={{width:44,height:44,borderRadius:10,background:color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color}}>{initials}</div>}
          <div><div style={{fontWeight:700,fontSize:15,color:'#0f172a'}}>{p.name}</div>{p.sector&&<span style={{fontSize:11,fontWeight:600,color,background:color+'15',borderRadius:20,padding:'2px 8px'}}>{p.sector}</span>}</div>
        </div>
        <p style={{fontSize:13,color:'#64748b',lineHeight:1.6,margin:'0 0 12px',flex:1,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical'}}>{p.short_description}</p>
        {p.target_profile&&<div style={{fontSize:12,color:'#94a3b8',marginBottom:12}}><span style={{fontWeight:600}}>{t('marketplace.target')}</span> {p.target_profile}</div>}
        {p.commission_display&&<div style={{fontSize:13,fontWeight:700,color,marginBottom:16}}>{p.commission_display}</div>}
        <div style={{display:'flex',gap:8}}>
          {p.website&&<a href={p.website} target="_blank" rel="noopener noreferrer" style={{flex:1,padding:'8px',borderRadius:8,border:'1px solid #e2e8f0',background:'#fff',color:'#475569',fontSize:13,fontWeight:600,textDecoration:'none',textAlign:'center'}}>{t('marketplace.website')}</a>}
          <a href={'/apply?tenant='+p.id} style={{flex:2,padding:'8px',borderRadius:8,border:'none',background:'linear-gradient(135deg,'+color+','+color+'cc)',color:'#fff',fontSize:13,fontWeight:700,textDecoration:'none',textAlign:'center'}}>{t('marketplace.join')}</a>
        </div>
      </div>);})}
    </div>}
    <div style={{marginTop:48,background:'linear-gradient(135deg,#f0fdf4,#ecfdf5)',borderRadius:20,padding:32,border:'1px solid #bbf7d0',textAlign:'center'}}>
      <h3 style={{fontSize:20,fontWeight:800,color:'#0f172a',marginBottom:8}}>{t('marketplace.add_program')}</h3>
      <p style={{color:'#64748b',marginBottom:20}}>{t('marketplace.add_program_sub')}</p>
      <a href="/signup" style={{display:'inline-flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#059669,#10b981)',color:'#fff',padding:'14px 28px',borderRadius:12,fontWeight:700,fontSize:15,textDecoration:'none'}}>{t('marketplace.add_program_cta')}</a>
    </div>
  </div>);}