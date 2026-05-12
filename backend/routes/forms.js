// Partner-registration forms — étape 1B/6.
//
// CRUD over the per-tenant form, its fields, and the per-partner share
// tokens. The builder UI (étape 2) drives every endpoint here; the
// public form, embed, and funnel instrumentation are étapes 3/4/5/6
// and don't live in this file.
//
// V1 invariant: one active form per tenant. Enforced both at the DB
// level (partial UNIQUE index on forms(tenant_id) WHERE deleted_at IS
// NULL, see migrate.js v47) and here in the route layer with a 409.
//
// Authorisation: admin or superadmin in the tenant. Commercials don't
// need to touch the form schema, and partners certainly don't.
//
// Cross-tenant isolation: every query that touches a form row also
// checks tenant_id = req.tenantId. The RLS policies from v47b are
// belt-and-braces — if RLS_ENABLED is unset on Railway, these guards
// are the only line of defence.
const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate, tenantScope, authorize } = require('../middleware/auth');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'superadmin'));

// 'appointment' was removed from this list in v50: appointment booking
// is now a form-level setting (forms.appointment_enabled + appointment_url)
// rendered on the thank-you screen, not a field the prospect fills.
// Legacy 'appointment' fields were migrated to forms.appointment_url
// in the v50 migration; new POSTs are rejected at validation here.
const FIELD_TYPES = [
  'text_short', 'text_long', 'email', 'phone', 'dropdown',
  'multi_select', 'radio', 'date', 'number',
];

const LEAD_HANDLING_VALUES = ['partner_managed', 'client_prospect'];

// Builder convenience: types that surface a list of choices in the
// UI. We require options to be a non-empty array of strings for these
// so the rendered form is actually usable.
const TYPES_WITH_OPTIONS = new Set(['dropdown', 'multi_select', 'radio']);

// Standard "lead" fields auto-created with every form. Each one's
// field_role lines up with a referrals column so the public-submit
// endpoint can drop the answer straight onto the right column. The
// builder also reads field_role to flag a deletion confirmation
// (standard field → "this will leave the referral column unfilled")
// and to drive the restore-defaults action.
const STANDARD_FIELDS = [
  { field_role: 'contact_first_name', type: 'text_short', label: 'Prénom',   required: true,  placeholder: null },
  { field_role: 'contact_last_name',  type: 'text_short', label: 'Nom',      required: true,  placeholder: null },
  { field_role: 'prospect_email',     type: 'email',      label: 'Email',    required: true,  placeholder: null },
  { field_role: 'prospect_phone',     type: 'phone',      label: 'Téléphone', required: false, placeholder: null },
  { field_role: 'prospect_company',   type: 'text_short', label: 'Société',  required: true,  placeholder: null },
  { field_role: 'prospect_role',      type: 'text_short', label: 'Poste',    required: false, placeholder: null },
];
const STANDARD_ROLES = new Set(STANDARD_FIELDS.map(f => f.field_role));

function badRequest(res, error) {
  return res.status(400).json({ error });
}

function validateFieldPayload(body, { partial = false, maxStep = 5 } = {}) {
  const errs = [];
  if (!partial || body.type !== undefined) {
    if (!FIELD_TYPES.includes(body.type)) errs.push('type invalide');
  }
  if (!partial || body.label !== undefined) {
    if (typeof body.label !== 'string' || !body.label.trim()) errs.push('label requis');
    else if (body.label.length > 500) errs.push('label trop long (max 500)');
  }
  if (!partial || body.step !== undefined) {
    const s = Number(body.step);
    if (!Number.isInteger(s) || s < 1 || s > maxStep) errs.push(`step doit être entre 1 et ${maxStep}`);
  }
  if (body.placeholder !== undefined && body.placeholder !== null) {
    if (typeof body.placeholder !== 'string') errs.push('placeholder doit être une string');
    else if (body.placeholder.length > 500) errs.push('placeholder trop long (max 500)');
  }
  if (body.required !== undefined && typeof body.required !== 'boolean') {
    errs.push('required doit être un booléen');
  }
  if (body.order_index !== undefined && !Number.isInteger(body.order_index)) {
    errs.push('order_index doit être un entier');
  }
  // Type-specific shape checks. We only enforce on the final type
  // (i.e. after applying the PATCH) so the caller may need to handle
  // re-validation themselves when type changes.
  const effectiveType = body.type;
  if (TYPES_WITH_OPTIONS.has(effectiveType)) {
    if (!Array.isArray(body.options) || body.options.length === 0) {
      errs.push('options requis (tableau non vide) pour ' + effectiveType);
    } else if (!body.options.every(o => typeof o === 'string' && o.trim())) {
      errs.push('chaque option doit être une string non vide');
    }
  }
  if (body.field_role !== undefined && body.field_role !== null) {
    if (typeof body.field_role !== 'string' || body.field_role.length > 50) {
      errs.push('field_role invalide');
    }
  }
  return errs;
}

