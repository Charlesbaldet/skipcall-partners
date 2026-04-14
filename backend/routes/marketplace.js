const router = require('express').Router();
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');

// Public: liste tenants marketplace
router.get('/', async (req, res) => {
  try {
    const { sector, q } = req.query;
    let sql = `SELECT id, name, slug, logo_url, primary_color, sector, website, icp, short_description, created_at FROM tenants WHERE marketplace_visible = true AND short_description IS NOT NULL AND short_description <> ''`;
    const params = [];
    if (sector) { params.push(sector); sql += ` AND sector = $${params.length}`; }
    if (q) { params.push(`%${q.toLowerCase()}%`); sql += ` AND (LOWER(name) LIKE $${params.length} OR LOWER(short_description) LIKE $${params.length} OR LOWER(icp) LIKE $${params.length})`; }
    sql += ' ORDER BY created_at DESC';
    const { rows } = await query(sql, params);
    res.json({ partners: rows });
  } catch (err) { console.error('[marketplace]', err.message); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Public: secteurs
router.get('/sectors', async (req, res) => {
  try {
    const { rows } = await query("SELECT DISTINCT sector FROM tenants WHERE marketplace_visible = true AND sector IS NOT NULL AND sector <> '' ORDER BY sector ASC");
    res.json({ sectors: rows.map(r => r.sector) });
  } catch (err) {
    console.error('[marketplace GET settings]', err.message, 'tenantId:', req.user?.tenantId);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// Auth: get mes settings
router.get('/settings', authenticate, async (req, res) => {
  if (!['admin','superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Accès interdit' });
  try {
    const { rows } = await query('SELECT sector, website, icp, short_description, marketplace_visible FROM tenants WHERE id = $1', [req.user.tenantId]);
    if (!rows.length) return res.status(404).json({ error: 'Tenant non trouvé' });
    res.json({ settings: rows[0] });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Auth: update settings
router.patch('/settings', authenticate, async (req, res) => {
  if (!['admin','superadmin'].includes(req.user.role)) return res.status(403).json({ error: 'Acces interdit' });
  const { sector, website, icp, short_description, marketplace_visible } = req.body;
  if (website && !/^https?:\/\/.+/.test(website))
    return res.status(400).json({ error: 'URL invalide (doit commencer par http:// ou https://)' });
  // Auto-disable visibility if required fields are missing
  const visible = marketplace_visible === true && sector && website && short_description ? true : false;
  try {
    const { rows } = await query(
      'UPDATE tenants SET sector=$1, website=$2, icp=$3, short_description=$4, marketplace_visible=$5 WHERE id=$6 RETURNING sector, website, icp, short_description, marketplace_visible',
      [sector || null, website || null, icp || null, short_description || null, visible, req.user.tenantId]
    );
    res.json({ settings: rows[0] || {} });
  } catch (err) {
    console.error('[marketplace PATCH]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;