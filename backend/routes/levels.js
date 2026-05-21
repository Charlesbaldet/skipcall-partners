const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { invalidateCache: invalidateTierCache } = require('../utils/tierResolver');

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
    invalidateTierCache(req.tenantId);
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
    invalidateTierCache(req.tenantId);
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

// Normalise the optional longevity inputs (E2 refonte). Returns
// `{ mode, months }` with mode ∈ {'limited','lifetime'} and months
// constrained to a sane positive integer when mode='limited'.
// `undefined` inputs fall back to safe defaults so a request that
// omits the fields entirely keeps working against pre-v55 callers.
function normaliseLongevity(modeRaw, monthsRaw) {
  let mode = typeof modeRaw === 'string' ? modeRaw.toLowerCase() : undefined;
  if (mode !== 'limited' && mode !== 'lifetime') mode = undefined;
  let months = monthsRaw == null ? null : parseInt(monthsRaw, 10);
  if (mode === 'lifetime') months = null;
  if (mode === 'limited' && (!Number.isFinite(months) || months < 1)) months = 12;
  return { mode, months };
}

// G2 — normalisation setup_rate (0..100 ou NULL). NUMERIC(5,2) côté
// DB, le CHECK constraint v62 n'existe pas (colonne juste NULL-able)
// donc on valide ici.
function normaliseSetupRate(raw) {
  if (raw === undefined) return undefined; // ne pas toucher la colonne
  if (raw === null || raw === '') return null;
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) return undefined; // input invalide → ignoré côté PUT
  return Math.round(n * 100) / 100;
}

router.post('/', authorize('admin'), async (req, res) => {
  try {
    const { name, min_threshold, commission_rate, color, icon, position, longevity_mode, longevity_months, setup_rate } = req.body;
    if (!name) return res.status(400).json({ error: 'Nom requis' });
    if (!req.tenantId) return res.status(400).json({ error: 'Pas de tenant' });
    const long = normaliseLongevity(longevity_mode, longevity_months);
    const setupNorm = normaliseSetupRate(setup_rate);
    // 400 propre quand l'admin envoie une valeur clairement hors plage
    // (sinon normaliseSetupRate retourne undefined et la colonne reste NULL).
    if (setup_rate !== undefined && setup_rate !== null && setup_rate !== '' && setupNorm === undefined) {
      return res.status(400).json({ error: 'invalid_setup_rate', message: 'setup_rate doit être entre 0 et 100' });
    }
    const { rows: [level] } = await query(
      `INSERT INTO tenant_levels
         (tenant_id, name, min_threshold, commission_rate, color, icon, position,
          longevity_mode, longevity_months, setup_rate)
       VALUES ($1, $2, $3, $4, $5, $6, $7,
               COALESCE($8, 'limited'), COALESCE($9, 12), $10)
       RETURNING *`,
      [req.tenantId, name, min_threshold || 0, commission_rate || 10, color || '#94a3b8', icon || '⭐', position || 0,
       long.mode, long.months, setupNorm === undefined ? null : setupNorm]
    );
    invalidateTierCache(req.tenantId);
    res.status(201).json({ level });
  } catch (err) {
    console.error('Create level error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, min_threshold, commission_rate, color, icon, position, longevity_mode, longevity_months, setup_rate } = req.body;
    const long = normaliseLongevity(longevity_mode, longevity_months);
    // longevity_months is intentionally allowed to land as NULL when
    // mode flips to 'lifetime' — that's the canonical "no end date"
    // marker. So we don't COALESCE the months column unless the
    // caller didn't touch the mode at all.
    const monthsParam = longevity_mode === undefined ? null : long.months;
    // G2 — setup_rate (hybrid). 3 cas distincts pour préserver la
    // sémantique : (a) absent du body → ne touche pas la colonne ;
    // (b) explicite null/"" → set NULL (tier sans setup) ;
    // (c) numérique 0..100 → set valeur.
    const setupNorm = normaliseSetupRate(setup_rate);
    if (setup_rate !== undefined && setup_rate !== null && setup_rate !== '' && setupNorm === undefined) {
      return res.status(400).json({ error: 'invalid_setup_rate', message: 'setup_rate doit être entre 0 et 100' });
    }
    const setupTouched = setup_rate !== undefined;
    const setupParam = setupNorm === undefined ? null : setupNorm;
    const { rows: [level] } = await query(
      `UPDATE tenant_levels SET
        name = COALESCE($1, name),
        min_threshold = COALESCE($2, min_threshold),
        commission_rate = COALESCE($3, commission_rate),
        color = COALESCE($4, color),
        icon = COALESCE($5, icon),
        position = COALESCE($6, position),
        longevity_mode = COALESCE($9, longevity_mode),
        longevity_months = CASE
                             WHEN $9 = 'lifetime' THEN NULL
                             WHEN $9 = 'limited'  THEN COALESCE($10, longevity_months, 12)
                             ELSE longevity_months
                           END,
        setup_rate = CASE WHEN $11::boolean THEN $12::numeric ELSE setup_rate END
      WHERE id = $7 AND tenant_id = $8 RETURNING *`,
      [name, min_threshold, commission_rate, color, icon, position, req.params.id, req.tenantId,
       long.mode, monthsParam, setupTouched, setupParam]
    );
    if (!level) return res.status(404).json({ error: 'Niveau introuvable' });
    invalidateTierCache(req.tenantId);
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
    invalidateTierCache(req.tenantId);
    res.json({ message: 'Niveau supprimé' });
  } catch (err) {
    console.error('Delete level error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
