import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const user = await login(email, password);
      navigate(user.role === 'partner' ? '/partner/submit' : '/');
    } catch (err) {
      setError(err.message || 'Identifiants incorrects');
    } finally {
      setLoading(false);
    }
  };

  const s = {
    page: { minHeight: '100vh', background: 'linear-gradient(168deg, #0a0a0f 0%, #111827 50%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: 420, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40, backdropFilter: 'blur(20px)' },
    logo: { display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center', marginBottom: 32 },
    logoIcon: { width: 44, height: 44, borderRadius: 13, background: 'linear-gradient(135deg,#6366f1,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', boxShadow: '0 0 30px rgba(99,102,241,0.4)' },
    title: { fontSize: 24, fontWeight: 700, color: '#fff', textAlign: 'center', marginBottom: 8 },
    subtitle: { color: '#94a3b8', fontSize: 14, textAlign: 'center', marginBottom: 32 },
    label: { display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 },
    input: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, color: '#fff', boxSizing: 'border-box' },
    btn: { width: '100%', padding: '14px', borderRadius: 12, background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer', marginTop: 8, boxShadow: '0 4px 15px rgba(99,102,241,0.3)' },
    error: { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 },
  };

  return (
    <div style={s.page}>
      <div style={s.card} className="fade-in">
        <div style={s.logo}>
          <div style={s.logoIcon}>S</div>
          <span style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>Skipcall</span>
        </div>
        <h1 style={s.title}>Connexion</h1>
        <p style={s.subtitle}>Programme Partenaires</p>

        {error && <div style={s.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={s.label}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="votre@email.com" style={s.input} required />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={s.label}>Mot de passe</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" style={s.input} required />
          </div>
          <button type="submit" disabled={loading} style={{ ...s.btn, opacity: loading ? 0.7 : 1 }}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
