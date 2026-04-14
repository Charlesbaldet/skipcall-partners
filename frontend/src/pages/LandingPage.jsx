import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from '../components/LanguageSwitcher';

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

const C = { p:'#059669',pl:'#10b981',pd:'#047857',s:'#0f172a',sl:'#1e293b',a:'#f97316',al:'#fb923c',m:'#64748b',bg:'#fafbfc' };
const g = (a,b) => `linear-gradient(135deg,${a},${b})`;

function Logo({ size = 40, white = false }) {
  return (
    <div style={{ display:'flex',alignItems:'center',gap:10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor={C.p}/><stop offset="100%" stopColor={C.pl}/></linearGradient></defs>
        <rect width="48" height="48" rx="14" fill="url(#lg)"/>
        <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white"/>
        <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9"/>
      </svg>
      <span style={{ fontSize:size*0.55,fontWeight:800,letterSpacing:-1,color:white?'#fff':C.s,fontFamily:'inherit' }}>
        Ref<span style={{ color:C.p }}>Boost</span>
      </span>
    </div>
  );
}


function BlogPreview({ t, C }) {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/blog/posts?limit=3')
      .then(r => r.json())
      .then(data => { setPosts((data.posts || []).slice(0, 3)); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div style={{textAlign:'center',padding:'40px 0',color:'#64748b'}}>...</div>;
  if (!posts.length) return <p style={{textAlign:'center',color:'#64748b'}}>{t('landing.blog.no_posts')}</p>;

  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(300px,1fr))',gap:24}}>
      {posts.map(post => (
        <a key={post.id} href={'/blog/' + post.slug} style={{textDecoration:'none',display:'block',background:'#fff',borderRadius:16,overflow:'hidden',boxShadow:'0 2px 16px rgba(0,0,0,0.08)',border:'1px solid #e2e8f0',transition:'transform .2s,box-shadow .2s'}}
          onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow='0 8px 32px rgba(0,0,0,0.15)';}}
          onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 2px 16px rgba(0,0,0,0.08)';}}>
          {post.cover_image_url && <img src={post.cover_image_url} alt={post.title} style={{width:'100%',height:180,objectFit:'cover'}} />}
          {!post.cover_image_url && <div style={{height:6,background:'linear-gradient(90deg,'+(C&&C.p?C.p:'#6366f1')+','+(C&&C.s?C.s:'#8b5cf6')+')'}} />}
          <div style={{padding:24}}>
            {post.category && <span style={{fontSize:12,fontWeight:600,color:(C&&C.p?C.p:'#6366f1'),textTransform:'uppercase',letterSpacing:1}}>{post.category}</span>}
            <h3 style={{fontSize:17,fontWeight:700,margin:'8px 0 10px',color:'#0f172a',lineHeight:1.4}}>{post.title}</h3>
            {post.excerpt && <p style={{fontSize:14,color:'#64748b',margin:'0 0 16px',lineHeight:1.6,display:'-webkit-box',WebkitLineClamp:3,WebkitBoxOrient:'vertical',overflow:'hidden'}}>{post.excerpt}</p>}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span style={{fontSize:12,color:'#94a3b8'}}>{post.reading_time_minutes} min</span>
              <span style={{fontSize:13,fontWeight:600,color:(C&&C.p?C.p:'#6366f1')}}>{t('landing.blog.read_more')}</span>
            </div>
          </div>
        </a>
      ))}
    </div>
  );
}


