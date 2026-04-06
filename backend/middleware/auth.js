const jwt = require('jsonwebtoken');
const { query } = require('../db');

// Verify JWT token
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

// Restrict to specific roles
function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Accès interdit' });
    }
    next();
  };
}

// Restrict partners to their own data
function partnerScope(req, res, next) {
  if (req.user.role === 'partner') {
        req.partnerScope = req.user.partnerId || '00000000-0000-0000-0000-000000000000';
  }
  next();
}

// Restrict to tenant data
function tenantScope(req, res, next) {
  if (req.user && req.user.role !== 'superadmin') {
    req.tenantId = req.user.tenantId || null;
  }
  next();
}

module.exports = { authenticate, authorize, partnerScope, tenantScope };
