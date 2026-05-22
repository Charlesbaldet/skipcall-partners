import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// J2 — Email verification landing page.
// Consommée par le lien envoyé à la création du compte (POST /signup).
// Appelle GET /api/auth/verify-email/:token et affiche l'état :
//   - loading : token en cours de vérification
//   - verified : succès, bouton vers /login
//   - already_verified : déjà actif, bouton vers /login (idempotent)
//   - error : token invalide ou expiré, bouton vers /signup OR
//             resend-verification (à saisir email)

const C = {
  p: '#059669', pl: '#10b981',
  s: '#0f172a', m: '#64748b',
};

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [status, setStatus] = useState('loading'); // 'loading' | 'verified' | 'already_verified' | 'error'
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) {
      setStatus('error');
      setErrorMsg(t('verify_email.no_token', 'Lien invalide — aucun token fourni.'));
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch('/api/auth/verify-email/' + encodeURIComponent(token));
        const data = await r.json().catch(() => ({}));
        if (cancelled) return;
        if (!r.ok) {
          setStatus('error');
          setErrorMsg(data.error === 'invalid_or_expired_token'
            ? t('verify_email.invalid', 'Lien invalide ou expiré.')
            : t('verify_email.error_generic', 'Erreur lors de la vérification.'));
          return;
        }
        if (data.already_verified) {
          setStatus('already_verified');
        } else {
          setStatus('verified');
        }
      } catch {
        if (!cancelled) {
          setStatus('error');
          setErrorMsg(t('verify_email.network', 'Erreur réseau. Réessayez dans quelques instants.'));
        }
      }
    })();
    return () => { cancelled = true; };
  }, [params, t]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: '24px',
      background: '#fafbfc',
    }}>
      <div style={{
        width: '100%', maxWidth: 440, padding: 36, borderRadius: 20,
        background: '#fff', boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
        border: '1px solid #e2e8f0', textAlign: 'center',
      }}>
        {status === 'loading' && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: '#eff6ff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>⏳</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.s, margin: '0 0 8px' }}>
              {t('verify_email.loading_title', 'Vérification en cours…')}
            </h2>
            <p style={{ color: C.m, fontSize: 14, margin: 0 }}>
              {t('verify_email.loading_sub', 'Validation du lien dans une seconde.')}
            </p>
          </>
        )}
        {(status === 'verified' || status === 'already_verified') && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: `${C.p}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>✅</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.s, margin: '0 0 8px' }}>
              {status === 'verified'
                ? t('verify_email.success_title', 'Email vérifié !')
                : t('verify_email.already_title', 'Email déjà vérifié')}
            </h2>
            <p style={{ color: C.m, fontSize: 14, margin: '0 0 28px' }}>
              {t('verify_email.success_sub', 'Vous pouvez maintenant vous connecter à votre espace.')}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: C.p, color: '#fff', fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('verify_email.login_cta', 'Se connecter')}
            </button>
          </>
        )}
        {status === 'error' && (
          <>
            <div style={{ width: 72, height: 72, borderRadius: 20, background: '#fef2f2', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: 36 }}>⚠️</div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: C.s, margin: '0 0 8px' }}>
              {t('verify_email.error_title', 'Lien invalide ou expiré')}
            </h2>
            <p style={{ color: C.m, fontSize: 14, margin: '0 0 24px' }}>
              {errorMsg || t('verify_email.error_generic', 'Demandez un nouveau lien depuis la page de connexion.')}
            </p>
            <button
              onClick={() => navigate('/login')}
              style={{ width: '100%', padding: '14px', borderRadius: 14, border: '1.5px solid ' + C.p, background: '#fff', color: C.p, fontWeight: 700, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit' }}
            >
              {t('verify_email.go_to_login', 'Retour à la connexion')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
