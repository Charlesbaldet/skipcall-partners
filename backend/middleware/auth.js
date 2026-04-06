const jwt = require('jsonwebtoken');
const { query } = require('../db');

function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token manquant' });
  }
  try {
    const token = header.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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
