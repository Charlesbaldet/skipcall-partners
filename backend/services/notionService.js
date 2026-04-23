const { query } = require('../db');
const { encrypt, decrypt } = require('../middleware/security');

// ─── Sync-log bookkeeping ────────────────────────────────────────────
// The HubSpot and Salesforce paths log every sync attempt to
// crm_sync_log (keyed by a crm_integrations.id). We mirror that here
// so the existing /crm/sync/log endpoint and the "Historique de
// synchronisation" UI surface Notion pushes alongside HubSpot — no
// view changes needed. The Notion config itself stays on the
// tenants.notion_* columns; the crm_integrations row is just a
// bookkeeping target for the foreign key.
async function ensureNotionIntegrationRow(tenantId) {
  if (!tenantId) return null;
  try {
    const { rows } = await query(
      `INSERT INTO crm_integrations (tenant_id, provider, is_active, connected_at)
       VALUES ($1, 'notion', TRUE, NOW())
       ON CONFLICT (tenant_id, provider)
       DO UPDATE SET is_active = TRUE, connected_at = COALESCE(crm_integrations.connected_at, NOW())
       RETURNING id`,
      [tenantId]
    );
    return rows[0]?.id || null;
  } catch (err) {
    console.error('[notion.ensureIntegrationRow]', err.message);
    return null;
  }
}

async function markNotionIntegrationInactive(tenantId) {
  if (!tenantId) return;
  try {
    await query(
      `UPDATE crm_integrations SET is_active = FALSE
        WHERE tenant_id = $1 AND provider = 'notion'`,
      [tenantId]
    );
  } catch (err) {
    console.error('[notion.markInactive]', err.message);
  }
}

async function getNotionIntegrationId(tenantId) {
  if (!tenantId) return null;
  try {
    const { rows } = await query(
      `SELECT id FROM crm_integrations WHERE tenant_id = $1 AND provider = 'notion' LIMIT 1`,
      [tenantId]
    );
    return rows[0]?.id || null;
  } catch { return null; }
}

