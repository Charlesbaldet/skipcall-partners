import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const C = { p: '#059669', pl: '#10b981', s: '#0f172a', m: '#64748b', a: '#f97316', bg: '#fafbfc' };
const g = (a,b) => `linear-gradient(135deg,${a},${b})`;

function Logo({ size = 36, white = false }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="lg-ll" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor={C.p}/><stop offset="100%" stopColor={C.pl}/></linearGradient></defs>
        <rect width="48" height="48" rx="14" fill="url(#lg-ll)"/>
        <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white"/>
        <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9"/>
      </svg>
      <span style={{ fontSize:size*0.55, fontWeight:800, letterSpacing:-1, color:white?'#fff':C.s, fontFamily:'inherit' }}>
        Ref<span style={{ color:C.p }}>Boost</span>
      </span>
    </div>
  );
}

export function LandingNav() {
  const navigate = useNavigate();
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,padding:'16px 48px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.98)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 1px 8px rgba(0,0,0,0.06)' }}>
      <a href="/" style={{ textDecoration:'none' }}><Logo size={36}/></a>
      <div style={{ display:'flex',alignItems:'center',gap:28 }}>
        {[['Fonctionnalités','/#fonctionnalites'],['Tarifs','/#tarifs'],['Témoignages','/#temoignages'],['Blog','/blog']].map(([label,href])=>(
          <a key={label} href={href} style={{ color:C.m,textDecoration:'none',fontSize:14,fontWeight:500,transition:'color .2s' }}
            onMouseEnter={e=>e.target.style.color=C.p} onMouseLeave={e=>e.target.style.color=C.m}>
            {label}
          </a>
        ))}
        <button onClick={()=>navigate('/login')} style={{ padding:'10px 24px',borderRadius:10,border:`2px solid ${C.s}`,background:'transparent',color:C.s,fontWeight:600,fontSize:14,cursor:'pointer',fontFamily:'inherit',transition:'all .2s' }}
          onMouseEnter={e=>{e.currentTarget.style.background=C.s;e.currentTarget.style.color='#fff';}} onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.s;}}>
          Connexion
        </button>
        <button onClick={()=>navigate('/signup')} style={{ padding:'10px 24px',borderRadius:10,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',fontFamily:'inherit',boxShadow:`0 4px 16px ${C.p}40` }}>
          Essai gratuit
        </button>
      </div>
    </nav>
  );
}

export function LandingFooter() {
  return (
    <footer style={{ padding:'48px 48px 32px',background:C.s,borderTop:'1px solid rgba(255,255,255,.05)' }}>
      <div style={{ maxWidth:1100,margin:'0 auto' }}>
        <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:32 }}>
          <div>
            <Logo size={28} white/>
            <p style={{ color:'#64748b',fontSize:13,marginTop:12,maxWidth:300,fontFamily:'inherit' }}>La plateforme de gestion de programme d'apporteurs d'affaires et de parrainage professionnel.</p>
          </div>
          <div style={{ display:'flex',gap:48 }}>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>Produit</div>
              {['Fonctionnalités','Tarifs','Sécurité','API'].map(x=><a key={x} href="#" style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{x}</a>)}
            </div>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>Ressources</div>
              {['Blog','Guide de démarrage','FAQ','Contact'].map(x=>(
                <a key={x} href={x==='Blog'?'/blog':'#'} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{x}</a>
              ))}
            </div>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>Légal</div>
              {['CGV','Confidentialité','Mentions légales','RGPD'].map(x=><a key={x} href="#" style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{x}</a>)}
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:20,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
          <div style={{ color:'#475569',fontSize:12 }}>© 2026 RefBoost. Tous droits réservés.</div>
          <div style={{ color:'#475569',fontSize:12 }}>Fait avec ❤️ en France</div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingLayout({ children }) {
  return (
    <div style={{ fontFamily:'inherit', background:'#fafbfc', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <LandingNav />
      <div style={{ flex:1, paddingTop:80 }}>
        {children}
      </div>
      <LandingFooter />
    </div>
  );
}
