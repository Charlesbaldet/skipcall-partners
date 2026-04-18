const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog, recordLoginAttempt, isAccountLocked, validatePassword } = require('../middleware/security');

const router = express.Router();

// ─── Login (ISO 27001 A.9.4 - brute force protection) ───
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const { email, password } = req.body;
    const ip = req.ip || req.connection?.remoteAddress;

    // Check if account is locked
    const locked = await isAccountLocked(email);
    if (locked) {
      auditLog(req, 'login_blocked_locked', 'user', null, { email });
      return res.status(423).json({ error: 'Compte temporairement verrouillé suite à trop de tentatives. Réessayez dans 30 minutes.' });
    }

    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.partner_id, u.is_active, u.tenant_id, u.must_change_password,
              p.name as partner_name
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.email = $1`,
      [email]
    );

    if (rows.length === 0) {
      await recordLoginAttempt(email, ip, false);
      auditLog(req, 'login_failed', 'user', null, { email, reason: 'unknown_email' });
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    const user = rows[0];

    if (!user.is_active) {
      auditLog(req, 'login_blocked_inactive', 'user', user.id, { email });
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      await recordLoginAttempt(email, ip, false);
      auditLog(req, 'login_failed', 'user', user.id, { email, reason: 'wrong_password' });
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Success — reset failed attempts
    await recordLoginAttempt(email, ip, true);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, partnerId: user.partner_id, fullName: user.full_name, tenantId: user.tenant_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    auditLog(req, 'login_success', 'user', user.id, { email });

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, partnerId: user.partner_id, partnerName: user.partner_name, mustChangePassword: user.must_change_password || false },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Google SSO ──────────────────────────────────────────────────────
// POST /auth/google { access_token } — the frontend runs the OAuth2
// implicit flow (popup → Google → redirects back with #access_token=…)
// and POSTs the resulting bearer token here. We validate it by calling
// Google's userinfo endpoint (the 200 response proves the token is
// valid, unexpired, and issued to one of our scopes). We do NOT
// verify the token's audience like we would with an ID token — that
// ship sails the moment a popup-flow access token hits our backend —
// but the subsequent DB lookup constrains access to emails we already
// know, and the token stays server-side beyond this single call.
router.post('/google', async (req, res) => {
  try {
    const { access_token } = req.body || {};
    if (!access_token) return res.status(400).json({ error: 'access_token manquant' });

    let payload;
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!resp.ok) {
        auditLog(req, 'google_login_invalid_token', 'user', null, { status: resp.status });
        return res.status(401).json({ error: 'Token Google invalide' });
      }
      payload = await resp.json();
    } catch (err) {
      auditLog(req, 'google_login_invalid_token', 'user', null, { err: err.message });
      return res.status(401).json({ error: 'Token Google invalide' });
    }

    const email = (payload.email || '').toLowerCase();
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!email || !emailVerified) {
      return res.status(401).json({ error: 'Email Google non vérifié' });
    }

    // Find the user by email (case-insensitive).
    const { rows } = await query(
      `SELECT u.id, u.email, u.password_hash, u.full_name, u.role, u.partner_id,
              u.is_active, u.tenant_id, u.must_change_password, u.avatar_url,
              p.name AS partner_name
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id
       WHERE LOWER(u.email) = LOWER($1)
       LIMIT 1`,
      [email]
    );
    const user = rows[0];
    if (!user) {
      // Intentionally 200 with `needsSignup: true` — our api.request
      // throws on non-2xx, which would strip the email/name the
      // frontend needs to pre-fill the signup form.
      return res.json({
        needsSignup: true,
        email,
        name: payload.name || null,
        picture: payload.picture || null,
      });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte désactivé' });
    }

    // Opportunistically save the Google avatar if we don't have one.
    if (!user.avatar_url && payload.picture) {
      try {
        await query('UPDATE users SET avatar_url = $1 WHERE id = $2', [payload.picture, user.id]);
        user.avatar_url = payload.picture;
      } catch { /* avatar_url column may not exist yet — ignore */ }
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, partnerId: user.partner_id, fullName: user.full_name, tenantId: user.tenant_id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    auditLog(req, 'google_login_success', 'user', user.id, { email });

    res.json({
      token,
      user: {
        id: user.id, email: user.email, fullName: user.full_name,
        role: user.role, partnerId: user.partner_id, partnerName: user.partner_name,
        mustChangePassword: user.must_change_password || false,
        avatarUrl: user.avatar_url || null,
      },
    });
  } catch (err) {
    console.error('[google sso]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Get current user profile ───
// Response shape MUST match POST /auth/login so useAuth can overwrite
// the stored user on page reload without dropping any fields. Return
// camelCase (partnerId, not partner_id).
//
// Multi-role (Phase B) handling: a user may have `role='partner'` on
// the users row but `partner_id IS NULL` — either because a prior
// /switch-space passed no partnerId, or the matching user_roles row
// itself lacks it. In that case we resolve the correct partnerId by:
//   1) looking at user_roles for this (user, tenant, role=partner)
//   2) falling back to partners rows matched by email+tenant
// Without this, referrals submission fails with "Partner ID requis"
// after space switching even though the partner record exists.
router.get('/me', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.partner_id, u.tenant_id, u.must_change_password,
              p.name as partner_name, p.commission_rate
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id WHERE u.id = $1`,
      [req.user.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const u = rows[0];

    let partnerId = u.partner_id;
    let partnerName = u.partner_name;
    let commissionRate = u.commission_rate;

    if (u.role === 'partner' && !partnerId) {
      // 1. Resolve via user_roles (canonical source of truth for spaces).
      const { rows: ur } = await query(
        `SELECT ur.partner_id, p.name AS partner_name, p.commission_rate
           FROM user_roles ur
           LEFT JOIN partners p ON p.id = ur.partner_id
          WHERE ur.user_id = $1 AND ur.role = 'partner'
            AND ($2::uuid IS NULL OR ur.tenant_id = $2)
            AND ur.is_active = TRUE AND ur.partner_id IS NOT NULL
          ORDER BY ur.created_at DESC
          LIMIT 1`,
        [u.id, u.tenant_id || null]
      );
      if (ur.length) {
        partnerId = ur[0].partner_id;
        partnerName = ur[0].partner_name;
        commissionRate = ur[0].commission_rate;
      } else {
        // 2. Fallback — find an active partner record by email in the tenant.
        const { rows: pr } = await query(
          `SELECT id AS partner_id, name AS partner_name, commission_rate
             FROM partners
            WHERE LOWER(email) = LOWER($1) AND is_active = TRUE
              AND ($2::uuid IS NULL OR tenant_id = $2)
            ORDER BY created_at DESC
            LIMIT 1`,
          [u.email, u.tenant_id || null]
        );
        if (pr.length) {
          partnerId = pr[0].partner_id;
          partnerName = pr[0].partner_name;
          commissionRate = pr[0].commission_rate;
          // Self-heal: persist so subsequent requests skip this fallback.
          await query('UPDATE users SET partner_id = $1 WHERE id = $2', [partnerId, u.id]);
        }
      }
    }

    // Access revoked check — if this is a partner session but no active
    // partner record exists (admin archived/deleted), sign them out. The
    // frontend's 401 handler redirects to /login; the ?revoked=1 param
    // tells the login page to show the "access revoked" banner.
    if (u.role === 'partner') {
      let stillActive = false;
      if (partnerId) {
        const { rows: pa } = await query(
          'SELECT is_active FROM partners WHERE id = $1',
          [partnerId]
        );
        stillActive = pa.length && pa[0].is_active === true;
      }
      if (!stillActive) {
        return res.status(401).json({ error: 'access_revoked', revoked: true });
      }
    }

    res.json({
      user: {
        id: u.id,
        email: u.email,
        fullName: u.full_name,
        role: u.role,
        partnerId,
        partnerName,
        tenantId: u.tenant_id,
        commissionRate,
        mustChangePassword: u.must_change_password || false,
      },
    });
  } catch (err) {
    console.error('[GET /me] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Change password (ISO 27001 A.9.4 - password policy) ───
router.put('/password', authenticate, [
  body('currentPassword').notEmpty(),
  body('newPassword').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: 'Données manquantes' });

    const { currentPassword, newPassword } = req.body;

    // Validate password policy
    const policy = validatePassword(newPassword);
    if (!policy.valid) return res.status(400).json({ error: policy.errors.join('. ') });

    const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [req.user.id]);
    const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!valid) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });

    // Check password history (don't reuse last 3)
    try {
      const { rows: history } = await query(
        'SELECT password_hash FROM password_history WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
        [req.user.id]
      );
      for (const h of history) {
        if (await bcrypt.compare(newPassword, h.password_hash)) {
          return res.status(400).json({ error: 'Ce mot de passe a déjà été utilisé récemment' });
        }
      }
    } catch {} // password_history table may not exist yet

    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW() WHERE id = $2', [hash, req.user.id]);

    // Save to password history
    try { await query('INSERT INTO password_history (user_id, password_hash) VALUES ($1, $2)', [req.user.id, hash]); } catch {}

    auditLog(req, 'password_changed', 'user', req.user.id);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Validate invitation token ───
