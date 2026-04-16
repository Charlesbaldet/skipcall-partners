import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { Lock, Eye, EyeOff, CheckCircle } from 'lucide-react';
import api from '../lib/api';

export default function ChangePasswordModal({ onSuccess }) {
  const { t } = useTranslation();
  const [pwd, setPwd] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setError('');
    if (pwd.length < 8) return setError(t('changePwd.min_chars'));
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
          <div style={{ width: 56, height: 56, borderRadius: 16, background: '#f0fdf4', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
            <Lock size={24} color="#059669" />
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', marginBottom: 8 }}>{t('changePwd.choose_title')}</h2>
          <p style={{ color: '#64748b', fontSize: 14, lineHeight: 1.5 }}>{t('changePwd.welcome_text')}</p>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 6 }}>{t('changePwd.new_pwd')}</label>
          <div style={{ position: 'relative' }}>
            <input
              type={showPwd ? 'text' : 'password'}
              value={pwd}
              onChange={e => setPwd(e.target.value)}
              placeholder={t('changePwd.pwd_ph')}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              style={{ width: '100%', padding: '12px 44px 12px 14px', borderRadius: 10, border: '1.5px solid #e2e8f0', fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button onClick={() => setShowPwd(!showPwd)} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
              {showPwd ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontWeight: 600, fontSize: 13, color: '#334155', marginBottom: 6 }}>{t('changePwd.confirm')}</label>
          <input
            type={showPwd ? 'text' : 'password'}
            value={confirm}
            onChange={e => setConfirm(e.target.value)}
            placeholder={t('changePwd.confirm_ph')}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            style={{ width: '100%', padding: '12px 14px', borderRadius: 10, border: `1.5px solid ${confirm && confirm !== pwd ? '#dc2626' : confirm && confirm === pwd ? '#059669' : '#e2e8f0'}`, fontSize: 15, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit' }}
          />
          {confirm && confirm === pwd && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 6, color: '#059669', fontSize: 13 }}>
              <CheckCircle size={14} /> {t('changePwd.match_ok')}
            </div>
          )}
        </div>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 14px', color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</div>}

        <button
          onClick={handleSubmit}
          disabled={loading || !pwd || !confirm}
          style={{ width: '100%', padding: '14px', borderRadius: 12, border: 'none', background: loading || !pwd || !confirm ? '#94a3b8' : '#059669', color: '#fff', fontWeight: 700, fontSize: 16, cursor: loading || !pwd || !confirm ? 'not-allowed' : 'pointer' }}
        >
          {loading ? t('changePwd.submitting') : t('changePwd.set_password')}
        </button>
      </div>
    </div>
  );
}
