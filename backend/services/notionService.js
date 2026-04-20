const { query } = require('../db');
const { encrypt, decrypt } = require('../middleware/security');

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

// ─── Config lookup ──────────────────────────────────────────────────
async function getTenantNotion(tenantId) {
  const { rows } = await query(
    `SELECT notion_token, notion_database_id, notion_database_name,
            notion_connected, notion_field_mapping
       FROM tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  );
  const t = rows[0];
  if (!t || !t.notion_connected || !t.notion_token || !t.notion_database_id) return null;
  return {
    token: decrypt(t.notion_token),
    databaseId: t.notion_database_id,
    databaseName: t.notion_database_name,
    mapping: t.notion_field_mapping || {},
  };
}

// ─── HTTP helper (rate-limit tolerant) ──────────────────────────────
// Notion's API is rate-limited at ~3 RPS; keep one small delay between
// sequential writes so a bulk pull doesn't get 429'd. For the
// one-off sync endpoints we call from the UI this is overkill but
// harmless.
async function notionFetch(token, path, init = {}) {
  const res = await fetch(NOTION_API + path, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data?.message || 'Notion error');
    err.status = res.status;
    err.body = data;
    throw err;
  }
  return data;
}

async function validateToken(token, databaseId) {
  const db = await notionFetch(token, `/databases/${encodeURIComponent(databaseId)}`);
  const name = (db.title || [])
    .map(t => (t.plain_text || t.text?.content || '')).join('')
    .trim() || 'Notion database';
  const properties = Object.entries(db.properties || {}).map(([key, p]) => ({
    id: p.id, name: key, type: p.type,
  }));
  return { databaseName: name, properties };
}

// ─── Property builder ──────────────────────────────────────────────
// Given a Notion property spec + a primitive value, build the exact
// request body Notion expects for that property type. Returns null
// when we can't represent the value (so the caller can skip).
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

// Map RefBoost referral → Notion properties using the tenant's
// configured mapping + the database schema (type info).
async function buildPropertiesFromReferral(referral, token, databaseId, mapping) {
  const db = await notionFetch(token, `/databases/${encodeURIComponent(databaseId)}`);
  const schema = db.properties || {};

  const fieldValue = {
    prospect_name: referral.prospect_name,
    email:         referral.prospect_email,
    phone:         referral.prospect_phone,
    company:       referral.prospect_company,
    notes:         referral.notes,
    status:        referral.status,
    mrr:           referral.deal_value,
    partner_name:  referral.partner_name,
  };

  const properties = {};
  for (const [refboostField, notionPropName] of Object.entries(mapping || {})) {
    if (!notionPropName) continue;
    const spec = schema[notionPropName];
    if (!spec) continue;
    const built = buildNotionProperty({ ...spec, id: spec.id }, fieldValue[refboostField]);
    if (built) properties[notionPropName] = built;
  }

  // Safety: Notion requires a 'title' property. If the mapping didn't
  // set one (e.g. user never configured mappings), pick the first
  // title property and fill it with prospect_name so the page actually
  // lands in the database.
  const hasTitle = Object.entries(properties).some(([k]) => schema[k]?.type === 'title');
  if (!hasTitle) {
    const [titleKey] = Object.entries(schema).find(([, p]) => p.type === 'title') || [];
    if (titleKey && referral.prospect_name) {
      properties[titleKey] = { title: [{ text: { content: String(referral.prospect_name).slice(0, 2000) } }] };
    }
  }

  return { properties, schema };
}

// ─── Sync ops ───────────────────────────────────────────────────────
async function pushReferralToNotion(referral, tenantId) {
  const cfg = await getTenantNotion(tenantId);
  if (!cfg) return { ok: false, reason: 'not_connected' };

  try {
    const { properties } = await buildPropertiesFromReferral(referral, cfg.token, cfg.databaseId, cfg.mapping);

    if (referral.notion_page_id) {
      // Update
      await notionFetch(cfg.token, `/pages/${referral.notion_page_id}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });
      return { ok: true, action: 'updated', pageId: referral.notion_page_id };
    }
    // Create
    const created = await notionFetch(cfg.token, '/pages', {
      method: 'POST',
      body: JSON.stringify({
        parent: { database_id: cfg.databaseId },
        properties,
      }),
    });
    if (created.id) {
      await query('UPDATE referrals SET notion_page_id = $1 WHERE id = $2', [created.id, referral.id]);
    }
    return { ok: true, action: 'created', pageId: created.id };
  } catch (err) {
    console.error('[notion.push]', err.message, err.body || '');
    return { ok: false, error: err.message };
  }
}

// Pull: fetch recently edited pages, match on notion_page_id, and
// update the local referral row with any mapped text/email/phone/
// company/notes fields whose Notion value is newer.
async function pullFromNotion(tenantId) {
  const cfg = await getTenantNotion(tenantId);
  if (!cfg) return { ok: false, reason: 'not_connected' };

  try {
    const since = (await query('SELECT notion_last_sync FROM tenants WHERE id = $1', [tenantId])).rows[0]?.notion_last_sync;
    const body = {
      page_size: 100,
      sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
    };
    const pages = await notionFetch(cfg.token, `/databases/${encodeURIComponent(cfg.databaseId)}/query`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const reverseMap = {}; // notion_property_name → refboost_field
    for (const [refField, notionName] of Object.entries(cfg.mapping || {})) {
      if (notionName) reverseMap[notionName] = refField;
    }
    const textyRefFields = new Set(['prospect_name', 'email', 'phone', 'company', 'notes', 'partner_name']);

    let updated = 0;
    for (const page of (pages.results || [])) {
      // Only touch pages whose last edit is newer than our last sync.
      if (since && new Date(page.last_edited_time) <= new Date(since)) continue;
      const { rows: [referral] } = await query(
        'SELECT id FROM referrals WHERE notion_page_id = $1 AND tenant_id = $2',
        [page.id, tenantId]
      );
      if (!referral) continue;

      const sets = [];
      const params = [];
      let i = 1;
      for (const [propName, prop] of Object.entries(page.properties || {})) {
        const refField = reverseMap[propName];
        if (!refField || !textyRefFields.has(refField)) continue;
        const val = readNotionText(prop);
        if (val == null) continue;
        const col = ({ prospect_name: 'prospect_name', email: 'prospect_email', phone: 'prospect_phone', company: 'prospect_company', notes: 'notes' })[refField];
        if (!col) continue;
        sets.push(`${col} = $${i++}`);
        params.push(val);
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

function readNotionText(prop) {
  if (!prop) return null;
  switch (prop.type) {
    case 'title':       return (prop.title || []).map(t => t.plain_text).join('').trim();
    case 'rich_text':   return (prop.rich_text || []).map(t => t.plain_text).join('').trim();
    case 'email':       return prop.email || null;
    case 'phone_number': return prop.phone_number || null;
    case 'url':         return prop.url || null;
    case 'number':      return prop.number != null ? String(prop.number) : null;
    case 'select':      return prop.select?.name || null;
    case 'status':      return prop.status?.name || null;
    default:            return null;
  }
}

module.exports = {
  validateToken,
  getTenantNotion,
  pushReferralToNotion,
  pullFromNotion,
};
