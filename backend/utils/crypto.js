// AES-256-CBC at-rest encryption for stored API tokens
// (Pennylane API key, Qonto OAuth tokens, HubSpot/Salesforce OAuth
// tokens). The legacy fallback — values without a ':' separator are
// returned as-is by decrypt() — keeps existing rows working until the
// next write encrypts them. Run scripts/migrate-encrypt-tokens.js
// once after TOKEN_ENCRYPTION_KEY is provisioned to back-fill the rest.

const crypto = require('crypto');
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY;
const IV_LENGTH = 16;

function encrypt(text) {
  if (!text) return text;
  if (!ENCRYPTION_KEY) throw new Error('TOKEN_ENCRYPTION_KEY not set');
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let encrypted = cipher.update(text);
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  if (!text) return text;
  if (!ENCRYPTION_KEY) throw new Error('TOKEN_ENCRYPTION_KEY not set');
  if (!text.includes(':')) return text; // legacy unencrypted — return as-is
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString();
}

module.exports = { encrypt, decrypt };
