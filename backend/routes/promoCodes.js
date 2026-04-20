const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { requireFeature } = require('../middleware/featureFlag');

const router = express.Router();

// Shape: uppercase, A-Z/0-9/dash, 3-50 chars. Matches the spec's
// "uppercase alphanumeric + dashes only".
function normalizeCode(raw) {
  if (!raw) return null;
  const s = String(raw).trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
  if (s.length < 3 || s.length > 50) return null;
  return s;
}

function sanitizeDiscount(type, value) {
  const t = type === 'fixed' ? 'fixed' : 'percentage';
  const v = parseFloat(value);
  return {
    discount_type: t,
    discount_value: Number.isFinite(v) && v >= 0 ? v : 0,
  };
}

// ─── Public validate endpoint (no auth) ─────────────────────────────

router.post('/validate', express.json(), async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  try {
    const code = normalizeCode(req.body?.code);
    const tenantSlug = req.body?.tenantSlug;
    if (!code || !tenantSlug) return res.json({ valid: false, reason: 'not_found' });

    const { rows: [tenant] } = await query(
      'SELECT id, feature_promo_codes FROM tenants WHERE slug = $1 LIMIT 1',
      [tenantSlug]
    );
    if (!tenant || !tenant.feature_promo_codes) {
      return res.json({ valid: false, reason: 'not_found' });
    }
    const { rows: [pc] } = await query(
      `SELECT pc.*, p.name AS partner_name
         FROM promo_codes pc
         JOIN partners p ON p.id = pc.partner_id
        WHERE pc.tenant_id = $1 AND pc.code = $2
        LIMIT 1`,
      [tenant.id, code]
    );
    if (!pc) return res.json({ valid: false, reason: 'not_found' });
    if (!pc.is_active) return res.json({ valid: false, reason: 'not_found' });
    if (pc.expires_at && new Date(pc.expires_at) < new Date()) {
      return res.json({ valid: false, reason: 'expired' });
    }
    if (pc.max_uses != null && pc.current_uses >= pc.max_uses) {
      return res.json({ valid: false, reason: 'max_uses_reached' });
    }

    await query('UPDATE promo_codes SET current_uses = current_uses + 1 WHERE id = $1', [pc.id]);
    res.json({
      valid: true,
      discount: { type: pc.discount_type, value: parseFloat(pc.discount_value) },
      partnerName: pc.partner_name,
    });
  } catch (err) {
    console.error('[promo-codes validate]', err.message);
    res.json({ valid: false, reason: 'not_found' });
  }
});

router.options('/validate', (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type');
  res.sendStatus(204);
});

// ─── Authenticated CRUD ──────────────────────────────────────────────

router.use(authenticate);
router.use(tenantScope);

