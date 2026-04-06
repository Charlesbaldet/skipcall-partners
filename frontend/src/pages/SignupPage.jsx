import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const C = { p:'#059669', pl:'#10b981', s:'#0f172a', a:'#f97316', m:'#64748b' };
const g = (a,b) => `linear-gradient(135deg,${a},${b})`;

export default function SignupPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    company: '', fullName: '', email: params.get('email') || '', password: '', phone: '',
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const passwordOk = form.password.length >= 10 &&
    /[A-Z]/.test(form.password) && /[a-z]/.test(form.password) &&
    /[0-9]/.test(form.password) && /[^A-Za-z0-9]/.test(form.password);

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur lors de la création');
      // Auto-login
      localStorage.setItem('skipcall_token', data.token);
      localStorage.setItem('skipcall_user', JSON.stringify(data.user));
      // Track signup
      try { window._rb_track?.('signup', { company: form.company }); } catch(e) {}
      setStep(3);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '14px 16px', borderRadius: 12,
    border: '2px solid #e2e8f0', fontSize: 15, fontFamily: 'inherit',
    outline: 'none', transition: 'border-color .2s', boxSizing: 'border-box',
  };

  return (
    <div style={{ minHeight:'100vh', background:`radial-gradient(ellipse 80% 50% at 50% -10%,${C.p}10,transparent),#fafbfc`, fontFamily:"'Outfit','DM Sans',sans-serif", display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px' }}>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;700&display=swap" rel="stylesheet"/>

      {/* Logo */}
      <div onClick={()=>navigate('/')} style={{ cursor:'pointer',display:'flex',alignItems:'center',gap:10,marginBottom:40 }}>
        <svg width={40} height={40} viewBox="0 0 48 48" fill="none">
          <defs><linearGradient id="lg" x1="0" y1="0" x2="48" y2="48"><stop offset="0%" stopColor={C.p}/><stop offset="100%" stopColor={C.pl}/></linearGradient></defs>
          <rect width="48" height="48" rx="14" fill="url(#lg)"/>
          <path d="M16 34V14h8c2.2 0 4 .6 5.2 1.8 1.2 1.2 1.8 2.8 1.8 4.7 0 1.4-.4 2.6-1.1 3.6-.7 1-1.8 1.6-3.1 2l5 7.9h-4.5L23 26.5h-2.5V34H16zm4.5-11h3.2c1 0 1.8-.3 2.3-.8.5-.5.8-1.2.8-2.1 0-.9-.3-1.6-.8-2.1-.5-.5-1.3-.8-2.3-.8h-3.2v5.8z" fill="white"/>
          <path d="M32 14l3 0 0 3-1.5 1.5L32 17z" fill={C.a} opacity="0.9"/>
        </svg>
        <span style={{ fontSize:22,fontWeight:800,letterSpacing:-1,color:C.s }}>Ref<span style={{ color:C.p }}>Boost</span></span>
      </div>

      {/* Card */}
      <div style={{ width:'100%',maxWidth:460,background:'#fff',borderRadius:24,padding:40,boxShadow:'0 20px 60px rgba(0,0,0,.08)',border:'1px solid #f1f5f9' }}>

        {/* Progress */}
        {step < 3 && (
          <div style={{ display:'flex',gap:8,marginBottom:32 }}>
            {[1,2].map(s=>(
              <div key={s} style={{ flex:1,height:4,borderRadius:2,background:step>=s?g(C.p,C.pl):'#e2e8f0',transition:'all .3s' }}/>
            ))}
          </div>
        )}

        {/* Step 1: Company + Name */}
        {step === 1 && (
          <>
            <h2 style={{ fontSize:26,fontWeight:800,margin:'0 0 8px',color:C.s }}>Créez votre espace</h2>
            <p style={{ color:C.m,fontSize:14,margin:'0 0 28px',fontFamily:"'DM Sans',sans-serif" }}>Votre programme d'apporteurs d'affaires en 2 minutes.</p>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13,fontWeight:600,color:C.s,display:'block',marginBottom:6 }}>Nom de votre entreprise *</label>
              <input value={form.company} onChange={e=>set('company',e.target.value)} placeholder="Ex: Acme SAS" style={inputStyle} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
            </div>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13,fontWeight:600,color:C.s,display:'block',marginBottom:6 }}>Votre nom complet *</label>
              <input value={form.fullName} onChange={e=>set('fullName',e.target.value)} placeholder="Prénom Nom" style={inputStyle} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
            </div>
            <div style={{ marginBottom:28 }}>
              <label style={{ fontSize:13,fontWeight:600,color:C.s,display:'block',marginBottom:6 }}>Téléphone (optionnel)</label>
              <input value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+33 6 12 34 56 78" style={inputStyle} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
            </div>

            <button onClick={()=>{ if(form.company && form.fullName) setStep(2); else setError('Veuillez remplir les champs obligatoires.'); }}
              style={{ width:'100%',padding:'16px',borderRadius:14,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit',boxShadow:`0 8px 30px ${C.p}25` }}>
              Continuer →
            </button>
          </>
        )}

        {/* Step 2: Email + Password */}
        {step === 2 && (
          <>
            <button onClick={()=>setStep(1)} style={{ background:'none',border:'none',color:C.m,cursor:'pointer',fontSize:13,marginBottom:12,padding:0 }}>← Retour</button>
            <h2 style={{ fontSize:26,fontWeight:800,margin:'0 0 8px',color:C.s }}>Vos identifiants</h2>
            <p style={{ color:C.m,fontSize:14,margin:'0 0 28px',fontFamily:"'DM Sans',sans-serif" }}>Vous serez l'administrateur de l'espace <strong>{form.company}</strong>.</p>

            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:13,fontWeight:600,color:C.s,display:'block',marginBottom:6 }}>Email professionnel *</label>
              <input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="vous@entreprise.com" style={inputStyle} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
            </div>
            <div style={{ marginBottom:8 }}>
              <label style={{ fontSize:13,fontWeight:600,color:C.s,display:'block',marginBottom:6 }}>Mot de passe *</label>
              <input type="password" value={form.password} onChange={e=>set('password',e.target.value)} placeholder="Min. 10 caractères" style={inputStyle} onFocus={e=>e.target.style.borderColor=C.p} onBlur={e=>e.target.style.borderColor='#e2e8f0'}/>
            </div>
            <div style={{ marginBottom:28,display:'flex',flexWrap:'wrap',gap:6 }}>
              {[
                [form.password.length>=10, '10+ car.'],
                [/[A-Z]/.test(form.password), 'Majuscule'],
                [/[a-z]/.test(form.password), 'Minuscule'],
                [/[0-9]/.test(form.password), 'Chiffre'],
                [/[^A-Za-z0-9]/.test(form.password), 'Spécial'],
              ].map(([ok,label],i)=>(
                <span key={i} style={{ fontSize:11,padding:'3px 8px',borderRadius:6,background:ok?`${C.p}15`:'#f1f5f9',color:ok?C.p:'#94a3b8',fontWeight:600 }}>{ok?'✓':'○'} {label}</span>
              ))}
            </div>

            {error && <div style={{ padding:'12px 16px',borderRadius:10,background:'#fef2f2',color:'#dc2626',fontSize:13,marginBottom:16,fontWeight:500 }}>{error}</div>}

            <button onClick={()=>{ if(!form.email||!passwordOk) setError('Email et mot de passe requis (10 car., maj, min, chiffre, spécial).'); else handleSubmit(); }}
              disabled={loading}
              style={{ width:'100%',padding:'16px',borderRadius:14,border:'none',background:loading?'#94a3b8':g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:16,cursor:loading?'wait':'pointer',fontFamily:'inherit',boxShadow:loading?'none':`0 8px 30px ${C.p}25` }}>
              {loading ? 'Création en cours...' : 'Créer mon espace'}
            </button>

            <p style={{ color:'#94a3b8',fontSize:11,textAlign:'center',marginTop:16,fontFamily:"'DM Sans',sans-serif" }}>
              En créant un compte, vous acceptez nos <a href="#" style={{ color:C.p }}>CGV</a> et notre <a href="#" style={{ color:C.p }}>politique de confidentialité</a>.
            </p>
          </>
        )}

        {/* Step 3: Success */}
        {step === 3 && (
          <div style={{ textAlign:'center' }}>
            <div style={{ width:72,height:72,borderRadius:20,background:`${C.p}10`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 20px',fontSize:36 }}>🎉</div>
            <h2 style={{ fontSize:26,fontWeight:800,margin:'0 0 8px',color:C.s }}>Bienvenue sur RefBoost !</h2>
            <p style={{ color:C.m,fontSize:14,margin:'0 0 32px',fontFamily:"'DM Sans',sans-serif" }}>
              Votre espace <strong>{form.company}</strong> est prêt.<br/>Vous êtes l'administrateur.
            </p>
            <button onClick={()=>navigate('/dashboard')}
              style={{ width:'100%',padding:'16px',borderRadius:14,border:'none',background:g(C.p,C.pl),color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer',fontFamily:'inherit',boxShadow:`0 8px 30px ${C.p}25` }}>
              Accéder à mon tableau de bord →
            </button>
          </div>
        )}
      </div>

      {/* Login link */}
      {step < 3 && (
        <p style={{ marginTop:24,color:C.m,fontSize:14 }}>
          Déjà un compte ? <a onClick={()=>navigate('/login')} style={{ color:C.p,fontWeight:600,cursor:'pointer',textDecoration:'none' }}>Se connecter</a>
        </p>
      )}
    </div>
  );
}
