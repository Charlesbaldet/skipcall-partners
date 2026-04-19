// Per-tenant pipeline stages — custom columns for the referrals
// Kanban, powered by the `pipeline_stages` table. `is_system`,
// `is_won`, and `is_lost` are set server-side and locked:
//   * is_system stages (won + lost) cannot be deleted
//   * the won/lost flags on existing stages cannot be flipped by
//     clients — `is_won` is the single source of truth for commission
//     auto-creation, and we don't want a random rename to accidentally
//     turn the "Gagné" column off
const express = require('express');
const { query, getClient } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

function slugify(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50) || 'stage';
}

// Ensure a tenant has the 6 default stages. Safe to call repeatedly
// — the UNIQUE(tenant_id, slug) constraint + NOT EXISTS guard means
// this is idempotent. Used as a fallback if migration hasn't run yet
// for a given tenant and for brand-new tenants at signup time.
async function ensureDefaultStages(tenantId) {
  if (!tenantId) return;
  const { rows } = await query('SELECT 1 FROM pipeline_stages WHERE tenant_id = $1 LIMIT 1', [tenantId]);
  if (rows.length > 0) return;
  const defaults = [
    ['Nouveau',     'new',       '#6B7280', 0, false, false, false],
    ['Contacté',    'contacted', '#3B82F6', 1, false, false, false],
    ['Qualifié',    'qualified', '#8B5CF6', 2, false, false, false],
    ['Proposition', 'proposal',  '#F59E0B', 3, false, false, false],
    ['Gagné',       'won',       '#10B981', 4, true,  true,  false],
    ['Perdu',       'lost',      '#EF4444', 5, true,  false, true],
  ];
  for (const d of defaults) {
    await query(
      `INSERT INTO pipeline_stages (tenant_id, name, slug, color, position, is_system, is_won, is_lost)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (tenant_id, slug) DO NOTHING`,
      [tenantId, ...d]
    );
  }
}

// ─── GET /api/pipeline-stages ────────────────────────────────────────
router.get('/', authenticate, tenantScope, async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    await ensureDefaultStages(req.tenantId);
    const { rows } = await query(
      `SELECT id, name, slug, color, position, is_system, is_won, is_lost, created_at
         FROM pipeline_stages WHERE tenant_id = $1 ORDER BY position ASC, created_at ASC`,
      [req.tenantId]
    );
    res.json({ stages: rows });
  } catch (err) {
    console.error('[pipeline-stages.list] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/pipeline-stages ───────────────────────────────────────
// New stages always insert BEFORE system stages. We compute the next
// position as (min system position) and shift system stages down.
router.post('/', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const { name, color } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'name requis' });

    await ensureDefaultStages(req.tenantId);

    // Build a slug; if it collides, append a short suffix.
    const base = slugify(name);
    let slug = base;
    for (let i = 2; i < 20; i++) {
      const { rows } = await client.query('SELECT 1 FROM pipeline_stages WHERE tenant_id = $1 AND slug = $2', [req.tenantId, slug]);
      if (!rows.length) break;
      slug = base + '-' + i;
    }

    await client.query('BEGIN');
    // Insertion position: just before the first system stage (won),
    // so system stages always keep the bottom two slots.
    const { rows: sys } = await client.query(
      'SELECT MIN(position) AS p FROM pipeline_stages WHERE tenant_id = $1 AND is_system = TRUE',
      [req.tenantId]
    );
    const insertPos = sys[0]?.p != null ? sys[0].p : 0;
    // Shift system stages (and anything after insertPos) down by 1.
    await client.query(
      'UPDATE pipeline_stages SET position = position + 1 WHERE tenant_id = $1 AND position >= $2',
      [req.tenantId, insertPos]
    );
    const { rows: [created] } = await client.query(
      `INSERT INTO pipeline_stages (tenant_id, name, slug, color, position, is_system, is_won, is_lost)
       VALUES ($1, $2, $3, $4, $5, FALSE, FALSE, FALSE)
       RETURNING *`,
      [req.tenantId, String(name).trim(), slug, color || '#6B7280', insertPos]
    );
    await client.query('COMMIT');
    res.status(201).json({ stage: created });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[pipeline-stages.create] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/pipeline-stages/:id ────────────────────────────────────
// Renames + color + position updates. Intentionally ignores is_system,
// is_won, is_lost on the body — those can only be set by the seed.
router.put('/:id', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const { name, color, position } = req.body || {};
    const updates = [];
    const params = [];
    let i = 1;
    if (name !== undefined) { updates.push(`name = $${i++}`); params.push(String(name).trim()); }
    if (color !== undefined) { updates.push(`color = $${i++}`); params.push(color); }
    if (position !== undefined) { updates.push(`position = $${i++}`); params.push(position); }
    if (!updates.length) return res.json({ ok: true, noop: true });
    params.push(req.params.id, req.tenantId);
    const { rows } = await query(
      `UPDATE pipeline_stages SET ${updates.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++} RETURNING *`,
      params
    );
    if (!rows[0]) return res.status(404).json({ error: 'Stage introuvable' });
    res.json({ stage: rows[0] });
  } catch (err) {
    console.error('[pipeline-stages.update] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── DELETE /api/pipeline-stages/:id ─────────────────────────────────
// System stages are locked. Any referrals sitting in the deleted stage
// get moved to the previous stage (lower position) or the first stage
// if none exists below.
router.delete('/:id', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    await client.query('BEGIN');
    const { rows: [stage] } = await client.query(
      'SELECT * FROM pipeline_stages WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
      [req.params.id, req.tenantId]
    );
    if (!stage) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Stage introuvable' });
    }
    if (stage.is_system) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'system_stage_locked' });
    }

    // Find fallback: previous stage (highest position < current), or
    // first stage of tenant if none.
    const { rows: [fallback] } = await client.query(
      `SELECT id FROM pipeline_stages
        WHERE tenant_id = $1 AND id <> $2
        ORDER BY CASE WHEN position < $3 THEN 0 ELSE 1 END, ABS(position - $3), position ASC
        LIMIT 1`,
      [req.tenantId, stage.id, stage.position]
    );
    if (!fallback) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: 'cannot_delete_only_stage' });
    }
    // Move referrals out, then delete.
    await client.query('UPDATE referrals SET stage_id = $1 WHERE stage_id = $2', [fallback.id, stage.id]);
    await client.query('DELETE FROM pipeline_stages WHERE id = $1', [stage.id]);
    // Compact positions above the deleted one.
    await client.query(
      'UPDATE pipeline_stages SET position = position - 1 WHERE tenant_id = $1 AND position > $2',
      [req.tenantId, stage.position]
    );
    await client.query('COMMIT');
    res.json({ ok: true, movedTo: fallback.id });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[pipeline-stages.delete] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── PUT /api/pipeline-stages/reorder ────────────────────────────────
