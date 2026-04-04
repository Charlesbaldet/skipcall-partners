const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
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

module.exports = router;