router.get('/invitation/:token', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email, full_name, role, expires_at, accepted_at FROM user_invitations WHERE token = $1',
      [req.params.token]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Invitation introuvable' });
    if (rows[0].accepted_at) return res.status(400).json({ error: 'Invitation déjà utilisée' });
    if (new Date(rows[0].expires_at) < new Date()) return res.status(400).json({ error: 'Invitation expirée' });
    res.json({ invitation: { email: rows[0].email, fullName: rows[0].full_name, role: rows[0].role } });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// ─── Setup password from invitation (with password policy) ───
router.post('/setup-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });

    const policy = validatePassword(password);
    if (!policy.valid) return res.status(400).json({ error: policy.errors.join('. ') });

    const { rows } = await query('SELECT * FROM user_invitations WHERE token = $1', [token]);
    if (rows.length === 0) return res.status(404).json({ error: 'Invitation introuvable' });
    const inv = rows[0];
    if (inv.accepted_at) return res.status(400).json({ error: 'Invitation déjà utilisée' });
    if (new Date(inv.expires_at) < new Date()) return res.status(400).json({ error: 'Invitation expirée' });

    const hash = await bcrypt.hash(password, 12);
    await query(
      'INSERT INTO users (email, password_hash, full_name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (email) DO UPDATE SET password_hash = $2, role = $4, is_active = true',
      [inv.email, hash, inv.full_name, inv.role]
    );
    await query('UPDATE user_invitations SET accepted_at = NOW() WHERE id = $1', [inv.id]);

    auditLog(req, 'account_setup', 'user', null, { email: inv.email });
    res.json({ message: 'Compte créé avec succès' });
  } catch (err) {
    console.error('Setup password error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// ─── SIGNUP - Create new tenant + admin user ───
router.post('/signup', [
  body('company').trim().notEmpty(),
  body('fullName').trim().notEmpty(),
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 10 }),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const { company, fullName, email, password, phone } = req.body;
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
      return res.status(400).json({ error: 'Mot de passe: majuscule, minuscule, chiffre et caractere special requis.' });
    }
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Un compte avec cet email existe deja.' });
    const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    const { rows: [tenant] } = await query(
      "INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color) VALUES ($1, $2, '#6366f1', '#0f172a', '#f97316') RETURNING id",
      [company, slug]
    );
    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await query(
      "INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES ($1, $2, $3, 'admin', $4) RETURNING id, email, full_name, role, tenant_id",
      [email, hash, fullName, tenant.id]
    );
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenantId: tenant.id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    try { await query("INSERT INTO audit_logs (user_id, tenant_id, action, resource_type, resource_id, details) VALUES ($1, $2, 'signup', 'tenant', $3, $4)", [user.id, tenant.id, tenant.id, JSON.stringify({ company, email })]); } catch(e) {}
    res.status(201).json({ token, user: { id: user.id, email: user.email, fullName: user.full_name, role: user.role, tenantId: tenant.id } });
  } catch (err) { console.error('Signup error:', err); res.status(500).json({ error: 'Erreur lors de la creation du compte.' }); }
});

