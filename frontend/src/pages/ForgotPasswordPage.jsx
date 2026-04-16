import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const C = { p: '#059669', s: '#0f172a', m: '#64748b', bg: '#fafbfc' };

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.request('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
    } catch (_) {}
    setSent(true);
    setLoading(false);
  };

  if (sent) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.bg }}>
      <div style={{ maxWidth: 440, width: '100%', textAlign: 'center', background: '#fff', borderRadius: 24, padding: 48, boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <div style={{ fontSize: 52, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontWeight: 800, fontSize: 24, color: C.s, margin: '0 0 12px' }}>Email envoyé !</h2>
        <p style={{ color: C.m, marginBottom: 32, lineHeight: 1.6 }}>
          Si un compte existe avec cet email, vous recevrez un lien de réinitialisation dans quelques minutes.
        </p>
        <Link to="/login" style={{ color: C.p, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
          ← Retour à la connexion
        </Link>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: C.bg }}>
      <div style={{ width: '100%', maxWidth: 440, background: '#fff', borderRadius: 24, padding: 48, boxShadow: '0 20px 60px rgba(0,0,0,0.08)' }}>
        <Link to="/login" style={{ color: C.m, textDecoration: 'none', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4, marginBottom: 28 }}>
          ← Retour à la connexion
        </Link>
        <h1 style={{ fontWeight: 800, fontSize: 28, color: C.s, margin: '0 0 8px' }}>Mot de passe oublié</h1>
        <p style={{ color: C.m, margin: '0 0 32px', lineHeight: 1.6 }}>
          Entrez votre email. Si un compte existe, nous vous enverrons un lien pour réinitialiser votre mot de passe.
        </p>
        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: C.s, marginBottom: 8 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="vous@entreprise.com"
            required
            style={{ width: '100%', padding: '14px 16px', borderRadius: 12, border: '1.5px solid #e2e8f0', background: C.bg, fontSize: 15, color: C.s, outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{ width: '100%', padding: 15, borderRadius: 12, border: 'none', background: loading ? '#94a3b8' : C.p, color: '#fff', fontWeight: 700, fontSize: 15, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 8px 30px rgba(5,150,105,0.3)' }}
          >
            {loading ? 'Envoi en cours...' : 'Envoyer le lien de réinitialisation →'}
          </button>
        </form>
      </div>
    </div>
  );
}
