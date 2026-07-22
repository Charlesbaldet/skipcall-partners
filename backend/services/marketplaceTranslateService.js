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

const crypto = require('crypto');
const { query } = require('../db');
const base = require('./translateContentService');

const TARGET_LANGS = base.TARGET_LANGS; // [{ code, name }, ...]

// ─── Source fingerprint (freshness) ─────────────────────────────────
// Each `<col>_i18n` JSONB now carries a reserved `_srchash` key holding
// a fingerprint of the FR source that produced its translations. A lang
// entry is considered stale (and re-translated) whenever the current
// source fingerprint differs from the stored one — so editing or adding
// a reference/why-join item after a first translation run is no longer
// silently skipped. Consumers only ever read i18nObj[<2-letter-lang>]
// (see pickI18n in routes/marketplace.js), so `_srchash` is invisible
// to the public page.
function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}
function srcHash(value) {
  return crypto.createHash('sha1').update(stableStringify(value == null ? null : value)).digest('hex').slice(0, 16);
}
// Fresh iff the language entry exists (per `hasValue`) AND the stored
// source fingerprint matches the current one. A missing `_srchash`
// (legacy rows translated before this feature) is treated as stale so
// the next run refreshes any content that drifted from its source.
function isFresh(i18nObj, code, currentHash, hasValue) {
  if (!i18nObj || typeof i18nObj !== 'object') return false;
  if (i18nObj._srchash !== currentHash) return false;
  return hasValue(i18nObj[code]);
}
const hasStr = v => typeof v === 'string' ? !!v.trim() : (v != null && String(v).trim() !== '');
const hasArr = v => Array.isArray(v) && v.length > 0;

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
    `SELECT page_description, ideal_client, ideal_client_tags, why_join, commission_blocks,
            client_references, additional_info,
            page_description_i18n, ideal_client_i18n, ideal_client_tags_i18n, why_join_i18n,
            commission_blocks_i18n, client_references_i18n, additional_info_i18n
       FROM marketplace_settings WHERE tenant_id = $1`,
    [tenantId]
  );
  // Tier names live on tenant_levels (separate table) — translated into
  // name_i18n alongside the page content so the public program page can
  // localize them.
  const { rows: levelRows } = await query(
    `SELECT id, name, name_i18n FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC, min_threshold ASC`,
    [tenantId]
  );
  if (!rows.length && !levelRows.length) {
    log('no marketplace_settings row and no tenant_levels — nothing to translate');
    return { done: 0, skipped: 0, failed: 0 };
  }
  const src = rows[0] || {};
  log(`fields: page_description=${!!src.page_description} ideal_client=${!!src.ideal_client} ideal_client_tags=${(src.ideal_client_tags || []).length} why_join=${(src.why_join || []).length} commission_blocks=${(src.commission_blocks || []).length} client_references=${(src.client_references || []).length} additional_info=${(src.additional_info || []).length} tenant_levels=${levelRows.length}`);

  // Source fingerprints, computed once from the original snapshot so
  // every language in the loop below makes the same staleness decision
  // (the in-loop UPDATEs don't mutate `src`).
  const H = {
    page_description: srcHash(src.page_description),
    ideal_client: srcHash(src.ideal_client),
    ideal_client_tags: srcHash(src.ideal_client_tags || []),
    why_join: srcHash(src.why_join || []),
    commission_blocks: srcHash(src.commission_blocks || []),
    client_references: srcHash(src.client_references || []),
    additional_info: srcHash(src.additional_info || []),
  };

  let done = 0, skipped = 0, failed = 0;

  for (const { code, name } of TARGET_LANGS) {
    log(`── ${code} (${name})`);

    // Text fields: page_description, ideal_client.
    for (const [col, i18nCol] of [
      ['page_description', 'page_description_i18n'],
      ['ideal_client', 'ideal_client_i18n'],
    ]) {
      if (isFresh(src[i18nCol], code, H[col], hasStr)) { skipped++; continue; }
      const value = src[col];
      if (!value || !String(value).trim()) { skipped++; continue; }
      try {
        const translated = await translateText({ text: value, targetLangName: name, kind: 'description', log });
        if (translated && !dryRun) {
          await query(
            `UPDATE marketplace_settings
                SET ${i18nCol} = COALESCE(${i18nCol}, '{}'::jsonb) || jsonb_build_object($2::text, $3::text, '_srchash', $4::text),
                    updated_at = NOW()
              WHERE tenant_id = $1`,
            [tenantId, code, translated, H[col]]
          );
          log(`   ${col}: ${translated.slice(0, 60)}${translated.length > 60 ? '…' : ''}`);
          done++;
        }
      } catch (err) { failed++; log(`   ${col} failed: ${err.message}`); }
    }

    // ideal_client_tags — TEXT[] of short labels. We translate each
    // entry individually with kind='label' so the model treats them
    // as terse phrases rather than running prose. Result stored as a
    // JSON array inside ideal_client_tags_i18n[code].
    {
      const fresh = isFresh(src.ideal_client_tags_i18n, code, H.ideal_client_tags, hasArr);
      const items = Array.isArray(src.ideal_client_tags) ? src.ideal_client_tags : [];
      if (fresh || !items.length) { skipped++; }
      else {
        try {
          const translated = [];
          for (const tag of items) {
            if (!tag || typeof tag !== 'string' || !tag.trim()) { translated.push(tag); continue; }
            try {
              const v = await base.translate({ text: tag, targetLangName: name, kind: 'label', log });
              translated.push(v || tag);
            } catch (err) {
              log(`   ideal_client_tags item "${tag}" failed: ${err.message}`);
              translated.push(tag);
            }
          }
          if (!dryRun) {
            await query(
              `UPDATE marketplace_settings
                  SET ideal_client_tags_i18n = COALESCE(ideal_client_tags_i18n, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb, '_srchash', $4::text),
                      updated_at = NOW()
                WHERE tenant_id = $1`,
              [tenantId, code, JSON.stringify(translated), H.ideal_client_tags]
            );
            log(`   ideal_client_tags: ${translated.length} item(s)`);
            done++;
          }
        } catch (err) { failed++; log(`   ideal_client_tags failed: ${err.message}`); }
      }
    }

    // JSONB array fields: why_join, commission_blocks, client_references, additional_info.
    for (const [col, i18nCol] of [
      ['why_join', 'why_join_i18n'],
      ['commission_blocks', 'commission_blocks_i18n'],
      ['client_references', 'client_references_i18n'],
      ['additional_info', 'additional_info_i18n'],
    ]) {
      if (isFresh(src[i18nCol], code, H[col], hasArr)) { skipped++; continue; }
      const items = Array.isArray(src[col]) ? src[col] : [];
      if (!items.length) { skipped++; continue; }
      try {
        const translatedArr = await translateArrayField(items, col, name, log);
        if (!dryRun) {
          await query(
            `UPDATE marketplace_settings
                SET ${i18nCol} = COALESCE(${i18nCol}, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb, '_srchash', $4::text),
                    updated_at = NOW()
              WHERE tenant_id = $1`,
            [tenantId, code, JSON.stringify(translatedArr), H[col]]
          );
          log(`   ${col}: ${translatedArr.length} item(s)`);
          done++;
        }
      } catch (err) { failed++; log(`   ${col} failed: ${err.message}`); }
    }

    // Tier names (tenant_levels.name) → name_i18n[code]. Short labels,
    // translated with kind='label'. Each level has its own fingerprint
    // since names differ per row.
    for (const lvl of levelRows) {
      const nm = lvl.name;
      if (!nm || !String(nm).trim()) { skipped++; continue; }
      const h = srcHash(nm);
      if (isFresh(lvl.name_i18n, code, h, hasStr)) { skipped++; continue; }
      try {
        const translated = await base.translate({ text: nm, targetLangName: name, kind: 'label', log });
        if (translated && !dryRun) {
          await query(
            `UPDATE tenant_levels
                SET name_i18n = COALESCE(name_i18n, '{}'::jsonb) || jsonb_build_object($2::text, $3::text, '_srchash', $4::text)
              WHERE id = $1`,
            [lvl.id, code, translated, h]
          );
          log(`   level "${nm}" → ${translated}`);
          done++;
        }
      } catch (err) { failed++; log(`   level "${nm}" failed: ${err.message}`); }
    }
  }

  return { done, skipped, failed };
}

module.exports = { translatePage };
