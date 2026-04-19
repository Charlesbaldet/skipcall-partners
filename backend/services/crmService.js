// CRM sync service. Three providers supported:
//   * 'webhook'    — generic POST to a customer-supplied URL (no OAuth)
//   * 'hubspot'    — HubSpot Deals API (needs HUBSPOT_CLIENT_ID/SECRET env)
//   * 'salesforce' — Salesforce Opportunity API (needs SALESFORCE_*)
//
// Functions are intentionally fire-and-forget at the call site: any
// failure logs to crm_sync_log with status='error' rather than throwing
// so a CRM outage never breaks the user-facing referral flow.
const { query } = require('../db');

const REFBOOST_BASE_FIELDS = {
  prospect_name:    r => r.prospect_name,
  prospect_company: r => r.prospect_company,
  email:            r => r.prospect_email || r.email,
  phone:            r => r.prospect_phone || r.phone,
  deal_value:       r => r.deal_value,
  notes:            r => r.notes,
};

async function getActiveIntegration(tenantId) {
  if (!tenantId) return null;
  const { rows } = await query(
    'SELECT * FROM crm_integrations WHERE tenant_id = $1 AND is_active = TRUE LIMIT 1',
    [tenantId]
  );
  return rows[0] || null;
}

async function getMappings(integrationId) {
  const [{ rows: fields }, { rows: stages }] = await Promise.all([
    query('SELECT refboost_field, crm_field, direction FROM crm_field_mappings WHERE integration_id = $1', [integrationId]),
    query('SELECT refboost_status, crm_stage, crm_pipeline_id FROM crm_stage_mappings WHERE integration_id = $1', [integrationId]),
  ]);
  return { fields, stages };
}

async function logSync(integrationId, referralId, action, status, details) {
  try {
    await query(
      'INSERT INTO crm_sync_log (integration_id, referral_id, action, status, details) VALUES ($1, $2, $3, $4, $5)',
      [integrationId, referralId || null, action, status, details ? JSON.stringify(details) : null]
    );
  } catch (e) {
    // Logging must never throw — a failed log entry is strictly less
    // important than the sync attempt itself.
    console.error('[crm.logSync] failed:', e.message);
  }
}

// Build a payload object from the referral using the field-mapping
// table. RefBoost field names are mapped to whatever CRM property
// names the user picked. Unmapped fields are skipped.
function buildPayload(referral, fieldMappings) {
  const payload = {};
  for (const m of fieldMappings) {
    const fn = REFBOOST_BASE_FIELDS[m.refboost_field];
    if (!fn) continue;
    const value = fn(referral);
    if (value === undefined || value === null || value === '') continue;
    payload[m.crm_field] = value;
  }
  return payload;
}

function findStageMapping(stages, status) {
  return stages.find(s => s.refboost_status === status);
}

// ─── HubSpot ─────────────────────────────────────────────────────────
async function pushToHubSpot(referral, integration, mappings) {
  const properties = buildPayload(referral, mappings.fields);
  const stage = findStageMapping(mappings.stages, referral.status);
  if (stage) {
    properties.dealstage = stage.crm_stage;
    if (stage.crm_pipeline_id) properties.pipeline = stage.crm_pipeline_id;
  }
  if (!properties.dealname) {
    // dealname is required by HubSpot — synthesize one if no mapping
    // wrote it.
    properties.dealname = referral.prospect_company || referral.prospect_name || 'RefBoost referral';
  }

  const url = referral.crm_deal_id
    ? `https://api.hubapi.com/crm/v3/objects/deals/${referral.crm_deal_id}`
    : 'https://api.hubapi.com/crm/v3/objects/deals';
  const method = referral.crm_deal_id ? 'PATCH' : 'POST';

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HubSpot ${resp.status}: ${body.slice(0, 300)}`);
  }
  const data = await resp.json();
  return data.id; // dealId
}

// ─── Salesforce ──────────────────────────────────────────────────────
async function pushToSalesforce(referral, integration, mappings) {
  if (!integration.instance_url) throw new Error('Salesforce instance_url missing');
  const properties = buildPayload(referral, mappings.fields);
  const stage = findStageMapping(mappings.stages, referral.status);
  if (stage) properties.StageName = stage.crm_stage;
  if (!properties.Name) {
    properties.Name = referral.prospect_company || referral.prospect_name || 'RefBoost referral';
  }
  if (!properties.CloseDate) {
    // Salesforce requires CloseDate; default 90 days out for open deals.
    properties.CloseDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  }

  const url = referral.crm_deal_id
    ? `${integration.instance_url}/services/data/v59.0/sobjects/Opportunity/${referral.crm_deal_id}`
    : `${integration.instance_url}/services/data/v59.0/sobjects/Opportunity`;
  const method = referral.crm_deal_id ? 'PATCH' : 'POST';

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(properties),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Salesforce ${resp.status}: ${body.slice(0, 300)}`);
  }
  if (referral.crm_deal_id) return referral.crm_deal_id; // PATCH returns 204
  const data = await resp.json();
  return data.id;
}

