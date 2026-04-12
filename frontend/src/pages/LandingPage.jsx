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
          {/* Fonctionnalités — dropdown */}
          <div style={{ position:'relative' }}
            onMouseEnter={() => setFeatOpen(true)}
            onMouseLeave={() => setFeatOpen(false)}>
            <span style={{ color:C.m,fontSize:14,fontWeight:500,cursor:'default',display:'flex',alignItems:'center',gap:4 }}>
              Fonctionnalités
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 4l4 4 4-4" stroke={C.m} strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
            </span>
            {featOpen && (
              <div style={{ position:'absolute',top:'calc(100% + 8px)',left:-16,background:'#fff',borderRadius:16,boxShadow:'0 12px 40px rgba(0,0,0,0.12)',border:'1px solid #f1f5f9',padding:8,minWidth:260,zIndex:200 }}>
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
          ))};
}
