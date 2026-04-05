const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { queueNotification } = require('../services/emailService');

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin'));

// ─── List all internal users (admin + commercial) ───
router.get('/users', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
              u.partner_id, p.name as partner_name
       FROM users u
       LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.role IN ('admin', 'commercial')
       ORDER BY u.role, u.full_name`
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Invite a new user ───
router.post('/invite', [
  body('email').isEmail().normalizeEmail(),
  body('full_name').trim().notEmpty(),
  body('role').isIn(['admin', 'commercial']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Données invalides' });
    }

    const { email, full_name, role } = req.body;

    // Check if user already exists
    const { rows: existing } = await query(
      'SELECT id FROM users WHERE email = $1', [email]
    );
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà' });
    }

    // Generate unique token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await query(
      `INSERT INTO user_invitations (email, full_name, role, token, invited_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (email) DO UPDATE SET token = $4, expires_at = $6, role = $3, full_name = $2`,
      [email, full_name, role, token, req.user.id, expiresAt]
    );

    // Send invitation email
    const frontendUrl = process.env.FRONTEND_URL || 'https://skipcall-partners.vercel.app';
    const setupUrl = `${frontendUrl}/setup-password/${token}`;

    try { await queueNotification(email, full_name, 'user_invitation', {
      invitedBy: req.user.fullName || 'Admin Skipcall',
      role: role === 'admin' ? 'Administrateur' : 'Commercial',
      setupUrl: setupUrl,
    });

    } catch(notifErr) { console.log('Email notification skipped:', notifErr.message); }
    res.status(201).json({ message: 'Invitation envoyée', setupUrl });
  } catch (err) {
    console.error('Invite user error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── List pending invitations ───
router.get('/invitations', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ui.*, u.full_name as invited_by_name
       FROM user_invitations ui
       JOIN users u ON ui.invited_by = u.id
       ORDER BY ui.created_at DESC`
    );
    res.json({ invitations: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Update user role or status ───
router.put('/users/:id', async (req, res) => {
  try {
    const { role, is_active } = req.body;

    // Prevent self-deactivation
    if (req.params.id === req.user.id && is_active === false) {
      return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
    }

    const { rows: [user] } = await query(
      `UPDATE users SET 
        role = COALESCE($2, role),
        is_active = COALESCE($3, is_active)
       WHERE id = $1 AND role IN ('admin', 'commercial')
       RETURNING id, email, full_name, role, is_active`,
      [req.params.id, role, is_active]
    );

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Delete invitation ───
router.delete('/invitations/:id', async (req, res) => {
  try {
    await query('DELETE FROM user_invitations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invitation supprimée' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
