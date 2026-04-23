const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');
const { encrypt, decrypt } = require('../middleware/security');
const notion = require('../services/notionService');

const router = express.Router();
router.use(authenticate);
router.use(tenantScope);
router.use(authorize('admin', 'superadmin'));

const DB_TYPES = new Set(['transactions', 'contacts', 'companies']);

// POST /api/crm/notion/connect
// Body: { token, dbTransactions, dbContacts?, dbCompanies? }
// Transactions is required; Contacts and Companies are optional.
router.post('/connect', async (req, res) => {
  const { token, dbTransactions, dbContacts, dbCompanies } = req.body || {};
  if (!token || !dbTransactions) return res.status(400).json({ error: 'token et base Transactions requis' });

  // Inbound request tracing. Logs token PREFIX only — never the full
  // secret. Helps spot paste artefacts ("ntn_" prefix mis-copied,
  // trailing whitespace, 32-char hex vs UUID) on the Railway side.
  console.log('[notion.connect] body keys:', Object.keys(req.body || {}));
  console.log('[notion.connect] token prefix:', String(token).slice(0, 15) + '…', 'length:', String(token).length);
  console.log('[notion.connect] token tail:', '…' + String(token).slice(-4));
  console.log('[notion.connect] dbTransactions:', dbTransactions);
  if (dbContacts)  console.log('[notion.connect] dbContacts:',  dbContacts);
  if (dbCompanies) console.log('[notion.connect] dbCompanies:', dbCompanies);
  console.log('[notion.connect] normalized dbTransactions:', notion.normalizeDatabaseId(dbTransactions));

  // ─── Step 1: probe /users/me to verify the TOKEN itself ─────────────
  // This disambiguates "token is invalid" from "database wasn't shared
  // with the integration". If /users/me returns 200 but /databases/:id
  // returns 404, we can tell the user the exact action to take in the
  // Notion UI (Connect → Add connection on each DB) instead of blaming
  // the token.
  try {
    const probeRes = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: 'Bearer ' + String(token).trim(),
        'Notion-Version': '2022-06-28',
      },
    });
    const probeBody = await probeRes.json().catch(() => ({}));
    console.log('[notion.connect] /users/me status:', probeRes.status, '| code:', probeBody.code || '-', '| message:', probeBody.message || '-');
    if (probeRes.status === 401) {
      return res.status(400).json({
        error: 'Token Notion invalide',
        detail: probeBody.message || 'Notion returned 401 Unauthorized on /users/me',
        status: 401,
        code: probeBody.code || 'unauthorized',
      });
    }
    // Non-401 failures on /users/me are weird — log and keep going,
    // the DB-fetch step will surface a better diagnostic.
    if (!probeRes.ok) {
      console.log('[notion.connect] /users/me non-OK non-401:', JSON.stringify(probeBody).slice(0, 500));
    } else {
      console.log('[notion.connect] /users/me OK — bot user id:', probeBody?.bot?.id || probeBody?.id || '-');
    }
  } catch (probeErr) {
    console.log('[notion.connect] /users/me threw:', probeErr.message);
  }

  try {
    const { databases, errors } = await notion.validateConnection(token.trim(), {
      transactions: dbTransactions.trim(),
      contacts:     dbContacts ? dbContacts.trim()  : null,
      companies:    dbCompanies ? dbCompanies.trim() : null,
    });
    if (errors && Object.keys(errors).length) {
      console.log('[notion.connect] validation errors:', JSON.stringify(errors));
    }
    if (!databases.transactions) {
      const e = errors.transactions || {};
      // A 401 / "unauthorized" from Notion means the integration
      // token is wrong. 404 / object_not_found means the database ID
      // is wrong OR the DB wasn't shared with the integration (the
      // more common problem — users forget to click "Connect" inside
      // the database).
      const isTokenError = e.status === 401 || e.code === 'unauthorized';
      const isNotShared = e.status === 404 || e.code === 'object_not_found';
      let errorLabel;
      if (isTokenError) errorLabel = 'Token Notion invalide';
      else if (isNotShared) errorLabel = 'Base Transactions introuvable — pensez à partager la base avec votre intégration Notion';
      else errorLabel = 'Base Transactions invalide';
      return res.status(400).json({
        error: errorLabel,
        detail: e.message || null,
        status: e.status || null,
        code: e.code || null,
      });
    }

    await query(
      `UPDATE tenants
          SET notion_token          = $1,
              notion_db_transactions = $2,
              notion_db_contacts     = $3,
              notion_db_companies    = $4,
              notion_connected       = TRUE
        WHERE id = $5`,
      [
        encrypt(token.trim()),
        databases.transactions.id,
        databases.contacts?.id || null,
        databases.companies?.id || null,
        req.tenantId,
      ]
    );

    // Upsert the bookkeeping row in crm_integrations so subsequent
    // crm_sync_log writes (from every pushReferralToNotion call) have
    // a valid foreign-key target. The HubSpot sync-history UI then
    // surfaces Notion entries alongside HubSpot without any extra
    // plumbing.
    await notion.ensureNotionIntegrationRow(req.tenantId);

    res.json({ connected: true, databases, errors });
  } catch (err) {
    console.error('[notion.connect]', err.message, err.body || '');
    res.status(400).json({ error: 'Token invalide', detail: err.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await query(
      `UPDATE tenants
          SET notion_token = NULL,
              notion_db_transactions = NULL,
              notion_db_contacts     = NULL,
              notion_db_companies    = NULL,
              notion_mapping_transactions = '{}'::jsonb,
              notion_mapping_contacts     = '{}'::jsonb,
              notion_mapping_companies    = '{}'::jsonb,
              notion_connected = FALSE
        WHERE id = $1`,
      [req.tenantId]
    );
    // Keep the crm_integrations row around (sync-log FKs reference
    // it) but flip is_active=false so the row stops showing as
    // "connected" in anywhere the UI filters on that flag.
    await notion.markNotionIntegrationInactive(req.tenantId);
    res.json({ ok: true });
  } catch (err) {
    console.error('[notion.disconnect]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/crm/notion/status — the UI uses this to render the card's
// connected state and remember which DBs are hooked up.
router.get('/status', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT notion_connected,
              notion_db_transactions, notion_db_contacts, notion_db_companies,
              notion_mapping_transactions, notion_mapping_contacts, notion_mapping_companies,
              notion_last_sync
         FROM tenants WHERE id = $1 LIMIT 1`,
      [req.tenantId]
    );
    const t = rows[0] || {};
    res.json({
      connected: !!t.notion_connected,
      databases: {
        transactions: t.notion_db_transactions || null,
        contacts:     t.notion_db_contacts || null,
        companies:    t.notion_db_companies || null,
      },
      mappings: {
        transactions: t.notion_mapping_transactions || {},
        contacts:     t.notion_mapping_contacts     || {},
        companies:    t.notion_mapping_companies    || {},
      },
      lastSync: t.notion_last_sync,
    });
  } catch (err) {
    console.error('[notion.status]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/crm/notion/properties/:type → schema for one database.
router.get('/properties/:type', async (req, res) => {
  const type = req.params.type;
  if (!DB_TYPES.has(type)) return res.status(400).json({ error: 'type invalide' });
  try {
    const cfg = await notion.getTenantNotion(req.tenantId);
    if (!cfg) return res.status(400).json({ error: 'Notion non connecté' });
    const dbId = cfg.dbs[type];
    if (!dbId) return res.json({ properties: [], not_configured: true });
    const db = await notion.fetchDatabase(cfg.token, dbId);
    res.json({ name: db.name, properties: db.properties });
  } catch (err) {
    console.error('[notion.properties]', err.message);
    const s = err.status;
    if (s === 401 || s === 403) return res.status(502).json({ error: 'Notion unreachable', upstream_status: s });
    res.status(500).json({ error: 'Erreur Notion' });
  }
});

router.get('/mappings', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT notion_mapping_transactions, notion_mapping_contacts, notion_mapping_companies,
              notion_status_mapping
         FROM tenants WHERE id = $1`,
      [req.tenantId]
    );
    const t = rows[0] || {};
    res.json({
      mappings: {
        transactions: t.notion_mapping_transactions || {},
        contacts:     t.notion_mapping_contacts     || {},
        companies:    t.notion_mapping_companies    || {},
      },
      statusMapping: t.notion_status_mapping || {},
    });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Canonical RefBoost stage slugs we offer in the status-mapping UI.
// Any string not in this list is silently dropped so a malicious or
// buggy client can't poison the JSONB.
const CANONICAL_STATUSES = new Set(['new', 'contacted', 'qualified', 'meeting', 'proposal', 'won', 'lost']);

// PUT /api/crm/notion/mappings
// Body: {
//   mappings?: { transactions?: {...}, contacts?: {...}, companies?: {...} },
//   statusMapping?: { new: "Prospect", contacted: "En cours", ... }
// }
router.put('/mappings', async (req, res) => {
  try {
    const m = req.body?.mappings && typeof req.body.mappings === 'object' ? req.body.mappings : {};
    const sm = req.body?.statusMapping && typeof req.body.statusMapping === 'object' ? req.body.statusMapping : null;
    const sets = [];
    const params = [];
    let i = 1;
    for (const type of ['transactions', 'contacts', 'companies']) {
      if (m[type] !== undefined && m[type] !== null && typeof m[type] === 'object') {
        sets.push(`notion_mapping_${type} = $${i++}`);
        params.push(JSON.stringify(m[type]));
      }
    }
    if (sm) {
      // Keep only canonical keys + string values; drop empty strings so
      // omitted rows in the UI become "unmapped → don't send status".
      const clean = {};
      for (const [k, v] of Object.entries(sm)) {
        if (CANONICAL_STATUSES.has(k) && typeof v === 'string' && v.trim()) {
          clean[k] = v.trim().slice(0, 100);
        }
      }
      sets.push(`notion_status_mapping = $${i++}`);
      params.push(JSON.stringify(clean));
    }
    if (!sets.length) return res.json({ ok: true, noop: true });
    params.push(req.tenantId);
    await query(`UPDATE tenants SET ${sets.join(', ')} WHERE id = $${i}`, params);
    res.json({ ok: true });
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

// POST /api/crm/notion/push — bulk push every referral of the current
// tenant to Notion. Mirrors the pattern the HubSpot integration uses
// for manual "sync all" runs. Each referral-level push logs its own
// row in crm_sync_log, so the sync-history UI fills in live as this
// runs.
router.post('/push', async (req, res) => {
  try {
    const result = await notion.pushAllReferralsToNotion(req.tenantId);
    if (!result.ok) return res.status(400).json({ error: result.reason || 'push_failed' });
    res.json(result);
  } catch (err) {
    console.error('[notion.push]', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

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
