// Pipedrive OAuth + status routes. Mounted at /api/crm/pipedrive.
//
// /connect, /disconnect, /status — authenticated admin/superadmin,
// Business-plan gated.
// /callback — public (Pipedrive bounces the user's browser here with
// no JWT) but CSRF-protected by the HMAC state token signed at
// /connect time. Both endpoints share the exact same redirect_uri,
// because Pipedrive validates it against the registered Marketplace
// app config and the value passed at /connect.
//
// P1 surface only: OAuth + status. Mapping (P2), push (P3), pull
// (P4) and webhooks (P5) will plug onto the same router.

const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { logAudit } = require('../services/auditLog');
const pipedrive = require('../services/pipedriveService');

const router = express.Router();

const FRONTEND = () => process.env.FRONTEND_URL || 'https://refboost.io';

// OAuth redirect_uri must be reachable by the admin's browser and
// match the Pipedrive Marketplace app config exactly. Vercel rewrites
// refboost.io/api/* → the Railway backend, so the public refboost.io
// origin is what we register. Same precedence as Qonto.
const REDIRECT_BASE = () =>
  process.env.APP_URL || process.env.FRONTEND_URL || 'https://refboost.io';
const REDIRECT_URI = () => REDIRECT_BASE().replace(/\/$/, '') + '/api/crm/pipedrive/callback';

