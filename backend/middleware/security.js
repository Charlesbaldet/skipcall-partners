const { query } = require('../db');
const crypto = require('crypto');

// ═══════════════════════════════════════
// ISO 27001 A.12.4 - AUDIT LOGGING
// ═══════════════════════════════════════
async function auditLog(req, action, resourceType, resourceId, details = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (tenant_id, user_id, user_email, action, resource_type, resource_id, details, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        req.tenantId || null,
        req.user?.id || null,
        req.user?.email || null,
        action,
        resourceType,
        resourceId || null,
        JSON.stringify(details),
        req.ip || req.connection?.remoteAddress || null,
        (req.headers['user-agent'] || '').substring(0, 500),
      ]
    );
  } catch (err) {
    console.error('Audit log error:', err.message);
  }
}

// ═══════════════════════════════════════
// ISO 27001 A.9.4 - RATE LIMITING
// ═══════════════════════════════════════
const rateLimitStore = {};

function rateLimit(windowMs = 60000, maxRequests = 60) {
  return (req, res, next) => {
    const key = (req.ip || 'unknown') + ':' + req.path;
    const now = Date.now();

    if (!rateLimitStore[key]) rateLimitStore[key] = { count: 0, resetAt: now + windowMs };
    if (now > rateLimitStore[key].resetAt) { rateLimitStore[key] = { count: 0, resetAt: now + windowMs }; }

    rateLimitStore[key].count++;
    const remaining = maxRequests - rateLimitStore[key].count;

    res.set('X-RateLimit-Limit', maxRequests);
    res.set('X-RateLimit-Remaining', Math.max(0, remaining));
    res.set('X-RateLimit-Reset', rateLimitStore[key].resetAt);

    if (remaining < 0) {
      auditLog(req, 'rate_limit_exceeded', 'api', null, { path: req.path });
      return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans un instant.' });
    }
    next();
  };
}

// Strict rate limit for auth endpoints
const authRateLimit = rateLimit(15 * 60 * 1000, 10); // 10 attempts per 15 min

// ═══════════════════════════════════════
// ISO 27001 A.9.4 - BRUTE FORCE PROTECTION
// ═══════════════════════════════════════
async function recordLoginAttempt(email, ip, success) {
  try {
    await query('INSERT INTO login_attempts (email, ip_address, success) VALUES ($1, $2, $3)', [email, ip, success]);
    if (!success) {
      await query('UPDATE users SET failed_login_count = COALESCE(failed_login_count, 0) + 1 WHERE email = $1', [email]);
      // Lock account after 5 failed attempts (30 min lock)
      await query(`UPDATE users SET locked_until = NOW() + INTERVAL '30 minutes' WHERE email = $1 AND COALESCE(failed_login_count, 0) >= 5`, [email]);
    } else {
      await query('UPDATE users SET failed_login_count = 0, locked_until = NULL WHERE email = $1', [email]);
    }
  } catch (err) {
    console.error('Login attempt recording error:', err.message);
  }
}

async function isAccountLocked(email) {
  try {
    const { rows } = await query('SELECT locked_until FROM users WHERE email = $1', [email]);
    if (rows.length > 0 && rows[0].locked_until && new Date(rows[0].locked_until) > new Date()) return true;
  } catch {}
  return false;
}

// ═══════════════════════════════════════
// ISO 27001 A.9.4 - PASSWORD POLICY
// ═══════════════════════════════════════
function validatePassword(password) {
  const errors = [];
  if (password.length < 10) errors.push('Minimum 10 caractères');
  if (!/[A-Z]/.test(password)) errors.push('Au moins une majuscule');
  if (!/[a-z]/.test(password)) errors.push('Au moins une minuscule');
  if (!/[0-9]/.test(password)) errors.push('Au moins un chiffre');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Au moins un caractère spécial');
  return { valid: errors.length === 0, errors };
}

// ═══════════════════════════════════════
// ISO 27001 A.10.1 - DATA ENCRYPTION
// ═══════════════════════════════════════
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || crypto.randomBytes(32).toString('hex');
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
  if (!text) return null;
  const iv = crypto.randomBytes(16);
  const key = Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

function decrypt(encryptedText) {
  if (!encryptedText || !encryptedText.includes(':')) return encryptedText;
  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
    const key = Buffer.from(ENCRYPTION_KEY.substring(0, 64), 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch {
    return encryptedText; // Return as-is if decryption fails (not yet encrypted)
  }
}

// ═══════════════════════════════════════
// ISO 27001 A.13.1 - SECURITY HEADERS
// ═══════════════════════════════════════
function securityHeaders(req, res, next) {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.removeHeader('X-Powered-By');
  next();
}

// ═══════════════════════════════════════
// ISO 27001 A.12.4 - CLEANUP OLD DATA
// ═══════════════════════════════════════
async function cleanupOldData() {
  try {
    // Clean login attempts older than 90 days
    await query("DELETE FROM login_attempts WHERE created_at < NOW() - INTERVAL '90 days'");
    // Clean expired sessions
    await query("DELETE FROM sessions WHERE expires_at < NOW()");
    // Clean old audit logs (keep 1 year)
    await query("DELETE FROM audit_logs WHERE created_at < NOW() - INTERVAL '365 days'");
    // Clean old messages (>10 messages in conv, older than 30 days)
    await query(`
      DELETE FROM messages WHERE id IN (
        SELECT m.id FROM messages m
        JOIN (SELECT conversation_id, COUNT(*) as cnt FROM messages GROUP BY conversation_id HAVING COUNT(*) > 10) c
        ON m.conversation_id = c.conversation_id
        WHERE m.created_at < NOW() - INTERVAL '30 days'
        AND m.id NOT IN (
          SELECT id FROM (
            SELECT id, ROW_NUMBER() OVER (PARTITION BY conversation_id ORDER BY created_at DESC) as rn
            FROM messages
          ) sub WHERE rn <= 10
        )
      )
    `);
    console.log('🧹 Data cleanup complete');
  } catch (err) {
    console.error('Cleanup error:', err.message);
  }
}

module.exports = {
  auditLog,
  rateLimit,
  authRateLimit,
  recordLoginAttempt,
  isAccountLocked,
  validatePassword,
  encrypt,
  decrypt,
  securityHeaders,
  cleanupOldData,
};
