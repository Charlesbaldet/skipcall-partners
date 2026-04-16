import { useTranslation } from 'react-i18next';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Lock, CheckCircle, AlertTriangle } from 'lucide-react';

export default function SetupPasswordPage() {
  const { t } = useTranslation();
  const { token } = useParams();
  const navigate = useNavigate();
  const [invitation, setInvitation] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/invitation/${token}`)
      .then(r => r.json().then(d => ({ ok: r.ok, data: d })))
      .then(({ ok, data }) => {
        if (!ok) throw new Error(data.error);
        setInvitation(data.invitation);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password.length < 8) return setError(t('setupPwd.min_chars'));
    if (password !== confirmPassword) return setError(t('setupPwd.mismatch'));

    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/auth/setup-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  };

  const s = {
    page: { minHeight: '100vh', background: 'linear-gradient(168deg, #0a0a0f 0%, #111827 50%, #0f172a 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 },
    card: { width: 440, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 24, padding: 40, backdropFilter: 'blur(20px)' },
    input: { width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.06)', fontSize: 15, color: '#fff', boxSizing: 'border-box' },
  };

  if (loading) {
    return (
      <div style={s.page}>
        <p style={{ color: '#94a3b8' }}>{t('setupPwd.loading')}</p>
      </div>
    );
  }

  if (error && !invitation) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ textAlign: 'center' }}>
            <AlertTriangle size={48} color="#f59e0b" style={{ marginBottom: 16 }} />
            <h2 style={{ color: '#fff', fontSize: 22, fontWeight: 700, marginBottom: 8 }}>{t('setupPwd.invalid')}</h2>
            <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 24 }}>{error}</p>
            <a href="/login" style={{ color: '#818cf8', fontWeight: 600, textDecoration: 'none' }}>{t('setupPwd.back_to_login')}</a>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg,#22c55e,#16a34a)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', boxShadow: '0 8px 30px rgba(34,197,94,0.3)' }}>
              <CheckCircle size={28} color="#fff" />
            </div>
            <h2 style={{ color: '#fff', fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{t('setupPwd.success_title')}</h2>
            <p style={{ color: '#94a3b8', fontSize: 15, marginBottom: 8 }}>{t('setupPwd.success_text')}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.card} className="fade-in">
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--rb-primary, #059669)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 800, color: '#fff', boxShadow: '0 0 30px rgba(5,150,105,0.4)' }}>S</div>
            <span style={{ fontSize: 26, fontWeight: 700, color: '#fff' }}>Skipcall</span>
          </div>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{t('setupPwd.create_title')}</h1>
          <p style={{ color: '#94a3b8', fontSize: 14 }}>
            {t('setupPwd.welcome_prefix')} <strong style={{ color: '#fff' }}>{invitation.fullName}</strong> {t('setupPwd.welcome_middle')} <strong style={{ color: '#818cf8' }}>{invitation.role === 'admin' ? t('setupPwd.role_admin') : t('setupPwd.role_commercial')}</strong>.
          </p>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 10, padding: '10px 14px', color: '#fca5a5', fontSize: 13, marginBottom: 16 }}>{error}</div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('signup.email')}</label>
            <input type="email" value={invitation.email} disabled
              style={{ ...s.input, opacity: 0.5, cursor: 'not-allowed' }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('setupPwd.pwd_label')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder={t('setupPwd.min_chars_ph')} style={s.input} required minLength={8} />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ display: 'block', color: '#cbd5e1', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t('resetPwd.confirm_pwd')}</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('setupPwd.confirm_ph')} style={s.input} required />
          </div>
          <button type="submit" disabled={saving} style={{
            width: '100%', padding: '14px', borderRadius: 12,
            background: 'var(--rb-primary, #059669)', color: '#fff',
            border: 'none', fontWeight: 600, fontSize: 15, cursor: 'pointer',
            boxShadow: '0 4px 15px rgba(5,150,105,0.3)', opacity: saving ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
            <Lock size={16} /> {saving ? t('setupPwd.creating') : t('setupPwd.create_account')}
          </button>
        </form>
      </div>
    </div>
  );
}
