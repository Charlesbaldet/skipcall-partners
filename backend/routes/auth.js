const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// ─── Login ───
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Email et mot de passe requis' });
    }

    const { email, password } = req.body;

    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.partner_id, u.is_active,
              p.name as partner_name
       FROM users u
       LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.email = $1`,
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = rows[0];

    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const token = jwt.sign(
      { 
        id: user.id, 
        email: user.email, 
        role: user.role, 
        partnerId: user.partner_id,
        fullName: user.full_name,
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        role: user.role,
        partnerId: user.partner_id,
        partnerName: user.partner_name,
      },
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
      `SELECT u.id, u.email, u.full_name, u.role, u.partner_id,
              p.name as partner_name, p.commission_rate
       FROM users u
       LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.id = $1`,
      [req.user.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Utilisateur introuvable' });
    }

    res.json({ user: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Change password ───
router.put('/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 8 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
    }

    const { currentPassword, newPassword } = req.body;

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) {
      return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    }

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, req.user.id]);

    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PUBLIC: Validate invitation token ───
router.get('/invitation/:token', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, email, full_name, role, expires_at, accepted_at
       FROM user_invitations WHERE token = $1`,
      [req.params.token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invitation introuvable' });
    }

    const invitation = rows[0];

    if (invitation.accepted_at) {
      return res.status(400).json({ error: 'Cette invitation a déjà été utilisée' });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Cette invitation a expiré' });
    }

    res.json({
      invitation: {
        email: invitation.email,
        fullName: invitation.full_name,
        role: invitation.role,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── PUBLIC: Setup password from invitation ───
router.post('/setup-password', [
  body('token').notEmpty(),
  body('password').isLength({ min: 8 }),
], async (req, res) => {
  const client = await getClient();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }

    const { token, password } = req.body;

    // Get invitation
    const { rows } = await query(
      `SELECT * FROM user_invitations WHERE token = $1`,
      [token]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Invitation introuvable' });
    }

    const invitation = rows[0];

    if (invitation.accepted_at) {
      return res.status(400).json({ error: 'Cette invitation a déjà été utilisée' });
    }

    if (new Date(invitation.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Cette invitation a expiré' });
    }

    await client.query('BEGIN');

    // Create user
    const hash = await bcrypt.hash(password, 12);
    await client.query(
      `INSERT INTO users (email, password_hash, full_name, role)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $4, is_active = true`,
      [invitation.email, hash, invitation.full_name, invitation.role]
    );

    // Mark invitation as accepted
    await client.query(
      `UPDATE user_invitations SET accepted_at = NOW() WHERE id = $1`,
      [invitation.id]
    );

    await client.query('COMMIT');

    res.json({ message: 'Compte créé avec succès. Vous pouvez maintenant vous connecter.' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Setup password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

module.exports = router;
