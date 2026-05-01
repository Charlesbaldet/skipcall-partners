// Marketplace page auto-translator. Reads the FR source fields off
// `marketplace_settings` for one tenant, translates them into the 6
// non-FR locales via Anthropic, and writes the results into the
// `<col>_i18n` JSONB columns.
//
// Reuses the throttle/retry primitive in translateContentService so we
// keep one rate-limit budget across the whole backend (5 req/min).
//
// Each call to `translatePage(tenantId)` is a full sweep: text fields
// + JSONB arrays of objects (why_join, commission_blocks, references,
// additional_info). Within each array, only the human-readable text
// fields are translated — ids and structural fields (is_primary,
// logo_url, etc.) are preserved verbatim.

const { query } = require('../db');
const base = require('./translateContentService');

const TARGET_LANGS = base.TARGET_LANGS; // [{ code, name }, ...]

// Per-array-row text-key whitelist. Anything not in this list is
// passed through unchanged so we don't translate slugs, ids, or
// boolean flags.
const ARRAY_TEXT_KEYS = {
  why_join: ['text'],
  commission_blocks: ['metric', 'label', 'description'],
  client_references: ['name', 'description'],
  additional_info: ['label', 'value'],
};

async function translateText({ text, targetLangName, kind = 'description', log }) {
  if (!text || typeof text !== 'string' || !text.trim()) return null;
  return base.translate({ text, targetLangName, kind, log });
}

// Translate a single array item in place — return a NEW object with
// the same structure but localized text fields.
async function translateItem(item, keys, targetLangName, log) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  for (const k of keys) {
    if (typeof item[k] !== 'string' || !item[k].trim()) continue;
    try {
      const translated = await translateText({ text: item[k], targetLangName, kind: 'description', log });
      if (translated) out[k] = translated;
    } catch (err) {
      log && log(`  item key=${k} failed: ${err.message}`);
    }
  }
  return out;
}

async function translateArrayField(value, columnName, targetLangName, log) {
  const keys = ARRAY_TEXT_KEYS[columnName] || [];
  if (!Array.isArray(value) || value.length === 0 || keys.length === 0) return [];
  const translated = [];
  for (const item of value) translated.push(await translateItem(item, keys, targetLangName, log));
  return translated;
}

async function translatePage(tenantId, { dryRun = false, log = () => {} } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');

  const { rows } = await query(
    `SELECT page_description, ideal_client, why_join, commission_blocks,
            client_references, additional_info,
            page_description_i18n, ideal_client_i18n, why_join_i18n,
            commission_blocks_i18n, client_references_i18n, additional_info_i18n
       FROM marketplace_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  if (!rows.length) {
    log('no marketplace_settings row — nothing to translate');
    return { done: 0, skipped: 0, failed: 0 };
  }
  const src = rows[0];
  log(`fields: page_description=${!!src.page_description} ideal_client=${!!src.ideal_client} why_join=${(src.why_join || []).length} commission_blocks=${(src.commission_blocks || []).length} client_references=${(src.client_references || []).length} additional_info=${(src.additional_info || []).length}`);

  let done = 0, skipped = 0, failed = 0;

  for (const { code, name } of TARGET_LANGS) {
    log(`── ${code} (${name})`);

    // Text fields: page_description, ideal_client.
    for (const [col, i18nCol] of [
      ['page_description', 'page_description_i18n'],
      ['ideal_client', 'ideal_client_i18n'],
    ]) {
      const existing = src[i18nCol] && src[i18nCol][code];
      if (existing && String(existing).trim()) { skipped++; continue; }
      const value = src[col];
      if (!value || !String(value).trim()) { skipped++; continue; }
      try {
        const translated = await translateText({ text: value, targetLangName: name, kind: 'description', log });
        if (translated && !dryRun) {
          await query(
            `UPDATE marketplace_settings
                SET ${i18nCol} = COALESCE(${i18nCol}, '{}'::jsonb) || jsonb_build_object($2::text, $3::text),
                    updated_at = NOW()
              WHERE tenant_id = $1`,
            [tenantId, code, translated]
          );
          log(`   ${col}: ${translated.slice(0, 60)}${translated.length > 60 ? '…' : ''}`);
          done++;
        }
      } catch (err) { failed++; log(`   ${col} failed: ${err.message}`); }
    }

    // JSONB array fields: why_join, commission_blocks, client_references, additional_info.
    for (const [col, i18nCol] of [
      ['why_join', 'why_join_i18n'],
      ['commission_blocks', 'commission_blocks_i18n'],
      ['client_references', 'client_references_i18n'],
      ['additional_info', 'additional_info_i18n'],
    ]) {
      const existing = src[i18nCol] && Array.isArray(src[i18nCol][code]) && src[i18nCol][code].length;
      if (existing) { skipped++; continue; }
      const items = Array.isArray(src[col]) ? src[col] : [];
      if (!items.length) { skipped++; continue; }
      try {
        const translatedArr = await translateArrayField(items, col, name, log);
        if (!dryRun) {
          await query(
            `UPDATE marketplace_settings
                SET ${i18nCol} = COALESCE(${i18nCol}, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
                    updated_at = NOW()
              WHERE tenant_id = $1`,
            [tenantId, code, JSON.stringify(translatedArr)]
          );
          log(`   ${col}: ${translatedArr.length} item(s)`);
          done++;
        }
      } catch (err) { failed++; log(`   ${col} failed: ${err.message}`); }
    }
  }

  return { done, skipped, failed };
}

module.exports = { translatePage };
