import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, ExternalLink, Globe, Users, Tag, ChevronLeft, Sparkles, Filter, X } from 'lucide-react';
import api from '../lib/api';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', a: '#f97316', m: '#64748b' };

const SECTORS_STATIC = [
  'SaaS / Logiciel','Conseil & Services','Finance & Fintech','RH & Recrutement',
  'Marketing & Communication','Immobilier','Santé','E-commerce','Formation',
  'Juridique','Comptabilité','Industrie','Autre',
];

function PartnerCard({ partner }) {
  const initials = partner.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();
  const color = partner.primary_color || C.p;
  return (
    <div style={{ background:'#fff', borderRadius:16, padding:'28px 24px', border:'1px solid #e2e8f0', boxShadow:'0 2px 12px rgba(0,0,0,.05)', display:'flex', flexDirection:'column', gap:16, transition:'transform .3s, box-shadow .3s' }}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-5px)';e.currentTarget.style.boxShadow='0 16px 48px rgba(5,150,105,.12)';}}
      onMouseLeave={e=>{e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,.05)';}}>
      <div style={{display:'flex',alignItems:'center',gap:14}}>
        {partner.logo_url
          ? <img src={partner.logo_url} alt={partner.name} style={{width:48,height:48,borderRadius:12,objectFit:'contain',border:'1px solid #f1f5f9'}}/>
          : <div style={{width:48,height:48,borderRadius:12,background:`${color}20`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,fontWeight:800,color}}>{initials}</div>}
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontWeight:700,fontSize:16,color:C.s}}>{partner.name}</div>
          {partner.sector && <span style={{display:'inline-flex',alignItems:'center',gap:4,fontSize:11,fontWeight:600,color,background:`${color}15`,borderRadius:20,padding:'2px 10px',marginTop:4}}><Tag size={10}/>{partner.sector}</span>}
        </div>
      </div>
      <p style={{fontSize:13.5,color:C.m,lineHeight:1.6,margin:0,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{partner.short_description}</p>
      {partner.icp && <div style={{display:'flex',alignItems:'center',gap:6,fontSize:12,color:C.m,background:'#f8fafc',borderRadius:8,padding:'6px 10px'}}><Users size={12} color={C.p}/><span><strong style={{color:C.s}}>Cible :</strong> {partner.icp}</span></div>}
      <div style={{display:'flex',gap:8,marginTop:'auto'}}>
        {partner.website && <a href={partner.website} target="_blank" rel="noopener noreferrer"
          style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px 16px',borderRadius:10,border:`1.5px solid ${color}`,color,fontWeight:600,fontSize:13,textDecoration:'none',transition:'all .2s'}}
          onMouseEnter={e=>{e.currentTarget.style.background=color;e.currentTarget.style.color='#fff';}}
          onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=color;}}><Globe size={14}/> Voir le site</a>}
        <a href={`/r/${partner.slug}`} style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'10px 16px',borderRadius:10,background:`linear-gradient(135deg,${color},${C.pl})`,color:'#fff',fontWeight:600,fontSize:13,textDecoration:'none'}}><ExternalLink size={14}/> Devenir partenaire</a>
      </div>
    </div>
  );
}

