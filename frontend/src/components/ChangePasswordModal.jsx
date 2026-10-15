import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import api from '../lib/api';
import PasswordStrengthMeter, { validatePasswordClient } from './PasswordStrengthMeter';

export default function ChangePasswordModal({ onSuccess }) {
  const { t } = useTranslation();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const policy = validatePasswordClient(pwd);
  const passwordOk = policy.valid;

  const handleSubmit = async () => {
    setError('');
    if (!passwordOk) return setError(t('password.errors.too_short', 'Mot de passe trop faible'));
    if (pwd !== confirm) return setError(t('changePwd.mismatch'));
    setLoading(true);
    try {
      await api.request('/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: pwd }),
      });
      onSuccess();
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(8px)' }}>
      <div style={{ background: '#fff', borderRadius: 24, padding: 40, width: 420, maxWidth: '100%', boxShadow: '0 25px 80px rgba(0,0,0,0.25)' }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#e9f1ea', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={24} color="#0e7a54" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0e1f18', marginBottom: 8 }}>{t('changePwd.choose_title')}</h2>
          <p style={{ color: '#6e756c', fontSize: 14, lineHeight: 1.5 }}>{t('changePwd.welcome_text')}</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#2b3a32', marginBottom: 6 }}>{t('changePwd.new_pwd')}</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder={t('changePwd.pwd_ph')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10, border: '1.5px solid #ded8cb', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#99a09a', padding: 0 }}>
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <PasswordStrengthMeter password={pwd} />
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#2b3a32', marginBottom: 6 }}>{t('changePwd.confirm')}</label>
          <input
            type={showPwd ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={t('changePwd.confirm_ph')}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${confirm && confirm !== pwd ? '#b23b2e' : confirm && confirm === pwd ? '#0e7a54' : '#ded8cb'}`, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          {confirm && confirm === pwd && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: '#0e7a54', fontSize: 13 }}>
              <CheckCircle size={14} /> {t('changePwd.match_ok')}
            </div>
          )}
        </div>

        {error && <div style={{ background: '#f7e9e6', border: '1px solid #edc4bd', borderRadius: 8, padding: '10px 14px', color: '#b23b2e', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || !pwd || !confirm || !passwordOk || pwd !== confirm}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: (loading || !pwd || !confirm || !passwordOk || pwd !== confirm) ? '#99a09a' : '#0e7a54', color: '#fff', fontWeight: 700, fontSize: 16, cursor: (loading || !pwd || !confirm || !passwordOk || pwd !== confirm) ? 'not-allowed' : 'pointer' }}
        >
          {loading ? t('changePwd.submitting') : t('changePwd.set_password')}
        </button>
      </div>
    </div>
  );
}
