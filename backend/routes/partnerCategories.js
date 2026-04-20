const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const router = express.Router();

// Slugify free-form names into a safe URL slug. Matches the tenant_id
// + slug unique constraint, so callers should retry on 23505 with a
// numeric suffix (handled below in createCategory).
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50) || 'category';
}

function isValidHex(c) {
  return typeof c === 'string' && /^#[0-9A-Fa-f]{6}$/.test(c);
}

// ─── Public read-only endpoint ─────────────────────────────────────
// Consumed by the partner registration form (no auth required so
// applicants can see the available partnership types before signing up).
router.get('/public', async (req, res) => {
  try {
    const tenantSlug = req.query.tenant;
    if (!tenantSlug) return res.status(400).json({ error: 'tenant query param required' });
    const { rows: [tenant] } = await query('SELECT id FROM tenants WHERE slug = $1 LIMIT 1', [tenantSlug]);
    if (!tenant) return res.json({ categories: [] });
    const { rows } = await query(
      `SELECT id, name, slug, color, description, is_default, position
         FROM partner_categories
        WHERE tenant_id = $1
        ORDER BY position ASC, created_at ASC`,
      [tenant.id]
    );
    res.json({ categories: rows });
  } catch (err) {
    console.error('[partner-categories public]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Authenticated routes ──────────────────────────────────────────
router.use(authenticate);
router.use(tenantScope);

router.get('/', async (req, res) => {
  try {
    if (!req.tenantId) return res.json({ categories: [] });
    const { rows } = await query(
      `SELECT pc.id, pc.name, pc.slug, pc.color, pc.description, pc.is_default, pc.position,
              (SELECT COUNT(*)::int FROM partners p WHERE p.category_id = pc.id) AS partners_count
         FROM partner_categories pc
        WHERE pc.tenant_id = $1
        ORDER BY pc.position ASC, pc.created_at ASC`,
      [req.tenantId]
    );
    res.json({ categories: rows });
  } catch (err) {
    console.error('[partner-categories GET]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Pick a free slug for this tenant — try the base slug first, then
// suffix with -2, -3, … until the UNIQUE constraint is satisfied.
async function pickFreeSlug(tenantId, base) {
  for (let n = 0; n < 20; n++) {
    const candidate = n === 0 ? base : `${base}-${n + 1}`;
    const { rows } = await query(
      'SELECT 1 FROM partner_categories WHERE tenant_id = $1 AND slug = $2 LIMIT 1',
      [tenantId, candidate]
    );
    if (!rows.length) return candidate;
  }
  return `${base}-${Date.now()}`;
}

router.post('/', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const { name, color, description } = req.body || {};
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Nom requis' });
    const slug = await pickFreeSlug(req.tenantId, slugify(name));
    const finalColor = isValidHex(color) ? color : '#6B7280';

    const { rows: [posRow] } = await query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS next FROM partner_categories WHERE tenant_id = $1',
      [req.tenantId]
    );
    const { rows: [inserted] } = await query(
      `INSERT INTO partner_categories (tenant_id, name, slug, color, description, position)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.tenantId, String(name).trim().slice(0, 100), slug, finalColor, description || null, posRow.next]
    );
    res.status(201).json({ category: inserted });
  } catch (err) {
    console.error('[partner-categories POST]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/reorder', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const list = Array.isArray(req.body?.categories) ? req.body.categories : [];
    for (const item of list) {
      if (!item || !item.id) continue;
      const pos = parseInt(item.position, 10);
      if (!Number.isFinite(pos)) continue;
      await query(
        'UPDATE partner_categories SET position = $1 WHERE id = $2 AND tenant_id = $3',
        [pos, item.id, req.tenantId]
      );
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[partner-categories reorder]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id/set-default', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const { rows: [exists] } = await query(
      'SELECT id FROM partner_categories WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!exists) return res.status(404).json({ error: 'Catégorie introuvable' });
    await query('UPDATE partner_categories SET is_default = FALSE WHERE tenant_id = $1', [req.tenantId]);
    await query('UPDATE partner_categories SET is_default = TRUE WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[partner-categories set-default]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const { name, color, description, position } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    if (name !== undefined) { sets.push(`name = $${i++}`); params.push(String(name).slice(0, 100)); }
    if (color !== undefined && isValidHex(color)) { sets.push(`color = $${i++}`); params.push(color); }
    if (description !== undefined) { sets.push(`description = $${i++}`); params.push(description || null); }
    if (position !== undefined && Number.isFinite(parseInt(position, 10))) {
      sets.push(`position = $${i++}`); params.push(parseInt(position, 10));
    }
    if (!sets.length) {
      const { rows: [cur] } = await query('SELECT * FROM partner_categories WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
      return res.json({ category: cur });
    }
    params.push(req.params.id, req.tenantId);
    const { rows: [updated] } = await query(
      `UPDATE partner_categories SET ${sets.join(', ')}
        WHERE id = $${i++} AND tenant_id = $${i}
        RETURNING *`,
      params
    );
    if (!updated) return res.status(404).json({ error: 'Catégorie introuvable' });
    res.json({ category: updated });
  } catch (err) {
    console.error('[partner-categories PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'no tenant' });
    const { rows: [cat] } = await query(
      'SELECT id, is_default FROM partner_categories WHERE id = $1 AND tenant_id = $2',
      [req.params.id, req.tenantId]
    );
    if (!cat) return res.status(404).json({ error: 'Catégorie introuvable' });
    if (cat.is_default) return res.status(400).json({ error: 'Cannot delete the default category' });
    const { rows: [{ count }] } = await query(
      'SELECT COUNT(*)::int AS count FROM partners WHERE category_id = $1',
      [req.params.id]
    );
    if (count > 0) {
      return res.status(400).json({ error: `This category has ${count} partners assigned. Reassign them first.`, count });
    }
    await query('DELETE FROM partner_categories WHERE id = $1 AND tenant_id = $2', [req.params.id, req.tenantId]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[partner-categories DELETE]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
