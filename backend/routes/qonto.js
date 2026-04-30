// Qonto banking integration — OAuth + status + bank-account selection.
//
// Mounted at /api/integrations/qonto. The OAuth callback is
// intentionally unauthenticated (the browser arriving at /callback
// won't have a JWT); CSRF is mitigated by signing the `state` blob
// with the JWT secret.

const express = require('express');
const crypto = require('crypto');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const qonto = require('../services/qontoService');

const router = express.Router();

const FRONTEND = () => process.env.FRONTEND_URL || 'https://refboost.io';
const BACKEND = () => {
  if (process.env.BACKEND_URL) return process.env.BACKEND_URL;
  if (process.env.RAILWAY_PUBLIC_DOMAIN) return `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`;
  return 'https://skipcall-partners-production.up.railway.app';
};

const STATE_SECRET = () => process.env.JWT_SECRET || 'dev-state-secret';

function signState(payload) {
  const json = JSON.stringify({ ...payload, ts: Date.now() });
  const b64 = Buffer.from(json).toString('base64url');
  const sig = crypto.createHmac('sha256', STATE_SECRET()).update(b64).digest('base64url');
  return `${b64}.${sig}`;
}

function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) return null;
  const [b64, sig] = state.split('.');
  const expected = crypto.createHmac('sha256', STATE_SECRET()).update(b64).digest('base64url');
  if (sig !== expected) return null;
  try { return JSON.parse(Buffer.from(b64, 'base64url').toString()); }
  catch { return null; }
}

// ─── GET /api/integrations/qonto/connect ─────────────────────────────
// Returns the URL for the admin's browser to redirect to. Carries the
// tenantId in `state` so /callback knows who to bind tokens to.
router.get('/connect', authenticate, tenantScope, authorize('admin'), (req, res) => {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
  if (!process.env.QONTO_CLIENT_ID) {
    return res.status(500).json({ error: 'qonto_not_configured' });
  }
  const redirectUri = BACKEND() + '/api/integrations/qonto/callback';
  const state = signState({ tenantId: req.tenantId });
  const url = qonto.authorizeUrl(state, redirectUri);
  if (!url) return res.status(500).json({ error: 'qonto_not_configured' });
  res.json({ url });
});

// ─── GET /api/integrations/qonto/callback ────────────────────────────
// Public — Qonto's OAuth bounces here. Verifies the signed state,
// exchanges the code for tokens, persists them, then redirects the
// admin back to /settings?tab=integrations.
router.get('/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      console.error('[qonto.callback] provider error:', error);
      return res.redirect(FRONTEND() + '/settings?tab=integrations&qonto=error');
    }
    if (!code || !state) return res.status(400).send('Missing code/state');
    const payload = verifyState(state);
    if (!payload || !payload.tenantId) return res.status(400).send('Invalid state');

    const redirectUri = BACKEND() + '/api/integrations/qonto/callback';
    const tokens = await qonto.exchangeCode(code, redirectUri);
    const expiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);

    await query(
      `INSERT INTO payment_integrations
         (tenant_id, provider, access_token, refresh_token, token_expires_at, is_active, connected_at)
       VALUES ($1, 'qonto', $2, $3, $4, TRUE, NOW())
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET access_token = EXCLUDED.access_token,
                     refresh_token = COALESCE(EXCLUDED.refresh_token, payment_integrations.refresh_token),
                     token_expires_at = EXCLUDED.token_expires_at,
                     is_active = TRUE, updated_at = NOW()`,
      [payload.tenantId, tokens.access_token, tokens.refresh_token || null, expiresAt]
    );

    // Best-effort: also fetch the org and pre-populate the bank account
    // so the admin doesn't have to pick one before the first payment.
    try {
      const accounts = await qonto.listBankAccounts(payload.tenantId);
      if (accounts.bank_accounts && accounts.bank_accounts.length) {
        const first = accounts.bank_accounts[0];
        await query(
          `UPDATE payment_integrations
              SET organization_slug = $2,
                  bank_account_id = COALESCE(bank_account_id, $3),
                  bank_account_iban = COALESCE(bank_account_iban, $4),
                  bank_account_label = COALESCE(bank_account_label, $5),
                  updated_at = NOW()
            WHERE tenant_id = $1 AND provider = 'qonto'`,
          [payload.tenantId, accounts.organization_slug, first.id, first.iban, first.label]
        );
      }
    } catch (e) {
      console.warn('[qonto.callback] bank_accounts pre-fetch skipped:', e.message);
    }

    res.redirect(FRONTEND() + '/settings?tab=integrations&qonto=connected');
  } catch (err) {
    console.error('[qonto.callback] error:', err);
    res.redirect(FRONTEND() + '/settings?tab=integrations&qonto=error');
  }
});

// ─── GET /api/integrations/qonto/status ──────────────────────────────
router.get('/status', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT is_active, organization_slug, bank_account_id, bank_account_iban,
              bank_account_label, connected_at,
              (refresh_token IS NOT NULL) AS has_refresh_token
         FROM payment_integrations
        WHERE tenant_id = $1 AND provider = 'qonto'`,
      [req.tenantId]
    );
    const integ = rows[0];
    if (!integ) {
      return res.json({
        connected: false,
        configured: !!process.env.QONTO_CLIENT_ID,
      });
    }
    res.json({
      connected: !!integ.is_active,
      configured: !!process.env.QONTO_CLIENT_ID,
      organization_slug: integ.organization_slug,
      bank_account_id: integ.bank_account_id,
      bank_account_iban: integ.bank_account_iban,
      bank_account_label: integ.bank_account_label,
      connected_at: integ.connected_at,
    });
  } catch (err) {
    console.error('[qonto.status] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── GET /api/integrations/qonto/bank-accounts ───────────────────────
// Lists the connected organization's bank accounts so the admin can
// pick which one to debit for transfers.
router.get('/bank-accounts', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const accounts = await qonto.listBankAccounts(req.tenantId);
    res.json(accounts);
  } catch (err) {
    console.error('[qonto.bank-accounts] error:', err);
    if (err.message === 'qonto_not_connected' || err.message === 'qonto_reconnect_required') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

router.put('/bank-account', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    const { bank_account_id, iban, label } = req.body || {};
    if (!bank_account_id) return res.status(400).json({ error: 'bank_account_id requis' });
    await query(
      `UPDATE payment_integrations
          SET bank_account_id = $2,
              bank_account_iban = $3,
              bank_account_label = $4,
              updated_at = NOW()
        WHERE tenant_id = $1 AND provider = 'qonto'`,
      [req.tenantId, bank_account_id, iban || null, label || null]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[qonto.bank-account.put] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/integrations/qonto/disconnect ─────────────────────────
router.post('/disconnect', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    await query(
      `UPDATE payment_integrations
          SET is_active = FALSE,
              access_token = NULL,
              refresh_token = NULL,
              token_expires_at = NULL,
              updated_at = NOW()
        WHERE tenant_id = $1 AND provider = 'qonto'`,
      [req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[qonto.disconnect] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
