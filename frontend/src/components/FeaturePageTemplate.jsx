import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import LandingLayout from './LandingLayout';

function useMobile() {
  const [mobile, setMobile] = useState(typeof window !== 'undefined' && window.innerWidth < 768);
  useEffect(() => {
    const h = () => setMobile(window.innerWidth < 768);
    window.addEventListener('resize', h, { passive: true });
    return () => window.removeEventListener('resize', h);
  }, []);
  return mobile;
}

export default function FeaturePageTemplate({ helmet, accentColor, label, title, subtitle, mockupSvg, benefits, quote, currentHref }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mobile = useMobile();
  const g = `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`;

  const FEATURE_LINKS = [
    { href:'/fonctionnalites/pipeline', label:t('landing.featuresDropdown.pipeline_label') },
    { href:'/fonctionnalites/commissions', label:t('landing.featuresDropdown.commissions_label') },
    { href:'/fonctionnalites/analytics', label:t('landing.featuresDropdown.analytics_label') },
    { href:'/fonctionnalites/personnalisation', label:t('landing.featuresDropdown.branding_label') },
    { href:'/fonctionnalites/tracking', label:t('landing.featuresDropdown.tracking_label') },
  ];

  return (
    <LandingLayout>
      <Helmet>
        <title>{helmet.title}</title>
        <meta name="description" content={helmet.description}/>
        <link rel="canonical" href={helmet.canonical}/>
        <meta property="og:title" content={helmet.title}/>
        <meta property="og:description" content={helmet.description}/>
        <meta property="og:url" content={helmet.canonical}/>
        <meta property="og:type" content="website"/>
      </Helmet>

      {/* Hero */}
      <section style={{ background:'linear-gradient(135deg,#0f172a 0%,#1e293b 100%)', padding:mobile?'48px 20px 0':'80px 48px 0', overflow:'hidden' }}>
        <div style={{ maxWidth:1100,margin:'0 auto',display:mobile?'block':'grid',gridTemplateColumns:'1fr 1fr',gap:64,alignItems:'flex-end' }}>
          <div style={{ paddingBottom:mobile?40:80 }}>
            <span style={{ display:'inline-block',padding:'4px 14px',borderRadius:20,background:`${accentColor}20`,border:`1px solid ${accentColor}40`,fontSize:12,fontWeight:700,color:accentColor,textTransform:'uppercase',letterSpacing:1.5,marginBottom:20 }}>
              {label}
            </span>
            <h1 style={{ margin:'0 0 16px',fontSize:mobile?32:44,fontWeight:900,color:'#fff',lineHeight:1.1,letterSpacing:-1 }}>{title}</h1>
            <p style={{ margin:'0 0 36px',fontSize:mobile?16:19,color:'#94a3b8',lineHeight:1.65 }}>{subtitle}</p>
            <div style={{ display:'flex',gap:12,flexWrap:'wrap' }}>
              <button onClick={()=>navigate('/signup')} style={{ padding:'13px 28px',borderRadius:12,border:'none',background:g,color:'#fff',fontWeight:700,fontSize:15,cursor:'pointer',boxShadow:`0 8px 30px ${accentColor}40`,flex:mobile?'1':'none' }}>
                {t('featureTemplate.try_free')}
              </button>
              <button onClick={()=>navigate('/login')} style={{ padding:'13px 28px',borderRadius:12,border:'2px solid rgba(255,255,255,0.18)',background:'transparent',color:'#fff',fontWeight:600,fontSize:15,cursor:'pointer',flex:mobile?'1':'none' }}>
                {t('featureTemplate.login')}
              </button>
            </div>
          </div>
          {!mobile && (
            <div style={{ position:'relative',alignSelf:'flex-end' }}>
              <div style={{ borderRadius:'16px 16px 0 0',overflow:'hidden',boxShadow:'0 -20px 60px rgba(0,0,0,0.4)',border:'1px solid rgba(255,255,255,0.08)',borderBottom:'none' }}
                dangerouslySetInnerHTML={{ __html: mockupSvg }}/>
            </div>
          )}
        </div>
      </section>

      {/* Stats */}
      <section style={{ background:'#f8fafc',padding:mobile?'32px 20px':'56px 48px',borderBottom:'1px solid #e2e8f0' }}>
        <div style={{ maxWidth:1100,margin:'0 auto',display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:mobile?16:32 }}>
          {benefits.slice(0,3).map((b,i)=>(
            <div key={i} style={{ textAlign:'center' }}>
              <div style={{ fontSize:mobile?28:36,fontWeight:900,color:accentColor,letterSpacing:-1,marginBottom:4 }}>{b.stat}</div>
              <div style={{ fontSize:mobile?12:14,color:'#64748b',lineHeight:1.4 }}>{b.statLabel}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Benefits */}
      <section style={{ background:'#fff',padding:mobile?'48px 20px':'80px 48px' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <div style={{ textAlign:'center',marginBottom:mobile?48:72 }}>
            <p style={{ margin:'0 0 10px',fontSize:12,fontWeight:700,color:accentColor,textTransform:'uppercase',letterSpacing:2 }}>
              {t('featureTemplate.detailed_features')}
            </p>
            <h2 style={{ margin:0,fontSize:mobile?26:36,fontWeight:800,color:'#0f172a',letterSpacing:-0.5 }}>
              {t('featureTemplate.what_you_get')}
            </h2>
          </div>
          {benefits.map((b,i)=>(
            <div key={i} style={{ display:mobile?'block':'grid',gridTemplateColumns:'1fr 1fr',gap:mobile?0:80,alignItems:'center',marginBottom:i<benefits.length-1?(mobile?56:96):0 }}>
              <div style={{ order:mobile?0:(i%2===0?0:1),marginBottom:mobile?24:0 }}>
                <div style={{ width:40,height:4,background:g,borderRadius:2,marginBottom:16 }}/>
                <h3 style={{ margin:'0 0 12px',fontSize:mobile?20:26,fontWeight:800,color:'#0f172a',lineHeight:1.3 }}>{b.title}</h3>
                <p style={{ margin:'0 0 20px',fontSize:mobile?15:16,color:'#64748b',lineHeight:1.75 }}>{b.text}</p>
                <ul style={{ listStyle:'none',padding:0,margin:0,display:'flex',flexDirection:'column',gap:8 }}>
                  {b.points.map((pt,j)=>(
                    <li key={j} style={{ display:'flex',alignItems:'flex-start',gap:10,fontSize:mobile?14:15,color:'#334155' }}>
                      <span style={{ width:18,height:18,borderRadius:'50%',background:`${accentColor}15`,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,marginTop:2 }}>
                        <svg width="9" height="7" viewBox="0 0 10 8" fill="none"><path d="M1 4l2.5 2.5L9 1" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </span>
                      {pt}
                    </li>
                  ))}
                </ul>
              </div>
              {!mobile && (
                <div style={{ order:i%2===0?1:0,borderRadius:20,overflow:'hidden',boxShadow:'0 20px 60px rgba(0,0,0,0.08)',border:'1px solid #e2e8f0' }}
                  dangerouslySetInnerHTML={{ __html: b.illustration }}/>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Quote */}
      <section style={{ background:'linear-gradient(135deg,#0f172a,#1e293b)',padding:mobile?'48px 20px':'80px 48px' }}>
        <div style={{ maxWidth:760,margin:'0 auto',textAlign:'center' }}>
          <svg width="40" height="32" viewBox="0 0 40 32" style={{ opacity:0.3,marginBottom:20 }}>
            <path d="M0 32V20C0 8.667 4 2.333 12 0l2 4C9.333 5.333 8 8 8 12h8v20H0zm20 0V20c0-11.333 4-17.667 12-20l2 4c-4.667 1.333-6 4-6 8h8v20H20z" fill={accentColor}/>
          </svg>
          <p style={{ margin:'0 0 24px',fontSize:mobile?17:22,color:'#fff',lineHeight:1.65,fontStyle:'italic',fontWeight:300 }}>{quote.text}</p>
          <p style={{ margin:0,fontSize:14,color:'#64748b',fontWeight:600 }}>{quote.author}</p>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background:'#f8fafc',padding:mobile?'48px 20px':'80px 48px',textAlign:'center' }}>
        <div style={{ maxWidth:560,margin:'0 auto' }}>
          <h2 style={{ margin:'0 0 16px',fontSize:mobile?28:36,fontWeight:800,color:'#0f172a',letterSpacing:-0.5 }}>
            {t('featureTemplate.ready_to_test')}
          </h2>
          <p style={{ margin:'0 0 32px',fontSize:mobile?16:18,color:'#64748b',lineHeight:1.6 }}>
            {t('featureTemplate.trial_text')}
          </p>
          <button onClick={()=>navigate('/signup')} style={{ padding:mobile?'14px 28px':'16px 36px',borderRadius:14,border:'none',background:g,color:'#fff',fontWeight:700,fontSize:mobile?16:18,cursor:'pointer',boxShadow:`0 8px 30px ${accentColor}30`,width:mobile?'100%':'auto' }}>
            {t('featureTemplate.create_space')}
          </button>
          <p style={{ marginTop:12,fontSize:13,color:'#94a3b8' }}>{t('featureTemplate.no_commitment')}</p>
        </div>
        <div style={{ maxWidth:900,margin:'40px auto 0',display:'flex',gap:12,justifyContent:'center',flexWrap:'wrap' }}>
          {FEATURE_LINKS.filter(l=>l.href!==currentHref).map(l=>(
            <a key={l.href} href={l.href} style={{ fontSize:13,color:accentColor,textDecoration:'none',fontWeight:600,padding:'8px 16px',borderRadius:8,border:`1px solid ${accentColor}30`,background:`${accentColor}08` }}>
              {l.label}
            </a>
          ))}
        </div>
      </section>
    </LandingLayout>
  );
}