// ─── Form CRUD ───────────────────────────────────────────────────

// GET /api/forms — return the tenant's single active form, or null.
router.get('/', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT * FROM forms
        WHERE tenant_id = $1 AND deleted_at IS NULL
        LIMIT 1`,
      [req.tenantId]
    );
    res.json({ form: rows[0] || null });
  } catch (err) {
    console.error('[forms.GET] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/forms — create the tenant's form. Refuses if one already
// exists (active). The partial UNIQUE index is the DB-level guard;
// the explicit SELECT here gives a friendlier 409 with the existing
// form id so the FE can redirect to the edit screen.
router.post('/', [
  body('title').trim().notEmpty().isLength({ max: 255 }),
  body('description').optional({ nullable: true }).isString(),
  body('thank_you_message').optional({ nullable: true }).isString(),
  body('default_lead_handling').optional().isIn(LEAD_HANDLING_VALUES),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors.array().map(e => e.msg).join(', '));
  try {
    const { rows: existing } = await query(
      `SELECT id FROM forms WHERE tenant_id = $1 AND deleted_at IS NULL LIMIT 1`,
      [req.tenantId]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Un formulaire existe déjà pour ce tenant', form_id: existing[0].id });
    }
    const { title, description, thank_you_message } = req.body;
    const leadHandling = req.body.default_lead_handling || 'partner_managed';
    // Atomic: create the form AND the 6 standard lead fields in one
    // transaction so the FE never sees a half-created form. If the
    // standard-field inserts fail mid-flight, the form row is rolled
    // back and the partial UNIQUE index slot stays free.
    const { pool } = require('../db');
    const client = await pool.connect();
    let formRow;
    try {
      await client.query('BEGIN');
      const { rows } = await client.query(
        `INSERT INTO forms (tenant_id, title, description, thank_you_message, default_lead_handling)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [req.tenantId, title.trim(), description || null, thank_you_message || null, leadHandling]
      );
      formRow = rows[0];
      // Standard fields all live on step 1, in declared order. Failing
      // here triggers ROLLBACK below so the form vanishes too.
      for (let i = 0; i < STANDARD_FIELDS.length; i++) {
        const f = STANDARD_FIELDS[i];
        await client.query(
          `INSERT INTO form_fields
            (form_id, tenant_id, step, order_index, type, label, placeholder, required, field_role)
           VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
          [formRow.id, req.tenantId, i, f.type, f.label, f.placeholder, f.required, f.field_role]
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      try { await client.query('ROLLBACK'); } catch {}
      throw txErr;
    } finally {
      try { client.release(); } catch {}
    }
    res.status(201).json({ form: formRow });
  } catch (err) {
    // 23505 = unique violation. Race-condition fallback for the
    // SELECT/INSERT window above.
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un formulaire existe déjà pour ce tenant' });
    }
    console.error('[forms.POST] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Loads the form by id and asserts tenant ownership in one go. Used
// by every nested route that needs to confirm the URL :id belongs to
// the caller's tenant before doing anything else.
async function loadOwnedForm(tenantId, formId) {
  const { rows } = await query(
    `SELECT * FROM forms WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
    [formId, tenantId]
  );
  return rows[0] || null;
}

