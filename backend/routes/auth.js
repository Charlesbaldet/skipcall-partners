const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cryptoRandom = require('crypto');
const { body, validationResult } = require('express-validator');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { auditLog, recordLoginAttempt, isAccountLocked, validatePassword: legacyValidatePassword } = require('../middleware/security');
const { validatePassword: strictValidatePassword } = require('../utils/passwordPolicy');
const { encrypt, decrypt } = require('../utils/crypto');
const { logAudit } = require('../services/auditLog');

// Compose policy: legacy length/chars rules (FR strings) + the new
// strict policy (i18n keys, common-passwords blocklist). Both must
// pass; errors from each are merged so the caller sees the union.
function validatePassword(pwd) {
  const a = legacyValidatePassword(pwd);
  const b = strictValidatePassword(pwd);
  return {
    valid: a.valid && b.valid,
    errors: [...(a.errors || []), ...(b.errors || [])],
  };
}

const router = express.Router();

// /me/spaces reads from user_roles, so a user only appears in the
// space-switcher dropdown for tenants that have a row there. Both the
// legacy users.tenant_id column and user_roles must agree, otherwise a
// user who signed up before this row was written can land on a tenant
// (e.g. via /auth/login or /auth/google → users.tenant_id) that they
// can never switch back to once they leave it. This helper makes the
// (user, tenant, role) triplet idempotently present and active.
async function ensureUserRoleEntry(userId, tenantId, role, partnerId) {
  if (!userId || !tenantId || !role) return;
  if (!['admin', 'commercial', 'partner'].includes(role)) return;
  try {
    await query(
      `INSERT INTO user_roles (user_id, tenant_id, role, partner_id, is_active)
       VALUES ($1, $2, $3, $4, TRUE)
       ON CONFLICT (user_id, role, tenant_id)
       DO UPDATE SET is_active = TRUE,
                     partner_id = COALESCE(EXCLUDED.partner_id, user_roles.partner_id)`,
      [userId, tenantId, role, partnerId || null]
    );
  } catch (e) {
    // user_roles may not exist on very old deployments — non-fatal.
    console.error('[ensureUserRoleEntry]', e.message);
  }
}