// ─── Generic webhook ─────────────────────────────────────────────────
async function pushToWebhook(referral, integration) {
  if (!integration.webhook_url) throw new Error('Webhook URL missing');
  const event = referral.crm_deal_id ? 'referral.updated' : 'referral.created';
  const resp = await fetch(integration.webhook_url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-RefBoost-Event': event },
    body: JSON.stringify({
      event,
      referral: {
        id: referral.id,
        prospect_name: referral.prospect_name,
        prospect_company: referral.prospect_company,
        email: referral.prospect_email || referral.email,
        phone: referral.prospect_phone || referral.phone,
        status: referral.status,
        deal_value: referral.deal_value,
        partner_id: referral.partner_id,
        partner_name: referral.partner_name,
        notes: referral.notes,
        created_at: referral.created_at,
        updated_at: referral.updated_at,
      },
    }),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Webhook ${resp.status}: ${body.slice(0, 200)}`);
  }
  return null; // webhook receivers don't return a deal id
}

// ─── Public: push a referral to whatever CRM is wired ────────────────
async function pushReferralToCRM(referral, tenantId) {
  try {
    const integration = await getActiveIntegration(tenantId);
    if (!integration) return { skipped: true, reason: 'no_integration' };

    let dealId = null;
    if (integration.provider === 'webhook') {
      await pushToWebhook(referral, integration);
    } else {
      const mappings = await getMappings(integration.id);
      if (integration.provider === 'hubspot') {
        dealId = await pushToHubSpot(referral, integration, mappings);
      } else if (integration.provider === 'salesforce') {
        dealId = await pushToSalesforce(referral, integration, mappings);
      } else {
        return { skipped: true, reason: 'unknown_provider' };
      }
    }

    // Persist deal id + sync timestamp on the referral.
    if (dealId) {
      await query(
        'UPDATE referrals SET crm_deal_id = $1, crm_synced_at = NOW() WHERE id = $2',
        [dealId, referral.id]
      );
    } else {
      await query('UPDATE referrals SET crm_synced_at = NOW() WHERE id = $1', [referral.id]);
    }
    await logSync(integration.id, referral.id, 'push', 'success', { provider: integration.provider, dealId });
    return { ok: true, dealId };
  } catch (err) {
    console.error('[crm.push] error:', err.message);
    // Best-effort log even on failure — needs the integration id.
    try {
      const integration = await getActiveIntegration(tenantId);
      if (integration) {
        await logSync(integration.id, referral.id, 'push', 'error', { message: err.message });
      }
    } catch {}
    return { error: err.message };
  }
}

// ─── Public: handle inbound webhook from CRM (status pull) ───────────
// Best-effort mapping — picks the first stage row whose crm_stage
// matches and writes the corresponding refboost_status onto the
// referral via crm_deal_id lookup.
async function pullStatusFromCRM(payload, integration) {
  try {
    const dealId = payload.dealId || payload.objectId || payload.id;
    const incomingStage = payload.stage || payload.dealstage || payload.StageName;
    if (!dealId || !incomingStage) {
      return { skipped: true, reason: 'missing_dealId_or_stage' };
    }
    const { rows: stages } = await query(
      'SELECT refboost_status FROM crm_stage_mappings WHERE integration_id = $1 AND crm_stage = $2 LIMIT 1',
      [integration.id, incomingStage]
    );
    const refboostStatus = stages[0]?.refboost_status;
    if (!refboostStatus) {
      await logSync(integration.id, null, 'pull', 'error', { message: 'no_stage_mapping', incomingStage });
      return { skipped: true, reason: 'no_stage_mapping' };
    }
    const { rows: refs } = await query(
      'SELECT id FROM referrals WHERE crm_deal_id = $1 AND tenant_id = $2 LIMIT 1',
      [String(dealId), integration.tenant_id]
    );
    if (!refs[0]) return { skipped: true, reason: 'referral_not_found' };
    await query(
      'UPDATE referrals SET status = $1, crm_synced_at = NOW(), updated_at = NOW() WHERE id = $2',
      [refboostStatus, refs[0].id]
    );
    await logSync(integration.id, refs[0].id, 'pull', 'success', { incomingStage, refboostStatus });
    return { ok: true, referralId: refs[0].id, status: refboostStatus };
  } catch (err) {
    console.error('[crm.pull] error:', err.message);
    await logSync(integration.id, null, 'pull', 'error', { message: err.message });
    return { error: err.message };
  }
}

// ─── HubSpot OAuth helpers (env-gated) ───────────────────────────────
function hubspotAuthUrl(state, redirectUri) {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) return null;
  const scopes = [
    'oauth',
    'crm.objects.deals.read',
    'crm.objects.deals.write',
    'crm.schemas.deals.read',
  ].join('%20');
  return `https://app.hubspot.com/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${scopes}&state=${encodeURIComponent(state)}`;
}

async function exchangeHubSpotCode(code, redirectUri) {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const clientSecret = process.env.HUBSPOT_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('HubSpot OAuth not configured');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const resp = await fetch('https://api.hubapi.com/oauth/v1/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`HubSpot token exchange ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json(); // { access_token, refresh_token, expires_in }
}

// ─── Salesforce OAuth helpers ────────────────────────────────────────
function salesforceAuthUrl(state, redirectUri) {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  if (!clientId) return null;
  return `https://login.salesforce.com/services/oauth2/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
}

async function exchangeSalesforceCode(code, redirectUri) {
  const clientId = process.env.SALESFORCE_CLIENT_ID;
  const clientSecret = process.env.SALESFORCE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Salesforce OAuth not configured');
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const resp = await fetch('https://login.salesforce.com/services/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`Salesforce token exchange ${resp.status}: ${body.slice(0, 200)}`);
  }
  return resp.json(); // { access_token, refresh_token, instance_url }
}

module.exports = {
  pushReferralToCRM,
  pullStatusFromCRM,
  getActiveIntegration,
  hubspotAuthUrl,
  exchangeHubSpotCode,
  salesforceAuthUrl,
  exchangeSalesforceCode,
  logSync,
};