export default function LandingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();
  const [email, setEmail] = useState('');
  const [scrollY, setScrollY] = useState(0);
  const [featOpen, setFeatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [featuredPartners, setFeaturedPartners] = useState([]);

  useEffect(() => {
    fetch('/api/marketplace').then(r => r.ok ? r.json() : null).then(d => d && setFeaturedPartners((d.partners||[]).slice(0,3))).catch(()=>{});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || window._rb_tracked) return;
    window._rb_tracked = true;
    const track = (event, data={}) => {
      try { fetch('/api/analytics/track',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event,...data,url:window.location.href,ts:Date.now(),ref:document.referrer,ua:navigator.userAgent})}).catch(()=>{}); } catch(e){}
    };
    track('page_view');
    window._rb_track = track;
    let maxScroll=0;
    const onScroll=()=>{
      const pct=Math.round((window.scrollY/(document.body.scrollHeight-window.innerHeight))*100);
      if(pct>maxScroll){maxScroll=pct;if([25,50,75,100].includes(pct))track('scroll_depth',{depth:pct});}
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll',onScroll,{passive:true});
    setTimeout(()=>track('engaged_30s'),30000);
    setTimeout(()=>track('engaged_60s'),60000);
    return ()=>window.removeEventListener('scroll',onScroll);
  }, []);

  const trackClick = (label) => window._rb_track?.('cta_click',{label});

  // Translated data arrays
  const features = t('landing.features.items',{returnObjects:true});
  const testimonials = t('landing.testimonials.items',{returnObjects:true});
  const plans = t('landing.pricing.plans',{returnObjects:true});
  const faqItems = t('landing.faq.items',{returnObjects:true});
  const steps = t('landing.howItWorks.steps',{returnObjects:true});
  const featDropdown = [
    {href:'/fonctionnalites/pipeline',label:t('landing.featuresDropdown.pipeline_label'),desc:t('landing.featuresDropdown.pipeline_desc')},
    {href:'/fonctionnalites/commissions',label:t('landing.featuresDropdown.commissions_label'),desc:t('landing.featuresDropdown.commissions_desc')},
    {href:'/fonctionnalites/analytics',label:t('landing.featuresDropdown.analytics_label'),desc:t('landing.featuresDropdown.analytics_desc')},
    {href:'/fonctionnalites/personnalisation',label:t('landing.featuresDropdown.branding_label'),desc:t('landing.featuresDropdown.branding_desc')},
    {href:'/fonctionnalites/tracking',label:t('landing.featuresDropdown.tracking_label'),desc:t('landing.featuresDropdown.tracking_desc')},
  ];

  const s = {
    section:{padding:'100px 48px'},
    label:{fontSize:13,fontWeight:700,color:C.p,textTransform:'uppercase',letterSpacing:2,marginBottom:12},
    h2:{fontSize:44,fontWeight:800,letterSpacing:-2,margin:0},
    center:{textAlign:'center',marginBottom:64},
  };

  return (
    <div style={{fontFamily:'inherit',color:C.s,overflow:'hidden'}}>
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        .fu{animation:fadeUp .7s ease-out forwards;opacity:0}
        .fu1{animation-delay:.1s}.fu2{animation-delay:.2s}.fu3{animation-delay:.3s}.fu4{animation-delay:.4s}
        .hl{transition:transform .3s,box-shadow .3s}.hl:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(5,150,105,.15)!important}
        .bp{transition:all .3s}.bp:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(5,150,105,.35)}
        .bs:hover{background:${C.s}!important;color:#fff!important}
      `}</style>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ NAV Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <nav style={{position:'fixed',top:0,left:0,right:0,zIndex:100,padding:mobile?'14px 20px':'16px 48px',display:'flex',alignItems:'center',justifyContent:'space-between',background:scrollY>50?'rgba(255,255,255,.95)':'rgba(255,255,255,.85)',backdropFilter:'blur(20px)',borderBottom:scrollY>50?'1px solid rgba(0,0,0,.06)':'1px solid rgba(0,0,0,.02)',transition:'all .3s'}}>
        <Logo size={mobile?30:36}/>
        {mobile ? (
          <button onClick={()=>setMenuOpen(!menuOpen)} style={{background:'none',border:'none',cursor:'pointer',padding:8,display:'flex',flexDirection:'column',gap:5}} aria-label={t('nav.menu')}>
            <span style={{display:'block',width:22,height:2,background:menuOpen?'transparent':'#0f172a',transition:'all .2s',transform:menuOpen?'rotate(45deg) translate(5px,5px)':'none'}}/>
            <span style={{display:'block',width:22,height:2,background:'#0f172a',transition:'all .2s',transform:menuOpen?'rotate(-45deg) translate(0,-1px)':'none'}}/>
          </button>
        ) : (
          <div style={{display:'flex',alignItems:'center',gap:28}}>
            {/* FonctionnalitÃÂ©s dropdown */}
            <div style={{position:'relative'}} onMouseEnter={()=>setFeatOpen(true)} onMouseLeave={()=>setFeatOpen(false)}>
              <span style={{color:C.m,fontSize:14,fontWeight:500,cursor:'default',display:'flex',alignItems:'center',gap:4}}>
                {t('nav.features')} <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke={C.m} strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
              </span>
              {featOpen && (
                <div style={{position:'absolute',top:'100%',left:-16,background:'#fff',borderRadius:16,boxShadow:'0 12px 40px rgba(0,0,0,0.12)',border:'1px solid #f1f5f9',padding:8,paddingTop:16,minWidth:260,zIndex:200}}>
                  {featDropdown.map(({href,label,desc})=>(
                    <a key={href} href={href} style={{display:'block',padding:'10px 14px',borderRadius:10,textDecoration:'none'}} onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{fontWeight:600,fontSize:14,color:'#0f172a'}}>{label}</div>
                      <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{desc}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            {[['nav.marketplace','/marketplace'],['nav.pricing','#tarifs'],['nav.testimonials','#temoignages'],['nav.blog','/blog']].map(([key,href])=>(
              <a key={key} href={href} style={{color:C.m,textDecoration:'none',fontSize:14,fontWeight:500,cursor:'pointer',transition:'color .2s'}} onMouseEnter={e=>e.target.style.color=C.p} onMouseLeave={e=>e.target.style.color=C.m}>
                {t(key)}
              </a>
            ))}
            <LanguageSwitcher style={{}} />
            <button onClick={()=>navigate('/login')} className="bs" style={{padding:'10px 20px',borderRadius:10,border:`2px solid ${C.s}`,background:'transparent',color:C.s,fontWeight:600,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>{t('nav.login')}</button>
            <button onClick={()=>{trackClick('nav_cta');navigate('/signup');}} className="bp" style={{padding:'10px 20px',borderRadius:10,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',fontFamily:'inherit'}}>{t('nav.freeTrial')}</button>
          </div>
        )}
        {/* Mobile menu */}
        {mobile && menuOpen && (
          <div style={{position:'fixed',top:58,left:0,right:0,height:'calc(100vh - 58px)',zIndex:200,background:'#fff',overflowY:'auto',padding:'24px 20px'}}>
            <div style={{marginBottom:16}}>
              <div style={{fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>{t('nav.features')}</div>
              {featDropdown.map(({href,label,desc})=>(
                <a key={href} href={href} onClick={()=>setMenuOpen(false)} style={{display:'block',padding:'12px 0',borderBottom:'1px solid #f1f5f9',textDecoration:'none'}}>
                  <div style={{fontWeight:600,fontSize:15,color:'#0f172a'}}>{label}</div>
                  <div style={{fontSize:13,color:'#64748b',marginTop:2}}>{desc}</div>
                </a>
              ))}
            </div>
            <div style={{display:'flex',flexDirection:'column',gap:2,marginTop:16}}>
              {[['nav.marketplace','/marketplace'],['nav.pricing','/#tarifs'],['nav.testimonials','/#temoignages'],['nav.blog','/blog']].map(([key,href])=>(
                <a key={key} href={href} onClick={()=>setMenuOpen(false)} style={{display:'block',padding:'14px 0',borderBottom:'1px solid #f1f5f9',fontSize:16,fontWeight:500,color:'#0f172a',textDecoration:'none'}}>{t(key)}</a>
              ))}
            </div>
            <div style={{padding:'16px 0',borderBottom:'1px solid #f1f5f9'}}><LanguageSwitcher/></div>
            <div style={{display:'flex',flexDirection:'column',gap:12,marginTop:24}}>
              <button onClick={()=>{setMenuOpen(false);navigate('/login');}} style={{padding:'14px',borderRadius:12,border:'2px solid #0f172a',background:'transparent',color:'#0f172a',fontWeight:600,fontSize:16,cursor:'pointer',width:'100%'}}>{t('nav.login')}</button>
              <button onClick={()=>{setMenuOpen(false);navigate('/signup');}} style={{padding:'14px',borderRadius:12,border:'none',background:'linear-gradient(135deg,#059669,#10b981)',color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',width:'100%'}}>{t('nav.freeTrial')}</button>
            </div>
          </div>
        )}
      </nav>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ HERO Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section style={{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'140px 48px 80px',position:'relative',background:`radial-gradient(ellipse 80% 60% at 50% -20%,${C.p}12,transparent),radial-gradient(ellipse 60% 40% at 80% 80%,${C.a}08,transparent),${C.bg}`}}>
        <div style={{position:'absolute',top:120,left:80,width:300,height:300,borderRadius:'50%',background:`${C.p}06`,animation:'float 6s ease-in-out infinite'}}/>
        <div style={{position:'absolute',bottom:100,right:120,width:200,height:200,borderRadius:'50%',background:`${C.a}08`,animation:'float 8s ease-in-out infinite 2s'}}/>
        <div style={{maxWidth:900,textAlign:'center',position:'relative',zIndex:1}}>
          <div className="fu fu1" style={{display:'inline-flex',alignItems:'center',gap:8,padding:'6px 16px',borderRadius:50,background:`${C.p}10`,border:`1px solid ${C.p}20`,fontSize:13,fontWeight:600,color:C.p,marginBottom:28}}>
            <span style={{width:6,height:6,borderRadius:'50%',background:C.p}}/> {t('landing.hero.badge')}
          </div>
          <h1 className="fu fu2" style={{fontSize:mobile?32:68,fontWeight:900,lineHeight:1.1,letterSpacing:mobile?-1:-3,wordBreak:'break-word',overflowWrap:'break-word',margin:'0 0 24px',color:C.s}}>
            {t('landing.hero.h1_start')}<br/>
            <span style={{background:g(C.p,C.pl),WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>{t('landing.hero.h1_highlight')}</span>
          </h1>
          <p className="fu fu3" style={{fontSize:20,color:C.m,lineHeight:1.6,maxWidth:620,margin:'0 auto 40px',fontFamily:'inherit'}}>{t('landing.hero.description')}</p>
          <div className="fu fu4" style={{display:'flex',gap:mobile?10:16,justifyContent:'center',flexDirection:mobile?'column':'row'}}>
            <button onClick={()=>{trackClick('hero_cta');navigate('/signup');}} className="bp" style={{padding:mobile?'13px 0':'16px 36px',width:mobile?'100%':'auto',borderRadius:14,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:17,cursor:'pointer',fontFamily:'inherit',boxShadow:`0 8px 30px ${C.p}30`}}>{t('landing.hero.cta_primary')}</button>
            <button onClick={()=>document.getElementById('fonctionnalites')?.scrollIntoView({behavior:'smooth'})} className="bs" style={{padding:mobile?'13px 0':'16px 36px',width:mobile?'100%':'auto',borderRadius:14,border:'2px solid #e2e8f0',background:'#fff',color:C.s,fontWeight:600,fontSize:17,cursor:'pointer',fontFamily:'inherit'}}>{t('landing.hero.cta_secondary')}</button>
          </div>
          <div className="fu fu4" style={{display:'flex',alignItems:'center',justifyContent:'center',gap:32,marginTop:60,color:C.m,fontSize:14}}>
            <div><span style={{fontSize:28,fontWeight:800,color:C.s}}>{t('landing.hero.stat1_value')}</span><br/>{t('landing.hero.stat1_label')}</div>
            <div style={{width:1,height:40,background:'#e2e8f0'}}/>
            <div><span style={{fontSize:28,fontWeight:800,color:C.s}}>{t('landing.hero.stat2_value')}</span><br/>{t('landing.hero.stat2_label')}</div>
            <div style={{width:1,height:40,background:'#e2e8f0'}}/>
            <div><span style={{fontSize:28,fontWeight:800,color:C.s}}>{t('landing.hero.stat3_value')}</span><br/>{t('landing.hero.stat3_label')}</div>
          </div>
          <p className="fu fu4" style={{color:'#94a3b8',fontSize:12,marginTop:20}}>{t('landing.hero.trial_badges')}</p>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ FEATURES Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section id="fonctionnalites" style={{...s.section,background:'#fff'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={s.center}>
            <div style={s.label}>{t('landing.features.label')}</div>
            <h2 style={s.h2}>{t('landing.features.title')}<br/><span style={{color:C.p}}>{t('landing.features.title_highlight')}</span></h2>
            <p style={{color:C.m,fontSize:16,marginTop:16,maxWidth:600,margin:'16px auto 0',fontFamily:'inherit'}}>{t('landing.features.description')}</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)',gap:24}}>
            {Array.isArray(features) && features.map((f,i)=>(
              <div key={i} className="hl" style={{padding:32,borderRadius:20,background:'#fff',border:'1px solid #f1f5f9',boxShadow:'0 4px 20px rgba(0,0,0,.03)',cursor:'default'}}>
                <div style={{width:44,height:44,borderRadius:10,background:`${C.p}15`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16}}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={C.p} strokeWidth="2"/><path d="M8 12l2.5 2.5L16 9" stroke={C.p} strokeWidth="2" strokeLinecap="round"/></svg>
                </div>
                <h3 style={{fontSize:19,fontWeight:700,marginBottom:10}}>{f.title}</h3>
                <p style={{color:C.m,fontSize:14,lineHeight:1.7,margin:0,fontFamily:'inherit'}}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ HOW IT WORKS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section style={{...s.section,background:C.s}}>
        <div style={{maxWidth:900,margin:'0 auto',textAlign:'center'}}>
          <div style={{...s.label,color:C.pl}}>{t('landing.howItWorks.label')}</div>
          <h2 style={{...s.h2,color:'#fff',marginBottom:64}}>{t('landing.howItWorks.title')}</h2>
          <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)',gap:40}}>
            {Array.isArray(steps) && steps.map((st,i)=>(
              <div key={i} style={{textAlign:'center'}}>
                <div style={{width:64,height:64,borderRadius:16,margin:'0 auto 20px',background:g(C.p,C.pl),display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'#fff'}}>0{i+1}</div>
                <h3 style={{fontSize:20,fontWeight:700,color:'#fff',marginBottom:8}}>{st.title}</h3>
                <p style={{color:'#94a3b8',fontSize:14,lineHeight:1.7,margin:0,fontFamily:'inherit'}}>{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ TESTIMONIALS Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section id="temoignages" style={{...s.section,background:'#fff'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={s.center}>
            <div style={s.label}>{t('landing.testimonials.label')}</div>
            <h2 style={s.h2}>{t('landing.testimonials.title')}</h2>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)',gap:24}}>
            {Array.isArray(testimonials) && testimonials.map((t2,i)=>(
              <div key={i} className="hl" style={{padding:32,borderRadius:20,background:'#fafbfc',border:'1px solid #f1f5f9'}}>
                <div style={{display:'flex',gap:2,marginBottom:16}}><svg width='88' height='16' viewBox='0 0 88 16'>{[0,1,2,3,4].map(j=><path key={j} transform={`translate(${j*18},0)`} d='M8 1l1.8 5.5H16l-5 3.6 1.9 5.9L8 12.5l-4.9 3.5 1.9-5.9-5-3.6h6.2z' fill='#fbbf24'/>)}</svg></div>
                <p style={{color:'#334155',fontSize:15,lineHeight:1.7,margin:'0 0 24px',fontFamily:'inherit',fontStyle:'italic'}}>"{t2.t}"</p>
                <div style={{display:'flex',alignItems:'center',gap:12}}>
                  <div style={{width:44,height:44,borderRadius:12,background:g(C.p,C.pl),display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:18}}>{t2.a}</div>
                  <div>
                    <div style={{fontWeight:700,fontSize:14,color:C.s}}>{t2.n}</div>
                    <div style={{fontSize:12,color:C.m}}>{t2.r} ÃÂ· {t2.c}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ MARKETPLACE Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section id="marketplace" style={{padding:'80px 24px',background:'#fff'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:48}}>
            <span style={{display:'inline-flex',alignItems:'center',gap:6,background:'#ecfdf5',border:'1px solid #6ee7b7',color:'#059669',borderRadius:20,padding:'6px 16px',fontSize:12,fontWeight:700,marginBottom:16}}>{t('landing.marketplace.badge')}</span>
            <h2 style={{fontSize:'clamp(26px,4vw,40px)',fontWeight:900,color:'#0f172a',margin:'0 0 16px',lineHeight:1.15}}>{t('landing.marketplace.title_start')}<br/><span style={{color:'#059669'}}>{t('landing.marketplace.title_highlight')}</span></h2>
            <p style={{color:'#64748b',fontSize:16,maxWidth:560,margin:'0 auto'}}>{t('landing.marketplace.description')}</p>
          </div>
          {featuredPartners.length > 0 ? (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:20,marginBottom:40}}>
              {featuredPartners.map(p=>{
                const initials=p.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase();
                const color=p.primary_color||'#059669';
                return (
                  <div key={p.id} style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',boxShadow:'0 2px 10px rgba(0,0,0,.05)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                      {p.logo_url?<img src={p.logo_url} alt={p.name} style={{width:44,height:44,borderRadius:10,objectFit:'contain'}}/>:<div style={{width:44,height:44,borderRadius:10,background:color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color}}>{initials}</div>}
                      <div><div style={{fontWeight:700,fontSize:15,color:'#0f172a'}}>{p.name}</div>{p.sector&&<span style={{fontSize:11,fontWeight:600,color,background:color+'15',borderRadius:20,padding:'2px 8px'}}>{p.sector}</span>}</div>
                    </div>
                    <p style={{fontSize:13,color:'#64748b',lineHeight:1.6,margin:0,overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical'}}>{p.short_description}</p>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(300px,1fr))',gap:20,marginBottom:40}}>
              {[{name:'TechFlow SaaS',sector:'SaaS',desc:'Solution CRM pour PME. 15% de commission sur 12 mois.',color:'#059669'},{name:'ScaleUp Agency',sector:'Marketing',desc:'Agence growth B2B. 500 EUR par deal signÃÂ©.',color:'#7c3aed'},{name:'DataViz Pro',sector:'SaaS',desc:'Outil BI pour ÃÂ©quipes data. 20% MRR sur 6 mois.',color:'#0ea5e9'}].map((p,i)=>(
                <div key={i} style={{background:'#fff',borderRadius:16,padding:24,border:'1px solid #e2e8f0',boxShadow:'0 2px 10px rgba(0,0,0,.05)'}}>
                  <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
                    <div style={{width:44,height:44,borderRadius:10,background:p.color+'20',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16,fontWeight:800,color:p.color}}>{p.name.split(' ').slice(0,2).map(w=>w[0]).join('')}</div>
                    <div><div style={{fontWeight:700,fontSize:15,color:'#0f172a'}}>{p.name}</div><span style={{fontSize:11,fontWeight:600,color:p.color,background:p.color+'15',borderRadius:20,padding:'2px 8px'}}>{p.sector}</span></div>
                  </div>
                  <p style={{fontSize:13,color:'#64748b',lineHeight:1.6,margin:0}}>{p.desc}</p>
                </div>
              ))}
            </div>
          )}
          <div style={{display:'flex',gap:24,justifyContent:'center',marginBottom:36,flexWrap:'wrap'}}>
            {[{val:t('landing.marketplace.stat1_val'),label:t('landing.marketplace.stat1_label')},{val:t('landing.marketplace.stat2_val'),label:t('landing.marketplace.stat2_label')},{val:t('landing.marketplace.stat3_val'),label:t('landing.marketplace.stat3_label')}].map((s2,i)=>(
              <div key={i} style={{textAlign:'center',padding:'16px 32px',background:'#f8fafc',borderRadius:12}}>
                <div style={{fontSize:28,fontWeight:900,color:'#059669'}}>{s2.val}</div>
                <div style={{fontSize:12,color:'#64748b',marginTop:2}}>{s2.label}</div>
              </div>
            ))}
          </div>
          <div style={{textAlign:'center'}}>
            <a href="/marketplace" style={{display:'inline-flex',alignItems:'center',gap:8,background:'linear-gradient(135deg,#059669,#10b981)',color:'#fff',padding:'16px 36px',borderRadius:14,fontWeight:700,fontSize:16,textDecoration:'none',boxShadow:'0 8px 30px rgba(5,150,105,.35)'}}>{t('landing.marketplace.cta')}</a>
            <p style={{fontSize:13,color:'#94a3b8',marginTop:12}}>{t('landing.marketplace.cta_note')}</p>
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ PRICING Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section id="tarifs" style={{...s.section,background:C.bg}}>
        <div style={{maxWidth:1000,margin:'0 auto'}}>
          <div style={s.center}>
            <div style={s.label}>{t('landing.pricing.label')}</div>
            <h2 style={s.h2}>{t('landing.pricing.title')}</h2>
            <p style={{color:C.m,fontSize:16,marginTop:16,fontFamily:'inherit'}}>{t('landing.pricing.description')}</p>
          </div>
          <div style={{display:'grid',gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)',gap:24}}>
            {Array.isArray(plans) && plans.map((p,i)=>{
              const popular = i===1;
              return (
                <div key={i} className="hl" style={{padding:36,borderRadius:24,background:'#fff',border:popular?`2px solid ${C.p}`:'1px solid #f1f5f9',boxShadow:popular?`0 20px 60px ${C.p}15`:'0 4px 20px rgba(0,0,0,.03)',position:'relative'}}>
                  {popular && <div style={{position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:g(C.p,C.pl),color:'#fff',fontSize:11,fontWeight:700,padding:'4px 16px',borderRadius:50,textTransform:'uppercase',letterSpacing:1}}>{t('landing.pricing.popular')}</div>}
                  <h3 style={{fontSize:22,fontWeight:700,marginBottom:4}}>{p.name}</h3>
                  <p style={{color:C.m,fontSize:13,margin:'0 0 20px'}}>{p.desc}</p>
                  <div style={{marginBottom:24}}>
                    {i===2?<span style={{fontSize:20,fontWeight:700}}>{t('landing.pricing.custom')}</span>:<><span style={{fontSize:42,fontWeight:800,color:C.s}}>{i===0?'99':'249'}</span><span style={{color:C.m,fontSize:15}}>{t('landing.pricing.per_month')}</span></>}
                  </div>
                  <ul style={{listStyle:'none',padding:0,margin:'0 0 28px'}}>
                    {Array.isArray(p.features) && p.features.map((f,j)=>(
                      <li key={j} style={{padding:'8px 0',fontSize:14,color:'#334155',display:'flex',alignItems:'center',gap:10,fontFamily:'inherit'}}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="7" cy="7" r="6" fill={`${C.p}20`}/><path d="M4 7l2 2 4-4" stroke={C.p} strokeWidth="1.5" strokeLinecap="round"/></svg> {f}
                      </li>
                    ))}
                  </ul>
                  <button onClick={()=>{trackClick('pricing_'+p.name);navigate(i===2?'/contact':'/signup');}} className={popular?'bp':'bs'} style={{width:'100%',padding:'14px 24px',borderRadius:12,cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:600,border:popular?'none':'2px solid #e2e8f0',background:popular?g(C.p,C.pl):'#fff',color:popular?'#fff':C.s,boxShadow:popular?`0 8px 30px ${C.p}25`:'none'}}>
                    {i===2?t('landing.pricing.cta_contact'):t('landing.pricing.cta_start')}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ FAQ Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section style={{...s.section,background:'#fff'}}>
        <div style={{maxWidth:700,margin:'0 auto'}}>
          <div style={s.center}>
            <div style={s.label}>{t('landing.faq.label')}</div>
            <h2 style={s.h2}>{t('landing.faq.title')}</h2>
          </div>
          {Array.isArray(faqItems) && faqItems.map((faq,i)=>(
            <details key={i} style={{marginBottom:12,borderRadius:16,border:'1px solid #f1f5f9',overflow:'hidden'}}>
              <summary style={{padding:'20px 24px',fontWeight:600,fontSize:16,cursor:'pointer',background:'#fafbfc',listStyle:'none',display:'flex',justifyContent:'space-between',alignItems:'center',gap:8}}>
                {faq.q}<span style={{color:C.p,fontSize:20}}>+</span>
              </summary>
              <div style={{padding:'0 24px 20px',color:C.m,fontSize:14,lineHeight:1.7,fontFamily:'inherit'}}>{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* --- Blog Preview --- */}
      <section style={{padding:'80px 48px',background:'#f8fafc'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{textAlign:'center',marginBottom:48}}>
            <span style={{display:'inline-block',padding:'6px 16px',background:C.p+'22',color:C.p,borderRadius:999,fontSize:13,fontWeight:600,marginBottom:12}}>{t('landing.blog.label')}</span>
            <h2 style={{fontSize:'clamp(28px,4vw,40px)',fontWeight:800,margin:'0 0 12px',color:'#0f172a'}}>{t('landing.blog.title')}</h2>
            <p style={{fontSize:17,color:'#64748b',maxWidth:560,margin:'0 auto'}}>{t('landing.blog.subtitle')}</p>
          </div>
          <BlogPreview t={t} C={C} />
          <div style={{textAlign:'center',marginTop:40}}>
            <a href="/blog" style={{display:'inline-block',padding:'14px 32px',background:C.p,color:'#fff',borderRadius:12,textDecoration:'none',fontWeight:700,fontSize:15,transition:'opacity .2s'}} onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='1'}>{t('landing.blog.cta')}</a>
          </div>
        </div>
      </section>


      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ CTA Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <section style={{padding:'100px 48px',background:g(C.s,'#1e293b'),position:'relative',overflow:'hidden'}}>
        <div style={{position:'absolute',top:-100,right:-100,width:400,height:400,borderRadius:'50%',background:`${C.p}10`}}/>
        <div style={{position:'absolute',bottom:-50,left:-50,width:250,height:250,borderRadius:'50%',background:`${C.a}08`}}/>
        <div style={{maxWidth:650,margin:'0 auto',textAlign:'center',position:'relative',zIndex:1}}>
          <h2 style={{fontSize:44,fontWeight:800,color:'#fff',letterSpacing:-2,margin:'0 0 16px'}}>{t('landing.cta.title')}<br/>{t('landing.cta.title_end')}</h2>
          <p style={{color:'#94a3b8',fontSize:17,lineHeight:1.6,marginBottom:36,fontFamily:'inherit'}}>{t('landing.cta.description')}</p>
          <div style={{display:'flex',gap:12,justifyContent:'center',maxWidth:460,margin:'0 auto',flexDirection:mobile?'column':'row'}}>
            <input type="email" placeholder={t('landing.cta.email_placeholder')} value={email} onChange={e=>setEmail(e.target.value)} style={{flex:1,padding:'16px 20px',borderRadius:12,border:'2px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.06)',color:'#fff',fontSize:15,fontFamily:'inherit',outline:'none'}}/>
            <button onClick={()=>{trackClick('footer_cta');navigate('/signup'+(email?'?email='+encodeURIComponent(email):''));}} className="bp" style={{padding:'16px 28px',borderRadius:12,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',boxShadow:`0 8px 30px ${C.p}30`}}>{t('landing.cta.cta_btn')}</button>
          </div>
          <p style={{color:'#475569',fontSize:12,marginTop:16}}>{t('landing.cta.note')}</p>
        </div>
      </section>

      {/* Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ FOOTER Ã¢ÂÂÃ¢ÂÂÃ¢ÂÂ */}
      <footer style={{padding:'48px 48px 32px',background:C.s,borderTop:'1px solid rgba(255,255,255,.05)'}}>
        <div style={{maxWidth:1100,margin:'0 auto'}}>
          <div style={{display:'flex',flexDirection:mobile?'column':'row',justifyContent:'space-between',alignItems:'flex-start',gap:mobile?32:0,marginBottom:32}}>
            <div>
              <Logo size={28} white/>
              <p style={{color:'#64748b',fontSize:13,marginTop:12,maxWidth:300,fontFamily:'inherit'}}>{t('landing.footer.tagline')}</p>
            </div>
            <div style={{display:'flex',gap:48,flexWrap:'wrap'}}>
              <div>
                <div style={{color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>{t('landing.footer.sections.features')}</div>
                {[['pipeline','pipeline'],['commissions','commissions'],['analytics','analytics'],['whiteLabel','personnalisation'],['tracking','tracking']].map(([key,slug])=>(
                  <a key={key} href={`/fonctionnalites/${slug}`} style={{display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8}}>{t(`landing.footer.links.${key}`)}</a>
                ))}
              </div>
              <div>
                <div style={{color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>{t('landing.footer.sections.resources')}</div>
                {['blog','guide','faq','contact'].map(key=>(
                  <a key={key} href={key==='blog'?'/blog':'#'} style={{display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8}}>{t(`landing.footer.links.${key}`)}</a>
                ))}
              </div>
              <div>
                <div style={{color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12}}>{t('landing.footer.sections.legal')}</div>
                {['cgv','privacy','legal','rgpd'].map(key=>(
                  <a key={key} href="#" style={{display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8}}>{t(`landing.footer.links.${key}`)}</a>
                ))}
              </div>
            </div>
          </div>
          {/* Footer bottom : copyright + language switcher */}
          <div style={{borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:20,display:'flex',flexDirection:mobile?'column':'row',justifyContent:'space-between',alignItems:mobile?'flex-start':'center',gap:12}}>
            <div style={{color:'#475569',fontSize:12}}>{t('landing.footer.copyright')}</div>
            <LanguageSwitcher/>
            <div style={{color:'#475569',fontSize:12}}>{t('landing.footer.madeIn')}</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
