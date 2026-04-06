const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { generateApiKey, hashKey } = require('../middleware/apiKeyAuth');
const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'superadmin'));

router.get('/users', async (req, res) => {
  try {
    let where = [`u.role IN ('admin', 'commercial')`];
    let params = [];
    let i = 1;

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`u.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.is_active, u.created_at,
              u.partner_id, p.name as partner_name
       FROM users u
       LEFT JOIN partners p ON u.partner_id = p.id
       WHERE ${where.join(' AND ')}
       ORDER BY u.role, u.full_name`,
      params
    );
    res.json({ users: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/invite', [
  body('email').isEmail().normalizeEmail(),
  body('full_name').trim().notEmpty(),
  body('role').isIn(['admin', 'commercial']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'DonnÃ©es invalides' });

    const { email, full_name, role } = req.body;

    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Un utilisateur avec cet email existe dÃ©jÃ ' });

    const tempPassword = crypto.randomBytes(4).toString('hex') + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);

    // INSERT with tenant_id
    await query(
      'INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES ($1, $2, $3, $4, $5)',
      [email, hash, full_name, role, req.tenantId || null]
    );

    res.status(201).json({ message: 'Utilisateur crÃ©Ã©', tempPassword, email });
  } catch (err) { console.error('Invite error:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

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

router.put('/users/:id', async (req, res) => {
  try {
    const { role, is_active } = req.body;

    if (req.params.id === req.user.id && is_active === false)
      return res.status(400).json({ error: 'Vous ne pouvez pas dÃ©sactiver votre propre compte' });

    // Tenant check: ensure user belongs to same tenant
    let whereExtra = `AND role IN ('admin', 'commercial')`;
    let params = [req.params.id, role, is_active];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra += ` AND tenant_id = $4`;
      params.push(req.tenantId);
    }

    const { rows: [user] } = await query(
      `UPDATE users SET role = COALESCE($2, role), is_active = COALESCE($3, is_active)
       WHERE id = $1 ${whereExtra}
       RETURNING id, email, full_name, role, is_active`,
      params
    );

    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/invitations/:id', async (req, res) => {
  try {
    await query('DELETE FROM user_invitations WHERE id = $1', [req.params.id]);
    res.json({ message: 'Invitation supprimÃ©e' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ API Keys Management âââ
router.get('/api-keys', async (req, res) => {
  try {
    let where = [];
    let params = [];
    let i = 1;

    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`ak.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT ak.id, ak.name, ak.key_prefix, ak.partner_id, ak.is_active,
              ak.created_at, ak.last_used_at, p.name as partner_name
       FROM api_keys ak
       LEFT JOIN partners p ON ak.partner_id = p.id
       ${whereClause}
       ORDER BY ak.created_at DESC`,
      params
    );
    res.json({ apiKeys: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/api-keys', async (req, res) => {
  try {
    const { name, partner_id } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });

    const rawKey = generateApiKey();
    const keyHash = hashKey(rawKey);
    const keyPrefix = rawKey.substring(0, 10) + '...';

    await query(
      'INSERT INTO api_keys (name, key_hash, key_prefix, partner_id, created_by, tenant_id) VALUES ($1, $2, $3, $4, $5, $6)',
      [name, keyHash, keyPrefix, partner_id || null, req.user.id, req.tenantId || null]
    );
    res.status(201).json({ apiKey: rawKey, name, keyPrefix });
  } catch (err) {
    console.error('Create API key error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/api-keys/:id', async (req, res) => {
  try {
    await query('UPDATE api_keys SET is_active = false WHERE id = $1', [req.params.id]);
    res.json({ message: 'ClÃ© rÃ©voquÃ©e' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete("/users/:id", async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ error: "Impossible de supprimer votre propre compte" });

    // Tenant check
    let whereExtra = `AND role IN ('admin', 'commercial')`;
    let params = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra += ` AND tenant_id = $2`;
      params.push(req.tenantId);
    }

    await query(`DELETE FROM users WHERE id = $1 ${whereExtra}`, params);
    res.json({ message: "Utilisateur supprimÃ©" });
  } catch (err) {
    res.status(500).json({ error: "Erreur serveur" });
  }
});

module.exports = router;
