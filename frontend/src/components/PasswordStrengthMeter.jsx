import { useTranslation } from 'react-i18next';

// Mirror of backend/utils/passwordPolicy.js — kept in lock-step so the
// UI never offers a password the backend would reject. Single source
// of truth lives on the backend; the FE re-implements the same rules
// for instant feedback.

const COMMON = new Set([
  'password', 'password1', 'password123', '123456', '123456789', '12345678',
  '12345', '1234567', '1234567890', 'qwerty', 'qwerty123', 'qwertyuiop',
  'azerty', 'azerty123', 'abc123', 'admin', 'admin123', 'administrator',
  'root', 'toor', 'welcome', 'welcome1', 'welcome123', 'iloveyou',
  'letmein', 'login', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'monkey',
  'dragon', 'master', 'superman', 'batman', 'shadow', 'football',
  'starwars', 'sunshine', 'princess', 'qazwsx', 'trustno1', '111111',
  '222222', '000000', '123123', '654321', 'qwer1234', 'qwerty1',
  'iloveyou1', 'changeme', 'changeme123', 'temp123', 'test123',
  'demo123', 'guest', 'guest123', 'user', 'user123', 'pass', 'pass123',
  'secret', 'secret123', 'motdepasse', 'bonjour', 'soleil', 'compte123',
  'refboost', 'refboost123', 'skipcall', 'skipcall123',
]);

export function validatePasswordClient(pwd) {
  const errors = [];
  const s = typeof pwd === 'string' ? pwd : '';
  if (s.length < 8) errors.push('password.errors.too_short');
  if (!/[A-Z]/.test(s)) errors.push('password.errors.no_uppercase');
  if (!/[a-z]/.test(s)) errors.push('password.errors.no_lowercase');
  if (!/[0-9]/.test(s)) errors.push('password.errors.no_digit');
  if (s && COMMON.has(s.toLowerCase())) errors.push('password.errors.too_common');
  return { valid: errors.length === 0, errors };
}

const SEGMENT_COLORS = ['#dc2626', '#f97316', '#eab308', '#059669'];
const STRENGTH_KEYS = ['password.strength.weak', 'password.strength.fair', 'password.strength.good', 'password.strength.strong'];

function scorePassword(pwd) {
  if (!pwd) return 0;
  const { errors } = validatePasswordClient(pwd);
  // 4 segments. Hard-rule failures cap the score; bonuses lift it up
  // when the password is comfortably long or mixes character classes.
  let score = Math.max(0, 4 - errors.length);
  if (score > 0 && pwd.length >= 12) score = Math.min(4, score + 1);
  if (score > 0 && /[^A-Za-z0-9]/.test(pwd)) score = Math.min(4, score + 1);
  return Math.max(1, Math.min(4, score));
}

export default function PasswordStrengthMeter({ password = '' }) {
  const { t } = useTranslation();
  const { errors } = validatePasswordClient(password);
  const score = scorePassword(password);

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 4,
              borderRadius: 2,
              background: password && i < score ? SEGMENT_COLORS[score - 1] : '#e2e8f0',
              transition: 'background-color 0.2s',
            }}
          />
        ))}
      </div>
      {password && (
        <div style={{ fontSize: 12, color: SEGMENT_COLORS[score - 1] || '#94a3b8', fontWeight: 600, marginBottom: 8 }}>
          {t(STRENGTH_KEYS[score - 1] || STRENGTH_KEYS[0])}
        </div>
      )}
      {errors.length > 0 && (
        <ul style={{ margin: 0, padding: '0 0 0 18px', fontSize: 12, color: '#64748b', lineHeight: 1.6 }}>
          {errors.map(key => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
