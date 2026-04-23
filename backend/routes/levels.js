const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);

const DEFAULTS = [
  ['Bronze',   0,  10, '#cd7f32', '', 0],
  ['Silver',   5,  12, '#94a3b8', '', 1],
  ['Gold',     15, 15, '#f59e0b', '', 2],
  ['Platinum', 30, 20, '#6366f1', '', 3],
];

async function seedDefaults(tenantId) {
  for (const [name, min, rate, color, icon, position] of DEFAULTS) {
    await query(
      'INSERT INTO tenant_levels (tenant_id, name, min_threshold, commission_rate, color, icon, position) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [tenantId, name, min, rate, color, icon, position]
    );
  }
}

// IMPORTANT : declare specific routes BEFORE /:id otherwise /threshold-type / /reset
// would be matched as :id

router.post('/threshold-type', authorize('admin'), async (req, res) => {
  try {
    const { type } = req.body;
    if (!['deals', 'volume'].includes(type)) return res.status(400).json({ error: 'Type invalide (deals ou volume)' });
    if (!req.tenantId) return res.status(400).json({ error: 'Pas de tenant' });
    await query('UPDATE tenants SET level_threshold_type = $1 WHERE id = $2', [type, req.tenantId]);
    res.json({ threshold_type: type });
  } catch (err) {
    console.error('Set threshold type error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/reset', authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Pas de tenant' });
    await query('DELETE FROM tenant_levels WHERE tenant_id = $1', [req.tenantId]);
    await seedDefaults(req.tenantId);
    const { rows } = await query('SELECT * FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC', [req.tenantId]);
    res.json({ levels: rows });
  } catch (err) {
    console.error('Reset levels error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/', async (req, res) => {
  try {
    if (!req.tenantId) return res.json({ levels: [], threshold_type: 'deals' });
    let { rows } = await query('SELECT * FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC, min_threshold ASC', [req.tenantId]);
    if (rows.length === 0) {
      await seedDefaults(req.tenantId);
      ({ rows } = await query('SELECT * FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC', [req.tenantId]));
    }
    const { rows: tRows } = await query('SELECT level_threshold_type FROM tenants WHERE id = $1', [req.tenantId]);
    const thresholdType = (tRows[0] && tRows[0].level_threshold_type) || 'deals';
    res.json({ levels: rows, threshold_type: thresholdType });
  } catch (err) {
    console.error('List levels error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, min_threshold, commission_rate, color, icon, position } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    if (!req.tenantId) return res.status(400).json({ error: 'Pas de tenant' });
    const { rows: [level] } = await query(
      'INSERT INTO tenant_levels (tenant_id, name, min_threshold, commission_rate, color, icon, position) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [req.tenantId, name, min_threshold || 0, commission_rate || 10, color || '#94a3b8', icon || '⭐', position || 0]
    );
    res.status(201).json({ level });
  } catch (err) {
    console.error('Create level error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, min_threshold, commission_rate, color, icon, position } = req.body;
    const { rows: [level] } = await query(
      `UPDATE tenant_levels SET
        name = COALESCE($1, name),
        min_threshold = COALESCE($2, min_threshold),
        commission_rate = COALESCE($3, commission_rate),
        color = COALESCE($4, color),
        icon = COALESCE($5, icon),
        position = COALESCE($6, position)
      WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [name, min_threshold, commission_rate, color, icon, position, req.params.id, req.tenantId]
    );
    if (!level) return res.status(404).json({ error: 'Niveau introuvable' });
    res.json({ level });
  } catch (err) {
    console.error('Update level error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', authorize('admin'), async (req, res) => {
  try {
    const { rowCount } = await query(
      'DELETE FROM tenant_levels WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (rowCount === 0) return res.status(404).json({ error: 'Niveau introuvable' });
    res.json({ message: 'Niveau supprimé' });
  } catch (err) {
    console.error('Delete level error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