// All active workspaces a user belongs to. Mirrors the filter used by
// /me/spaces (rejects inactive partner rows so admins flipping
// partners.is_active out-of-band can't be bypassed). Returned in
// stable creation order so the "first space" we auto-pick is
// deterministic.
async function listUserSpaces(userId) {
  const { rows } = await query(
    `SELECT
       ur.id, ur.tenant_id, ur.role, ur.partner_id, ur.is_active,
       t.name AS tenant_name, t.slug AS tenant_slug,
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
    [userId]
  );
  return rows;
}

// Pick the space we should bind a fresh JWT to:
//   * 0 spaces → null (caller falls through to legacy users.tenant_id)
//   * 1 space  → that one
//   * 2+       → if users.tenant_id matches one, "last-used wins"; else null
//                (caller surfaces requiresSpaceSelection so the user picks)
function pickInitialSpace(spaces, lastTenantId) {
  if (!Array.isArray(spaces) || spaces.length === 0) return null;
  if (spaces.length === 1) return spaces[0];
  if (lastTenantId) {
    const match = spaces.find(s => s.tenant_id === lastTenantId);
    if (match) return match;
  }
  return null;
}

// Build the post-login JSON. Always includes the spaces list so the
// frontend can render a switcher; sets requiresSpaceSelection when the
// caller couldn't disambiguate.
function buildLoginResponse({ user, space, spaces, token, requiresSpaceSelection = false }) {
  const tenantId = space?.tenant_id || user.tenant_id || null;
  const tenantName = space?.tenant_name || null;
  const tenantSlug = space?.tenant_slug || null;
  const role = space?.role || user.role;
  const partnerId = (space && 'partner_id' in space) ? (space.partner_id || null) : (user.partner_id || null);
  const partnerName = space?.partner_name || user.partner_name || null;
  return {
    token,
    requiresSpaceSelection,
    spaces,
    user: {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role,
      partnerId,
      partnerName,
      tenantId,
      tenantName,
      tenantSlug,
      mustChangePassword: user.must_change_password || false,
      avatarUrl: user.avatar_url || null,
    },
  };
}

// Sign a normal session JWT bound to a specific (user, tenant, role).
// token_version is embedded so the authenticate middleware can detect
// "sign out everywhere" — bumping users.token_version invalidates
// every outstanding JWT without server-side session storage.
function signSessionToken({ user, tenantId, role, partnerId }) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: role || user.role,
      partnerId: partnerId ?? user.partner_id ?? null,
      fullName: user.full_name,
      tenantId,
      token_version: user.token_version || 0,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

// Short-lived JWT for the in-between state where the user has been
// authenticated but hasn't picked a workspace yet. It carries no
// tenantId, so any tenant-scoped endpoint will refuse it; the only
// thing it's good for is hitting /auth/me/spaces and /auth/switch-space.
function signPendingSelectionToken(user) {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      pendingSpaceSelection: true,
    },
    process.env.JWT_SECRET,
    { expiresIn: '15m' }
  );
}

// Persist users.tenant_id (and role/partner_id) to whichever space the
// user is now landing in. This is what makes the next login default
// back to the same workspace instead of springing the picker again.
async function persistActiveSpace(userId, space) {
  if (!space || !space.tenant_id) return;
  try {
    await query(
      `UPDATE users
          SET tenant_id = $2,
              role = $3,
              partner_id = $4,
              updated_at = NOW()
        WHERE id = $1`,
      [userId, space.tenant_id, space.role, space.partner_id || null]
    );
  } catch (e) {
    console.error('[persistActiveSpace]', e.message);
  }
}

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
              u.mfa_enabled,
              COALESCE(u.token_version, 0) AS token_version,
              p.name as partner_name
       FROM users u LEFT JOIN partners p ON u.partner_id = p.id
       WHERE u.email = $1`,
      [email]
    );

    if (rows.length === 0) {
      await recordLoginAttempt(email, ip, false);
      auditLog(req, 'login_failed', 'user', null, { email, reason: 'unknown_email' });
      // Synthetic req for the new SOC 2 audit log — no req.user yet
      // because the email was unknown.
      logAudit(
        { ip: req.ip, headers: req.headers, user: null, tenantId: null },
        'auth.login_failed', 'user', null,
        { email, ip: req.ip, userAgent: req.headers['user-agent'], reason: 'unknown_email' }
      );
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
      logAudit(
        { ip: req.ip, headers: req.headers, user: { id: user.id, tenantId: user.tenant_id }, tenantId: user.tenant_id },
        'auth.login_failed', 'user', user.id,
        { email, ip: req.ip, userAgent: req.headers['user-agent'], reason: 'wrong_password' }
      );
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    // Success — reset failed attempts
    await recordLoginAttempt(email, ip, true);

    // MFA gate: when the user has enrolled a TOTP secret we never
    // hand out a fully-scoped session JWT here. Instead we issue a
    // short-lived (5-min) "mfa_pending" token that only /auth/mfa/
    // validate accepts. The full JWT — with tenantId, role, etc. —
    // is signed only after the second factor checks out.
    if (user.mfa_enabled) {
      const mfaToken = jwt.sign(
        { sub: user.id, mfa_pending: true },
        process.env.JWT_SECRET,
        { expiresIn: '5m' }
      );
      auditLog(req, 'login_mfa_required', 'user', user.id, { email });
      return res.json({ mfa_required: true, mfa_token: mfaToken });
    }

    // Self-heal: legacy users created before user_roles existed (or via
    // signup paths that never wrote to it) can otherwise lose their
    // primary tenant from the space-switcher.
    await ensureUserRoleEntry(user.id, user.tenant_id, user.role, user.partner_id);

    // Multi-tenant disambiguation. Source of truth = user_roles (the
    // legacy users.tenant_id column can lag behind when an admin adds
    // a second tenant role through the team UI without flipping the
    // primary one). For multi-space users we either re-use the
    // last-used tenant (so a refresh stays put) or surface
    // requiresSpaceSelection so the frontend opens the picker modal.
    const spaces = await listUserSpaces(user.id);
    const space = pickInitialSpace(spaces, user.tenant_id);

    auditLog(req, 'login_success', 'user', user.id, { email, spaces: spaces.length });

    if (!space && spaces.length > 1) {
      const tempToken = signPendingSelectionToken(user);
      return res.json({
        token: tempToken,
        requiresSpaceSelection: true,
        spaces,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          mustChangePassword: user.must_change_password || false,
        },
      });
    }

    // Single-space (or last-used match): persist the chosen tenant so
    // users.tenant_id stays in sync with what's actually being used.
    if (space) await persistActiveSpace(user.id, space);

    const tenantId = space?.tenant_id || user.tenant_id;
    const token = signSessionToken({
      user,
      tenantId,
      role: space?.role || user.role,
      partnerId: space ? (space.partner_id || null) : user.partner_id,
    });
    logAudit(
      { ip: req.ip, headers: req.headers, user: { id: user.id, tenantId, email: user.email }, tenantId },
      'auth.login', 'user', user.id,
      { ip: req.ip, userAgent: req.headers['user-agent'], method: 'password' }
    );
    res.json(buildLoginResponse({ user, space, spaces, token }));
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
              COALESCE(u.token_version, 0) AS token_version,
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

    // Self-heal: same reason as /auth/login. Without this, a user who
    // signed up via Google (which never wrote user_roles for the tenant
    // it created) can never return to that tenant from the switcher.
    await ensureUserRoleEntry(user.id, user.tenant_id, user.role, user.partner_id);

    const spaces = await listUserSpaces(user.id);
    const space = pickInitialSpace(spaces, user.tenant_id);

    auditLog(req, 'google_login_success', 'user', user.id, { email, spaces: spaces.length });

    if (!space && spaces.length > 1) {
      const tempToken = signPendingSelectionToken(user);
      return res.json({
        token: tempToken,
        requiresSpaceSelection: true,
        spaces,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          avatarUrl: user.avatar_url || null,
          mustChangePassword: user.must_change_password || false,
        },
      });
    }

    if (space) await persistActiveSpace(user.id, space);

    const tenantId = space?.tenant_id || user.tenant_id;
    const token = signSessionToken({
      user,
      tenantId,
      role: space?.role || user.role,
      partnerId: space ? (space.partner_id || null) : user.partner_id,
    });
    logAudit(
      { ip: req.ip, headers: req.headers, user: { id: user.id, tenantId, email: user.email }, tenantId },
      'auth.login', 'user', user.id,
      { ip: req.ip, userAgent: req.headers['user-agent'], method: 'google' }
    );
    res.json(buildLoginResponse({ user, space, spaces, token }));
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
              p.name as partner_name, p.commission_rate,
              t.name as tenant_name, t.slug as tenant_slug
       FROM users u
       LEFT JOIN partners p ON u.partner_id = p.id
       LEFT JOIN tenants t ON u.tenant_id = t.id
       WHERE u.id = $1`,
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
        tenantName: u.tenant_name || null,
        tenantSlug: u.tenant_slug || null,
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
    const signupPolicy = validatePassword(password);
    if (!signupPolicy.valid) return res.status(400).json({ error: signupPolicy.errors.join('. ') });
    const { rows: existing } = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) return res.status(409).json({ error: 'Un compte avec cet email existe deja.' });
    const slug = company.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') + '-' + Date.now().toString(36);
    const { rows: [tenant] } = await query(
      "INSERT INTO tenants (name, slug, primary_color, secondary_color, accent_color) VALUES ($1, $2, '#6366f1', '#0f172a', '#f97316') RETURNING id",
      [company, slug]
    );
    // Seed the 6 default pipeline stages so the tenant's Kanban has
    // working columns out of the box. Lazy-imported to avoid a
    // circular-ish require at module load.
    try {
      const { ensureDefaultStages } = require('./pipeline-stages');
      await ensureDefaultStages(tenant.id);
    } catch (e) { console.error('[signup.stages]', e.message); }
    try {
      const { seedDefaultCategories } = require('../services/partnerCategoriesSeed');
      await seedDefaultCategories(tenant.id);
    } catch (e) { console.error('[signup.categories]', e.message); }
    const hash = await bcrypt.hash(password, 12);
    const { rows: [user] } = await query(
      "INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES ($1, $2, $3, 'admin', $4) RETURNING id, email, full_name, role, tenant_id",
      [email, hash, fullName, tenant.id]
    );
    await ensureUserRoleEntry(user.id, tenant.id, 'admin', null);
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role, tenantId: tenant.id, token_version: 0 }, process.env.JWT_SECRET, { expiresIn: '7d' });
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
    try {
      const { ensureDefaultStages } = require('./pipeline-stages');
      await ensureDefaultStages(tenant.id);
    } catch (e) { console.error('[signup-google.stages]', e.message); }
    try {
      const { seedDefaultCategories } = require('../services/partnerCategoriesSeed');
      await seedDefaultCategories(tenant.id);
    } catch (e) { console.error('[signup-google.categories]', e.message); }

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

    await ensureUserRoleEntry(user.id, tenant.id, 'admin', null);

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, tenantId: tenant.id, fullName: user.full_name, token_version: 0 },
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


// ─── MFA (TOTP) — setup / verify / disable / validate ──────────────
//
// Flow:
//   1. /auth/mfa/setup    — auth required. Generates a fresh TOTP
//      secret, encrypts it into users.mfa_secret (mfa_enabled stays
//      FALSE so the next login still works without 2FA), returns the
//      otpauth:// URI + a QR-code data URL the frontend can render
//      directly with <img src=…>.
//   2. /auth/mfa/verify   — auth required. The user types the first
//      6-digit code from their authenticator. On match we generate
//      8 single-use backup codes (8-char hex, bcrypt-hashed at rest)
//      and flip mfa_enabled = TRUE. The plain backup codes are
//      returned ONCE and never re-derivable.
//   3. /auth/mfa/disable  — auth required. Requires a valid TOTP or
//      backup code, then clears mfa_secret + mfa_backup_codes.
//   4. /auth/mfa/validate — NO normal auth. Consumes the short-lived
//      mfa_token issued by /auth/login when mfa_enabled = TRUE, and
//      returns the real session JWT on a successful TOTP/backup-code
//      match.

// otplib step defaults to 30 s; window of 1 lets a code from the
// previous step still match if the user is slightly behind, which
// matches the UX of every authenticator app on mobile.
authenticator.options = { window: 1 };

// Helper: load + decrypt the user's TOTP secret. Returns null when the
// user has no secret enrolled (or the row is missing). Centralises the
// try/catch around decrypt() so a corrupted ciphertext can't 500 the
// caller.
async function loadMfaSecret(userId) {
  const { rows } = await query(
    'SELECT mfa_secret FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  if (!rows.length || !rows[0].mfa_secret) return null;
  try { return decrypt(rows[0].mfa_secret); }
  catch (e) {
    console.error('[mfa] decrypt failed:', e.message);
    return null;
  }
}

router.post('/mfa/setup', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT id, email FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = rows[0];

    const secret = authenticator.generateSecret();
    let encryptedSecret;
    try { encryptedSecret = encrypt(secret); }
    catch (e) {
      console.error('[mfa.setup] encrypt failed:', e.message);
      return res.status(500).json({ error: 'TOKEN_ENCRYPTION_KEY non configuré' });
    }

    // Persist the secret but don't enable MFA yet — the user has to
    // prove they can read codes from it via /verify before we lock the
    // account behind a second factor.
    await query(
      'UPDATE users SET mfa_secret = $1 WHERE id = $2',
      [encryptedSecret, user.id]
    );

    const otpauthUri = authenticator.keyuri(user.email, 'RefBoost', secret);
    const qrCode = await QRCode.toDataURL(otpauthUri);

    res.json({ qrCode, secret, otpauthUri });
  } catch (err) {
    console.error('[mfa.setup]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/mfa/verify', authenticate, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code || !/^[0-9]{6}$/.test(String(code))) {
      return res.status(400).json({ error: 'Code à 6 chiffres requis' });
    }
    const secret = await loadMfaSecret(req.user.id);
    if (!secret) return res.status(400).json({ error: 'MFA non initialisé' });

    if (!authenticator.check(String(code), secret)) {
      logAudit(req, 'auth.mfa_verify_failed', 'user', req.user.id, {});
      return res.status(401).json({ error: 'Code invalide' });
    }

    // Generate 8 single-use backup codes. Hex (4 random bytes → 8
    // chars) is friendly to read on paper and zero ambiguity between
    // 0/O or 1/l. Each is bcrypt-hashed before storage so a DB leak
    // can't be replayed.
    const plainCodes = [];
    const hashedCodes = [];
    for (let i = 0; i < 8; i++) {
      const c = cryptoRandom.randomBytes(4).toString('hex').toUpperCase();
      plainCodes.push(c);
      hashedCodes.push(await bcrypt.hash(c, 10));
    }

    await query(
      'UPDATE users SET mfa_enabled = TRUE, mfa_backup_codes = $1 WHERE id = $2',
      [hashedCodes, req.user.id]
    );
    logAudit(req, 'auth.mfa_enabled', 'user', req.user.id, {});

    res.json({ ok: true, backup_codes: plainCodes });
  } catch (err) {
    console.error('[mfa.verify]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/mfa/disable', authenticate, async (req, res) => {
  try {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Code requis' });

    const { rows } = await query(
      'SELECT mfa_secret, mfa_backup_codes, mfa_enabled FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    if (!rows.length || !rows[0].mfa_enabled) {
      return res.status(400).json({ error: 'MFA non actif' });
    }

    const secret = rows[0].mfa_secret ? (() => {
      try { return decrypt(rows[0].mfa_secret); } catch { return null; }
    })() : null;
    const backupCodes = rows[0].mfa_backup_codes || [];

    let valid = false;
    // Accept TOTP first (typical case); fall through to backup-code
    // check so a user who lost their device can still disable.
    if (secret && /^[0-9]{6}$/.test(String(code))) {
      valid = authenticator.check(String(code), secret);
    }
    if (!valid) {
      for (const hashed of backupCodes) {
        if (await bcrypt.compare(String(code).toUpperCase(), hashed)) {
          valid = true;
          break;
        }
      }
    }

    if (!valid) {
      logAudit(req, 'auth.mfa_disable_failed', 'user', req.user.id, {});
      return res.status(401).json({ error: 'Code invalide' });
    }

    await query(
      'UPDATE users SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_backup_codes = NULL WHERE id = $1',
      [req.user.id]
    );
    logAudit(req, 'auth.mfa_disabled', 'user', req.user.id, {});

    res.json({ ok: true });
  } catch (err) {
    console.error('[mfa.disable]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/mfa/validate', async (req, res) => {
  try {
    const { mfa_token, code, is_backup_code } = req.body || {};
    if (!mfa_token || !code) {
      return res.status(400).json({ error: 'mfa_token et code requis' });
    }

    let payload;
    try { payload = jwt.verify(mfa_token, process.env.JWT_SECRET); }
    catch { return res.status(401).json({ error: 'Token MFA invalide ou expiré' }); }

    if (!payload || !payload.mfa_pending || !payload.sub) {
      return res.status(401).json({ error: 'Token MFA invalide' });
    }

    const { rows } = await query(
      `SELECT u.id, u.email, u.full_name, u.role, u.partner_id, u.tenant_id,
              u.is_active, u.must_change_password, u.avatar_url,
              u.mfa_secret, u.mfa_backup_codes, u.mfa_enabled,
              p.name AS partner_name
         FROM users u LEFT JOIN partners p ON u.partner_id = p.id
        WHERE u.id = $1
        LIMIT 1`,
      [payload.sub]
    );
    if (!rows.length) return res.status(404).json({ error: 'Utilisateur introuvable' });
    const user = rows[0];
    if (!user.is_active) return res.status(403).json({ error: 'Compte désactivé' });
    if (!user.mfa_enabled) {
      return res.status(400).json({ error: 'MFA non actif sur ce compte' });
    }

    let valid = false;
    if (is_backup_code) {
      const codes = user.mfa_backup_codes || [];
      let matchedIdx = -1;
      for (let i = 0; i < codes.length; i++) {
        if (await bcrypt.compare(String(code).toUpperCase(), codes[i])) {
          matchedIdx = i;
          break;
        }
      }
      if (matchedIdx >= 0) {
        valid = true;
        // Single-use: drop the consumed hash from the array.
        const remaining = codes.slice(0, matchedIdx).concat(codes.slice(matchedIdx + 1));
        await query(
          'UPDATE users SET mfa_backup_codes = $1 WHERE id = $2',
          [remaining, user.id]
        );
      }
    } else {
      let secret = null;
      try { if (user.mfa_secret) secret = decrypt(user.mfa_secret); } catch {}
      if (secret && /^[0-9]{6}$/.test(String(code))) {
        valid = authenticator.check(String(code), secret);
      }
    }

    if (!valid) {
      logAudit({ ...req, user: { id: user.id, email: user.email } }, 'auth.mfa_failed', 'user', user.id, {});
      return res.status(401).json({ error: 'Code invalide' });
    }

    // From here on the flow mirrors the tail of /auth/login: heal
    // user_roles, pick a workspace, and emit the same response shape.
    await ensureUserRoleEntry(user.id, user.tenant_id, user.role, user.partner_id);
    const spaces = await listUserSpaces(user.id);
    const space = pickInitialSpace(spaces, user.tenant_id);
    logAudit({ ...req, user: { id: user.id, email: user.email } }, 'auth.login_via_mfa', 'user', user.id, {
      via: is_backup_code ? 'backup_code' : 'totp',
      spaces: spaces.length,
    });

    if (!space && spaces.length > 1) {
      const tempToken = signPendingSelectionToken(user);
      return res.json({
        token: tempToken,
        requiresSpaceSelection: true,
        spaces,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          mustChangePassword: user.must_change_password || false,
        },
      });
    }

    if (space) await persistActiveSpace(user.id, space);
    const tenantId = space?.tenant_id || user.tenant_id;
    const token = signSessionToken({
      user,
      tenantId,
      role: space?.role || user.role,
      partnerId: space ? (space.partner_id || null) : user.partner_id,
    });
    res.json(buildLoginResponse({ user, space, spaces, token }));
  } catch (err) {
    console.error('[mfa.validate]', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/mfa/status', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT mfa_enabled FROM users WHERE id = $1 LIMIT 1',
      [req.user.id]
    );
    res.json({ mfa_enabled: !!(rows[0] && rows[0].mfa_enabled) });
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
    const { passwordReset } = require('../utils/emailTemplates');
    const tpl = passwordReset({ recipientName: user.full_name, resetUrl });

    await resend.sendEmail({
      to: email,
      subject: tpl.subject,
      html: tpl.html,
      text: tpl.text,
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
         t.logo_url AS tenant_logo_url,
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

      // Pull the user + tenant + partner names in one shot so the
      // response carries everything the frontend sidebar needs without
      // an extra /me round-trip.
      const userRes = await query(
        `SELECT u.id, u.email, u.full_name, u.must_change_password, u.avatar_url,
                COALESCE(u.token_version, 0) AS token_version,
                t.name AS tenant_name, t.slug AS tenant_slug,
                p.name AS partner_name, p.commission_rate
           FROM users u
           LEFT JOIN tenants t ON t.id = $2
           LEFT JOIN partners p ON p.id = $3
          WHERE u.id = $1`,
        [req.user.id, tenantId, partnerId || null]
      );
      const user = userRes.rows[0];
      if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

      const token = signSessionToken({
        user: { id: user.id, email: user.email, full_name: user.full_name, role, partner_id: partnerId || null, token_version: user.token_version },
        tenantId,
        role,
        partnerId: partnerId || null,
      });
      logAudit(
        { ip: req.ip, headers: req.headers, user: { id: user.id, tenantId, email: user.email }, tenantId },
        'auth.login', 'user', user.id,
        { ip: req.ip, userAgent: req.headers['user-agent'], method: 'switch_space' }
      );

      res.json({
        token,
        user: {
          id: user.id,
          email: user.email,
          fullName: user.full_name,
          role,
          partnerId: partnerId || null,
          partnerName: user.partner_name || null,
          tenantId,
          tenantName: user.tenant_name || null,
          tenantSlug: user.tenant_slug || null,
          commissionRate: user.commission_rate || null,
          mustChangePassword: user.must_change_password || false,
          avatarUrl: user.avatar_url || null,
        },
      });
    } catch (err) {
      console.error('[POST /switch-space] error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ─── GDPR Article 17 — partner-initiated account deletion ───
// Soft-deletes the user + partner rows (deleted_at = NOW()) and flips
// the partner inactive so the existing /auth/me access-revoked check
// terminates the active session on the next /me poll. The daily purge
// worker (backend/services/gdprPurge.js) hard-deletes anything past
// the 30-day grace window. Partners only — admins can't self-delete
// their tenant (would need a separate tenant-deletion flow).
router.post('/delete-account', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'partner') {
      return res.status(403).json({ error: 'Réservé aux partenaires' });
    }
    const userId = req.user.id;
    const tenantId = req.user.tenantId || null;
    const partnerId = req.user.partnerId || null;

    // v52: optional feedback payload from the 2-step deletion modal.
    // Validated against the CHECK enum on the table; bad inputs are
    // silently dropped so the partner can still complete the
    // deletion even if their feedback round-trips a malformed value.
    const REASON_CODES = new Set(['price', 'features', 'competitor', 'no_need', 'other']);
    const reasonCode = REASON_CODES.has(req.body?.reason_code) ? req.body.reason_code : null;
    const freeText = typeof req.body?.free_text === 'string' ? req.body.free_text.slice(0, 4000) : null;
    if (reasonCode) {
      try {
        await query(
          `INSERT INTO account_deletion_feedback (tenant_id, partner_id, user_id, reason_code, free_text)
           VALUES ($1, $2, $3, $4, $5)`,
          [tenantId, partnerId, userId, reasonCode, freeText]
        );
      } catch (e) { console.error('[delete-account.feedback] failed:', e.message); }
    }

    // Soft-delete the user row. We stamp deleted_at AND flip is_active
    // so any code path that filters by is_active (the legacy ones that
    // pre-date the deleted_at column) treats this user as gone too.
    await query(
      'UPDATE users SET deleted_at = NOW(), is_active = false, updated_at = NOW() WHERE id = $1',
      [userId]
    );

    // Soft-delete the partner row (tenant-scoped). is_active = false
    // tells the partner-access guard in /auth/me to surface
    // access_revoked on the next call, so the active session
    // terminates without waiting for JWT expiry.
    if (partnerId && tenantId) {
      await query(
        'UPDATE partners SET deleted_at = NOW(), is_active = false WHERE id = $1 AND tenant_id = $2',
        [partnerId, tenantId]
      );
    }

    // Pull the user's name + tenant name for a more personable email.
    let recipientName = null;
    let tenantName = null;
    try {
      const { rows: u } = await query(
        `SELECT u.full_name, t.name AS tenant_name
           FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
          WHERE u.id = $1`,
        [userId]
      );
      if (u.length) {
        recipientName = u[0].full_name || null;
        tenantName = u[0].tenant_name || null;
      }
    } catch {}

    const purgeAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const purgeAtIso = purgeAt.toISOString();
    const purgeAtLabel = purgeAt.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });

    // Confirmation email — best-effort; we never block the deletion
    // response on email-send latency.
    try {
      const resend = require('../services/resend');
      const { accountDeletionRequested } = require('../utils/emailTemplates');
      const tpl = accountDeletionRequested({
        recipientName,
        scheduledPurgeAt: purgeAtLabel,
        tenantName,
      });
      await resend.sendEmail({
        to: req.user.email,
        subject: tpl.subject,
        html: tpl.html,
        text: tpl.text,
      });
    } catch (err) {
      console.error('[delete-account.email] failed:', err.message);
    }

    // Notify admins of the tenant so they're aware a partner left.
    try {
      const notify = require('../services/notifyService');
      await notify.fanoutAdminNotification(tenantId, 'partner_account_deletion_requested', {
        title: 'Suppression de compte partenaire',
        message: `Le partenaire ${recipientName || req.user.email} a demandé la suppression de son compte (purge prévue le ${purgeAtLabel}).`,
        link: '/partners',
      });
    } catch (err) {
      console.error('[delete-account.notify] failed:', err.message);
    }

    auditLog(req, 'partner_account_deletion_requested', 'user', userId, {
      tenant_id: tenantId,
      partner_id: partnerId,
      scheduled_purge_at: purgeAtIso,
    });

    res.json({ ok: true, scheduled_purge_at: purgeAtIso });
  } catch (err) {
    console.error('[delete-account] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GDPR Article 17 — admin-owner-initiated tenant deletion ─────
//
// Permitted only to the *founding* admin of the tenant: the user with
// role='admin' AND the earliest created_at among that tenant's admins.
// Founding is heuristic (no is_owner flag in the schema) but consistent
// with the signup flow: the tenant's first admin is the user who
// signed up and provisioned it.
//
// Behaviour:
//   1. Validate the typed company name against tenants.name (case-
//      sensitive match) so a fat-fingered click can't soft-delete a
//      live tenant.
//   2. Insert feedback row if a reason was provided.
//   3. Stamp tenants.deleted_at = NOW() so every read path that
//      filters by tenant_id stops surfacing it.
//   4. Cascade-soft-delete the entities that already carry a
//      deleted_at column (partners, referrals, commissions, users).
//   5. Multi-tenant safety: a user with active user_roles in OTHER
//      tenants does NOT get a global users.deleted_at — instead, only
//      their user_roles row in THIS tenant is set is_active=false so
//      their partner access elsewhere is preserved.
//   6. Audit log + best-effort confirmation email.
router.post('/delete-tenant', authenticate, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'admin_only' });
    }
    const tenantId = req.user.tenantId;
    if (!tenantId) return res.status(400).json({ error: 'missing_tenant' });

    // Owner check: earliest-created admin of this tenant.
    const { rows: ownerRows } = await query(
      `SELECT id FROM users
        WHERE tenant_id = $1 AND role = 'admin' AND deleted_at IS NULL
        ORDER BY created_at ASC LIMIT 1`,
      [tenantId]
    );
    const ownerId = ownerRows[0]?.id || null;
    if (ownerId !== req.user.id) {
      return res.status(403).json({ error: 'not_owner' });
    }

    // Tenant existence + typed-name confirmation guard.
    const { rows: tRows } = await query(
      'SELECT id, name FROM tenants WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [tenantId]
    );
    if (!tRows.length) return res.status(404).json({ error: 'tenant_not_found' });
    const tenant = tRows[0];
    const typed = String(req.body?.confirm_name || '').trim();
    if (typed !== tenant.name) {
      return res.status(400).json({ error: 'name_mismatch' });
    }

    // Feedback row (best-effort, doesn't block the deletion).
    const REASON_CODES = new Set(['price', 'features', 'competitor', 'no_need', 'other']);
    const reasonCode = REASON_CODES.has(req.body?.reason_code) ? req.body.reason_code : null;
    const freeText = typeof req.body?.free_text === 'string' ? req.body.free_text.slice(0, 4000) : null;
    if (reasonCode) {
      try {
        await query(
          `INSERT INTO account_deletion_feedback (tenant_id, partner_id, user_id, reason_code, free_text)
           VALUES ($1, NULL, $2, $3, $4)`,
          [tenantId, req.user.id, reasonCode, freeText]
        );
      } catch (e) { console.error('[delete-tenant.feedback] failed:', e.message); }
    }

    // 1. Stamp the tenant.
    await query(
      `UPDATE tenants SET deleted_at = NOW(), deleted_by = $1, is_active = FALSE, updated_at = NOW()
        WHERE id = $2 AND deleted_at IS NULL`,
      [req.user.id, tenantId]
    );

    // 2. Cascade-soft-delete entities that already carry deleted_at.
    //    partners + referrals + commissions: existing soft-delete column.
    try {
      await query(`UPDATE partners    SET deleted_at = NOW(), is_active = FALSE WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId]);
      await query(`UPDATE referrals   SET deleted_at = NOW(), deleted_by = $2  WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId, req.user.id]);
      await query(`UPDATE commissions SET deleted_at = NOW(), deleted_by = $2  WHERE tenant_id = $1 AND deleted_at IS NULL`, [tenantId, req.user.id]);
    } catch (e) {
      console.error('[delete-tenant.cascade] failed:', e.message);
    }

    // 3. Multi-tenant-aware user handling.
    //    Mark user_roles entries for this tenant inactive. Users with
    //    no remaining active user_roles get a global deleted_at; users
    //    with roles elsewhere keep their account but lose access here.
    try {
      const { rows: tenantUsers } = await query(
        `SELECT id FROM users WHERE tenant_id = $1 AND deleted_at IS NULL`,
        [tenantId]
      );
      for (const u of tenantUsers) {
        await query(
          `UPDATE user_roles SET is_active = FALSE
            WHERE user_id = $1 AND tenant_id = $2`,
          [u.id, tenantId]
        );
        const { rows: remaining } = await query(
          `SELECT id FROM user_roles
            WHERE user_id = $1 AND is_active = TRUE LIMIT 1`,
          [u.id]
        );
        if (!remaining.length) {
          await query(
            `UPDATE users SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
              WHERE id = $1 AND deleted_at IS NULL`,
            [u.id]
          );
        }
      }
    } catch (e) {
      console.error('[delete-tenant.users] failed:', e.message);
    }

    auditLog(req, 'tenant_deletion_requested', 'tenant', tenantId, {
      tenant_name: tenant.name,
      reason_code: reasonCode,
    });

    res.json({ ok: true, tenant_id: tenantId });
  } catch (err) {
    console.error('[delete-tenant] error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// GET /api/auth/account-info — exposes whether the signed-in user is
// the founding admin of their tenant. Drives the "Supprimer mon
// compte entreprise" affordance in Profil et sécurité; commercials
// and invited admins see no button at all.
router.get('/account-info', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const tenantId = req.user.tenantId || null;
    let isOwner = false;
    let tenantName = null;
    if (role === 'admin' && tenantId) {
      const { rows: ownerRows } = await query(
        `SELECT id FROM users
          WHERE tenant_id = $1 AND role = 'admin' AND deleted_at IS NULL
          ORDER BY created_at ASC LIMIT 1`,
        [tenantId]
      );
      isOwner = ownerRows[0]?.id === userId;
      const { rows: tRows } = await query('SELECT name FROM tenants WHERE id = $1 LIMIT 1', [tenantId]);
      tenantName = tRows[0]?.name || null;
    }
    res.json({
      role,
      tenant_id: tenantId,
      tenant_name: tenantName,
      is_tenant_owner: isOwner,
      // FE convenience: which path the deletion button should hit.
      can_delete_self: role === 'partner' || (role === 'admin' && isOwner),
      delete_kind: role === 'partner' ? 'partner_account' : (role === 'admin' && isOwner ? 'tenant' : null),
    });
  } catch (err) {
    console.error('[account-info] error:', err.message);
    res.status(500).json({ error: 'server_error' });
  }
});

// ─── Login history (Settings → Profil → Connexions récentes) ───
// Last 20 successful login events for the signed-in user. Reads from
// audit_logs filtered to action = 'auth.login'. SOC 2 CC6.1 — gives
// users visibility into where their account has been used.
router.get('/login-history', authenticate, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT created_at, ip_address, user_agent, details
         FROM audit_logs
        WHERE user_id = $1 AND action = 'auth.login'
        ORDER BY created_at DESC
        LIMIT 20`,
      [req.user.id]
    );
    const logins = rows.map(r => {
      const details = (() => {
        if (!r.details) return {};
        if (typeof r.details === 'object') return r.details;
        try { return JSON.parse(r.details); } catch { return {}; }
      })();
      return {
        created_at: r.created_at,
        ip: r.ip_address || details.ip || null,
        user_agent: r.user_agent || details.userAgent || null,
        method: details.method || 'password',
      };
    });
    res.json({ logins });
  } catch (err) {
    console.error('[login-history] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── Invalidate every existing session ───
// Bumps users.token_version → every outstanding JWT (this device + every
// other) becomes invalid on the next request through the authenticate
// middleware. The client logs out locally and routes to /login.
router.post('/invalidate-sessions', authenticate, async (req, res) => {
  try {
    await query(
      'UPDATE users SET token_version = COALESCE(token_version, 0) + 1, updated_at = NOW() WHERE id = $1',
      [req.user.id]
    );
    logAudit(req, 'session.invalidated', 'user', req.user.id, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
    res.json({ ok: true });
  } catch (err) {
    console.error('[invalidate-sessions] error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
