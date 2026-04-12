import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';

const C = { p: '#059669', s: '#0f172a', m: '#64748b', bg: '#fafbfc' };

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.bg }}>
      <div style={{ textAlign: 'center' }}>
        <p style={{ color: C.m, marginBottom: 16 }}>Lien invalide ou expiré.</p>
        <Link to="/forgot-password" style={{ color: C.p, fontWeight: 700, textDecoration: 'none' }}>Demander un nouveau lien</Link>
      </div>
    </div>
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (password !== confirm) return setError('Les mots de passe ne correspondent pas.');
    setLoading(true);
    try {
      await api.request('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });
      setDone(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message || 'Erreur serveur');
    }
    setLoading(false);
  };

  if (done) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.bg }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', background: '#fff', borderRadius: 24, padding: 48, boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
        <h2 style={{ fontWeight: 800, fontSize: 24, color: C.s, margin: '0 0 12px' }}>Mot de passe mis à jour !</h2>
        <p style={{ color: C.m, marginBottom: 24 }}>Redirection vers la connexion dans quelques secondes...</p>
        <Link to="/login" style={{ color: C.p, fontWeight: 700, textDecoration: 'none' }}>Se connecter maintenant →</Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.bg }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 24, padding: 48, boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <h1 style={{ fontWeight: 800, fontSize: 28, color: C.s, margin: '0 0 8px' }}>Nouveau mot de passe</h1>
        <p style={{ color: C.m, margin: '0 0 32px', lineHeight: 1.6 }}>
          Choisissez un mot de passe fort : 10 caractères minimum, avec majuscule, chiffre et caractère spécial.
        </p>
        {error && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', color: '#dc2626', fontSize: 14, marginBottom: 20 }}>
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: C.s, marginBottom: 8 }}>Nouveau mot de passe</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="••••••••••"
            required
            style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: C.bg, fontSize: 15, color: C.s, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
          />
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: C.s, marginBottom: 8 }}>Confirmer le mot de passe</label>
          <input
            type="password"
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder="••••••••••"
            required
            style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: C.bg, fontSize: 15, color: C.s, outline: 'none', boxSizing: 'border-box', marginBottom: 24 }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: loading ? '#94a3b8' : C.p, color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 8px 30px rgba(5,150,105,0.3)' }}
          >
            {loading ? 'Mise à jour...' : 'Réinitialiser mon mot de passe →'}
          </button>
        </form>
      </div>
    </div>
  );
}