// ─── SIGNUP via Google (no password — verify access_token, create tenant+user) ───
// The frontend flow: Google OAuth2 redirect → /login picks up the access
// token → backend /auth/google returns { needsSignup: true } → frontend
// forwards to /signup with google_email/name/avatar + keeps access_token
// in sessionStorage → user fills company + phone → POST here with the
// access_token so we can re-verify the Google identity server-side and
// ensure nobody can spoof an email that doesn't match their OAuth session.
router.post('/signup-google', [
  body('company').trim().notEmpty(),
  body('fullName').trim().notEmpty(),
  body('access_token').notEmpty(),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ error: errors.array()[0].msg });
    const { company, fullName, phone, access_token } = req.body;

    // Re-verify the Google access token and extract the canonical email.
    let payload;
    try {
      const resp = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (!resp.ok) return res.status(401).json({ error: 'Token Google invalide' });
      payload = await resp.json();
    } catch {
      return res.status(401).json({ error: 'Token Google invalide' });
    }

    const email = (payload.email || '').toLowerCase();
    const emailVerified = payload.email_verified === true || payload.email_verified === 'true';
    if (!email || !emailVerified) return res.status(401).json({ error: 'Email Google non vérifié' });

    const { rows: existing } = await query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Un compte avec cet email existe deja.' });

    const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    const { rows: [tenant] } = await query(
      "INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color) VALUES ($1, $2, '#6366f1', '#0f172a', '#f97316') RETURNING id",
      [company, slug]
    );

    // Random placeholder password — the user will only ever log in via Google.
    // Keeps the NOT NULL constraint satisfied without creating a usable credential.
    const placeholder = require('crypto').randomBytes(32).toString('hex');
    const hash = await bcrypt.hash(placeholder, 12);

    let user;
    try {
      // Try inserting with avatar_url; fall back if the column doesn't exist yet.
      const r = await query(
        "INSERT INTO users (email, password_hash, full_name, role, tenant_id, avatar_url) VALUES ($1, $2, $3, 'admin', $4, $5) RETURNING id, email, full_name, role, tenant_id",
        [email, hash, fullName, tenant.id, payload.picture || null]
      );
      user = r.rows[0];
    } catch {
      const r = await query(
        "INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES ($1, $2, $3, 'admin', $4) RETURNING id, email, full_name, role, tenant_id",
        [email, hash, fullName, tenant.id]
      );
      user = r.rows[0];
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: tenant.id, fullName: user.full_name },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    try { await query("INSERT INTO audit_logs (user_id, tenant_id, action, resource_type, resource_id, details) VALUES ($1, $2, 'signup_google', 'tenant', $3, $4)", [user.id, tenant.id, tenant.id, JSON.stringify({ company, email })]); } catch {}

    res.status(201).json({
      token,
      user: {
        id: user.id, email: user.email, fullName: user.full_name,
        role: user.role, tenantId: tenant.id,
        avatarUrl: payload.picture || null,
      },
    });
  } catch (err) {
    console.error('Signup-google error:', err);
    res.status(500).json({ error: 'Erreur lors de la creation du compte.' });
  }
});

