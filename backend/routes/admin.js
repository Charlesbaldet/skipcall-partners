const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const { generateApiKey, hashKey } = require('../middleware/apiKeyAuth');

const router = express.Router();
router.use(authenticate);
router.use(authorize('admin', 'superadmin'));

router.get('/users', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
              u.partner_id, p.name as partner_name
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.role IN ('admin', 'commercial') ORDER BY u.role, u.full_name`
    );
    res.json({ users: rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/invite', [
  body('email').isEmail().normalizeEmail(),
  body('full_name').trim().notEmpty(),
  body('role').isIn(['admin', 'commercial']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Données invalides' });
    const { email, full_name, role } = req.body;
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Un utilisateur avec cet email existe déjà' });
    const tempPassword = crypto.randomBytes(4).toString('hex') + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);
    await query('INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES ($1, $2, $3, $4, $5)', [email, hash, full_name, role, req.user.tenantId]);
    res.status(201).json({ message: 'Utilisateur créé', tempPassword, email });
  } catch (err) { console.error('Invite error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/invitations', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ui.*, u.full_name as invited_by_name FROM user_invitations ui
       JOIN users u ON ui.invited_by = u.id ORDER BY ui.created_at DESC`
    );
    res.json({ invitations: rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/users/:id', async (req, res) => {
  try {
    const { role, is_active } = req.body;
    if (req.params.id === req.user.id && is_active === false)
      return res.status(400).json({ error: 'Vous ne pouvez pas désactiver votre propre compte' });
    const { rows: [user] } = await query(
      `UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active)
       WHERE id = $1 AND role IN ('admin', 'commercial') RETURNING id, email, full_name, role, is_active`,
      [req.params.id, role, is_active]
    );
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/invitations/:id', async (req, res) => {
  try {
    await query('DELETE FROM user_invitations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invitation supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── API Keys Management ───
router.get('/api-keys', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT ak.id, ak.name, ak.key_prefix, ak.partner_id, ak.is_active, ak.created_at, ak.last_used_at,
              p.name as partner_name
       FROM api_keys ak LEFT JOIN partners p ON ak.partner_id = p.id
       ORDER BY ak.created_at DESC`
    );
    res.json({ apiKeys: rows });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/api-keys', async (req, res) => {
  try {
    const { name, partner_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });

    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 10) + '...';

    await query(
      'INSERT INTO api_keys (name, key_hash, key_prefix, partner_id, created_by) VALUES ($1, $2, $3, $4, $5)',
      [name, keyHash, keyPrefix, partner_id || null, req.user.id]
    );

    res.status(201).json({ apiKey: rawKey, name, keyPrefix });
  } catch (err) { console.error('Create API key error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/api-keys/:id', async (req, res) => {
  try {
    await query('UPDATE api_keys SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'Clé révoquée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.user.id) return res.status(400).json({ error: "Impossible de supprimer votre propre compte" });
    await query("DELETE FROM users WHERE id = $1 AND role IN ('admin', 'commercial')", [req.params.id]);
    res.json({ message: "Utilisateur supprimé" });
  } catch (err) { res.status(500).json({ error: "Erreur serveur" }); }
});module.exports = router;