// PATCH /api/forms/:id — partial update of the form metadata.
router.patch('/:id', [
  body('title').optional().trim().isLength({ min: 1, max: 255 }),
  body('description').optional({ nullable: true }).isString(),
  body('thank_you_message').optional({ nullable: true }).isString(),
  body('default_lead_handling').optional().isIn(LEAD_HANDLING_VALUES),
  body('is_published').optional().isBoolean(),
  body('appointment_enabled').optional().isBoolean(),
  body('appointment_url').optional({ nullable: true }).isString(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return badRequest(res, errors.array().map(e => e.msg).join(', '));
  // appointment_url, if provided, must parse as a URL when non-empty.
  // (express-validator's .isURL() is too restrictive for Calendly
  // sub-paths so we use the WHATWG URL constructor.)
  if (req.body.appointment_url) {
    try { new URL(req.body.appointment_url); }
    catch { return badRequest(res, 'appointment_url doit être une URL valide'); }
  }
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const sets = [];
    const params = [];
    let i = 1;
    for (const k of ['title', 'description', 'thank_you_message', 'default_lead_handling', 'is_published', 'appointment_enabled', 'appointment_url']) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        params.push(k === 'title' ? String(req.body[k]).trim() : req.body[k]);
      }
    }
    if (!sets.length) return res.json({ form });
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id, req.tenantId);
    const { rows } = await query(
      `UPDATE forms SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i++} RETURNING *`,
      params
    );
    res.json({ form: rows[0] });
  } catch (err) {
    console.error('[forms.PATCH] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/forms/:id — soft delete. The partial UNIQUE index uses
// `deleted_at IS NULL`, so soft-deleting frees the slot for a new
// form. Existing referrals.form_id rows are kept intact (FK with ON
// DELETE SET NULL would only fire on a hard delete).
router.delete('/:id', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    await query(
      `UPDATE forms SET deleted_at = NOW(), is_published = FALSE, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2`,
      [req.params.id, req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[forms.DELETE] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Form fields ─────────────────────────────────────────────────

// GET /api/forms/:id/fields — ordered by step then order_index.
router.get('/:id/fields', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { rows } = await query(
      `SELECT * FROM form_fields
        WHERE form_id = $1 AND tenant_id = $2
        ORDER BY step ASC, order_index ASC, created_at ASC`,
      [req.params.id, req.tenantId]
    );
    res.json({ fields: rows });
  } catch (err) {
    console.error('[forms.fields.GET] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/fields', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const errs = validateFieldPayload(req.body, { maxStep: form.step_count || 3 });
    if (errs.length) return badRequest(res, errs.join(', '));

    const { type, label, placeholder = null, required = false, options = null, config = null } = req.body;
    // Custom-built fields never carry a field_role: the slot is reserved
    // for the 6 standard lead fields seeded at form creation. Anything
    // else stays null and falls into referrals.notes at submission time.
    const fieldRole = req.body.field_role && STANDARD_ROLES.has(req.body.field_role)
      ? req.body.field_role
      : null;
    const step = Number(req.body.step);
    // Default order_index to the next slot in the target step so the
    // builder doesn't have to compute it. The FE may still override.
    let orderIndex = req.body.order_index;
    if (orderIndex === undefined) {
      const { rows: maxRows } = await query(
        `SELECT COALESCE(MAX(order_index), -1) + 1 AS next FROM form_fields
          WHERE form_id = $1 AND step = $2`,
        [req.params.id, step]
      );
      orderIndex = maxRows[0].next;
    }
    const { rows } = await query(
      `INSERT INTO form_fields
        (form_id, tenant_id, step, order_index, type, label, placeholder, required, options, config, field_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        req.params.id, req.tenantId, step, orderIndex, type,
        label.trim(), placeholder, required,
        options ? JSON.stringify(options) : null,
        config ? JSON.stringify(config) : null,
        fieldRole,
      ]
    );
    res.status(201).json({ field: rows[0] });
  } catch (err) {
    console.error('[forms.fields.POST] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/:id/fields/:fieldId', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { rows: existing } = await query(
      `SELECT * FROM form_fields WHERE id = $1 AND form_id = $2 AND tenant_id = $3 LIMIT 1`,
      [req.params.fieldId, req.params.id, req.tenantId]
    );
    if (!existing.length) return res.status(404).json({ error: 'Champ introuvable' });

    // Merge the incoming patch onto the existing row so the type/option
    // coherence check sees the post-update state. Required because a
    // PATCH that only sets options shouldn't be rejected for "type is
    // not in enum".
    const merged = {
      type: req.body.type !== undefined ? req.body.type : existing[0].type,
      label: req.body.label !== undefined ? req.body.label : existing[0].label,
      step: req.body.step !== undefined ? req.body.step : existing[0].step,
      placeholder: req.body.placeholder,
      required: req.body.required,
      order_index: req.body.order_index,
      options: req.body.options !== undefined ? req.body.options : existing[0].options,
      config: req.body.config !== undefined ? req.body.config : existing[0].config,
    };
    const errs = validateFieldPayload(merged, { partial: false, maxStep: form.step_count || 3 });
    if (errs.length) return badRequest(res, errs.join(', '));

    const sets = [];
    const params = [];
    let i = 1;
    const stringFields = ['type', 'label', 'placeholder'];
    for (const k of stringFields) {
      if (req.body[k] !== undefined) {
        sets.push(`${k} = $${i++}`);
        params.push(k === 'label' ? String(req.body[k]).trim() : req.body[k]);
      }
    }
    if (req.body.step !== undefined) {
      sets.push(`step = $${i++}`);
      params.push(Number(req.body.step));
    }
    if (req.body.order_index !== undefined) {
      sets.push(`order_index = $${i++}`);
      params.push(req.body.order_index);
    }
    if (req.body.required !== undefined) {
      sets.push(`required = $${i++}`);
      params.push(!!req.body.required);
    }
    if (req.body.options !== undefined) {
      sets.push(`options = $${i++}`);
      params.push(req.body.options ? JSON.stringify(req.body.options) : null);
    }
    if (req.body.config !== undefined) {
      sets.push(`config = $${i++}`);
      params.push(req.body.config ? JSON.stringify(req.body.config) : null);
    }
    if (!sets.length) return res.json({ field: existing[0] });
    params.push(req.params.fieldId, req.params.id, req.tenantId);
    const { rows } = await query(
      `UPDATE form_fields SET ${sets.join(', ')}
        WHERE id = $${i++} AND form_id = $${i++} AND tenant_id = $${i++}
        RETURNING *`,
      params
    );
    res.json({ field: rows[0] });
  } catch (err) {
    console.error('[forms.fields.PATCH] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id/fields/:fieldId', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { rowCount } = await query(
      `DELETE FROM form_fields WHERE id = $1 AND form_id = $2 AND tenant_id = $3`,
      [req.params.fieldId, req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Champ introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[forms.fields.DELETE] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/forms/:id/fields/reorder — bulk update of order_index +
// step in a single transaction. Body: { items: [{ id, step,
// order_index }, ...] }. Every id must belong to the form & tenant.
router.post('/:id/fields/reorder', async (req, res) => {
  const { items } = req.body || {};
  if (!Array.isArray(items) || !items.length) return badRequest(res, 'items requis (tableau non vide)');
  for (const it of items) {
    if (!it || typeof it !== 'object') return badRequest(res, 'item invalide');
    if (!it.id || typeof it.id !== 'string') return badRequest(res, 'item.id requis');
    if (!Number.isInteger(it.order_index)) return badRequest(res, 'item.order_index doit être un entier');
  }
  const { pool } = require('../db');
  const client = await pool.connect();
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) {
      client.release();
      return res.status(404).json({ error: 'Formulaire introuvable' });
    }
    const maxStep = form.step_count || 3;
    for (const it of items) {
      const s = Number(it.step);
      if (!Number.isInteger(s) || s < 1 || s > maxStep) {
        client.release();
        return badRequest(res, `item.step doit être entre 1 et ${maxStep}`);
      }
    }
    await client.query('BEGIN');
    for (const it of items) {
      const r = await client.query(
        `UPDATE form_fields SET step = $1, order_index = $2
          WHERE id = $3 AND form_id = $4 AND tenant_id = $5`,
        [Number(it.step), it.order_index, it.id, req.params.id, req.tenantId]
      );
      if (!r.rowCount) {
        await client.query('ROLLBACK');
        client.release();
        return res.status(404).json({ error: 'Champ introuvable: ' + it.id });
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, count: items.length });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[forms.fields.reorder] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    try { client.release(); } catch {}
  }
});

// POST /api/forms/:id/steps/add — increment step_count (cap at 5).
// New step starts empty; fields stay where they are.
router.post('/:id/steps/add', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const current = form.step_count || 3;
    if (current >= 5) return badRequest(res, 'Maximum 5 étapes atteint');
    const { rows } = await query(
      `UPDATE forms SET step_count = step_count + 1, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId]
    );
    res.json({ form: rows[0] });
  } catch (err) {
    console.error('[forms.steps.add] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/forms/:id/steps/remove — body: { step: N }.
// Atomic: in one tx, move any fields currently on step N to the
// target step (N-1 if N > 1, otherwise N+1 then becomes 1 after the
// shift), then renumber every step > N down by one to fill the gap,
// then decrement step_count.
router.post('/:id/steps/remove', async (req, res) => {
  const stepToRemove = Number(req.body?.step);
  if (!Number.isInteger(stepToRemove) || stepToRemove < 1) {
    return badRequest(res, 'step doit être un entier ≥ 1');
  }
  const { pool } = require('../db');
  const client = await pool.connect();
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) { client.release(); return res.status(404).json({ error: 'Formulaire introuvable' }); }
    const current = form.step_count || 3;
    if (current <= 1) { client.release(); return badRequest(res, 'Le formulaire doit conserver au moins une étape'); }
    if (stepToRemove > current) { client.release(); return badRequest(res, `step ${stepToRemove} hors plage (max ${current})`); }

    // Target step the orphaned fields fall back to. If the removed
    // step is the first, fields go to what was step 2 (which will
    // become step 1 after the renumber). For any other step N, fields
    // go to N-1 (the step that visually sits just before, and which
    // keeps its number after the shift).
    const fallbackBeforeShift = stepToRemove === 1 ? 2 : stepToRemove - 1;

    await client.query('BEGIN');
    // 1. Determine the next free order_index in the fallback step so
    //    the moved fields land after any existing ones rather than
    //    overlapping.
    const { rows: maxR } = await client.query(
      `SELECT COALESCE(MAX(order_index), -1) AS m FROM form_fields
        WHERE form_id = $1 AND step = $2`,
      [req.params.id, fallbackBeforeShift]
    );
    const baseIdx = (maxR[0]?.m ?? -1) + 1;
    // 2. Move fields of the removed step, preserving their relative
    //    order via order_index = baseIdx + their current order_index.
    await client.query(
      `UPDATE form_fields
          SET step = $1, order_index = order_index + $2
        WHERE form_id = $3 AND tenant_id = $4 AND step = $5`,
      [fallbackBeforeShift, baseIdx, req.params.id, req.tenantId, stepToRemove]
    );
    // 3. Renumber every step > removed step down by one.
    await client.query(
      `UPDATE form_fields SET step = step - 1
        WHERE form_id = $1 AND tenant_id = $2 AND step > $3`,
      [req.params.id, req.tenantId, stepToRemove]
    );
    // 4. Decrement step_count.
    const { rows: formRows } = await client.query(
      `UPDATE forms SET step_count = step_count - 1, updated_at = NOW()
        WHERE id = $1 AND tenant_id = $2 RETURNING *`,
      [req.params.id, req.tenantId]
    );
    await client.query('COMMIT');
    res.json({ form: formRows[0] });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch {}
    console.error('[forms.steps.remove] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    try { client.release(); } catch {}
  }
});

// POST /api/forms/:id/fields/restore-defaults
// Recreate any of the 6 STANDARD_FIELDS whose field_role is currently
// missing on the form. Existing fields are left untouched. Newly
// inserted rows land on step 1 at the end (order_index = current max
// of step 1 + 1, incrementing per insertion). Idempotent — calling
// it on a form that already has all 6 standards returns ok with
// added=0.
router.post('/:id/fields/restore-defaults', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { rows: existing } = await query(
      `SELECT field_role FROM form_fields
        WHERE form_id = $1 AND field_role IS NOT NULL`,
      [req.params.id]
    );
    const have = new Set(existing.map(r => r.field_role));
    const missing = STANDARD_FIELDS.filter(f => !have.has(f.field_role));
    if (!missing.length) return res.json({ ok: true, added: 0 });

    const { rows: maxRows } = await query(
      `SELECT COALESCE(MAX(order_index), -1) AS m FROM form_fields
        WHERE form_id = $1 AND step = 1`,
      [req.params.id]
    );
    let nextIdx = (maxRows[0]?.m ?? -1) + 1;

    const { pool } = require('../db');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const f of missing) {
        await client.query(
          `INSERT INTO form_fields
            (form_id, tenant_id, step, order_index, type, label, placeholder, required, field_role)
           VALUES ($1, $2, 1, $3, $4, $5, $6, $7, $8)`,
          [req.params.id, req.tenantId, nextIdx++, f.type, f.label, f.placeholder, f.required, f.field_role]
        );
      }
      await client.query('COMMIT');
    } catch (txErr) {
      try { await client.query('ROLLBACK'); } catch {}
      throw txErr;
    } finally {
      try { client.release(); } catch {}
    }
    res.json({ ok: true, added: missing.length });
  } catch (err) {
    console.error('[forms.fields.restore-defaults] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Partner tokens ──────────────────────────────────────────────

// 'prt_' prefix (per Charles' brief) + 32 hex chars = 36 chars, well
// under the VARCHAR(64) ceiling. crypto.randomBytes(16) gives 128 bits
// of entropy — overkill for a public-but-not-secret share token,
// matches what we use elsewhere (api_keys / partner referral codes).
function generateToken() {
  return 'prt_' + crypto.randomBytes(16).toString('hex');
}

router.get('/:id/partner-tokens', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { rows } = await query(
      `SELECT fpt.id, fpt.form_id, fpt.partner_id, fpt.token, fpt.created_at,
              p.name AS partner_name, p.email AS partner_email
         FROM form_partner_tokens fpt
         JOIN partners p ON p.id = fpt.partner_id
        WHERE fpt.form_id = $1 AND fpt.tenant_id = $2
        ORDER BY fpt.created_at DESC`,
      [req.params.id, req.tenantId]
    );
    res.json({ tokens: rows });
  } catch (err) {
    console.error('[forms.tokens.GET] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/:id/partner-tokens', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { partner_id } = req.body || {};
    if (!partner_id || typeof partner_id !== 'string') return badRequest(res, 'partner_id requis');

    // Verify the partner belongs to the caller's tenant. A partner_id
    // from another tenant would otherwise be silently wired up — small
    // window, but plug it explicitly.
    const { rows: pRows } = await query(
      `SELECT id FROM partners WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL LIMIT 1`,
      [partner_id, req.tenantId]
    );
    if (!pRows.length) return res.status(404).json({ error: 'Partenaire introuvable' });

    // Idempotency: if a token already exists for (form_id, partner_id)
    // we surface it instead of creating a duplicate. The UNIQUE
    // constraint would reject it anyway, but a 200 here gives the FE
    // a smoother "copy link" flow.
    const { rows: existing } = await query(
      `SELECT id, token FROM form_partner_tokens
        WHERE form_id = $1 AND partner_id = $2 LIMIT 1`,
      [req.params.id, partner_id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Token déjà existant pour ce partenaire', token: existing[0] });
    }

    const token = generateToken();
    const { rows } = await query(
      `INSERT INTO form_partner_tokens (form_id, tenant_id, partner_id, token)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [req.params.id, req.tenantId, partner_id, token]
    );
    res.status(201).json({ token: rows[0] });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Token déjà existant' });
    }
    console.error('[forms.tokens.POST] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id/partner-tokens/:tokenId', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });
    const { rowCount } = await query(
      `DELETE FROM form_partner_tokens
        WHERE id = $1 AND form_id = $2 AND tenant_id = $3`,
      [req.params.tokenId, req.params.id, req.tenantId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Token introuvable' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[forms.tokens.DELETE] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Funnel stats ────────────────────────────────────────────────
//
// GET /api/forms/:id/stats?period=30d&partner_id=<uuid>
// Returns KPIs + per-step funnel + top abandoned fields for a form.
// Optional partner_id filter narrows results to events carrying any
// of that partner's tokens for this form.
function lowerBoundFor(period) {
  const now = Date.now();
  switch (period) {
    case '7d':  return new Date(now - 7  * 24 * 3600 * 1000);
    case '90d': return new Date(now - 90 * 24 * 3600 * 1000);
    case 'all': return null;
    case '30d':
    default:    return new Date(now - 30 * 24 * 3600 * 1000);
  }
}

router.get('/:id/stats', async (req, res) => {
  try {
    const form = await loadOwnedForm(req.tenantId, req.params.id);
    if (!form) return res.status(404).json({ error: 'Formulaire introuvable' });

    const period = ['7d', '30d', '90d', 'all'].includes(req.query.period) ? req.query.period : '30d';
    const since = lowerBoundFor(period);
    const partnerId = (typeof req.query.partner_id === 'string' && /^[0-9a-f-]{36}$/i.test(req.query.partner_id))
      ? req.query.partner_id : null;

    // Resolve partner_id → tokens. Empty list means "this partner
    // never had a token on this form" → every aggregate returns 0.
    let tokenWhere = '';
    const params = [req.params.id];
    if (since) { params.push(since); tokenWhere += ' AND created_at >= $' + params.length; }
    if (partnerId) {
      const { rows: tk } = await query(
        `SELECT token FROM form_partner_tokens WHERE form_id = $1 AND partner_id = $2`,
        [req.params.id, partnerId]
      );
      const tokens = tk.map(r => r.token);
      if (!tokens.length) {
        return res.json({
          period, partner_id: partnerId,
          kpis: { views: 0, starts: 0, submissions: 0, conversion_rate: 0 },
          funnel: [],
          top_abandons: [],
          partners: [],
        });
      }
      params.push(tokens);
      tokenWhere += ' AND partner_token = ANY($' + params.length + '::text[])';
    }

    // Aggregate counts per event type.
    const { rows: typeRows } = await query(
      `SELECT event_type, COUNT(*)::int AS c
         FROM form_events
        WHERE form_id = $1${tokenWhere}
        GROUP BY event_type`,
      params
    );
    const counts = Object.fromEntries(typeRows.map(r => [r.event_type, r.c]));

    // Per-step completion counts.
    const { rows: stepRows } = await query(
      `SELECT step_index, COUNT(*)::int AS c
         FROM form_events
        WHERE form_id = $1 AND event_type = 'step_complete'${tokenWhere}
        GROUP BY step_index
        ORDER BY step_index ASC`,
      params
    );
    const stepCounts = Object.fromEntries(stepRows.map(r => [r.step_index, r.c]));

    // Top abandoned fields (join to surface labels).
    const { rows: abandonRows } = await query(
      `SELECT fe.field_id, ff.label, COUNT(*)::int AS c
         FROM form_events fe
         JOIN form_fields ff ON ff.id = fe.field_id
        WHERE fe.form_id = $1 AND fe.event_type = 'field_abandon'${tokenWhere.replace(/created_at/g, 'fe.created_at').replace(/partner_token/g, 'fe.partner_token')}
        GROUP BY fe.field_id, ff.label
        ORDER BY c DESC
        LIMIT 10`,
      params
    );

    // Build funnel rows: view → start → step1 → step2 ... → submit.
    const views = counts.form_view || 0;
    const starts = counts.form_start || 0;
    const submissions = counts.form_submit || 0;
    const stepCount = form.step_count || 1;
    const funnel = [
      { key: 'views',  label: 'Vues',        count: views,  rate_from_prev: null },
      { key: 'starts', label: 'Démarrages', count: starts, rate_from_prev: views ? starts / views : 0 },
    ];
    for (let s = 1; s <= stepCount; s++) {
      const c = stepCounts[s] || 0;
      const prev = funnel[funnel.length - 1].count;
      funnel.push({ key: 'step_' + s, label: 'Étape ' + s, count: c, rate_from_prev: prev ? c / prev : 0 });
    }
    const lastStepCount = funnel[funnel.length - 1].count;
    funnel.push({ key: 'submit', label: 'Soumissions', count: submissions, rate_from_prev: lastStepCount ? submissions / lastStepCount : 0 });

    // Partner list for the filter dropdown — every partner who has a
    // token on this form, ordered by name.
    const { rows: partnerRows } = await query(
      `SELECT p.id, p.name
         FROM form_partner_tokens fpt
         JOIN partners p ON p.id = fpt.partner_id
        WHERE fpt.form_id = $1 AND p.deleted_at IS NULL
        ORDER BY p.name ASC`,
      [req.params.id]
    );

    res.json({
      period,
      partner_id: partnerId,
      kpis: {
        views,
        starts,
        submissions,
        conversion_rate: views ? submissions / views : 0,
      },
      funnel,
      top_abandons: abandonRows.map(r => ({ field_id: r.field_id, label: r.label, count: r.c })),
      partners: partnerRows,
    });
  } catch (err) {
    console.error('[forms.stats] failed:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