// ─── Change password (1ère connexion — JWT requis) ───
router.post('/change-password', authenticate, async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ error: 'Paramètres manquants' });
    const policy = validatePassword(newPassword);
    if (!policy.valid) return res.status(400).json({ error: policy.errors.join('. ') });
    const hash = await bcrypt.hash(newPassword, 12);
    await query('UPDATE users SET password_hash = $1, must_change_password = false WHERE id = $2', [hash, req.user.id]);
    auditLog(req, 'password_changed_first_login', 'user', req.user.id);
    res.json({ message: 'Mot de passe mis à jour' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// ─── Forgot password ───
router.post('/forgot-password', [
  body('email').isEmail().normalizeEmail(),
], async (req, res) => {
  // Always return 200 to avoid email enumeration
  res.json({ message: 'Si un compte existe, un email de réinitialisation a été envoyé.' });

  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return;

    const { email } = req.body;
    const { rows } = await query('SELECT id, full_name FROM users WHERE email = $1 AND is_active = true', [email]);
    if (rows.length === 0) return;

    const user = rows[0];
    const crypto = require('crypto');
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1h

    // Invalider les anciens tokens non utilisés
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE user_id = $1 AND used_at IS NULL', [user.id]);

    // Stocker le nouveau token
    await query(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
    );

    const resetUrl = `${process.env.FRONTEND_URL || 'https://refboost.io'}/reset-password?token=${token}`;
    const resend = require('../services/resend');

    const html = `
      <div style="font-family:system-ui,sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;">
        <div style="text-align:center;margin-bottom:32px;">
          <div style="display:inline-flex;align-items:center;gap:8px;background:#f0fdf4;padding:12px 20px;border-radius:12px;">
            <span style="font-size:22px;font-weight:800;color:#0f172a;">Ref<span style="color:#059669;">Boost</span></span>
          </div>
        </div>
        <h2 style="font-size:22px;font-weight:700;color:#0f172a;margin:0 0 8px;">Réinitialisation de mot de passe</h2>
        <p style="color:#64748b;margin:0 0 24px;">Bonjour ${user.full_name},</p>
        <p style="color:#334155;margin:0 0 24px;">Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${resetUrl}" style="display:inline-block;padding:14px 32px;background:#059669;color:#fff;border-radius:12px;text-decoration:none;font-weight:700;font-size:16px;">
            Réinitialiser mon mot de passe
          </a>
        </div>
        <p style="color:#94a3b8;font-size:13px;margin:0 0 8px;">Ce lien expire dans <strong>1 heure</strong>.</p>
        <p style="color:#94a3b8;font-size:13px;margin:0;">Si vous n'avez pas demandé cette réinitialisation, ignorez simplement cet email — votre mot de passe restera inchangé.</p>
        <hr style="border:none;border-top:1px solid #f1f5f9;margin:24px 0;"/>
        <p style="color:#cbd5e1;font-size:12px;text-align:center;">RefBoost · notifications@refboost.io</p>
      </div>
    `;

    await resend.sendEmail({
      to: email,
      subject: 'Réinitialisation de votre mot de passe RefBoost',
      html,
      text: `Bonjour ${user.full_name}, cliquez sur ce lien pour réinitialiser votre mot de passe (valide 1h) : ${resetUrl}`,
    });
  } catch (err) {
    console.error('[forgot-password] error:', err.message);
  }
});

// ─── Reset password (via token email) ───
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token et mot de passe requis' });

    const policy = validatePassword(password);
    if (!policy.valid) return res.status(400).json({ error: policy.errors.join('. ') });

    const { rows } = await query(
      `SELECT prt.id, prt.user_id, prt.expires_at, prt.used_at
       FROM password_reset_tokens prt
       WHERE prt.token = $1`,
      [token]
    );

    if (rows.length === 0) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    const resetToken = rows[0];

    if (resetToken.used_at) return res.status(400).json({ error: 'Ce lien a déjà été utilisé' });
    if (new Date(resetToken.expires_at) < new Date()) return res.status(400).json({ error: 'Lien expiré — demandez un nouveau' });

    const hash = await bcrypt.hash(password, 12);
    await query('UPDATE users SET password_hash = $1, password_changed_at = NOW(), must_change_password = false WHERE id = $2', [hash, resetToken.user_id]);
    await query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1', [resetToken.id]);

    auditLog({ ip: null, headers: {} }, 'password_reset', 'user', resetToken.user_id);
    res.json({ message: 'Mot de passe mis à jour avec succès' });
  } catch (err) {
    console.error('[reset-password] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});


// Phase B: Multi-role space switcher
router.get('/me/spaces', authenticate, async (req, res) => {
  try {
    // Filter out:
    //   * user_roles marked inactive (the normal archive path)
    //   * partner spaces where the backing partners row is either
    //     missing (hard-deleted) or is_active=false. This is a belt-
    //     and-suspenders check for any code path that flips
    //     partners.is_active without cascading to user_roles.
    const { rows } = await query(
      `SELECT
         ur.id, ur.tenant_id, ur.role, ur.partner_id, ur.is_active,
         t.name AS tenant_name,
         p.name AS partner_name
       FROM user_roles ur
       LEFT JOIN tenants t ON t.id = ur.tenant_id
       LEFT JOIN partners p ON p.id = ur.partner_id
       WHERE ur.user_id = $1
         AND ur.is_active = TRUE
         AND (
           ur.role <> 'partner'
           OR (p.id IS NOT NULL AND p.is_active = TRUE)
         )
       ORDER BY ur.created_at ASC`,
      [req.user.id]
    );
    res.json({ spaces: rows });
  } catch (err) {
    console.error('[GET /me/spaces] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/switch-space',
  authenticate,
  [
    body('tenantId').isUUID(),
    body('role').isIn(['admin', 'commercial', 'partner']),
    body('partnerId').optional({ nullable: true }).isUUID()
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

      const { tenantId, role, partnerId } = req.body;

      // Mirror the /me/spaces filter: for partner spaces also require
      // that the partners row is alive and active, so admins flipping
      // partners.is_active even out-of-band can't be bypassed by the
      // switcher.
      const { rows } = await query(
        `SELECT ur.id
           FROM user_roles ur
           LEFT JOIN partners p ON p.id = ur.partner_id
          WHERE ur.user_id = $1 AND ur.tenant_id = $2 AND ur.role = $3
            AND ($4::uuid IS NULL OR ur.partner_id = $4)
            AND ur.is_active = TRUE
            AND (
              ur.role <> 'partner'
              OR (p.id IS NOT NULL AND p.is_active = TRUE)
            )
          LIMIT 1`,
        [req.user.id, tenantId, role, partnerId || null]
      );
      if (rows.length === 0) {
        return res.status(403).json({ error: "Vous n'avez pas ce role sur cet espace" });
      }

      // Persist the switch in the users table so /me and any DB-reading endpoint see the new active space
      await query(
        'UPDATE users SET role = $1, tenant_id = $2, partner_id = $3, updated_at = NOW() WHERE id = $4',
        [role, tenantId, partnerId || null, req.user.id]
      );

      const userRes = await query('SELECT id, email, full_name FROM users WHERE id = $1', [req.user.id]);
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          role,
          partnerId: partnerId || null,
          fullName: user.full_name,
          tenantId
        },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role,
          partner_id: partnerId || null,
          tenant_id: tenantId
        }
      });
    } catch (err) {
      console.error('[POST /switch-space] error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

module.exports = router;
