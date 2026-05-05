const crypto = require('crypto');
const { query } = require('../db');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

// Existing keys ship with the `sk_` prefix. New ones generated via
// /admin/api-keys keep that prefix for backward compatibility with
// any client that has hard-coded a check on the prefix. Auth itself
// is prefix-agnostic — it looks up the SHA-256 hash regardless.
function generateApiKey() {
  return 'sk_' + crypto.randomBytes(24).toString('hex');
}

// In-memory rate limit store. Multi-instance deploys would need Redis,
// but Railway runs a single backend instance per service so this is
// fine for now. Each (api_key_id, minute-window) pair gets its own
// counter that resets at the window boundary.
const rateLimitStore = new Map();

function checkRateLimit(apiKeyId, limitPerMinute) {
  const now = Date.now();
  const windowMs = 60_000;
  const key = `rl:${apiKeyId}`;

  let entry = rateLimitStore.get(key);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
  }
  entry.count++;
  rateLimitStore.set(key, entry);

  return {
    allowed: entry.count <= limitPerMinute,
    limit: limitPerMinute,
    remaining: Math.max(0, limitPerMinute - entry.count),
    resetIn: Math.ceil((entry.resetAt - now) / 1000),
  };
}

// Periodically prune expired entries so the map doesn't leak memory.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitStore.entries()) {
    if (now > v.resetAt) rateLimitStore.delete(k);
  }
}, 60_000).unref?.();

async function apiKeyAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  if (!authHeader) {
    return res.status(401).json({
      error: 'missing_api_key',
      message: 'Provide API key via Authorization: Bearer sk_… or X-API-Key header.',
    });
  }

  const key = authHeader.replace('Bearer ', '').trim();
  const keyHash = hashKey(key);

  try {
    const { rows } = await query(
      `SELECT ak.*, p.id AS scoped_partner_id, p.name AS partner_name
         FROM api_keys ak
         LEFT JOIN partners p ON ak.partner_id = p.id
        WHERE ak.key_hash = $1
          AND ak.is_active = true
          AND ak.revoked_at IS NULL`,
      [keyHash]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'invalid_api_key', message: 'Invalid or revoked API key.' });
    }
    const apiKey = rows[0];

    // Per-minute rate limit. Default 60/min for legacy keys whose
    // rate_limit_per_minute is NULL (column added in v30).
    const limit = apiKey.rate_limit_per_minute || 60;
    const rl = checkRateLimit(apiKey.id, limit);
    res.set('X-RateLimit-Limit', String(rl.limit));
    res.set('X-RateLimit-Remaining', String(rl.remaining));
    res.set('X-RateLimit-Reset', String(rl.resetIn));
    if (!rl.allowed) {
      return res.status(429).json({ error: 'rate_limit_exceeded', message: 'Too many requests. Try again in a moment.' });
    }

    // Fire-and-forget last_used update; never blocks the response.
    query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [apiKey.id]).catch(() => {});

    req.apiKey = apiKey;
    req.tenantId = apiKey.tenant_id || null;
    // Legacy: keys with a partner_id are scoped to that partner only
    // (previous /api/v1 behaviour). Tenant-wide keys leave this null.
    req.partnerId = apiKey.scoped_partner_id || apiKey.partner_id || null;
    req.permissions = apiKey.permissions || ['read'];
    next();
  } catch (err) {
    console.error('[apiKeyAuth] error:', err.message);
    res.status(500).json({ error: 'auth_error', message: 'Authentication error.' });
  }
}

// Permission gate factory. `admin` implies everything. Use as:
//   router.post('/x', requirePermission('write'), handler)
function requirePermission(permission) {
  return (req, res, next) => {
    const perms = req.permissions || [];
    if (perms.includes(permission) || perms.includes('admin')) return next();
    return res.status(403).json({
      error: 'insufficient_permissions',
      message: `This endpoint requires the '${permission}' permission.`,
    });
  };
}

module.exports = { apiKeyAuth, generateApiKey, hashKey, requirePermission };
