const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { encrypt, decrypt } = require('../middleware/security');
const notion = require('../services/notionService');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'superadmin'));

// POST /api/crm/notion/connect — validate token + databaseId, persist.
router.post('/connect', async (req, res) => {
  const { token, databaseId } = req.body || {};
  if (!token || !databaseId) return res.status(400).json({ error: 'token et databaseId requis' });
  try {
    const { databaseName, properties } = await notion.validateToken(token.trim(), databaseId.trim());
    await query(
      `UPDATE tenants
          SET notion_token = $1,
              notion_database_id = $2,
              notion_database_name = $3,
              notion_connected = TRUE
        WHERE id = $4`,
      [encrypt(token.trim()), databaseId.trim(), databaseName, req.tenantId]
    );
    res.json({ connected: true, databaseName, properties });
  } catch (err) {
    console.error('[notion.connect]', err.message, err.body || '');
    res.status(400).json({ error: 'Token ou base de données invalide', detail: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await query(
      `UPDATE tenants
          SET notion_token = NULL, notion_database_id = NULL, notion_database_name = NULL,
              notion_connected = FALSE, notion_field_mapping = '{}'::jsonb
        WHERE id = $1`,
      [req.tenantId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[notion.disconnect]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/crm/notion/status — consumed by the Settings card so it
// can render the "Connected" badge + database name without holding
// the raw token on the client.
router.get('/status', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT notion_connected, notion_database_name, notion_database_id, notion_field_mapping, notion_last_sync
         FROM tenants WHERE id = $1 LIMIT 1`,
      [req.tenantId]
    );
    const t = rows[0] || {};
    res.json({
      connected: !!t.notion_connected,
      databaseName: t.notion_database_name,
      databaseId: t.notion_database_id,
      mapping: t.notion_field_mapping || {},
      lastSync: t.notion_last_sync,
    });
  } catch (err) {
    console.error('[notion.status]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/properties', async (req, res) => {
  try {
    const cfg = await notion.getTenantNotion(req.tenantId);
    if (!cfg) return res.status(400).json({ error: 'Notion non connecté' });
    const { properties } = await notion.validateToken(cfg.token, cfg.databaseId);
    res.json({ properties });
  } catch (err) {
    console.error('[notion.properties]', err.message);
    // Map upstream 401/403 to 502 so the frontend doesn't interpret it
    // as a session expiry (same pattern as HubSpot/Salesforce proxies).
    const s = err.status;
    if (s === 401 || s === 403) return res.status(502).json({ error: 'Notion unreachable', upstream_status: s });
    res.status(500).json({ error: 'Erreur Notion' });
  }
});

router.get('/mappings', async (req, res) => {
  try {
    const { rows } = await query('SELECT notion_field_mapping FROM tenants WHERE id = $1', [req.tenantId]);
    res.json({ mappings: rows[0]?.notion_field_mapping || {} });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/mappings', async (req, res) => {
  try {
    const mappings = req.body?.mappings && typeof req.body.mappings === 'object' ? req.body.mappings : {};
    await query('UPDATE tenants SET notion_field_mapping = $1 WHERE id = $2', [JSON.stringify(mappings), req.tenantId]);
    res.json({ ok: true, mappings });
  } catch (err) {
    console.error('[notion.mappings PUT]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Push one referral to Notion (admin-triggered from the UI).
router.post('/sync/:referralId', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT r.*, p.name AS partner_name
         FROM referrals r
         LEFT JOIN partners p ON p.id = r.partner_id
        WHERE r.id = $1 AND r.tenant_id = $2
        LIMIT 1`,
      [req.params.referralId, req.tenantId]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Referral introuvable' });
    const result = await notion.pushReferralToNotion(rows[0], req.tenantId);
    if (!result.ok) return res.status(400).json({ error: result.error || result.reason });
    res.json(result);
  } catch (err) {
    console.error('[notion.sync]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Pull changes from Notion — full database scan.
router.post('/pull', async (req, res) => {
  try {
    const result = await notion.pullFromNotion(req.tenantId);
    if (!result.ok) return res.status(400).json({ error: result.error || result.reason });
    res.json(result);
  } catch (err) {
    console.error('[notion.pull]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