// Accepts `{ stages: [{id, position}, ...] }`. System stages snap to
// the last two positions regardless of what the client requested —
// "Gagné" and "Perdu" must always close the pipeline.
router.put('/reorder', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const { stages } = req.body || {};
    if (!Array.isArray(stages)) return res.status(400).json({ error: 'stages array required' });
    await client.query('BEGIN');
    // Load authoritative rows.
    const { rows: all } = await client.query(
      'SELECT id, is_system, is_won, is_lost FROM pipeline_stages WHERE tenant_id = $1',
      [req.tenantId]
    );
    const byId = new Map(all.map(s => [s.id, s]));
    // Separate system + user stages.
    const user = [];
    const sysWon = [];
    const sysLost = [];
    for (const s of stages) {
      const row = byId.get(s.id);
      if (!row) continue;
      if (row.is_won) sysWon.push(row);
      else if (row.is_lost) sysLost.push(row);
      else user.push(row);
    }
    // Position user stages in the order they arrived.
    let pos = 0;
    for (const s of user) {
      await client.query('UPDATE pipeline_stages SET position = $1 WHERE id = $2', [pos++, s.id]);
    }
    // Won → position (N-2), Lost → (N-1). If either is missing, skip.
    for (const s of sysWon) {
      await client.query('UPDATE pipeline_stages SET position = $1 WHERE id = $2', [pos++, s.id]);
    }
    for (const s of sysLost) {
      await client.query('UPDATE pipeline_stages SET position = $1 WHERE id = $2', [pos++, s.id]);
    }
    await client.query('COMMIT');
    const { rows } = await query(
      `SELECT id, name, slug, color, position, is_system, is_won, is_lost
         FROM pipeline_stages WHERE tenant_id = $1 ORDER BY position ASC`,
      [req.tenantId]
    );
    res.json({ stages: rows });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[pipeline-stages.reorder] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

module.exports = router;
module.exports.ensureDefaultStages = ensureDefaultStages;
