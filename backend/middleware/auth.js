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
    req.partnerScope = req.user.partnerId;
  }
  next();
}

module.exports = { authenticate, authorize, partnerScope };
