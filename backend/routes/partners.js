const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { query, getClient } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { sendEmail, partnerAccessRevoked } = require('../services/emailService');
const router = express.Router();

// ─── Helper: notify every user linked to this partner ───────────────
// Best-effort: any email failure is logged but doesn't abort the flow.
async function notifyPartnerRevoked(partnerId, tenantId, partnerName) {
  try {
    const { rows: tRow } = await query('SELECT name FROM tenants WHERE id = $1', [tenantId || null]);
    const tenantName = tRow[0]?.name || null;
    const { rows: users } = await query(
      `SELECT DISTINCT u.email, u.full_name
         FROM users u
        WHERE u.partner_id = $1
           OR u.id IN (SELECT user_id FROM user_roles WHERE partner_id = $1)`,
      [partnerId]
    );
    for (const u of users) {
      if (!u.email) continue;
      const tpl = partnerAccessRevoked(u.full_name || partnerName || '', tenantName);
      sendEmail(u.email, tpl.subject, tpl.html).catch(e =>
        console.error('[partner-revoke email]', u.email, e.message)
      );
    }
  } catch (err) {
    console.error('[notifyPartnerRevoked]', err.message);
  }
}

router.use(authenticate);
router.use(tenantScope);

// ─── Update tenant social links (admin) ─────────────────────────────
// These links are displayed to partners next to each news feed program.
// Stored on the `partners` table per spec; we mirror the values across
// every active partner record in the tenant so any one can feed the
// GET /api/partner/program/:id/socials endpoint.
router.put('/social', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const {
      social_linkedin, social_twitter, social_facebook,
      social_instagram, social_youtube, social_website,
    } = req.body || {};
    await query(
      `UPDATE partners SET
         social_linkedin  = $1,
         social_twitter   = $2,
         social_facebook  = $3,
         social_instagram = $4,
         social_youtube   = $5,
         social_website   = $6
       WHERE tenant_id = $7`,
      [
        social_linkedin  ?? null,
        social_twitter   ?? null,
        social_facebook  ?? null,
        social_instagram ?? null,
        social_youtube   ?? null,
        social_website   ?? null,
        req.tenantId || null,
      ]
    );
    res.json({
      socials: {
        social_linkedin, social_twitter, social_facebook,
        social_instagram, social_youtube, social_website,
      },
    });
  } catch (err) {
    console.error('[partners PUT /social]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get current socials for admin's tenant ─────────────────────────
router.get('/social', authorize('admin', 'superadmin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT social_linkedin, social_twitter, social_facebook,
              social_instagram, social_youtube, social_website
         FROM partners
        WHERE tenant_id = $1 AND is_active = true
          AND (social_linkedin IS NOT NULL OR social_twitter IS NOT NULL
            OR social_facebook IS NOT NULL OR social_instagram IS NOT NULL
            OR social_youtube IS NOT NULL OR social_website IS NOT NULL)
        LIMIT 1`,
      [req.tenantId || null]
    );
    res.json({ socials: rows[0] || {} });
  } catch (err) {
    console.error('[partners GET /social]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ List partners âââ
router.get('/', async (req, res) => {
  try {
    const showAll = req.query.show === 'all';

    let where = [];
    let params = [];
    let i = 1;

    if (!showAll) {
      where.push('p.is_active = true');
    }

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await query(
      `SELECT p.*,
              COUNT(r.id) as total_referrals,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       ${whereClause}
       GROUP BY p.id
       ORDER BY p.is_active DESC, p.name`,
      params
    );
    res.json({ partners: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Get single partner âââ
router.get('/:id', async (req, res) => {
  try {
    let where = ['p.id = $1'];
    let params = [req.params.id];
    let i = 2;

    // Tenant isolation
    if (req.tenantId && !req.skipTenantFilter) {
      where.push(`p.tenant_id = $${i++}`);
      params.push(req.tenantId);
    }

    const { rows } = await query(
      `SELECT p.*,
              COUNT(r.id) as total_referrals,
              COUNT(CASE WHEN r.status = 'won' THEN 1 END) as won_deals,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value END), 0) as total_revenue,
              COALESCE(SUM(CASE WHEN r.status = 'won' THEN r.deal_value * p.commission_rate / 100 END), 0) as total_commission
       FROM partners p
       LEFT JOIN referrals r ON p.id = r.partner_id
       WHERE ${where.join(' AND ')}
       GROUP BY p.id`,
      params
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Create partner (admin only) âââ
router.post('/', authorize('admin'), [
  body('name').trim().notEmpty(),
  body('contact_name').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('commission_rate').isFloat({ min: 0, max: 50 }),
], async (req, res) => {
  const client = await getClient();
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, contact_name, email, phone, company_website, commission_rate } = req.body;

    // Plan partner-limit gate. Only blocks NEW additions — existing
    // partners above the limit keep working. -1 means unlimited (manual
    // DB override for early adopters / custom deals).
    if (req.tenantId) {
      const { rows: tr } = await query(
        'SELECT plan, plan_partner_limit FROM tenants WHERE id = $1',
        [req.tenantId]
      );
      const t = tr[0];
      const limit = t?.plan_partner_limit;
      if (t && limit != null && limit !== -1) {
        const { rows: cr } = await query(
          'SELECT COUNT(*)::int AS n FROM partners WHERE is_active = TRUE AND tenant_id = $1',
          [req.tenantId]
        );
        if ((cr[0]?.n || 0) >= limit) {
          const nextPlan = t.plan === 'starter' ? 'pro' : 'business';
          return res.status(403).json({
            error: 'partner_limit_reached',
            limit,
            plan: t.plan || 'starter',
            upgradeTo: nextPlan,
          });
        }
      }
    }

    await client.query('BEGIN');

    // If an archived partner with this email already exists, reactivate
    // them instead of returning 409 — deactivating never removed the
    // row (UNIQUE index on partners.email still holds it), so a fresh
    // INSERT would collide.
    const { rows: existing } = await client.query(
      'SELECT id, is_active, tenant_id FROM partners WHERE LOWER(email) = LOWER($1) LIMIT 1',
      [email]
    );

    let partner;
    let tempPassword;
    const reactivating = existing.length > 0 && existing[0].is_active === false;

    if (existing.length && existing[0].is_active) {
      // Genuine duplicate — real active partner with this email.
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Un partenaire avec cet email existe déjà' });
    }
    if (existing.length && existing[0].tenant_id && req.tenantId && existing[0].tenant_id !== req.tenantId) {
      // Email is tied to another tenant — don't poach.
      await client.query('ROLLBACK');
      return res.status(409).json({ error: 'Un partenaire avec cet email existe déjà' });
    }

    tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
    const hash = await bcrypt.hash(tempPassword, 12);

    if (reactivating) {
      const prev = existing[0];
      const { rows: [updated] } = await client.query(
        `UPDATE partners SET
           name = $2,
           contact_name = $3,
           phone = COALESCE($4, phone),
           company_website = COALESCE($5, company_website),
           commission_rate = $6,
           is_active = true,
           tenant_id = COALESCE(tenant_id, $7)
         WHERE id = $1
         RETURNING *`,
        [prev.id, name, contact_name, phone || null, company_website || null, commission_rate, req.tenantId || null]
      );
      partner = updated;

      // Restore the paired user (new password + must_change_password),
      // or create one if it was previously deleted.
      const { rowCount: userUpdated } = await client.query(
        `UPDATE users SET
           password_hash = $1,
           full_name = $2,
           role = 'partner',
           partner_id = $3,
           tenant_id = COALESCE(tenant_id, $4),
           is_active = true,
           must_change_password = true
         WHERE LOWER(email) = LOWER($5)`,
        [hash, contact_name, partner.id, req.tenantId || null, email]
      );
      if (!userUpdated) {
        await client.query(
          `INSERT INTO users (email, password_hash, full_name, role, partner_id, tenant_id, must_change_password)
           VALUES ($1, $2, $3, 'partner', $4, $5, true)`,
          [email, hash, contact_name, partner.id, req.tenantId || null]
        );
      }
      await client.query(
        'UPDATE user_roles SET is_active = true WHERE partner_id = $1',
        [partner.id]
      );
    } else {
      const { rows: [created] } = await client.query(
        `INSERT INTO partners (name, contact_name, email, phone, company_website, commission_rate, tenant_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [name, contact_name, email, phone, company_website, commission_rate, req.tenantId || null]
      );
      partner = created;
      await client.query(
        `INSERT INTO users (email, password_hash, full_name, role, partner_id, tenant_id, must_change_password)
         VALUES ($1, $2, $3, 'partner', $4, $5, true)`,
        [email, hash, contact_name, partner.id, req.tenantId || null]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ partner, tempPassword, reactivated: reactivating });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Un partenaire avec cet email existe dÃ©jÃ ' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// âââ Update partner (admin only) âââ
router.put('/:id', authorize('admin'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, company_website,
            commission_rate, is_active, iban, bic, account_holder } = req.body;

    // Tenant check
    let whereExtra = '';
    let params = [req.params.id, name, contact_name, email, phone,
                  company_website, commission_rate, is_active, iban, bic, account_holder];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra = ` AND tenant_id = $12`;
      params.push(req.tenantId);
    }

    const { rows: [partner] } = await query(
      `UPDATE partners SET
        name = COALESCE($2, name),
        contact_name = COALESCE($3, contact_name),
        email = COALESCE($4, email),
        phone = COALESCE($5, phone),
        company_website = COALESCE($6, company_website),
        commission_rate = COALESCE($7, commission_rate),
        is_active = COALESCE($8, is_active),
        iban = COALESCE($9, iban),
        bic = COALESCE($10, bic),
        account_holder = COALESCE($11, account_holder)
       WHERE id = $1${whereExtra}
       RETURNING *`,
      params
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Partner updates own IBAN âââ
router.put('/:id/iban', async (req, res) => {
  try {
    if (req.user.role === 'partner' && req.user.partnerId !== req.params.id) {
      return res.status(403).json({ error: 'AccÃ¨s interdit' });
    }
    if (req.user.role !== 'partner' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'AccÃ¨s interdit' });
    }

    const { iban, bic, account_holder } = req.body;
    if (iban) {
      const cleanIban = iban.replace(/\s/g, '').toUpperCase();
      if (cleanIban.length < 15 || cleanIban.length > 34) {
        return res.status(400).json({ error: 'Format IBAN invalide' });
      }
    }

    const { rows: [partner] } = await query(
      `UPDATE partners SET iban = $2, bic = $3, account_holder = $4
       WHERE id = $1 AND (tenant_id = $5 OR $5::uuid IS NULL)
       RETURNING id, iban, bic, account_holder`,
      [req.params.id, iban || null, bic || null, account_holder || null, req.tenantId || null]
    );

    if (!partner) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// âââ Archive / Restore partner âââ
router.put('/:id/archive', authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    let whereExtra = '';
    let params = [req.params.id];
    if (req.tenantId && !req.skipTenantFilter) {
      whereExtra = ' AND tenant_id = $2';
      params.push(req.tenantId);
    }

    await client.query('BEGIN');
    const { rows: [partner] } = await client.query(
      `UPDATE partners SET is_active = NOT is_active WHERE id = $1${whereExtra} RETURNING *`,
      params
    );
    if (!partner) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Partenaire introuvable' });
    }

    // Keep user_roles in sync so /me/spaces stops listing this space
    // for the partner user and /switch-space denies it. Existing active
    // JWTs will still work until they hit /auth/me (which re-checks
    // partners.is_active) or until the admin re-archives.
    await client.query(
      `UPDATE user_roles SET is_active = $1 WHERE partner_id = $2`,
      [partner.is_active, partner.id]
    );
    await client.query('COMMIT');

    // Fire-and-forget email on deactivation only (restore is silent).
    if (!partner.is_active) {
      notifyPartnerRevoked(partner.id, partner.tenant_id, partner.name);
    }
    res.json({ partner });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[partners archive]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// âââ Delete partner (admin only) âââ
router.delete('/:id', authorize('admin'), async (req, res) => {
  const client = await getClient();
  try {
    // Collect partner + linked users BEFORE we delete so we can email
    // them after the transaction commits.
    const { rows: pRow } = await client.query(
      'SELECT id, name, tenant_id FROM partners WHERE id = $1 AND (tenant_id = $2 OR $2::uuid IS NULL)',
      [req.params.id, req.tenantId || null]
    );
    const partner = pRow[0];

    await client.query('BEGIN');
    // Remove the user_roles mappings that point at this partner so
    // /me/spaces stops listing the deleted space and /switch-space
    // would refuse it. Any OTHER user_roles the user owns (admin of
    // another tenant, partner of another program, …) stay intact.
    await client.query('DELETE FROM user_roles WHERE partner_id = $1', [req.params.id]);

    // Find the users whose primary partner_id pointed at this partner.
    // We need to preserve their account if they still have any other
    // user_roles (multi-role case) — just null out their partner_id so
    // they can keep accessing their remaining spaces. Users who had no
    // other roles get their account deleted (single-program partner,
    // now revoked).
    const { rows: pUsers } = await client.query(
      'SELECT id FROM users WHERE partner_id = $1',
      [req.params.id]
    );
    for (const u of pUsers) {
      const { rows: [{ c }] } = await client.query(
        'SELECT COUNT(*)::int AS c FROM user_roles WHERE user_id = $1',
        [u.id]
      );
      if (c > 0) {
        // Keep the account — point them at their first remaining role
        // so tenant/partner/role stay consistent with an existing space.
        const { rows: [next] } = await client.query(
          `SELECT role, tenant_id, partner_id
             FROM user_roles
            WHERE user_id = $1
            ORDER BY is_active DESC, created_at ASC LIMIT 1`,
          [u.id]
        );
        await client.query(
          `UPDATE users SET role = $1, tenant_id = $2, partner_id = $3 WHERE id = $4`,
          [next.role, next.tenant_id, next.partner_id, u.id]
        );
      } else {
        // Pure partner of only this program — safe to remove the account.
        await client.query('DELETE FROM users WHERE id = $1', [u.id]);
      }
    }

    const { rowCount } = await client.query('DELETE FROM partners WHERE id = $1 AND (tenant_id = $2 OR $2::uuid IS NULL)', [req.params.id, req.tenantId || null]);
    await client.query('COMMIT');

    if (partner) notifyPartnerRevoked(partner.id, partner.tenant_id, partner.name);

    if (rowCount === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ message: 'Partenaire supprimÃ©' });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Impossible de supprimer : ce partenaire a des referrals. Archivez-le plutÃ´t.' });
    }
    res.status(500).json({ error: 'Erreur serveur' });
  } finally {
    client.release();
  }
});

// âââ Get partner's own profile âââ
router.get('/me/profile', async (req, res) => {
  try {
    if (!req.user.partnerId) {
      return res.status(400).json({ error: 'Pas un partenaire' });
    }

    const { rows } = await query(
      `SELECT id, name, contact_name, email, phone, company_website,
              commission_rate, iban, bic, account_holder
       FROM partners WHERE id = $1`,
      [req.user.partnerId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Partenaire introuvable' });
    res.json({ partner: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