// Write a row to crm_sync_log. Best-effort — a failed log write must
// never break the actual sync.
async function logSync(tenantId, { action, status, referralId, details }) {
  try {
    const integrationId = await getNotionIntegrationId(tenantId);
    if (!integrationId) return;
    await query(
      `INSERT INTO crm_sync_log (integration_id, referral_id, action, status, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [integrationId, referralId || null, action, status || 'success', details ? JSON.stringify(details) : null]
    );
  } catch (err) {
    console.error('[notion.logSync]', err.message);
  }
}

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ═══════════════════════════════════════════════════════════════════
// Multi-database Notion sync
//
// The tenant can configure up to three Notion databases:
//   - notion_db_transactions  (required — drives every push)
//   - notion_db_contacts      (optional)
//   - notion_db_companies     (optional)
//
// Each database gets its own JSONB field mapping (refboost field →
// Notion property name). At push time we upsert in order
// Company → Contact → Transaction and, when relation-typed properties
// exist between the databases, wire them up. Everything not marked
// required is skipped gracefully when it's not configured.
// ═══════════════════════════════════════════════════════════════════

async function getTenantNotion(tenantId) {
  const { rows } = await query(
    `SELECT notion_token, notion_connected,
            notion_db_transactions, notion_db_contacts, notion_db_companies,
            notion_mapping_transactions, notion_mapping_contacts, notion_mapping_companies,
            notion_status_mapping,
            notion_last_sync
       FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  const t = rows[0];
  if (!t || !t.notion_connected || !t.notion_token || !t.notion_db_transactions) return null;
  return {
    token: decrypt(t.notion_token),
    dbs: {
      transactions: t.notion_db_transactions,
      contacts:     t.notion_db_contacts || null,
      companies:    t.notion_db_companies || null,
    },
    mappings: {
      transactions: t.notion_mapping_transactions || {},
      contacts:     t.notion_mapping_contacts     || {},
      companies:    t.notion_mapping_companies    || {},
    },
    statusMapping: t.notion_status_mapping || {},
    lastSync: t.notion_last_sync,
  };
}

// ─── HTTP helper ────────────────────────────────────────────────────
async function notionFetch(token, path, init = {}) {
  const url = NOTION_API + path;
  // Strip anything that might have slipped past the input field — stray
  // newlines, quotes, or zero-width chars from a copy-paste — before we
  // stuff the token into the Authorization header. Notion rejects
  // tokens that aren't a clean ASCII string.
  const cleanToken = String(token || '').replace(/[\r\n\t"'\u200B-\u200D\uFEFF]/g, '').trim();
  console.log('[notion] →', init.method || 'GET', url);
  console.log('[notion]    token prefix:', cleanToken.slice(0, 10) + '…', 'length:', cleanToken.length);
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cleanToken}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.ok) {
    console.log('[notion] ←', res.status, 'ok');
  } else {
    // On failure, dump the full Notion response body (truncated) so
    // Railway logs carry the exact error — helps tell "token is bad"
    // (401 unauthorized) from "database not shared with integration"
    // (404 object_not_found) from request_validation / rate_limited.
    console.log('[notion] ←', res.status, 'FAIL code:', data?.code || '-', '| message:', data?.message || '-');
    console.log('[notion]    raw body:', JSON.stringify(data).slice(0, 800));
  }
  if (!res.ok) {
    const err = new Error(data?.message || `Notion ${res.status}`);
    err.status = res.status; err.body = data;
    throw err;
  }
  return data;
}

// Notion accepts both hyphen-less ("32char") and UUID-dashed
// ("8-4-4-4-12") database ids, but some legacy paths/reverse proxies
// treat them differently. Normalise every id we pass on the wire to
// the dashed UUID form to rule that failure mode out.
function normalizeDatabaseId(raw) {
  if (!raw) return raw;
  const s = String(raw).trim().toLowerCase().replace(/-/g, '');
  if (!/^[0-9a-f]{32}$/.test(s)) return raw.trim(); // leave non-hex as-is
  return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}

// Extract a human-readable database title from a GET /databases/:id
// response. Falls back to a generic label when the title is empty.
function readDbTitle(db) {
  const t = (db.title || []).map(t => t.plain_text || t.text?.content || '').join('').trim();
  return t || 'Notion database';
}

// Summarise a database's schema so the frontend can render dropdowns:
// [{ id, name, type }]. Relation types also carry the target database_id.
// select / status / multi_select additionally carry their allowed option
// names so the status-mapping UI can offer real values instead of a
// free-text input.
function readDbProperties(db) {
  return Object.entries(db.properties || {}).map(([name, p]) => {
    const base = { id: p.id, name, type: p.type };
    if (p.type === 'relation' && p.relation?.database_id) {
      base.relation_database_id = p.relation.database_id;
    }
    if (p.type === 'select' && Array.isArray(p.select?.options)) {
      base.options = p.select.options.map(o => o.name).filter(Boolean);
    } else if (p.type === 'multi_select' && Array.isArray(p.multi_select?.options)) {
      base.options = p.multi_select.options.map(o => o.name).filter(Boolean);
    } else if (p.type === 'status' && Array.isArray(p.status?.options)) {
      base.options = p.status.options.map(o => o.name).filter(Boolean);
    }
    return base;
  });
}

async function fetchDatabase(token, databaseId) {
  if (!databaseId) return null;
  const normalized = normalizeDatabaseId(databaseId);
  const db = await notionFetch(token, `/databases/${encodeURIComponent(normalized)}`);
  return {
    id: normalized,
    name: readDbTitle(db),
    properties: readDbProperties(db),
    rawSchema: db.properties || {},
  };
}

// Validate up to 3 databases in one shot. Returns what each resolved
// to so the frontend can surface " Contacts DB invalid — skipped"
// when needed.
async function validateConnection(token, { transactions, contacts, companies }) {
  const out = { transactions: null, contacts: null, companies: null };
  const errors = {};
  for (const [key, id] of Object.entries({ transactions, contacts, companies })) {
    if (!id) continue;
    try {
      const db = await fetchDatabase(token, id);
      out[key] = { id: db.id, name: db.name, properties: db.properties };
    } catch (err) {
      // Preserve the HTTP status + Notion error code so the caller
      // can tell "invalid token" (401 / unauthorized) apart from
      // "invalid database id" (404 / object_not_found).
      errors[key] = {
        message: err.message,
        status: err.status || null,
        code: err.body?.code || null,
      };
    }
  }
  return { databases: out, errors };
}

// ─── Property builder ──────────────────────────────────────────────
function buildNotionProperty(spec, value) {
  if (value === undefined || value === null || value === '') return null;
  const str = String(value);
  switch (spec.type) {
    case 'title':        return { title:     [{ text: { content: str.slice(0, 2000) } }] };
    case 'rich_text':    return { rich_text: [{ text: { content: str.slice(0, 2000) } }] };
    case 'email':        return { email: str };
    case 'phone_number': return { phone_number: str };
    case 'url':          return { url: str };
    case 'number':       { const n = parseFloat(value); return Number.isFinite(n) ? { number: n } : null; }
    case 'select':       return { select: { name: str.slice(0, 100) } };
    case 'status':       return { status: { name: str.slice(0, 100) } };
    case 'multi_select': return { multi_select: [{ name: str.slice(0, 100) }] };
    case 'checkbox':     return { checkbox: !!value && value !== 'false' };
    case 'date':         return { date: { start: new Date(str).toISOString().slice(0, 10) } };
    default:             return null;
  }
}

// Given a database schema + a mapping (refboost_field → notion_prop_name)
// + the flattened field/value map for the referral, build the Notion
// properties payload. Drops anything unmapped or unrepresentable.
// Always fills the db's title property even when the user didn't map
// it (Notion requires title-type pages to have a title).
function buildPropertiesFor(schema, mapping, values) {
  const properties = {};
  for (const [refField, propName] of Object.entries(mapping || {})) {
    if (!propName) continue;
    const spec = schema[propName];
    if (!spec) continue;
    const built = buildNotionProperty(spec, values[refField]);
    if (built) properties[propName] = built;
  }
  // Safety net for the title property — Notion refuses to create a
  // page without a title, so when the admin hasn't mapped anything to
  // the Title column we fill it ourselves. Prefers deal_name (the
  // explicit field for this purpose) and falls back through prospect
  // / company / email.
  const hasTitle = Object.entries(properties).some(([k]) => schema[k]?.type === 'title');
  if (!hasTitle) {
    const [titleKey] = Object.entries(schema).find(([, p]) => p.type === 'title') || [];
    const fallback = values.deal_name || values.prospect_name || values.company || values.email || '(sans titre)';
    if (titleKey) {
      properties[titleKey] = { title: [{ text: { content: String(fallback).slice(0, 2000) } }] };
    }
  }
  return properties;
}

// Find the relation property on `sourceSchema` whose target database_id
// matches `targetDbId`. Returns the property name or null.
function findRelationProperty(sourceSchema, targetDbId) {
  if (!targetDbId) return null;
  for (const [name, spec] of Object.entries(sourceSchema || {})) {
    if (spec.type === 'relation' && spec.relation?.database_id === targetDbId) {
      return name;
    }
  }
  return null;
}

// Look up a page in `databaseId` matching `{ property, equals }`.
async function searchPage(token, databaseId, property, filter) {
  try {
    const data = await notionFetch(token, `/databases/${encodeURIComponent(databaseId)}/query`, {
      method: 'POST',
      body: JSON.stringify({
        filter: { property, ...filter },
        page_size: 1,
      }),
    });
    return data?.results?.[0]?.id || null;
  } catch { return null; }
}

// ─── Sync ops ───────────────────────────────────────────────────────
async function pushReferralToNotion(referral, tenantId) {
  const cfg = await getTenantNotion(tenantId);
  if (!cfg) return { ok: false, reason: 'not_connected' };

  try {
    // Fetch schemas for every database we plan to write to.
    const [txnsDb, contactsDb, companiesDb] = await Promise.all([
      fetchDatabase(cfg.token, cfg.dbs.transactions),
      cfg.dbs.contacts  ? fetchDatabase(cfg.token, cfg.dbs.contacts).catch(() => null)  : null,
      cfg.dbs.companies ? fetchDatabase(cfg.token, cfg.dbs.companies).catch(() => null) : null,
    ]);

    // Translate the RefBoost stage slug ('new', 'contacted', 'won', …)
    // through the tenant's status-mapping into the Notion option name
    // ("Prospect", "Signé", …). When there's no mapping entry for this
    // slug we set status to undefined so buildPropertiesFor skips the
    // status property entirely — writing a bad option name into a
    // Notion Status field fails with a validation error.
    const mappedStatus = referral.status && cfg.statusMapping && cfg.statusMapping[referral.status]
      ? cfg.statusMapping[referral.status]
      : undefined;

    // Derive a deal / transaction name. Every Notion DB has exactly
    // one Title property and every page must have a title, so we want
    // a deterministic, human-readable value for it. RefBoost doesn't
    // store an explicit deal_name (yet) — we synthesize one the same
    // way HubSpot does: company, then prospect name, then a generic
    // fallback. Admins map this onto the Title property of their
    // Transactions DB in the mapping modal.
    const dealName = referral.prospect_company
      || referral.prospect_name
      || 'RefBoost referral';

    const values = {
      deal_name:     dealName,
      prospect_name: referral.prospect_name,
      email:         referral.prospect_email,
      phone:         referral.prospect_phone,
      company:       referral.prospect_company,
      notes:         referral.notes,
      status:        mappedStatus,
      mrr:           referral.deal_value,
      partner_name:  referral.partner_name,
      role:          referral.prospect_role,
    };

    // ── 1. Company ──
    let companyId = referral.notion_company_id || null;
    if (companiesDb && values.company) {
      const mapping = cfg.mappings.companies || {};
      const nameProp = mapping.company || findTitleProp(companiesDb.rawSchema);
      // Search by title for existing row.
      if (!companyId && nameProp) {
        companyId = await searchPage(cfg.token, cfg.dbs.companies, nameProp, { title: { equals: values.company } });
      }
      const properties = buildPropertiesFor(companiesDb.rawSchema, mapping, values);
      if (companyId) {
        await notionFetch(cfg.token, `/pages/${companyId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
      } else {
        const created = await notionFetch(cfg.token, '/pages', {
          method: 'POST',
          body: JSON.stringify({ parent: { database_id: cfg.dbs.companies }, properties }),
        });
        companyId = created?.id || null;
      }
    }

    // ── 2. Contact ──
    let contactId = referral.notion_contact_id || null;
    if (contactsDb && values.email) {
      const mapping = cfg.mappings.contacts || {};
      const emailProp = mapping.email;
      if (!contactId && emailProp) {
        const schemaType = contactsDb.rawSchema[emailProp]?.type;
        const filter = schemaType === 'email'
          ? { email: { equals: values.email } }
          : { rich_text: { equals: values.email } };
        contactId = await searchPage(cfg.token, cfg.dbs.contacts, emailProp, filter);
      }
      const properties = buildPropertiesFor(contactsDb.rawSchema, mapping, values);
      // Auto-relation: if the Contacts DB has a relation property that
      // points at the Companies DB, populate it with the company we
      // just upserted.
      const contactToCompany = findRelationProperty(contactsDb.rawSchema, cfg.dbs.companies);
      if (contactToCompany && companyId) {
        properties[contactToCompany] = { relation: [{ id: companyId }] };
      }
      if (contactId) {
        await notionFetch(cfg.token, `/pages/${contactId}`, { method: 'PATCH', body: JSON.stringify({ properties }) });
      } else {
        const created = await notionFetch(cfg.token, '/pages', {
          method: 'POST',
          body: JSON.stringify({ parent: { database_id: cfg.dbs.contacts }, properties }),
        });
        contactId = created?.id || null;
      }
    }

    // ── 3. Transaction (always) ──
    const txMapping = cfg.mappings.transactions || {};
    const txProperties = buildPropertiesFor(txnsDb.rawSchema, txMapping, values);
    // Auto-relations: link the new transaction to contact/company when
    // the Transactions DB schema exposes relations pointing at them.
    const txToContact = findRelationProperty(txnsDb.rawSchema, cfg.dbs.contacts);
    const txToCompany = findRelationProperty(txnsDb.rawSchema, cfg.dbs.companies);
    if (txToContact && contactId) txProperties[txToContact] = { relation: [{ id: contactId }] };
    if (txToCompany && companyId) txProperties[txToCompany] = { relation: [{ id: companyId }] };

    let transactionId = referral.notion_transaction_id || referral.notion_page_id || null;
    let linkStatus = null;

    if (transactionId) {
      // Already linked on the referral → PATCH the known page.
      await notionFetch(cfg.token, `/pages/${transactionId}`, { method: 'PATCH', body: JSON.stringify({ properties: txProperties }) });
      linkStatus = 'updated';
    } else {
      // Dedup probe: look for a pre-existing page in the Transactions
      // DB that matches this prospect. Priority:
      //   1. mapped email property on Transactions (most reliable)
      //   2. title property matched against prospect_name (fallback)
      // If a match is found we link the referral to that page instead
      // of creating a new one — universal "check email first" rule.
      const emailProp = txMapping.email;
      let dedupId = null;
      if (emailProp && values.email) {
        const schemaType = txnsDb.rawSchema[emailProp]?.type;
        const filter = schemaType === 'email'
          ? { email: { equals: values.email } }
          : { rich_text: { equals: values.email } };
        dedupId = await searchPage(cfg.token, cfg.dbs.transactions, emailProp, filter);
      }
      if (!dedupId && values.prospect_name) {
        const titleKey = findTitleProp(txnsDb.rawSchema);
        if (titleKey) {
          dedupId = await searchPage(cfg.token, cfg.dbs.transactions, titleKey, { title: { equals: values.prospect_name } });
        }
      }
      if (dedupId) {
        await notionFetch(cfg.token, `/pages/${dedupId}`, { method: 'PATCH', body: JSON.stringify({ properties: txProperties }) });
        transactionId = dedupId;
        linkStatus = 'linked_existing';
      } else {
        const created = await notionFetch(cfg.token, '/pages', {
          method: 'POST',
          body: JSON.stringify({ parent: { database_id: cfg.dbs.transactions }, properties: txProperties }),
        });
        transactionId = created?.id || null;
        linkStatus = 'created_new';
      }
    }

    // Persist every id we resolved + the unified link status flag so
    // the Kanban card can badge this referral as synced.
    await query(
      `UPDATE referrals
          SET notion_transaction_id = COALESCE($1, notion_transaction_id),
              notion_contact_id     = COALESCE($2, notion_contact_id),
              notion_company_id     = COALESCE($3, notion_company_id),
              notion_page_id        = COALESCE($1, notion_page_id),
              crm_link_status       = COALESCE($4, crm_link_status)
        WHERE id = $5`,
      [transactionId, contactId, companyId, linkStatus, referral.id]
    );

    // Sync-log entry — unifies with the HubSpot sync-history view.
    // operation mirrors crm_link_status so the UI can render the same
    // badge in both places.
    logSync(tenantId, {
      action: 'push',
      status: 'success',
      referralId: referral.id,
      details: {
        operation: linkStatus === 'created_new' ? 'create'
          : linkStatus === 'linked_existing' ? 'linked_existing'
            : 'update',
        linkStatus,
        transaction_id: transactionId,
        contact_id: contactId,
        company_id: companyId,
        prospect_name: referral.prospect_name,
      },
    });

    return { ok: true, transactionId, contactId, companyId, linkStatus };
  } catch (err) {
    console.error('[notion.push]', err.message, err.body || '');
    logSync(tenantId, {
      action: 'push',
      status: 'error',
      referralId: referral.id,
      details: { message: err.message, status: err.status || null, code: err.body?.code || null },
    });
    return { ok: false, error: err.message };
  }
}

function findTitleProp(schema) {
  const entry = Object.entries(schema || {}).find(([, p]) => p.type === 'title');
  return entry ? entry[0] : null;
}

// ─── Pull ───────────────────────────────────────────────────────────
async function pullFromNotion(tenantId) {
  const cfg = await getTenantNotion(tenantId);
  if (!cfg) return { ok: false, reason: 'not_connected' };

  try {
    const pages = await notionFetch(cfg.token, `/databases/${encodeURIComponent(cfg.dbs.transactions)}/query`, {
      method: 'POST',
      body: JSON.stringify({ page_size: 100, sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }] }),
    });

    // Reverse the Transaction mapping so we know which Notion prop
    // name maps back to which RefBoost field.
    const txReverse = reverseMap(cfg.mappings.transactions);
    const ctReverse = reverseMap(cfg.mappings.contacts);
    const coReverse = reverseMap(cfg.mappings.companies);

    let updated = 0;
    for (const page of (pages.results || [])) {
      if (cfg.lastSync && new Date(page.last_edited_time) <= new Date(cfg.lastSync)) continue;
      const { rows: [referral] } = await query(
        'SELECT id FROM referrals WHERE notion_transaction_id = $1 AND tenant_id = $2',
        [page.id, tenantId]
      );
      if (!referral) continue;

      const patch = {};
      mergeReadable(patch, page.properties, txReverse);

      // Follow relations into Contacts / Companies for fuller enrichment.
      if (cfg.dbs.contacts) {
        const relProp = firstRelationPropValue(page.properties);
        for (const contactPageId of (relProp.get('contacts') || [])) {
          const contactPage = await notionFetch(cfg.token, `/pages/${contactPageId}`).catch(() => null);
          if (contactPage?.properties) mergeReadable(patch, contactPage.properties, ctReverse);
        }
      }
      if (cfg.dbs.companies) {
        const relProp = firstRelationPropValue(page.properties);
        for (const companyPageId of (relProp.get('companies') || [])) {
          const companyPage = await notionFetch(cfg.token, `/pages/${companyPageId}`).catch(() => null);
          if (companyPage?.properties) mergeReadable(patch, companyPage.properties, coReverse);
        }
      }

      // Write the patch back (translate RefBoost keys → column names).
      const colMap = {
        prospect_name: 'prospect_name', email: 'prospect_email', phone: 'prospect_phone',
        company: 'prospect_company', notes: 'notes', role: 'prospect_role',
      };
      const sets = [];
      const params = [];
      let i = 1;
      for (const [k, v] of Object.entries(patch)) {
        const col = colMap[k];
        if (!col || v == null || v === '') continue;
        sets.push(`${col} = $${i++}`); params.push(v);
      }
      if (sets.length) {
        params.push(referral.id);
        await query(`UPDATE referrals SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${i}`, params);
        updated++;
      }
    }

    await query('UPDATE tenants SET notion_last_sync = NOW() WHERE id = $1', [tenantId]);
    return { ok: true, updated };
  } catch (err) {
    console.error('[notion.pull]', err.message, err.body || '');
    return { ok: false, error: err.message };
  }
}

function reverseMap(mapping) {
  const out = {};
  for (const [refField, propName] of Object.entries(mapping || {})) {
    if (propName) out[propName] = refField;
  }
  return out;
}

function mergeReadable(patch, props, reverse) {
  for (const [propName, prop] of Object.entries(props || {})) {
    const refField = reverse[propName];
    if (!refField) continue;
    const val = readNotionText(prop);
    if (val != null && val !== '') patch[refField] = val;
  }
}

// Group all relation-property values on a page into a Map keyed by
// the target database shorthand (best-effort: keys are "contacts" /
// "companies" lookups done server-side). Here we return a generic
// "all relations" bucket so the caller can inspect them.
function firstRelationPropValue(props) {
  const out = new Map();
  const bucket = [];
  for (const prop of Object.values(props || {})) {
    if (prop.type === 'relation') {
      for (const r of (prop.relation || [])) bucket.push(r.id);
    }
  }
  out.set('contacts', bucket);
  out.set('companies', bucket);
  return out;
}

function readNotionText(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':        return (prop.title || []).map(t => t.plain_text).join('').trim();
    case 'rich_text':    return (prop.rich_text || []).map(t => t.plain_text).join('').trim();
    case 'email':        return prop.email || null;
    case 'phone_number': return prop.phone_number || null;
    case 'url':          return prop.url || null;
    case 'number':       return prop.number != null ? String(prop.number) : null;
    case 'select':       return prop.select?.name || null;
    case 'status':       return prop.status?.name || null;
    default:             return null;
  }
}

// ─── Bulk push ──────────────────────────────────────────────────────
// Iterates over every referral for the tenant and calls
// pushReferralToNotion one by one. Sequential on purpose — Notion
// rate-limits pretty aggressively (~3 req/s per integration), and
// pushReferralToNotion itself fires 1 request per resolved page
// (Company → Contact → Transaction), so a parallel fan-out would
// trip the limiter on any reasonably-sized pipeline.
async function pushAllReferralsToNotion(tenantId) {
  const cfg = await getTenantNotion(tenantId);
  if (!cfg) return { ok: false, reason: 'not_connected' };

  const { rows: referrals } = await query(
    `SELECT r.*, p.name AS partner_name
       FROM referrals r
       LEFT JOIN partners p ON p.id = r.partner_id
      WHERE r.tenant_id = $1
      ORDER BY r.created_at ASC`,
    [tenantId]
  );

  let pushed = 0;
  let failed = 0;
  const errors = [];
  for (const ref of referrals) {
    const result = await pushReferralToNotion(ref, tenantId);
    if (result.ok) pushed++;
    else {
      failed++;
      if (errors.length < 5) errors.push({ referral_id: ref.id, message: result.error });
    }
  }
  return { ok: true, total: referrals.length, pushed, failed, errors };
}

module.exports = {
  validateConnection,
  fetchDatabase,
  normalizeDatabaseId,
  getTenantNotion,
  pushReferralToNotion,
  pushAllReferralsToNotion,
  pullFromNotion,
  ensureNotionIntegrationRow,
  markNotionIntegrationInactive,
};