// Plan gate — mirrors crm.js / qonto.js requireBusiness. 403
// plan_upgrade_required is the contract the frontend already reads
// to render the upgrade banner.
async function requireBusiness(req, res, next) {
  if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
  try {
    const { rows } = await query('SELECT plan FROM tenants WHERE id = $1', [req.tenantId]);
    const plan = rows[0]?.plan || 'starter';
    if (plan !== 'business') {
      return res.status(403).json({
        error: 'plan_upgrade_required',
        currentPlan: plan,
        requiredPlan: 'business',
      });
    }
    next();
  } catch (err) {
    console.error('[pipedrive.requireBusiness] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
}

// ─── GET /api/crm/pipedrive/connect ──────────────────────────────────
// Returns the authorize URL for the admin's browser to redirect to.
// Frontend pattern matches Qonto's (the FE does the window.location
// itself rather than letting the BE issue a 302 — keeps cookies +
// auth headers behaviour explicit on the client).
router.get(
  '/connect',
  authenticate, tenantScope, authorize('admin', 'superadmin'), requireBusiness,
  (req, res) => {
    if (!pipedrive.isConfigured()) {
      return res.status(503).json({ error: 'pipedrive_not_configured' });
    }
    const redirectUri = REDIRECT_URI();
    const url = pipedrive.buildAuthorizeUrl(req.tenantId, redirectUri);
    if (!url) return res.status(503).json({ error: 'pipedrive_not_configured' });
    console.log('[pipedrive.connect] redirect_uri:', redirectUri);
    res.json({ authorize_url: url });
  }
);

// ─── GET /api/crm/pipedrive/callback ─────────────────────────────────
// PUBLIC route — Pipedrive bounces the user's browser here without a
// JWT. CSRF protection comes from the signed `state` token. Every
// failure path redirects back to the FE with a discriminator query
// param so the integrations page can surface a precise toast.
// audit-skip: OAuth callback — auth is the signed state token.
router.get('/callback', async (req, res) => {
  const back = (params) =>
    FRONTEND() + '/settings?tab=integrations&' + new URLSearchParams(params).toString();
  try {
    const { code, state, error } = req.query;
    if (error) {
      console.error('[pipedrive.callback] provider error:', error);
      return res.redirect(back({ pipedrive_error: 'provider_' + String(error) }));
    }
    if (!code || !state) {
      return res.redirect(back({ pipedrive_error: 'missing_code' }));
    }
    const payload = pipedrive.verifyState(state);
    if (!payload || !payload.tenantId) {
      return res.redirect(back({ pipedrive_error: 'invalid_state' }));
    }
    if (!pipedrive.isConfigured()) {
      return res.redirect(back({ pipedrive_error: 'not_configured' }));
    }
    // Pipedrive validates the redirect_uri on the token exchange so we
    // MUST pass the same value we sent at /connect time.
    const redirectUri = REDIRECT_URI();
    try {
      const tokens = await pipedrive.exchangeCodeForTokens(code, redirectUri);
      await pipedrive.ensurePipedriveIntegrationRow(payload.tenantId);
      await pipedrive.saveTokens(payload.tenantId, tokens);

      // Best-effort sync-log entry so the History tab on the
      // integrations page surfaces the connect event.
      try {
        const { rows } = await query(
          `SELECT id FROM crm_integrations
            WHERE tenant_id = $1 AND provider = 'pipedrive' LIMIT 1`,
          [payload.tenantId]
        );
        if (rows[0]) {
          await query(
            `INSERT INTO crm_sync_log (integration_id, action, status, details)
             VALUES ($1, 'pull', 'success', $2::jsonb)`,
            [
              rows[0].id,
              JSON.stringify({
                event: 'oauth_connected',
                api_domain: tokens.api_domain || null,
                company_id: tokens.company_id != null ? String(tokens.company_id) : null,
                scope: tokens.scope || null,
              }),
            ]
          );
        }
      } catch (e) {
        console.error('[pipedrive.callback.log]', e.message);
      }

      return res.redirect(back({ pipedrive_success: '1' }));
    } catch (e) {
      console.error('[pipedrive.callback] exchange failed:', e.message);
      return res.redirect(back({
        pipedrive_error: 'exchange_failed',
        detail: e.message.slice(0, 200),
      }));
    }
  } catch (err) {
    console.error('[pipedrive.callback] fatal:', err);
    return res.redirect(back({ pipedrive_error: 'internal' }));
  }
});

// ─── POST /api/crm/pipedrive/disconnect ──────────────────────────────
// Flips the integration inactive but keeps the row + (encrypted)
// tokens in place. Reconnect via /connect will overwrite them with
// fresh values. Deliberate non-destructive behaviour — same posture
// as Notion/HubSpot/Salesforce so reconnecting is a 2-click flow.
router.post(
  '/disconnect',
  authenticate, tenantScope, authorize('admin', 'superadmin'), requireBusiness,
  async (req, res) => {
    try {
      await pipedrive.markPipedriveIntegrationInactive(req.tenantId, 'manual_disconnect');
      await logAudit(req, 'crm.pipedrive.disconnect', 'crm_integration', null, {});
      res.json({ ok: true });
    } catch (err) {
      console.error('[pipedrive.disconnect] error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

// ─── GET /api/crm/pipedrive/status ───────────────────────────────────
// Intentionally NOT plan-gated — the frontend needs to render the
// "Plan Business" lock card for starter/pro tenants too. Never
// surfaces tokens or webhook credentials, even partially.
router.get(
  '/status',
  authenticate, tenantScope, authorize('admin', 'superadmin'),
  async (req, res) => {
    try {
      const { rows: planRows } = await query('SELECT plan FROM tenants WHERE id = $1', [req.tenantId]);
      const plan = planRows[0]?.plan || 'starter';
      const planAllowed = plan === 'business';

      const integ = await pipedrive.getTenantPipedrive(req.tenantId);
      if (!integ) {
        return res.json({
          connected: false,
          configured: pipedrive.isConfigured(),
          plan,
          plan_allowed: planAllowed,
          api_domain: null,
          company_id: null,
          scope: null,
          connected_at: null,
          last_pull_at: null,
          last_error: null,
          token_expires_at: null,
          pipeline_id: null,
          auto_push: false,
        });
      }
      res.json({
        connected: !!integ.isActive,
        configured: pipedrive.isConfigured(),
        plan,
        plan_allowed: planAllowed,
        api_domain: integ.apiDomain,
        company_id: integ.companyId,
        scope: integ.scope,
        connected_at: integ.connectedAt,
        last_pull_at: integ.lastPullAt,
        last_error: integ.lastError,
        token_expires_at: integ.tokenExpiresAt,
        pipeline_id: integ.pipelineId,
        auto_push: integ.autoPush,
      });
    } catch (err) {
      console.error('[pipedrive.status] error:', err);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  }
);

module.exports = router;
