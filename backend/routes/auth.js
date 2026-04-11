const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog, recordLoginAttempt, isAccountLocked, validatePassword } = require('../middleware/security');

const router = express.Router();

// ─── Login (ISO 27001 A.9.4 - brute force protection) ───
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const { email, password } = req.body;
    const ip = req.ip || req.connection?.remoteAddress;

    // Check if account is locked
    const locked = await isAccountLocked(email);
    if (locked) {
      auditLog(req, 'login_blocked_locked', 'user', null, { email });
      return res.status(423).json({ error: 'Compte temporairement verrouillé suite à trop de tentatives. Réessayez dans 30 minutes.' });
    }

    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.partner_id, u.is_active, u.tenant_id, u.must_change_password,
              p.name as partner_name
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.email = $1`,
      [email]
    );

    if (rows.length === 0) {
      await recordLoginAttempt(email, ip, false);
      auditLog(req, 'login_failed', 'user', null, { email, reason: 'unknown_email' });
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = rows[0];

    if (!user.is_active) {
      auditLog(req, 'login_blocked_inactive', 'user', user.id, { email });
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await recordLoginAttempt(email, ip, false);
      auditLog(req, 'login_failed', 'user', user.id, { email, reason: 'wrong_password' });
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Success — reset failed attempts
    await recordLoginAttempt(email, ip, true);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, partnerId: user.partner_id, fullName: user.full_name, tenantId: user.tenant_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    auditLog(req, 'login_success', 'user', user.id, { email });

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, partnerId: user.partner_id, partnerName: user.partner_name, mustChangePassword: user.must_change_password || false },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get current user profile ───
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.partner_id, p.name as partner_name, p.commission_rate
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id WHERE u.id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user: rows[0] });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Change password (ISO 27001 A.9.4 - password policy) ───
router.put('/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Données manquantes' });

    const { currentPassword, newPassword } = req.body;

    // Validate password policy
    const policy = validatePassword(newPassword);
    if (!policy.valid) return res.status(400).json({ error: policy.errors.join('. ') });

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });

    // Check password history (don't reuse last 3)
    try {
      const { rows: history } = await query(
        'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
        [req.user.id]
      );
      for (const h of history) {
        if (await bcrypt.compare(newPassword, h.password_hash)) {
          return res.status(400).json({ error: 'Ce mot de passe a déjà été utilisé récemment' });
        }
      }
    } catch {} // password_history table may not exist yet

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [hash, req.user.id]);

    // Save to password history
    try { await query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [req.user.id, hash]); } catch {}

    auditLog(req, 'password_changed', 'user', req.user.id);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Validate invitation token ───
router.get('/invitation/:token', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, full_name, role, expires_at, accepted_at FROM user_invitations WHERE token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invitation introuvable' });
    if (rows[0].accepted_at) return res.status(400).json({ error: 'Invitation déjà utilisée' });
    if (new Date(rows[0].expires_at) < new Date()) return res.status(400).json({ error: 'Invitation expirée' });
    res.json({ invitation: { email: rows[0].email, fullName: rows[0].full_name, role: rows[0].role } });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Setup password from invitation (with password policy) ───
router.post('/setup-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });

    const policy = validatePassword(password);
    if (!policy.valid) return res.status(400).json({ error: policy.errors.join('. ') });

    const { rows } = await query('SELECT * FROM user_invitations WHERE token = $1', [token]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invitation introuvable' });
    const inv = rows[0];
    if (inv.accepted_at) return res.status(400).json({ error: 'Invitation déjà utilisée' });
    if (new Date(inv.expires_at) < new Date()) return res.status(400).json({ error: 'Invitation expirée' });

    const hash = await bcrypt.hash(password, 12);
    await query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $4, is_active = true',
      [inv.email, hash, inv.full_name, inv.role]
    );
    await query('UPDATE user_invitations SET accepted_at = NOW() WHERE id = $1', [inv.id]);

    auditLog(req, 'account_setup', 'user', null, { email: inv.email });
    res.json({ message: 'Compte créé avec succès' });
  } catch (err) {
    console.error('Setup password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// ─── SIGNUP - Create new tenant + admin user ───
router.post('/signup', [
  body('company').trim().notEmpty(),
  body('fullName').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 10 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const { company, fullName, email, password, phone } = req.body;
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Mot de passe: majuscule, minuscule, chiffre et caractere special requis.' });
    }
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Un compte avec cet email existe deja.' });
    const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    const { rows: [tenant] } = await query(
      "INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color) VALUES ($1, $2, '#6366f1', '#0f172a', '#f97316') RETURNING id",
      [company, slug]
    );
    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await query(
      "INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES ($1, $2, $3, 'admin', $4) RETURNING id, email, full_name, role, tenant_id",
      [email, hash, fullName, tenant.id]
    );
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenantId: tenant.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    try { await query("INSERT INTO audit_logs (user_id, tenant_id, action, resource_type, resource_id, details) VALUES ($1, $2, 'signup', 'tenant', $3, $4)", [user.id, tenant.id, tenant.id, JSON.stringify({ company, email })]); } catch(e) {}
    res.status(201).json({ token, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, tenantId: tenant.id } });
  } catch (err) { console.error('Signup error:', err); res.status(500).json({ error: 'Erreur lors de la creation du compte.' }); }
});

// Change password (1ère connexion)
router.post('/change-password', async (req, res) => {
  try {
    const { userId, newPassword } = req.body;
    if (!userId || !newPassword) return res.status(400).json({ error: 'Paramètres manquants' });
    if (newPassword.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (8 min)' });
    const bcrypt = require('bcryptjs');
    const { query } = require('../db');
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, userId]);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
