const crypto = require('crypto');
const { query } = require('../db');

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function generateApiKey() {
  return 'sk_' + crypto.randomBytes(24).toString('hex');
}

async function apiKeyAuth(req, res, next) {
  const authHeader = req.headers['authorization'] || req.headers['x-api-key'];
  if (!authHeader) return res.status(401).json({ error: 'API key required' });

  const key = authHeader.replace('Bearer ', '').trim();
  const keyHash = hashKey(key);

  try {
    const { rows } = await query(
      `SELECT ak.*, p.id as partner_id, p.name as partner_name
       FROM api_keys ak
       LEFT JOIN partners p ON ak.partner_id = p.id
       WHERE ak.key_hash = $1 AND ak.is_active = true`,
      [keyHash]
    );

    if (rows.length === 0) return res.status(401).json({ error: 'Invalid API key' });

    // Update last used
    await query('UPDATE api_keys SET last_used_at = NOW() WHERE id = $1', [rows[0].id]);

    req.apiKey = rows[0];
    req.partnerId = rows[0].partner_id;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Authentication error' });
  }
}

module.exports = { apiKeyAuth, generateApiKey, hashKey };
