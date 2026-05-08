// Password policy — ISO 27001 A.9.4 / SOC 2 CC6.
// Mirror of the rules enforced client-side by PasswordStrengthMeter so
// the UI never offers a password the backend would reject. Returns
// i18n keys (not human strings) so the FE can localize uniformly;
// callers that surface raw strings (legacy auth.js) join them with
// '. ' and ship the keys as-is — the FE looks them up later.

const COMMON_PASSWORDS = new Set([
  'password', 'password1', 'password123', '123456', '123456789', '12345678',
  '12345', '1234567', '1234567890', 'qwerty', 'qwerty123', 'qwertyuiop',
  'azerty', 'azerty123', 'abc123', 'admin', 'admin123', 'administrator',
  'root', 'toor', 'welcome', 'welcome1', 'welcome123', 'iloveyou',
  'letmein', 'login', 'passw0rd', 'p@ssw0rd', 'p@ssword', 'monkey',
  'dragon', 'master', 'superman', 'batman', 'shadow', 'football',
  'baseball', 'basketball', 'starwars', 'sunshine', 'princess', 'qazwsx',
  'trustno1', 'mustang', 'access', 'flower', 'whatever', 'jordan',
  'hunter', 'killer', 'pepper', 'ranger', 'jennifer', 'jessica',
  'jordan23', 'thomas', 'michelle', 'daniel', 'andrew', 'joshua',
  'matthew', 'computer', 'internet', 'samantha', 'tigger', 'charlie',
  'donald', 'freedom', 'liberty', 'soccer', 'hockey', 'george',
  'george1', 'asdfghjkl', 'asdf1234', 'asdfgh', 'zxcvbnm', 'qaz123',
  '1q2w3e4r', '1q2w3e', 'q1w2e3r4', '111111', '222222', '000000',
  '123123', '654321', 'qwer1234', 'qwerty1', 'iloveyou1', 'changeme',
  'changeme123', 'temp123', 'test123', 'demo123', 'guest', 'guest123',
  'user', 'user123', 'pass', 'pass123', 'secret', 'secret123',
  'motdepasse', 'bonjour', 'soleil', 'azerty1', 'compte123', 'refboost',
  'refboost123', 'skipcall', 'skipcall123',
]);

function validatePassword(pwd) {
  const errors = [];
  const s = typeof pwd === 'string' ? pwd : '';
  if (s.length < 8) errors.push('password.errors.too_short');
  if (!/[A-Z]/.test(s)) errors.push('password.errors.no_uppercase');
  if (!/[a-z]/.test(s)) errors.push('password.errors.no_lowercase');
  if (!/[0-9]/.test(s)) errors.push('password.errors.no_digit');
  if (s && COMMON_PASSWORDS.has(s.toLowerCase())) {
    errors.push('password.errors.too_common');
  }
  return { valid: errors.length === 0, errors };
}

module.exports = { COMMON_PASSWORDS, validatePassword };