export default function MarketplacePage() {
  const navigate = useNavigate();
  const [partners, setPartners] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeSector, setActiveSector] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    api.getMarketplaceSectors().then(d => setSectors(d.sectors||[])).catch(()=>setSectors(SECTORS_STATIC));
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = {};
    if (activeSector) params.sector = activeSector;
    if (search.length > 1) params.q = search;
    const timer = setTimeout(() => {
      api.getMarketplace(params).then(d=>setPartners(d.partners||[])).catch(()=>setPartners([])).finally(()=>setLoading(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [search, activeSector]);

  const reset = () => { setSearch(''); setActiveSector(''); };

  return (
    <div style={{minHeight:'100vh',background:'#f8fafc',fontFamily:"'Outfit','DM Sans',sans-serif"}}>
      {/* Header */}
      <div style={{background:`linear-gradient(135deg,${C.s} 0%,#1e293b 100%)`,padding:'64px 24px 80px',position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-80,right:-80,width:320,height:320,borderRadius:'50%',background:`${C.p}20`,filter:'blur(60px)'}}/>
        <div style={{maxWidth:960,margin:'0 auto',position:'relative'}}>
          <button onClick={()=>navigate('/')} style={{display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',color:'#fff',borderRadius:8,padding:'6px 14px',fontSize:13,cursor:'pointer',marginBottom:32}}>
            <ChevronLeft size={14}/> Retour
          </button>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:12}}>
            <div style={{background:`${C.p}30`,borderRadius:12,padding:10,display:'flex',alignItems:'center'}}><Sparkles size={22} color={C.pl}/></div>
            <span style={{background:`${C.p}25`,border:`1px solid ${C.p}40`,color:C.pl,borderRadius:20,padding:'4px 14px',fontSize:12,fontWeight:700}}>Marketplace RefBoost</span>
          </div>
          <h1 style={{fontSize:'clamp(28px,5vw,48px)',fontWeight:900,color:'#fff',margin:'0 0 12px',lineHeight:1.1}}>Découvrez des programmes<br/><span style={{color:C.pl}}>de parrainage</span> vérifiés</h1>
          <p style={{color:'#94a3b8',fontSize:16,margin:'0 0 36px',maxWidth:560}}>Toutes les entreprises ci-dessous ont un programme de parrainage actif. Rejoignez-les en tant qu'apporteur d'affaires.</p>
          {/* Search */}
          <div style={{background:'#fff',borderRadius:14,padding:'6px 6px 6px 20px',display:'flex',alignItems:'center',gap:10,boxShadow:'0 8px 40px rgba(0,0,0,.3)',maxWidth:600}}>
            <Search size={18} color={C.m}/>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Chercher par nom, service, cible…" style={{flex:1,border:'none',outline:'none',fontSize:15,color:C.s,fontFamily:'inherit',background:'transparent'}}/>
            {search && <button onClick={()=>setSearch('')} style={{background:'none',border:'none',cursor:'pointer',padding:4}}><X size={16} color={C.m}/></button>}
            <button onClick={()=>setShowFilters(v=>!v)} style={{display:'flex',alignItems:'center',gap:6,background:showFilters?C.p:C.s,color:'#fff',border:'none',borderRadius:10,padding:'10px 18px',fontWeight:600,fontSize:13,cursor:'pointer',fontFamily:'inherit'}}>
              <Filter size={14}/> Filtres {activeSector?'•':''}
            </button>
          </div>
        </div>
      </div>
      {/* Filters */}
      {showFilters && (
        <div style={{background:'#fff',borderBottom:'1px solid #e2e8f0',padding:'16px 24px'}}>
          <div style={{maxWidth:960,margin:'0 auto',display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
            <span style={{fontSize:12,fontWeight:700,color:C.m,marginRight:4}}>SECTEUR :</span>
            <button onClick={()=>setActiveSector('')} style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',border:`1.5px solid ${!activeSector?C.p:'#e2e8f0'}`,background:!activeSector?C.p:'#fff',color:!activeSector?'#fff':C.m}}>Tous</button>
            {sectors.map(s=><button key={s} onClick={()=>setActiveSector(activeSector===s?'':s)} style={{padding:'6px 14px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',border:`1.5px solid ${activeSector===s?C.p:'#e2e8f0'}`,background:activeSector===s?C.p:'#fff',color:activeSector===s?'#fff':C.m,transition:'all .2s'}}>{s}</button>)}
            {(activeSector||search) && <button onClick={reset} style={{display:'flex',alignItems:'center',gap:4,marginLeft:'auto',padding:'6px 12px',borderRadius:20,fontSize:12,fontWeight:600,cursor:'pointer',border:'1.5px solid #fecaca',background:'#fef2f2',color:'#dc2626'}}><X size={12}/> Réinitialiser</button>}
          </div>
        </div>
      )}
      {/* Content */}
      <div style={{maxWidth:960,margin:'0 auto',padding:'40px 24px 80px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:28}}>
          <p style={{color:C.m,fontSize:14,margin:0}}>{loading?'Chargement…':<><strong style={{color:C.s}}>{partners.length}</strong> programme{partners.length!==1?'s':''} trouvé{partners.length!==1?'s':''}{activeSector?` dans "${activeSector}"`:''}{search?` pour "${search}"`:''}</>}</p>
        </div>
        {loading ? (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:20}}>
            {[1,2,3,4,5,6].map(i=><div key={i} style={{background:'#fff',borderRadius:16,padding:28,border:'1px solid #e2e8f0',height:220}}><div style={{width:48,height:48,borderRadius:12,background:'#f1f5f9',marginBottom:16}}/><div style={{height:14,background:'#f1f5f9',borderRadius:4,marginBottom:8,width:'60%'}}/><div style={{height:12,background:'#f1f5f9',borderRadius:4,width:'90%'}}/></div>)}
          </div>
        ) : partners.length === 0 ? (
          <div style={{textAlign:'center',padding:'80px 24px',background:'#fff',borderRadius:20,border:'1px solid #e2e8f0'}}>
            <div style={{fontSize:48,marginBottom:16}}>🔍</div>
            <h3 style={{fontSize:20,fontWeight:700,color:C.s,margin:'0 0 8px'}}>Aucun résultat</h3>
            <p style={{color:C.m,margin:'0 0 20px'}}>{search||activeSector?"Essayez d'autres critères.":"Aucun programme visible pour le moment."}</p>
            {(search||activeSector) && <button onClick={reset} style={{padding:'10px 20px',borderRadius:10,background:C.p,color:'#fff',border:'none',cursor:'pointer',fontWeight:600}}>Voir tous les programmes</button>}
          </div>
        ) : (
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:20}}>
            {partners.map(p=><PartnerCard key={p.id} partner={p}/>)}
          </div>
        )}
        {/* CTA Footer */}
        <div style={{marginTop:64,textAlign:'center',background:`linear-gradient(135deg,${C.s},#1e293b)`,borderRadius:20,padding:'48px 24px',position:'relative',overflow:'hidden'}}>
          <div style={{position:'absolute',top:-40,right:-40,width:200,height:200,borderRadius:'50%',background:`${C.p}20`,filter:'blur(40px)'}}/>
          <h2 style={{color:'#fff',fontSize:26,fontWeight:800,margin:'0 0 8px'}}>Vous avez un programme de parrainage ?</h2>
          <p style={{color:'#94a3b8',margin:'0 0 24px',fontSize:15}}>Rejoignez RefBoost et gagnez en visibilité auprès de milliers d'apporteurs d'affaires.</p>
          <a href="/signup" style={{display:'inline-flex',alignItems:'center',gap:8,background:`linear-gradient(135deg,${C.p},${C.pl})`,color:'#fff',padding:'14px 28px',borderRadius:12,fontWeight:700,fontSize:15,textDecoration:'none',boxShadow:`0 8px 30px ${C.p}50`}}><Sparkles size={16}/> Créer mon espace gratuitement</a>
        </div>
      </div>
    </div>
  );
}