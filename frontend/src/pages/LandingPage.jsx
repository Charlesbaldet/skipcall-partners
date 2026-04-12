import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const C = {
  p: '#059669', pl: '#10b981', pd: '#047857',
  s: '#0f172a', sl: '#1e293b',
  a: '#f97316', al: '#fb923c',
  m: '#64748b', bg: '#fafbfc',
};
const g = (a,b) => `linear-gradient(135deg,${a},${b})`;

function Logo({ size = 40, white = false }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:10 }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor={C.p}/><stop offset="100%" stopColor={C.pl}/></linearGradient></defs>
        <rect width="48" height="48" rx="14" fill="url(#lg)"/>
        <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white"/>
        <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9"/>
      </svg>
      <span style={{ fontSize:size*0.55, fontWeight:800, letterSpacing:-1, color:white?'#fff':C.s, fontFamily: 'inherit' }}>
        Ref<span style={{ color:C.p }}>Boost</span>
      </span>
    </div>
  );
}

export default function LandingPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [scrollY, setScrollY] = useState(0);
  const [featOpen, setFeatOpen] = useState(false);

  useEffect(() => {
    // Analytics tracker
    if (typeof window !== 'undefined' && !window._rb_tracked) {
      window._rb_tracked = true;
      const track = (event, data = {}) => {
        try {
          fetch('/api/analytics/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ event, ...data, url: window.location.href, ts: Date.now(), ref: document.referrer, ua: navigator.userAgent }),
          }).catch(() => {});
        } catch(e) {}
      };
      track('page_view');
      window._rb_track = track;
      // Track scroll depth
      let maxScroll = 0;
      const onScroll = () => {
        const pct = Math.round((window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100);
        if (pct > maxScroll) { maxScroll = pct; if ([25,50,75,100].includes(pct)) track('scroll_depth', { depth: pct }); }
        setScrollY(window.scrollY);
      };
      window.addEventListener('scroll', onScroll, { passive: true });
      // Track time on page
      setTimeout(() => track('engaged_30s'), 30000);
      setTimeout(() => track('engaged_60s'), 60000);
      return () => window.removeEventListener('scroll', onScroll);
    }
  }, []);

  const trackClick = (label) => window._rb_track?.('cta_click', { label });

  const features = [
    { icon:'pipeline', title:'Pipeline de referrals', desc:'Suivez chaque recommandation du premier contact au closing. Vue Kanban, filtres avancés, statuts en temps réel.' },
    { icon:'commissions', title:'Commissions automatiques', desc:'Calcul automatique des primes selon vos règles. Validation en un clic, historique complet, paiements traçables.' },
    { icon:'analytics', title:'Tableaux de bord & KPIs', desc:'Taux de conversion, MRR généré, performance par apporteur d\'affaires. Prenez des décisions basées sur les données.' },
    { icon:'branding', title:'Votre marque, votre plateforme', desc:'Personnalisez entièrement l\'interface : logo, couleurs, domaine. Vos partenaires travaillent dans votre univers.' },
    { icon:'security', title:'Sécurité de niveau entreprise', desc:'Chiffrement AES-256, journaux d\'audit, protection anti-brute force. Conforme RGPD, prêt pour l\'ISO 27001.' },
    { icon:'tracking', title:'Liens de tracking uniques', desc:'Chaque apporteur d\'affaires a son lien personnel. Attribution automatique, formulaire public, zéro friction.' },
  ];

  const testimonials = [
    { n:'Marie Dupont', r:'Directrice Commerciale', c:'TechFlow', t:"On a multiplié par 3 notre canal apporteurs d’affaires en 4 mois. L’outil est intuitif et nos partenaires l’adorent.", a:'M' },
    { n:'Thomas Chen', r:'CEO', c:'ScaleUp Agency', t:"RefBoost nous a permis de structurer notre programme de recommandation. On ne revient plus en arrière.", a:'T' },
    { n:'Sophie Martin', r:'Head of Partnerships', c:'DataViz Pro', t:"Fini les tableurs pour tracker les commissions. Tout est automatisé, transparent, et nos partenaires sont ravis.", a:'S' },
  ];

  const plans = [
    { n:'Starter', p:'99', d:'Idéal pour lancer votre programme', f:["Jusqu’à 20 apporteurs d’affaires",'100 recommandations/mois','Tableau de bord & analytics','Liens de tracking','Support email'], c:false },
    { n:'Growth', p:'249', d:'Pour accélérer votre croissance', f:["Apporteurs d’affaires illimités",'Recommandations illimitées','Personnalisation complète','API & intégrations CRM','Support prioritaire','Multi-utilisateurs'], c:true },
    { n:'Enterprise', p:'0', d:'Pour les grandes organisations', f:['Tout Growth +','Multi-espaces','SSO / SAML','SLA garanti','Account manager dédié','Audit & conformité'], c:false },
  ];

  const s = { // shared styles
    section: { padding:'100px 48px' },
    label: { fontSize:13, fontWeight:700, color:C.p, textTransform:'uppercase', letterSpacing:2, marginBottom:12 },
    h2: { fontSize:44, fontWeight:800, letterSpacing:-2, margin:0 },
    center: { textAlign:'center', marginBottom:64 },
  };

  return (
    <div style={{ fontFamily: 'inherit', color:C.s, overflow:'hidden' }}>
      
      <style>{`
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulse{0%,100%{opacity:.4}50%{opacity:.8}}
        .fu{animation:fadeUp .7s ease-out forwards;opacity:0}
        .fu1{animation-delay:.1s}.fu2{animation-delay:.2s}.fu3{animation-delay:.3s}.fu4{animation-delay:.4s}
        .hl{transition:transform .3s,box-shadow .3s}.hl:hover{transform:translateY(-6px);box-shadow:0 20px 60px rgba(5,150,105,.15)!important}
        .bp{transition:all .3s}.bp:hover{transform:translateY(-2px);box-shadow:0 12px 40px rgba(5,150,105,.35)}
        .bs:hover{background:${C.s}!important;color:#fff!important}
      `}</style>

      {/* ═══ NAV ═══ */}
      <nav style={{ position:'fixed',top:0,left:0,right:0,zIndex:100,padding:'16px 48px',display:'flex',alignItems:'center',justifyContent:'space-between',background:scrollY>50?'rgba(255,255,255,.95)':'rgba(255,255,255,.85)',backdropFilter:'blur(20px)',borderBottom:scrollY>50?'1px solid rgba(0,0,0,.06)':'1px solid rgba(0,0,0,.02)',transition:'all .3s' }}>
        <Logo size={36}/>
        <div style={{ display:'flex',alignItems:'center',gap:32 }}>
          {/* Fonctionnalités dropdown */}
          <div style={{ position:'relative' }}
            onMouseEnter={() => setFeatOpen(true)}
            onMouseLeave={() => setFeatOpen(false)}>
            <span style={{ color:C.m,fontSize:14,fontWeight:500,cursor:'default',display:'flex',alignItems:'center',gap:4 }}>
              Fonctionnalités
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke={C.m} strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            </span>
            {featOpen && (
              <div style={{ position:'absolute',top:'100%',left:-16,background:'#fff',borderRadius:16,boxShadow:'0 12px 40px rgba(0,0,0,0.12)',border:'1px solid #f1f5f9',padding:8,paddingTop:16,minWidth:260,zIndex:200 }}>
                {[
                  ['/fonctionnalites/pipeline','Pipeline de leads','Du referral au closing'],
                  ['/fonctionnalites/commissions','Commissions automatiques','Calcul et paiement sans friction'],
                  ['/fonctionnalites/analytics','Analytics & KPIs','Pilotez avec des données réelles'],
                  ['/fonctionnalites/personnalisation','Marque blanche','Votre image, votre domaine'],
                  ['/fonctionnalites/tracking','Liens de tracking','Attribution parfaite'],
                ].map(([href,label,desc]) => (
                  <a key={href} href={href} style={{ display:'block',padding:'10px 14px',borderRadius:10,textDecoration:'none' }}
                    onMouseEnter={e => e.currentTarget.style.background='#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.background='transparent'}>
                    <div style={{ fontWeight:600,fontSize:14,color:'#0f172a' }}>{label}</div>
                    <div style={{ fontSize:12,color:'#64748b',marginTop:2 }}>{desc}</div>
                  </a>
                ))}
              </div>
            )}
          </div>
          {['Tarifs','Témoignages','Blog'].map(x => (
            <a key={x} href={x === 'Blog' ? '/blog' : '#' + x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'')} style={{ color:C.m,textDecoration:'none',fontSize:14,fontWeight:500,transition:'color .2s' }}
              onMouseEnter={e => e.target.style.color=C.p}
              onMouseLeave={e => e.target.style.color=C.m}>
              {x}
            </a>
          ))}
          <button onClick={()=>navigate('/login')} className="bs" style={{ padding:'10px 24px',borderRadius:10,border:`2px solid ${C.s}`,background:'transparent',color:C.s,fontWeight:600,fontSize:14,cursor:'pointer',fontFamily:'inherit' }}>Connexion</button>
          <button onClick={()=>{trackClick('nav_cta');navigate('/signup')}} className="bp" style={{ padding:'10px 24px',borderRadius:10,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',fontFamily:'inherit' }}>Essai gratuit</button>
        </div>
      </nav>

      {/* ═══ HERO ═══ */}
      <section style={{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'140px 48px 80px',position:'relative',background:`radial-gradient(ellipse 80% 60% at 50% -20%,${C.p}12,transparent),radial-gradient(ellipse 60% 40% at 80% 80%,${C.a}08,transparent),${C.bg}` }}>
        <div style={{ position:'absolute',top:120,left:80,width:300,height:300,borderRadius:'50%',background:`${C.p}06`,animation:'float 6s ease-in-out infinite' }}/>
        <div style={{ position:'absolute',bottom:100,right:120,width:200,height:200,borderRadius:'50%',background:`${C.a}08`,animation:'float 8s ease-in-out infinite 2s' }}/>

        <div style={{ maxWidth:900,textAlign:'center',position:'relative',zIndex:1 }}>
          <div className="fu fu1" style={{ display:'inline-flex',alignItems:'center',gap:8,padding:'6px 16px',borderRadius:50,background:`${C.p}10`,border:`1px solid ${C.p}20`,fontSize:13,fontWeight:600,color:C.p,marginBottom:28 }}>
            <span style={{ width:6,height:6,borderRadius:'50%',background:C.p }}/>
            Gérez vos apporteurs d’affaires simplement
          </div>

          <h1 className="fu fu2" style={{ fontSize:68,fontWeight:900,lineHeight:1.05,letterSpacing:-3,margin:'0 0 24px',color:C.s }}>
            Transformez vos<br/>
            <span style={{ background:g(C.p,C.pl),WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent' }}>recommandations en revenus</span>
          </h1>

          <p className="fu fu3" style={{ fontSize:20,color:C.m,lineHeight:1.6,maxWidth:620,margin:'0 auto 40px',fontFamily: 'inherit' }}>
            RefBoost est la plateforme SaaS de gestion de programme partenaires et d’apporteurs d’affaires.
            Automatisez le suivi des referrals, les commissions et la performance de votre réseau.
          </p>

          <div className="fu fu4" style={{ display:'flex',gap:16,justifyContent:'center' }}>
            <button onClick={()=>{trackClick('hero_cta');navigate('/signup')}} className="bp" style={{ padding:'16px 36px',borderRadius:14,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:17,cursor:'pointer',fontFamily:'inherit',boxShadow:`0 8px 30px ${C.p}30` }}>
              Créer mon espace gratuitement →
            </button>
            <button onClick={()=>document.getElementById('fonctionnalites')?.scrollIntoView({behavior:'smooth'})} className="bs" style={{ padding:'16px 36px',borderRadius:14,border:'2px solid #e2e8f0',background:'#fff',color:C.s,fontWeight:600,fontSize:17,cursor:'pointer',fontFamily:'inherit' }}>
              Découvrir
            </button>
          </div>

          <div className="fu fu4" style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:32,marginTop:60,color:C.m,fontSize:14 }}>
            <div><span style={{ fontSize:28,fontWeight:800,color:C.s }}>150+</span><br/>Apporteurs actifs</div>
            <div style={{ width:1,height:40,background:'#e2e8f0' }}/>
            <div><span style={{ fontSize:28,fontWeight:800,color:C.s }}>2.4M€</span><br/>Revenus générés</div>
            <div style={{ width:1,height:40,background:'#e2e8f0' }}/>
            <div><span style={{ fontSize:28,fontWeight:800,color:C.s }}>98%</span><br/>Satisfaction client</div>
          </div>

          <p className="fu fu4" style={{ color:'#94a3b8',fontSize:12,marginTop:20 }}>✓ 14 jours gratuits · ✓ Sans carte bancaire · ✓ Configuration en 5 min</p>
        </div>
      </section>

      {/* ═══ FEATURES ═══ */}
      <section id="fonctionnalites" style={{ ...s.section, background:'#fff' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <div style={s.center}>
            <div style={s.label}>Fonctionnalités</div>
            <h2 style={s.h2}>Tout pour gérer votre<br/><span style={{ color:C.p }}>programme d’apporteurs d’affaires</span></h2>
            <p style={{ color:C.m,fontSize:16,marginTop:16,maxWidth:600,margin:'16px auto 0',fontFamily: 'inherit' }}>De la première recommandation au paiement de la commission, RefBoost automatise chaque étape.</p>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24 }}>
            {features.map((f,i)=>(
              <div key={i} className="hl" style={{ padding:32,borderRadius:20,background:'#fff',border:'1px solid #f1f5f9',boxShadow:'0 4px 20px rgba(0,0,0,.03)',cursor:'default' }}>
                <div style={{ width:44,height:44,borderRadius:10,background:`${C.p}15`,display:'flex',alignItems:'center',justifyContent:'center',marginBottom:16 }}><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke={C.p} strokeWidth="2"/><path d="M8 12l2.5 2.5L16 9" stroke={C.p} strokeWidth="2" strokeLinecap="round"/></svg></div>
                <h3 style={{ fontSize:19,fontWeight:700,marginBottom:10 }}>{f.title}</h3>
                <p style={{ color:C.m,fontSize:14,lineHeight:1.7,margin:0,fontFamily: 'inherit' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ HOW IT WORKS ═══ */}
      <section style={{ ...s.section, background:C.s }}>
        <div style={{ maxWidth:900,margin:'0 auto',textAlign:'center' }}>
          <div style={{ ...s.label, color:C.pl }}>Comment ça marche</div>
          <h2 style={{ ...s.h2, color:'#fff',marginBottom:64 }}>Lancez votre programme en 3 étapes</h2>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:40 }}>
            {[
              { step:'01', title:'Créez votre espace', desc:'Inscrivez-vous en 2 minutes. Personnalisez votre plateforme avec votre identité visuelle.' },
              { step:'02', title:'Invitez vos apporteurs', desc:'Envoyez des invitations par email. Chaque partenaire reçoit son accès et son lien de tracking.' },
              { step:'03', title:'Suivez & rémunérez', desc:'Vos apporteurs soumettent des leads. Vous suivez la conversion et versez les commissions automatiquement.' },
            ].map((st,i)=>(
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ width:64,height:64,borderRadius:16,margin:'0 auto 20px',background:g(C.p,C.pl),display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,fontWeight:800,color:'#fff' }}>{st.step}</div>
                <h3 style={{ fontSize:20,fontWeight:700,color:'#fff',marginBottom:8 }}>{st.title}</h3>
                <p style={{ color:'#94a3b8',fontSize:14,lineHeight:1.7,margin:0,fontFamily: 'inherit' }}>{st.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ TESTIMONIALS ═══ */}
      <section id="temoignages" style={{ ...s.section, background:'#fff' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <div style={s.center}>
            <div style={s.label}>Témoignages</div>
            <h2 style={s.h2}>Ils gèrent leurs apporteurs d’affaires avec RefBoost</h2>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24 }}>
            {testimonials.map((t,i)=>(
              <div key={i} className="hl" style={{ padding:32,borderRadius:20,background:'#fafbfc',border:'1px solid #f1f5f9' }}>
                <div style={{ display:'flex',gap:2,marginBottom:16 }}><svg width='88' height='16' viewBox='0 0 88 16'>{[0,1,2,3,4].map(i=><path key={i} transform={`translate(${i*18},0)`} d='M8 1l1.8 5.5H16l-5 3.6 1.9 5.9L8 12.5l-4.9 3.5 1.9-5.9-5-3.6h6.2z' fill='#fbbf24'/>)}</svg></div>
                <p style={{ color:'#334155',fontSize:15,lineHeight:1.7,margin:'0 0 24px',fontFamily: 'inherit',fontStyle:'italic' }}>"{t.t}"</p>
                <div style={{ display:'flex',alignItems:'center',gap:12 }}>
                  <div style={{ width:44,height:44,borderRadius:12,background:g(C.p,C.pl),display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:700,fontSize:18 }}>{t.a}</div>
                  <div>
                    <div style={{ fontWeight:700,fontSize:14,color:C.s }}>{t.n}</div>
                    <div style={{ fontSize:12,color:C.m }}>{t.r} · {t.c}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ PRICING ═══ */}
      <section id="tarifs" style={{ ...s.section, background:C.bg }}>
        <div style={{ maxWidth:1000,margin:'0 auto' }}>
          <div style={s.center}>
            <div style={s.label}>Tarifs</div>
            <h2 style={s.h2}>Des prix simples, sans surprise</h2>
            <p style={{ color:C.m,fontSize:16,marginTop:16,fontFamily: 'inherit' }}>Tous les plans incluent 14 jours d’essai gratuit. Sans engagement.</p>
          </div>
          <div style={{ display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:24 }}>
            {plans.map((p,i)=>(
              <div key={i} className="hl" style={{ padding:36,borderRadius:24,background:'#fff',border:p.c?`2px solid ${C.p}`:'1px solid #f1f5f9',boxShadow:p.c?`0 20px 60px ${C.p}15`:'0 4px 20px rgba(0,0,0,.03)',position:'relative' }}>
                {p.c && <div style={{ position:'absolute',top:-12,left:'50%',transform:'translateX(-50%)',background:g(C.p,C.pl),color:'#fff',fontSize:11,fontWeight:700,padding:'4px 16px',borderRadius:50,textTransform:'uppercase',letterSpacing:1 }}>Populaire</div>}
                <h3 style={{ fontSize:22,fontWeight:700,marginBottom:4 }}>{p.n}</h3>
                <p style={{ color:C.m,fontSize:13,margin:'0 0 20px' }}>{p.d}</p>
                <div style={{ marginBottom:24 }}>
                  {p.p==='0'?<span style={{ fontSize:20,fontWeight:700 }}>Sur mesure</span>:<><span style={{ fontSize:42,fontWeight:800,color:C.s }}>{p.p}</span><span style={{ color:C.m,fontSize:15 }}>€/mois</span></>}
                </div>
                <ul style={{ listStyle:'none',padding:0,margin:'0 0 28px' }}>
                  {p.f.map((f,j)=><li key={j} style={{ padding:'8px 0',fontSize:14,color:'#334155',display:'flex',alignItems:'center',gap:10,fontFamily: 'inherit' }}><svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{flexShrink:0,marginTop:2}}><circle cx="7" cy="7" r="6" fill={`${C.p}20`}/><path d="M4 7l2 2 4-4" stroke={C.p} strokeWidth="1.5" strokeLinecap="round"/></svg> {f}</li>)}
                </ul>
                <button onClick={()=>{trackClick('pricing_'+p.n);navigate(p.p==='0'?'/contact':'/signup')}} className={p.c?'bp':'bs'} style={{ width:'100%',padding:'14px 24px',borderRadius:12,cursor:'pointer',fontFamily:'inherit',fontSize:15,fontWeight:600,border:p.c?'none':'2px solid #e2e8f0',background:p.c?g(C.p,C.pl):'#fff',color:p.c?'#fff':C.s,boxShadow:p.c?`0 8px 30px ${C.p}25`:'none' }}>
                  {p.p==='0'?'Nous contacter':'Démarrer gratuitement'}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ═══ FAQ ═══ */}
      <section style={{ ...s.section, background:'#fff' }}>
        <div style={{ maxWidth:700,margin:'0 auto' }}>
          <div style={s.center}>
            <div style={s.label}>Questions fréquentes</div>
            <h2 style={s.h2}>Tout ce que vous devez savoir</h2>
          </div>
          {[
            { q:"Qu’est-ce qu’un programme d’apporteurs d’affaires ?", a:"C’est un système qui rémunère des partenaires externes (apporteurs) pour chaque client qu’ils vous recommandent. RefBoost automatise tout : tracking, attribution, calcul et paiement des commissions." },
            { q:"Combien de temps pour être opérationnel ?", a:"5 minutes. Créez votre compte, invitez vos premiers apporteurs, et commencez à recevoir des recommandations dès aujourd’hui." },
            { q:"Puis-je personnaliser la plateforme à mon image ?", a:"Oui. Logo, couleurs, domaine personnalisé — vos partenaires travaillent dans un environnement à votre image, pas celle de RefBoost." },
            { q:"Comment sont calculées les commissions ?", a:"Vous définissez le taux par apporteur ou globalement. À chaque deal gagné, RefBoost calcule automatiquement la prime et vous notifie pour validation." },
            { q:"Mes données sont-elles sécurisées ?", a:"Absolument. Chiffrement AES-256, journaux d’audit complets, protection anti-brute force, conformité RGPD. Nous suivons les standards ISO 27001." },
          ].map((faq,i)=>(
            <details key={i} style={{ marginBottom:12,borderRadius:16,border:'1px solid #f1f5f9',overflow:'hidden' }}>
              <summary style={{ padding:'20px 24px',fontWeight:600,fontSize:16,cursor:'pointer',background:'#fafbfc',listStyle:'none',display:'flex',justifyContent:'space-between',alignItems:'center' }}>
                {faq.q}<span style={{ color:C.p,fontSize:20 }}>+</span>
              </summary>
              <div style={{ padding:'0 24px 20px',color:C.m,fontSize:14,lineHeight:1.7,fontFamily: 'inherit' }}>{faq.a}</div>
            </details>
          ))}
        </div>
      </section>

      {/* ═══ CTA ═══ */}
      <section style={{ padding:'100px 48px',background:g(C.s,'#1e293b'),position:'relative',overflow:'hidden' }}>
        <div style={{ position:'absolute',top:-100,right:-100,width:400,height:400,borderRadius:'50%',background:`${C.p}10` }}/>
        <div style={{ position:'absolute',bottom:-50,left:-50,width:250,height:250,borderRadius:'50%',background:`${C.a}08` }}/>
        <div style={{ maxWidth:650,margin:'0 auto',textAlign:'center',position:'relative',zIndex:1 }}>
          <h2 style={{ fontSize:44,fontWeight:800,color:'#fff',letterSpacing:-2,margin:'0 0 16px' }}>Prêt à structurer votre<br/>réseau d’apporteurs ?</h2>
          <p style={{ color:'#94a3b8',fontSize:17,lineHeight:1.6,marginBottom:36,fontFamily: 'inherit' }}>Rejoignez les entreprises qui utilisent RefBoost pour transformer leurs recommandations en revenus récurrents.</p>
          <div style={{ display:'flex',gap:12,justifyContent:'center',maxWidth:460,margin:'0 auto' }}>
            <input type="email" placeholder="votre@email.com" value={email} onChange={e=>setEmail(e.target.value)} style={{ flex:1,padding:'16px 20px',borderRadius:12,border:'2px solid rgba(255,255,255,.1)',background:'rgba(255,255,255,.06)',color:'#fff',fontSize:15,fontFamily:'inherit',outline:'none' }}/>
            <button onClick={()=>{trackClick('footer_cta');navigate('/signup'+(email?'?email='+encodeURIComponent(email):''))}} className="bp" style={{ padding:'16px 28px',borderRadius:12,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:15,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',boxShadow:`0 8px 30px ${C.p}30` }}>
              Démarrer →
            </button>
          </div>
          <p style={{ color:'#475569',fontSize:12,marginTop:16 }}>14 jours gratuits · Sans carte bancaire · Annulation en 1 clic</p>
        </div>
      </section>

      {/* ═══ FOOTER ═══ */}
      <footer style={{ padding:'48px 48px 32px',background:C.s,borderTop:'1px solid rgba(255,255,255,.05)' }}>
        <div style={{ maxWidth:1100,margin:'0 auto' }}>
          <div style={{ display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:32 }}>
            <div>
              <Logo size={28} white/>
              <p style={{ color:'#64748b',fontSize:13,marginTop:12,maxWidth:300,fontFamily: 'inherit' }}>La plateforme de gestion de programme d’apporteurs d’affaires et de parrainage professionnel.</p>
            </div>
            <div style={{ display:'flex',gap:48 }}>
              <div>
                <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>Fonctionnalités</div>
                {[
                  ['/fonctionnalites/pipeline','Pipeline de leads'],
                  ['/fonctionnalites/commissions','Commissions automatiques'],
                  ['/fonctionnalites/analytics','Analytics & KPIs'],
                  ['/fonctionnalites/personnalisation','Marque blanche'],
                  ['/fonctionnalites/tracking','Liens de tracking'],
                ].map(([href,label]) => <a key={href} href={href} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{label}</a>)}
              </div>
              <div>
                <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>Ressources</div>
                {['Blog','Guide de démarrage','FAQ','Contact'].map(x=><a key={x} href={x === 'Blog' ? '/blog' : '#'} style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{x}</a>)}
              </div>
              <div>
                <div style={{ color:'#94a3b8',fontWeight:600,fontSize:12,textTransform:'uppercase',letterSpacing:1,marginBottom:12 }}>Légal</div>
                {['CGV','Confidentialité','Mentions légales','RGPD'].map(x=><a key={x} href="#" style={{ display:'block',color:'#64748b',textDecoration:'none',fontSize:13,marginBottom:8 }}>{x}</a>)}
              </div>
            </div>
          </div>
          <div style={{ borderTop:'1px solid rgba(255,255,255,.06)',paddingTop:20,display:'flex',justifyContent:'space-between',alignItems:'center' }}>
            <div style={{ color:'#475569',fontSize:12 }}>© 2026 RefBoost. Tous droits réservés.</div>
            <div style={{ color:'#475569',fontSize:12 }}>Fait avec soin en France</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