// Admin listing (all codes across all partners for this tenant).
router.get('/', requireFeature('feature_promo_codes'), authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT pc.*, p.name AS partner_name
         FROM promo_codes pc
         JOIN partners p ON p.id = pc.partner_id
        WHERE pc.tenant_id = $1
        ORDER BY pc.created_at DESC`,
      [req.tenantId]
    );
    res.json({ promoCodes: rows });
  } catch (err) {
    console.error('[promo-codes list admin]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Partner listing (scoped to caller's partner_id).
router.get('/partner', requireFeature('feature_promo_codes'), async (req, res) => {
  try {
    if (req.user.role !== 'partner' || !req.user.partnerId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const { rows } = await query(
      `SELECT * FROM promo_codes
        WHERE tenant_id = $1 AND partner_id = $2
        ORDER BY created_at DESC`,
      [req.tenantId, req.user.partnerId]
    );
    res.json({ promoCodes: rows });
  } catch (err) {
    console.error('[promo-codes list partner]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create — partner creates their own; admin can target any partner.
router.post('/', requireFeature('feature_promo_codes'), async (req, res) => {
  try {
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    const isPartner = req.user.role === 'partner';
    if (!isAdmin && !isPartner) return res.status(403).json({ error: 'Forbidden' });

    const { partnerId, code, discountType, discountValue, description, maxUses, expiresAt } = req.body || {};
    const cleanCode = normalizeCode(code);
    if (!cleanCode) return res.status(400).json({ error: 'Code invalide (A-Z, 0-9, -, 3 à 50 caractères)' });

    const targetPartnerId = isAdmin ? partnerId : req.user.partnerId;
    if (!targetPartnerId) return res.status(400).json({ error: 'partnerId requis' });

    // Verify the partner belongs to this tenant.
    const { rows: [p] } = await query('SELECT id FROM partners WHERE id = $1 AND tenant_id = $2', [targetPartnerId, req.tenantId]);
    if (!p) return res.status(404).json({ error: 'Partner introuvable' });

    const { discount_type, discount_value } = sanitizeDiscount(discountType, discountValue);
    const max = maxUses != null && maxUses !== '' ? parseInt(maxUses, 10) : null;
    const exp = expiresAt ? new Date(expiresAt) : null;

    try {
      const { rows: [inserted] } = await query(
        `INSERT INTO promo_codes
          (tenant_id, partner_id, code, discount_type, discount_value, description, max_uses, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         RETURNING *`,
        [req.tenantId, targetPartnerId, cleanCode, discount_type, discount_value, description || null, Number.isFinite(max) ? max : null, exp]
      );
      res.status(201).json({ promoCode: inserted });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Ce code existe déjà' });
      throw err;
    }
  } catch (err) {
    console.error('[promo-codes create]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update — admins can edit any; partners only their own.
router.put('/:id', requireFeature('feature_promo_codes'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: [existing] } = await query('SELECT * FROM promo_codes WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!existing) return res.status(404).json({ error: 'Code introuvable' });
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    if (!isAdmin && existing.partner_id !== req.user.partnerId) return res.status(403).json({ error: 'Forbidden' });

    const { discountType, discountValue, description, maxUses, expiresAt, isActive } = req.body || {};
    const sets = [];
    const params = [];
    let i = 1;
    if (discountType !== undefined || discountValue !== undefined) {
      const { discount_type, discount_value } = sanitizeDiscount(
        discountType ?? existing.discount_type,
        discountValue ?? existing.discount_value
      );
      sets.push(`discount_type = $${i++}`); params.push(discount_type);
      sets.push(`discount_value = $${i++}`); params.push(discount_value);
    }
    if (description !== undefined) { sets.push(`description = $${i++}`); params.push(description || null); }
    if (maxUses !== undefined) {
      const m = maxUses === null || maxUses === '' ? null : parseInt(maxUses, 10);
      sets.push(`max_uses = $${i++}`); params.push(Number.isFinite(m) ? m : null);
    }
    if (expiresAt !== undefined) { sets.push(`expires_at = $${i++}`); params.push(expiresAt ? new Date(expiresAt) : null); }
    if (isActive !== undefined) { sets.push(`is_active = $${i++}`); params.push(!!isActive); }
    if (!sets.length) return res.json({ promoCode: existing });

    params.push(id);
    const { rows: [updated] } = await query(`UPDATE promo_codes SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`, params);
    res.json({ promoCode: updated });
  } catch (err) {
    console.error('[promo-codes update]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete → deactivate.
router.delete('/:id', requireFeature('feature_promo_codes'), async (req, res) => {
  try {
    const { id } = req.params;
    const { rows: [existing] } = await query('SELECT * FROM promo_codes WHERE id = $1 AND tenant_id = $2', [id, req.tenantId]);
    if (!existing) return res.status(404).json({ error: 'Code introuvable' });
    const isAdmin = ['admin', 'superadmin'].includes(req.user.role);
    if (!isAdmin && existing.partner_id !== req.user.partnerId) return res.status(403).json({ error: 'Forbidden' });
    await query('UPDATE promo_codes SET is_active = FALSE WHERE id = $1', [id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[promo-codes delete]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
