const jwt = require('jsonwebtoken');
const { query, pool } = require('../db');

// Optional defence-in-depth: when RLS_ENABLED=true is set on the
// environment, every authenticated request reserves a dedicated
// pg.Pool client and runs `SET LOCAL` for the two GUCs the v44
// tenant_isolation / superadmin_bypass policies read. The client is
// stashed on req.dbClient so route handlers that already manage
// transactions can reuse it. We release it on res.finish so even
// streaming responses can't leak a pinned connection.
//
// When RLS_ENABLED is unset (the default) we leave the pool/query
// path untouched — the policies tolerate `current_setting(..., true)`
// being unset because the second arg is `true` (return NULL instead of
// raising). This means a half-rolled-out v44 schema doesn't break
// reads on its own; flipping the env flag is what activates the gate.
const RLS_ENABLED = process.env.RLS_ENABLED === 'true';

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }

  if (!RLS_ENABLED) return next();

  // Acquire a dedicated client so SET LOCAL stays bound to a single
  // session for the duration of the request. SET LOCAL inside an
  // implicit transaction isn't possible, so we wrap the per-request
  // GUCs in a plain BEGIN. They auto-clear when we COMMIT on response
  // finish.
  let client;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const tenantId = (req.user && req.user.tenantId) || '';
    const role = (req.user && req.user.role) || '';
    // set_config(.., true) is transaction-local — no quoting concerns.
    await client.query(`SELECT set_config('app.current_tenant_id', $1, true)`, [String(tenantId)]);
    await client.query(`SELECT set_config('app.current_role', $1, true)`, [String(role)]);
    req.dbClient = client;

    let released = false;
    const release = async (err) => {
      if (released) return;
      released = true;
      try {
        if (err) await client.query('ROLLBACK');
        else await client.query('COMMIT');
      } catch (e) { /* best-effort */ }
      try { client.release(); } catch {}
    };
    res.on('finish', () => { release(); });
    res.on('close', () => { release(); });
    next();
  } catch (err) {
    if (client) {
      try { await client.query('ROLLBACK'); } catch {}
      try { client.release(); } catch {}
    }
    console.error('[authenticate.rls] failed:', err.message);
    return res.status(500).json({ error: 'Erreur serveur (RLS init)' });
  }
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
  };
}

function partnerScope(req, res, next) {
  if (req.user.role === 'partner') {
    req.partnerScope = req.user.partnerId || '00000000-0000-0000-0000-000000000000';
  }
  next();
}

// Tenant isolation — JWT is the source of truth (signed, trusted).
// Domain-derived tenantId is ignored for data queries.
function tenantScope(req, res, next) {
  if (req.user && req.user.role === 'superadmin') {
    req.skipTenantFilter = true;
    return next();
  }
  if (req.user && req.user.tenantId) {
    req.tenantId = req.user.tenantId;
  }
  next();
}

module.exports = { authenticate, authorize, partnerScope, tenantScope };
