const router = require('express').Router();
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const PennylaneService = require('../services/pennylaneService');
const { logAudit } = require('../services/auditLog');
const { encrypt, decrypt } = require('../utils/crypto');

// GET /api/pennylane/status — returns connected/enabled flags + the
// authenticated company name (for the Settings UI). We don't return
// the token itself; the FE only ever needs to know whether one is on
// file. Probes /me to surface stale tokens (e.g. user revoked it in
// Pennylane after pairing) so the admin sees a clear "disconnected"
// state instead of a green checkmark on a dead connection.
router.get('/status', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenant_missing' });
  try {
    const { rows: [tenant] } = await query(
      'SELECT pennylane_api_token, pennylane_enabled FROM tenants WHERE id = $1',
      [tenantId]
    );
    if (!tenant?.pennylane_api_token) {
      return res.json({ connected: false, enabled: false });
    }
    const plainToken = decrypt(tenant.pennylane_api_token);
    try {
      const pl = new PennylaneService(plainToken);
      const me = await pl.verifyConnection();
      return res.json({
        connected: true,
        enabled:   !!tenant.pennylane_enabled,
        company:   me.company || me.user || me,
      });
    } catch (err) {
      // Token on file but Pennylane refused it — surface the failure
      // so the FE can prompt the admin to reconnect, but keep the
      // stored token in case it's a transient outage.
      return res.json({
        connected: false,
        enabled:   !!tenant.pennylane_enabled,
        error:     err.message,
      });
    }
  } catch (err) {
    console.error('[pennylane.status]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/pennylane/settings — accepts api_token and/or enabled.
// When api_token is present we validate it against /me first — a
// 401 or anything else non-2xx surfaces as a 400 with an explicit
// error code so the FE can show a friendly message instead of just
// silently saving a broken token. enabled-only updates skip the
// probe since the existing token is already validated.
router.put('/settings', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenant_missing' });
  const { api_token, enabled } = req.body || {};
  if (api_token === undefined && enabled === undefined) {
    return res.status(400).json({ error: 'no_changes' });
  }
  try {
    if (api_token) {
      try {
        const pl = new PennylaneService(api_token);
        await pl.verifyConnection();
      } catch (err) {
        return res.status(400).json({ error: 'invalid_token', detail: err.message });
      }
    }
    await query(
      `UPDATE tenants
          SET pennylane_api_token = COALESCE($2, pennylane_api_token),
              pennylane_enabled   = COALESCE($3, pennylane_enabled)
        WHERE id = $1`,
      [tenantId, api_token ? encrypt(api_token) : null, typeof enabled === 'boolean' ? enabled : null]
    );
    if (api_token) logAudit(req, 'integration.connected', 'tenant', tenantId, { provider: 'pennylane' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[pennylane.settings]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/pennylane/disconnect — wipe the token + flag. Doesn't
// touch already-issued pennylane_invoice_id pointers on commissions
// (those are still useful audit history even if the integration is
// disabled), only the tenant-level connection state.
router.delete('/disconnect', authenticate, authorize('admin', 'superadmin'), async (req, res) => {
  const tenantId = req.user.tenantId;
  if (!tenantId) return res.status(400).json({ error: 'tenant_missing' });
  try {
    await query(
      'UPDATE tenants SET pennylane_api_token = NULL, pennylane_enabled = FALSE WHERE id = $1',
      [tenantId]
    );
    logAudit(req, 'integration.disconnected', 'tenant', tenantId, { provider: 'pennylane' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[pennylane.disconnect]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
