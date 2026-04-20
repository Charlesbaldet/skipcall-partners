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
// Thin wrapper around the HubSpot API with a clean error path — every
// non-2xx response throws with the status + truncated body so the
// caller's catch block can log meaningful details.
async function hs(integration, path, init = {}) {
  const res = await fetch(`https://api.hubapi.com${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${integration.access_token}`,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`HubSpot ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

// Split a single "prospect_name" into first/last. Falls back to
// (name, '') when there's only one token.
function splitName(full) {
  if (!full) return { firstname: '', lastname: '' };
  const parts = String(full).trim().split(/\s+/);
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return { firstname: parts[0], lastname: parts.slice(1).join(' ') };
}

function domainFromEmail(email) {
  const m = String(email || '').match(/@([a-z0-9.-]+\.[a-z]{2,})$/i);
  return m ? m[1].toLowerCase() : null;
}

// Search-by-property helper. Returns the first match's id (if any).
async function findObjectIdByProperty(integration, object, propertyName, value) {
  if (!value) return null;
  try {
    const data = await hs(integration, `/crm/v3/objects/${object}/search`, {
      method: 'POST',
      body: JSON.stringify({
        filterGroups: [{ filters: [{ propertyName, operator: 'EQ', value: String(value) }] }],
        limit: 1,
      }),
    });
    return data?.results?.[0]?.id || null;
  } catch (err) {
    // Search API 404s on misconfigured portals; treat as "not found".
    if (err.status === 404) return null;
    throw err;
  }
}

// Associate two HubSpot objects via the default type. Uses v4
// (`/crm/v4/objects/.../default/`) so HubSpot picks the primary
// association type automatically — no need to maintain type IDs.
async function associate(integration, fromObject, fromId, toObject, toId) {
  if (!fromId || !toId) return;
  try {
    await hs(integration, `/crm/v4/objects/${fromObject}/${fromId}/associations/default/${toObject}/${toId}`, { method: 'PUT' });
  } catch (err) {
    // Already-associated responses and transient 409s shouldn't fail
    // the whole sync — log and move on.
    console.warn('[hubspot.associate]', fromObject, fromId, '→', toObject, toId, err.message);
  }
}

// Upsert a Company on { name } (exact match). Returns the id.
async function upsertHubSpotCompany(integration, referral) {
  const name = referral.prospect_company;
  if (!name) return null;
  // Prefer the saved id, fall back to search-by-name.
  let id = referral.hubspot_company_id || await findObjectIdByProperty(integration, 'companies', 'name', name);
  const properties = {
    name,
    ...(domainFromEmail(referral.prospect_email) ? { domain: domainFromEmail(referral.prospect_email) } : {}),
  };
  if (id) {
    try { await hs(integration, `/crm/v3/objects/companies/${id}`, { method: 'PATCH', body: JSON.stringify({ properties }) }); }
    catch { /* benign — a stale id is better than a duplicate row */ }
    return id;
  }
  const created = await hs(integration, '/crm/v3/objects/companies', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
  return created?.id || null;
}

// Upsert a Contact on { email } (HubSpot's natural unique key).
async function upsertHubSpotContact(integration, referral) {
  const email = referral.prospect_email;
  if (!email) return null;
  const { firstname, lastname } = splitName(referral.prospect_name);
  const properties = {
    ...(firstname ? { firstname } : {}),
    ...(lastname ? { lastname } : {}),
    email,
    ...(referral.prospect_phone ? { phone: referral.prospect_phone } : {}),
    ...(referral.prospect_role ? { jobtitle: referral.prospect_role } : {}),
  };
  let id = referral.hubspot_contact_id || await findObjectIdByProperty(integration, 'contacts', 'email', email);
  if (id) {
    try { await hs(integration, `/crm/v3/objects/contacts/${id}`, { method: 'PATCH', body: JSON.stringify({ properties }) }); }
    catch { /* leave id, skip update */ }
    return id;
  }
  const created = await hs(integration, '/crm/v3/objects/contacts', {
    method: 'POST',
    body: JSON.stringify({ properties }),
  });
  return created?.id || null;
}

// Create or update the Deal and return its id. Kept separate so the
// top-level pushToHubSpot reads as an ordered script: company →
// contact → deal → associate.
async function upsertHubSpotDeal(integration, referral, mappings) {
  const properties = buildPayload(referral, mappings.fields);
  const stage = findStageMapping(mappings.stages, referral.status);
  if (stage) {
    properties.dealstage = stage.crm_stage;
    if (stage.crm_pipeline_id) properties.pipeline = stage.crm_pipeline_id;
  }
  if (!properties.dealname) {
    properties.dealname = referral.prospect_company || referral.prospect_name || 'RefBoost referral';
  }

  const url = referral.crm_deal_id ? `/crm/v3/objects/deals/${referral.crm_deal_id}` : '/crm/v3/objects/deals';
  const method = referral.crm_deal_id ? 'PATCH' : 'POST';
  const data = await hs(integration, url, { method, body: JSON.stringify({ properties }) });
  return data?.id || referral.crm_deal_id || null;
}

async function pushToHubSpot(referral, integration, mappings) {
  // Strict order: Company → Contact → Deal → associations. If any step
  // fails we still return whatever we've built so the caller can
  // persist the ids we have and log the partial state.
  const companyId = await upsertHubSpotCompany(integration, referral).catch(e => { console.warn('[hubspot.company]', e.message); return referral.hubspot_company_id || null; });
  const contactId = await upsertHubSpotContact(integration, referral).catch(e => { console.warn('[hubspot.contact]', e.message); return referral.hubspot_contact_id || null; });
  const dealId    = await upsertHubSpotDeal(integration, referral, mappings);

  // Associate contact ↔ deal, contact ↔ company, deal ↔ company.
  // All fire-and-forget at the individual call level (they self-log on
  // failure) — we never want a single association hiccup to poison the
  // whole sync.
  await Promise.all([
    associate(integration, 'contacts', contactId, 'deals', dealId),
    associate(integration, 'contacts', contactId, 'companies', companyId),
    associate(integration, 'deals', dealId, 'companies', companyId),
  ]);

  // Persist the sibling ids so the next push doesn't re-search.
  await query(
    'UPDATE referrals SET hubspot_contact_id = COALESCE($1, hubspot_contact_id), hubspot_company_id = COALESCE($2, hubspot_company_id) WHERE id = $3',
    [contactId, companyId, referral.id]
  );

  return dealId;
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
    // Re-read the sibling ids so the sync log reflects the full set
    // of HubSpot objects touched by this push (contact, company, deal).
    let hsIds = {};
    if (integration.provider === 'hubspot') {
      const { rows } = await query('SELECT hubspot_contact_id, hubspot_company_id FROM referrals WHERE id = $1', [referral.id]);
      hsIds = rows[0] || {};
    }
    await logSync(integration.id, referral.id, 'push', 'success', { provider: integration.provider, dealId, ...hsIds });
    return { ok: true, dealId, ...hsIds };
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
    const referralId = refs[0].id;

    // Bidirectional enrichment — when HubSpot owns a Contact or a
    // Company linked to this Deal, pull their current
    // email/phone/company values and mirror them on the referral row.
    // Falls through silently when the provider isn't HubSpot or when
    // the sibling ids haven't been persisted yet.
    const enrich = {};
    if (integration.provider === 'hubspot') {
      try {
        const { rows: [r] } = await query(
          'SELECT hubspot_contact_id, hubspot_company_id FROM referrals WHERE id = $1',
          [referralId]
        );
        if (r?.hubspot_contact_id) {
          const c = await hs(integration, `/crm/v3/objects/contacts/${r.hubspot_contact_id}?properties=email,phone,firstname,lastname,jobtitle`).catch(() => null);
          if (c?.properties) {
            if (c.properties.email) enrich.prospect_email = c.properties.email;
            if (c.properties.phone) enrich.prospect_phone = c.properties.phone;
            const fn = (c.properties.firstname || '').trim();
            const ln = (c.properties.lastname  || '').trim();
            if (fn || ln) enrich.prospect_name = [fn, ln].filter(Boolean).join(' ');
            if (c.properties.jobtitle) enrich.prospect_role = c.properties.jobtitle;
          }
        }
        if (r?.hubspot_company_id) {
          const co = await hs(integration, `/crm/v3/objects/companies/${r.hubspot_company_id}?properties=name`).catch(() => null);
          if (co?.properties?.name) enrich.prospect_company = co.properties.name;
        }
      } catch (e) {
        console.warn('[crm.pull.enrich]', e.message);
      }
    }

    const enrichKeys = Object.keys(enrich);
    const sets = ['status = $1', 'crm_synced_at = NOW()', 'updated_at = NOW()'];
    const params = [refboostStatus];
    enrichKeys.forEach((k, i) => {
      sets.push(`${k} = $${i + 2}`);
      params.push(enrich[k]);
    });
    params.push(referralId);
    await query(
      `UPDATE referrals SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );
    await logSync(integration.id, referralId, 'pull', 'success', { incomingStage, refboostStatus, enriched: enrichKeys });
    return { ok: true, referralId, status: refboostStatus };
  } catch (err) {
    console.error('[crm.pull] error:', err.message);
    await logSync(integration.id, null, 'pull', 'error', { message: err.message });
    return { error: err.message };
  }
}

// ─── HubSpot OAuth helpers (env-gated) ───────────────────────────────
// Scopes cover all three object types (deals / contacts / companies)
// plus their schemas so the mapping modal can list properties for
// each. Existing tenants who connected with the deals-only scope set
// will need to re-authorize once to unlock contact/company syncs.
function hubspotAuthUrl(state, redirectUri) {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  if (!clientId) return null;
  const scopes = [
    'oauth',
    'crm.objects.deals.read',
    'crm.objects.deals.write',
    'crm.objects.contacts.read',
    'crm.objects.contacts.write',
    'crm.objects.companies.read',
    'crm.objects.companies.write',
    'crm.schemas.deals.read',
    'crm.schemas.contacts.read',
    'crm.schemas.companies.read',
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
