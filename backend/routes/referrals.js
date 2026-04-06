const express = require('express');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, partnerScope } = require('../middleware/auth');
const { queueNotification } = require('../services/emailService');

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(partnerScope);

// ─── List referrals ───
router.get('/', async (req, res) => {
  try {
    const { status, partner_id, level, page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;
    
    let where = [];
    let params = [];
    let i = 1;

    // Partners can only see their own referrals
    // Tenant isolation - non-superadmin users only see their tenant data
    if (req.user.tenantId && req.user.role !== 'superadmin') {
      where.push(\`r.tenant_id = \$\${i++}\`);
      params.push(req.user.tenantId);
    }

    // Tenant isolation - non-superadmin users only see their tenant data
    if (req.user.tenantId && req.user.role !== 'superadmin') {
      where.push(\`r.tenant_id = \$\${i++}\`);
      params.push(req.user.tenantId);
    }

    if (req.partnerScope) {
      where.push(`r.partner_id = $${i++}`);
      params.push(req.partnerScope);
    } else if (partner_id) {
      where.push(`r.partner_id = $${i++}`);
      params.push(partner_id);
    }

    if (status && status !== 'all') {
      where.push(`r.status = $${i++}`);
      params.push(status);
    }
    if (level && level !== 'all') {
      where.push(`r.recommendation_level = $${i++}`);
      params.push(level);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT r.*, p.name as partner_name, p.contact_name as partner_contact,
              p.commission_rate, u.full_name as assigned_name
       FROM referrals r
       JOIN partners p ON r.partner_id = p.id
       LEFT JOIN users u ON r.assigned_to = u.id
       ${whereClause}
       ORDER BY r.created_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );

    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM referrals r ${whereClause}`,
      params
    );

    res.json({ 
      referrals: rows, 
      total: parseInt(count),
      page: parseInt(page),
      totalPages: Math.ceil(count / limit),
    });
  } catch (err) {
    console.error('List referrals error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get single referral with activities ───
router.get('/:id', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, p.name as partner_name, p.contact_name as partner_contact,
              p.commission_rate, u.full_name as assigned_name
       FROM referrals r
       JOIN partners p ON r.partner_id = p.id
       LEFT JOIN users u ON r.assigned_to = u.id
       WHERE r.id = $1`,
      [req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Referral introuvable' });
    }

    // Check partner scope
    if (req.partnerScope && rows[0].partner_id !== req.partnerScope) {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    // Get activity log
    const { rows: activities } = await query(
      `SELECT ra.*, u.full_name as user_name
       FROM referral_activities ra
       JOIN users u ON ra.user_id = u.id
       WHERE ra.referral_id = $1
       ORDER BY ra.created_at DESC`,
      [req.params.id]
    );

    res.json({ referral: rows[0], activities });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Create referral (partner submits) ───
router.post('/', [
  body('prospect_name').trim().notEmpty(),
  body('prospect_email').isEmail().normalizeEmail(),
  body('prospect_company').trim().notEmpty(),
  body('recommendation_level').isIn(['hot', 'warm', 'cold']),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      prospect_name, prospect_email, prospect_phone,
      prospect_company, prospect_role,
      recommendation_level, notes,
    } = req.body;

    // Determine partner_id from user or body
    const partnerId = req.user.partnerId || req.body.partner_id;
    if (!partnerId) {
      return res.status(400).json({ error: 'Partner ID requis' });
    }

    const { rows: [referral] } = await query(
      `INSERT INTO referrals 
        (partner_id, submitted_by, prospect_name, prospect_email, prospect_phone, 
         prospect_company, prospect_role, recommendation_level, notes, tenant_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [partnerId, req.user.id, prospect_name, prospect_email, prospect_phone,
       prospect_company, prospect_role, recommendation_level, notes, req.user.tenantId || null]
    );

    // Log activity
    await query(
      `INSERT INTO referral_activities (referral_id, user_id, action, new_value)
       VALUES ($1, $2, 'created', 'new')`,
      [referral.id, req.user.id]
    );

    // Queue email notification to admins
    const { rows: admins } = await query(
      `SELECT email, full_name FROM users WHERE role IN ('admin', 'commercial') AND is_active = true`
    );

    const { rows: [partner] } = await query(
      `SELECT name FROM partners WHERE id = $1`, [partnerId]
    );

    for (const admin of admins) {
      await queueNotification(admin.email, admin.full_name, 'new_referral', {
        partnerName: partner.name,
        prospectName: prospect_name,
        prospectCompany: prospect_company,
        level: recommendation_level,
        referralId: referral.id,
      });
    }

    res.status(201).json({ referral });
  } catch (err) {
    console.error('Create referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Update referral (internal team) ───
router.put('/:id', authenticate, authorize('admin', 'commercial'), async (req, res) => {
  const client = await getClient();
  try {
    const { status, deal_value, assigned_to, notes, lost_reason, engagement } = req.body;

    // Get current state
    const { rows: [current] } = await client.query(
      'SELECT * FROM referrals WHERE id = $1', [req.params.id]
    );
    if (!current) {
      client.release();
      return res.status(404).json({ error: 'Referral introuvable' });
    }

    await client.query('BEGIN');

    // Build update
    const updates = {};
    const activities = [];

    if (status && status !== current.status) {
      updates.status = status;
      activities.push({ action: 'status_change', old_value: current.status, new_value: status });
      
      if (['won', 'lost'].includes(status)) {
        updates.closed_at = new Date().toISOString();
      }
    }

    if (deal_value !== undefined && deal_value !== current.deal_value) {
      updates.deal_value = deal_value;
      activities.push({ action: 'value_updated', old_value: String(current.deal_value), new_value: String(deal_value) });
    }

    if (engagement && engagement !== current.engagement) {
      updates.engagement = engagement;
      activities.push({ action: 'engagement_updated', old_value: current.engagement, new_value: engagement });
    }

    if (assigned_to && assigned_to !== current.assigned_to) {
      updates.assigned_to = assigned_to;
      activities.push({ action: 'assigned', new_value: assigned_to });
    }

    if (notes) {
      activities.push({ action: 'note_added', new_value: notes });
    }

    // Apply updates
    if (Object.keys(updates).length > 0) {
      const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 2}`);
      const values = Object.values(updates);
      await client.query(
        `UPDATE referrals SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1`,
        [req.params.id, ...values]
      );
    }

    // Log activities
    for (const act of activities) {
      await client.query(
        `INSERT INTO referral_activities (referral_id, user_id, action, old_value, new_value, comment)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [req.params.id, req.user.id, act.action, act.old_value || null, act.new_value || null, act.comment || null]
      );
    }

    // Handle commission on deal won
    if (status === 'won' && deal_value > 0) {
      const { rows: [partner] } = await client.query(
        `SELECT p.id, p.commission_rate FROM partners p 
         JOIN referrals r ON r.partner_id = p.id 
         WHERE r.id = $1`,
        [req.params.id]
      );

      if (partner) {
        await client.query(
          `INSERT INTO commissions (referral_id, partner_id, amount, rate, deal_value)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (referral_id) DO UPDATE SET 
             amount = EXCLUDED.amount, deal_value = EXCLUDED.deal_value`,
          [req.params.id, partner.id, deal_value * partner.commission_rate / 100, partner.commission_rate, deal_value]
        );

        const { rows: [partnerUser] } = await client.query(
          `SELECT u.email, u.full_name FROM users u WHERE u.partner_id = $1 LIMIT 1`,
          [partner.id]
        );
        if (partnerUser) {
          await queueNotification(partnerUser.email, partnerUser.full_name, 'deal_won', {
            prospectName: current.prospect_name,
            dealValue: deal_value,
            commission: deal_value * partner.commission_rate / 100,
          });
        }
      }
    }

    // Notify partner of status changes
    if (status && status !== current.status) {
      const { rows: [partnerUser] } = await client.query(
        `SELECT u.email, u.full_name FROM users u 
         JOIN referrals r ON u.partner_id = r.partner_id
         WHERE r.id = $1 LIMIT 1`,
        [req.params.id]
      );
      if (partnerUser && status !== 'won') {
        await queueNotification(partnerUser.email, partnerUser.full_name, 'status_update', {
          prospectName: current.prospect_name,
          oldStatus: current.status,
          newStatus: status,
        });
      }
    }

    await client.query('COMMIT');

    // Return updated referral
    const { rows: [updated] } = await client.query(
      `SELECT r.*, p.name as partner_name, p.commission_rate FROM referrals r JOIN partners p ON r.partner_id = p.id WHERE r.id = $1`,
      [req.params.id]
    );

    res.json({ referral: updated });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// ─── Delete referral ───
// Partners can delete their own referrals (only if status is 'new')
// Admins can delete any referral
router.delete('/:id', async (req, res) => {
  const client = await getClient();
  try {
    // Get the referral
    const { rows: [referral] } = await query(
      'SELECT * FROM referrals WHERE id = $1', [req.params.id]
    );
    if (!referral) {
      return res.status(404).json({ error: 'Referral introuvable' });
    }

    // Authorization checks
    if (req.user.role === 'partner') {
      // Partner can only delete their own referrals
      if (referral.partner_id !== req.user.partnerId) {
        return res.status(403).json({ error: 'Accès interdit' });
      }
      // Partner can only delete referrals in 'new' status
      if (referral.status !== 'new') {
        return res.status(400).json({ error: 'Vous ne pouvez supprimer que les recommandations au statut "Nouveau". Contactez l\'admin pour les autres.' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Accès interdit' });
    }

    await client.query('BEGIN');

    // Delete related data
    await client.query('DELETE FROM referral_activities WHERE referral_id = $1', [req.params.id]);
    await client.query('DELETE FROM commissions WHERE referral_id = $1', [req.params.id]);
    await client.query('DELETE FROM referrals WHERE id = $1', [req.params.id]);

    await client.query('COMMIT');
    res.json({ message: 'Referral supprimé' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete referral error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

module.exports = router;
