import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageSwitcher from './LanguageSwitcher';

const C = { p:'#059669', pl:'#10b981', s:'#0f172a', m:'#64748b', a:'#f97316' };
const g = (a,b) => `linear-gradient(135deg,${a},${b})`;

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

function Logo({ size = 36, white = false }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="lg-ll" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor={C.p}/><stop offset="100%" stopColor={C.pl}/></linearGradient></defs>
        <rect width="48" height="48" rx="14" fill="url(#lg-ll)"/>
        <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white"/>
        <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9"/>
      </svg>
      <span style={{ fontSize:size*0.55, fontWeight:800, letterSpacing:-1, color:white?'#fff':C.s }}>
        Ref<span style={{ color:C.p }}>Boost</span>
      </span>
    </div>
  );
}

export function LandingNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();
  const [featOpen, setFeatOpen] = useState(false);
  const [useCasesOpen, setUseCasesOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const FEATURES = [
    { label: t('landing.featuresDropdown.pipeline_label'), href: '/fonctionnalites/pipeline', desc: t('landing.featuresDropdown.pipeline_desc') },
    { label: t('landing.featuresDropdown.commissions_label'), href: '/fonctionnalites/commissions', desc: t('landing.featuresDropdown.commissions_desc') },
    { label: t('landing.featuresDropdown.analytics_label'), href: '/fonctionnalites/analytics', desc: t('landing.featuresDropdown.analytics_desc') },
    { label: t('landing.featuresDropdown.branding_label'), href: '/fonctionnalites/personnalisation', desc: t('landing.featuresDropdown.branding_desc') },
    { label: t('landing.featuresDropdown.tracking_label'), href: '/fonctionnalites/tracking', desc: t('landing.featuresDropdown.tracking_desc') },
  ];

  const USE_CASES = [
    { label: t('useCases.nav.saas'), href: '/cas-dusage/saas-b2b', desc: t('useCases.nav.saasDesc') },
    { label: t('useCases.nav.conseil'), href: '/cas-dusage/cabinet-conseil', desc: t('useCases.nav.conseilDesc') },
    { label: t('useCases.nav.startup'), href: '/cas-dusage/startup', desc: t('useCases.nav.startupDesc') },
    { label: t('useCases.nav.distribution'), href: '/cas-dusage/reseau-distribution', desc: t('useCases.nav.distributionDesc') },
    { label: t('useCases.nav.marketplace'), href: '/cas-dusage/marketplace-plateforme', desc: t('useCases.nav.marketplaceDesc') },
    { label: t('useCases.nav.agence'), href: '/cas-dusage/agence-marketing', desc: t('useCases.nav.agenceDesc') },
  ];

  return (
    <>
      <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,padding:mobile?'14px 20px':'16px 48px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'rgba(255,255,255,0.98)',backdropFilter:'blur(12px)',borderBottom:'1px solid rgba(0,0,0,0.08)',boxShadow:'0 1px 8px rgba(0,0,0,0.06)' }}>
        <a href="/" style={{ textDecoration:'none' }}><Logo size={mobile?30:36}/></a>
        {mobile ? (
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            {/* Language switcher sits in the header bar on mobile so the
                dropdown can anchor to the right edge of the viewport and
                not clip against the left side of the screen. */}
            <LanguageSwitcher compact direction="down" dark={false}/>
            <button onClick={() => setMenuOpen(!menuOpen)} style={{ background:'none',border:'none',cursor:'pointer',padding:8,display:'flex',flexDirection:'column',gap:5 }}>
              <span style={{ display:'block',width:22,height:2,background:menuOpen?'transparent':C.s,transition:'all .2s',transform:menuOpen?'rotate(45deg) translate(5px,5px)':'none' }}/>
              <span style={{ display:'block',width:22,height:2,background:C.s,transition:'all .2s',transform:menuOpen?'rotate(-45deg) translate(0,-1px)':'none' }}/>
            </button>
          </div>
        ) : (
          <div style={{ display:'flex',alignItems:'center',gap:24 }}>
            <div style={{ position:'relative' }} onMouseEnter={()=>setFeatOpen(true)} onMouseLeave={()=>setFeatOpen(false)}>
              <span style={{ color:C.m,fontSize:14,fontWeight:500,cursor:'default',display:'flex',alignItems:'center',gap:4 }}>
                {t('nav.features')}
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ transition:'transform .2s',transform:featOpen?'rotate(180deg)':'none' }}>
                  <path d="M2 4l4 4 4-4" stroke={C.m} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </span>
              {featOpen && (
                <div style={{ position:'absolute',top:'100%',left:-16,background:'#fff',borderRadius:16,boxShadow:'0 12px 40px rgba(0,0,0,0.12)',border:'1px solid #f1f5f9',padding:8,paddingTop:16,minWidth:260,zIndex:200 }}>
                  {FEATURES.map(f=>(
                    <a key={f.href} href={f.href} style={{ display:'block',padding:'10px 14px',borderRadius:10,textDecoration:'none' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{ fontWeight:600,fontSize:14,color:C.s }}>{f.label}</div>
                      <div style={{ fontSize:12,color:C.m,marginTop:2 }}>{f.desc}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position:'relative' }} onMouseEnter={()=>setUseCasesOpen(true)} onMouseLeave={()=>setUseCasesOpen(false)}>
              <span style={{ color:C.m,fontSize:14,fontWeight:500,cursor:'default',display:'flex',alignItems:'center',gap:4 }}>
                {t('useCases.nav.menuLabel')}
                <svg width="12" height="12" viewBox="0 0 12 12" style={{ transition:'transform .2s',transform:useCasesOpen?'rotate(180deg)':'none' }}>
                  <path d="M2 4l4 4 4-4" stroke={C.m} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </span>
              {useCasesOpen && (
                <div style={{ position:'absolute',top:'100%',left:-16,background:'#fff',borderRadius:16,boxShadow:'0 12px 40px rgba(0,0,0,0.12)',border:'1px solid #f1f5f9',padding:8,paddingTop:16,minWidth:280,zIndex:200 }}>
                  {USE_CASES.map(u=>(
                    <a key={u.href} href={u.href} style={{ display:'block',padding:'10px 14px',borderRadius:10,textDecoration:'none' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#f8fafc'}
                      onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      <div style={{ fontWeight:600,fontSize:14,color:C.s }}>{u.label}</div>
                      <div style={{ fontSize:12,color:C.m,marginTop:2 }}>{u.desc}</div>
                    </a>
                  ))}
                </div>
              )}
            </div>
            {[['nav.marketplace','/marketplace'],['nav.pricing','/pricing'],['nav.testimonials','/#temoignages'],['nav.blog','/blog']].map(([key,href])=>(
              <a key={key} href={href} style={{ color:C.m,textDecoration:'none',fontSize:14,fontWeight:500 }}
                onMouseEnter={e=>e.target.style.color=C.p}
                onMouseLeave={e=>e.target.style.color=C.m}>
                {t(key)}
              </a>
            ))}
            <LanguageSwitcher direction="down" dark={false}/>
            <button onClick={()=>navigate('/login')}
              style={{ padding:'10px 24px',borderRadius:10,border:`2px solid ${C.s}`,background:'transparent',color:C.s,fontWeight:600,fontSize:14,cursor:'pointer' }}
              onMouseEnter={e=>{e.currentTarget.style.background=C.s;e.currentTarget.style.color='#fff';}}
              onMouseLeave={e=>{e.currentTarget.style.background='transparent';e.currentTarget.style.color=C.s;}}>
              {t('nav.login')}
            </button>
            <button onClick={()=>navigate('/signup')}
              style={{ padding:'10px 24px',borderRadius:10,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer' }}>
              {t('nav.freeTrial')}
            </button>
          </div>
        )}
      </nav>

      {mobile && menuOpen && (
        <div style={{ position:'fixed',top:58,left:0,right:0,bottom:0,zIndex:99,background:'#fff',overflowY:'auto',padding:'24px 20px' }}>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>{t('nav.features')}</div>
            {FEATURES.map(f=>(
              <a key={f.href} href={f.href} onClick={()=>setMenuOpen(false)} style={{ display:'block',padding:'12px 0',borderBottom:'1px solid #f1f5f9',textDecoration:'none' }}>
                <div style={{ fontWeight:600,fontSize:15,color:C.s }}>{f.label}</div>
                <div style={{ fontSize:13,color:C.m,marginTop:2 }}>{f.desc}</div>
              </a>
            ))}
          </div>
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:11,fontWeight:700,color:'#94a3b8',textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>{t('useCases.nav.menuLabel')}</div>
            {USE_CASES.map(u=>(
              <a key={u.href} href={u.href} onClick={()=>setMenuOpen(false)} style={{ display:'block',padding:'12px 0',borderBottom:'1px solid #f1f5f9',textDecoration:'none' }}>
                <div style={{ fontWeight:600,fontSize:15,color:C.s }}>{u.label}</div>
                <div style={{ fontSize:13,color:C.m,marginTop:2 }}>{u.desc}</div>
              </a>
            ))}
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:4,marginTop:16 }}>
            {[['nav.marketplace','/marketplace'],['nav.pricing','/pricing'],['nav.testimonials','/#temoignages'],['nav.blog','/blog']].map(([key,href])=>(
              <a key={key} href={href} onClick={()=>setMenuOpen(false)} style={{ display:'block',padding:'14px 0',borderBottom:'1px solid #f1f5f9',fontSize:16,fontWeight:500,color:C.s,textDecoration:'none' }}>
                {t(key)}
              </a>
            ))}
          </div>
          <div style={{ display:'flex',flexDirection:'column',gap:12,marginTop:24 }}>
            <button onClick={()=>{setMenuOpen(false);navigate('/login');}} style={{ padding:'14px',borderRadius:12,border:`2px solid ${C.s}`,background:'transparent',color:C.s,fontWeight:600,fontSize:16,cursor:'pointer',width:'100%' }}>{t('nav.login')}</button>
            <button onClick={()=>{setMenuOpen(false);navigate('/signup');}} style={{ padding:'14px',borderRadius:12,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',width:'100%' }}>{t('nav.freeTrial')}</button>
          </div>
        </div>
      )}
    </>
  );
}

export function LandingFooter() {
  const { t } = useTranslation();
  const mobile = useMobile();

  const FEATURES = [
    { label: t('landing.featuresDropdown.pipeline_label'), href: '/fonctionnalites/pipeline' },
    { label: t('landing.featuresDropdown.commissions_label'), href: '/fonctionnalites/commissions' },
    { label: t('landing.featuresDropdown.analytics_label'), href: '/fonctionnalites/analytics' },
    { label: t('landing.featuresDropdown.branding_label'), href: '/fonctionnalites/personnalisation' },
    { label: t('landing.featuresDropdown.tracking_label'), href: '/fonctionnalites/tracking' },
  ];

  const USE_CASES = [
    { label: t('useCases.nav.saas'),         href: '/cas-dusage/saas-b2b' },
    { label: t('useCases.nav.conseil'),      href: '/cas-dusage/cabinet-conseil' },
    { label: t('useCases.nav.startup'),      href: '/cas-dusage/startup' },
    { label: t('useCases.nav.distribution'), href: '/cas-dusage/reseau-distribution' },
    { label: t('useCases.nav.marketplace'),  href: '/cas-dusage/marketplace-plateforme' },
    { label: t('useCases.nav.agence'),       href: '/cas-dusage/agence-marketing' },
  ];

  return (
    <footer style={{ padding:mobile?'40px 20px 28px':'48px 48px 32px', background:C.s }}>
      <div style={{ maxWidth:1100, margin:'0 auto' }}>
        <div style={{ display:'flex',flexDirection:mobile?'column':'row',justifyContent:'space-between',alignItems:'flex-start',gap:mobile?32:0,marginBottom:32 }}>
          <div>
            <Logo size={28} white/>
            <p style={{ color:'#64748b',fontSize:13,marginTop:12,maxWidth:300 }}>{t('landing.footer.tagline')}</p>
          </div>
          <div style={{ display:'flex',flexWrap:'wrap',gap:mobile?32:48 }}>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>{t('landing.footer.sections.features')}</div>
              {FEATURES.map(f=><a key={f.href} href={f.href} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{f.label}</a>)}
            </div>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>{t('landing.footer.sections.useCases')}</div>
              {USE_CASES.map(u=><a key={u.href} href={u.href} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{u.label}</a>)}
            </div>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>{t('landing.footer.sections.resources')}</div>
              {['blog','guide','faq','contact'].map(key=>(
                <a key={key} href={key==='blog'?'/blog':key==='marketplace'?'/marketplace':'#'} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>
                  {t(`landing.footer.links.${key}`)}
                </a>
              ))}
            </div>
            <div>
              <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>{t('landing.footer.sections.legal')}</div>
              {[
                { key: 'cgv',     href: '/cgv' },
                { key: 'privacy', href: '/confidentialite' },
                { key: 'legal',   href: '/mentions-legales' },
                { key: 'rgpd',    href: '/rgpd' },
              ].map(({ key, href })=>(
                <a key={key} href={href} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>
                  {t(`landing.footer.links.${key}`)}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div style={{ borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:20,display:'flex',flexDirection:mobile?'column':'row',justifyContent:'space-between',alignItems:mobile?'flex-start':'center',gap:12 }}>
          <div style={{ color:'#475569',fontSize:12 }}>{t('landing.footer.copyright')}</div>
          <LanguageSwitcher direction="up" dark={true}/>
          <div style={{ color:'#475569',fontSize:12 }}>{t('landing.footer.madeIn')}</div>
        </div>
      </div>
    </footer>
  );
}

export default function LandingLayout({ children }) {
  return (
    <div style={{ fontFamily:'inherit',background:'#fafbfc',minHeight:'100vh',display:'flex',flexDirection:'column' }}>
      <LandingNav />
      <div style={{ flex:1,paddingTop:80 }}>{children}</div>
      <LandingFooter />
    </div>
  );
}
