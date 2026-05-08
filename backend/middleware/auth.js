const jwt = require('jsonwebtoken');
const { query } = require('../db');

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    // Token-version check (SOC 2 CC6.1) — every JWT carries the
    // user's token_version at issue time. Bumping users.token_version
    // (e.g. via the "Sign out everywhere" panic button) invalidates
    // every outstanding token without server-side session storage.
    // Pending-space-selection tokens skip this check because they're
    // short-lived and don't carry tenant data anyway.
    if (!decoded.pendingSpaceSelection && decoded.id) {
      try {
        const { rows } = await query(
          'SELECT token_version FROM users WHERE id = $1',
          [decoded.id]
        );
        if (rows.length === 0) {
          return res.status(401).json({ error: 'Utilisateur introuvable' });
        }
        const dbVersion = rows[0].token_version || 0;
        const tokenVersion = decoded.token_version || 0;
        if (tokenVersion !== dbVersion) {
          return res.status(401).json({ error: 'Session invalidée' });
        }
      } catch (err) {
        // token_version column may not exist on a stale schema (the
        // v45 migration runs at boot but is best-effort). If the
        // column is missing we fall through — a fresh deploy will
        // pick this up on the next request.
        if (!/column .* does not exist/i.test(err.message)) {
          console.error('[authenticate.token_version]', err.message);
        }
      }
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
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
