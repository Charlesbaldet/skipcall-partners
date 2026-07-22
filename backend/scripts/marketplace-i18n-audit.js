// READ-ONLY audit of marketplace translation freshness across all
// marketplace-visible tenants. No Anthropic calls, no writes. Also
// doubles as a migration check: SELECTing tenant_levels.name_i18n fails
// if migration v69 hasn't run yet.
//
// Run against prod via:  railway run node backend/scripts/marketplace-i18n-audit.js
const crypto = require('crypto');
const { query } = require('../db');
const base = require('../services/translateContentService');

const TARGET_LANGS = base.TARGET_LANGS; // [{code,name}, ...] non-fr

function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v === undefined ? null : v);
}
const srcHash = v => crypto.createHash('sha1').update(stableStringify(v == null ? null : v)).digest('hex').slice(0, 16);
function isFresh(i18nObj, code, h, hasValue) {
  if (!i18nObj || typeof i18nObj !== 'object') return false;
  if (i18nObj._srchash !== h) return false;
  return hasValue(i18nObj[code]);
}
const hasStr = v => typeof v === 'string' ? !!v.trim() : (v != null && String(v).trim() !== '');
const hasArr = v => Array.isArray(v) && v.length > 0;

(async () => {
  const { rows: tenants } = await query(
    `SELECT id, name, slug FROM tenants
      WHERE marketplace_visible = true
        AND short_description IS NOT NULL AND short_description <> ''
      ORDER BY name`);
  console.log(`${tenants.length} tenant(s) marketplace_visible\n`);

  let grandUnits = 0;
  for (const t of tenants) {
    const { rows: msRows } = await query(
      `SELECT page_description, ideal_client, ideal_client_tags, why_join, commission_blocks,
              client_references, additional_info,
              page_description_i18n, ideal_client_i18n, ideal_client_tags_i18n, why_join_i18n,
              commission_blocks_i18n, client_references_i18n, additional_info_i18n
         FROM marketplace_settings WHERE tenant_id = $1`, [t.id]);
    const s = msRows[0] || {};
    const { rows: levels } = await query(
      `SELECT id, name, name_i18n FROM tenant_levels WHERE tenant_id = $1 ORDER BY position ASC`, [t.id]);

    const textFields = [
      ['page_description', 'page_description_i18n', hasStr],
      ['ideal_client', 'ideal_client_i18n', hasStr],
      ['ideal_client_tags', 'ideal_client_tags_i18n', hasArr],
      ['why_join', 'why_join_i18n', hasArr],
      ['commission_blocks', 'commission_blocks_i18n', hasArr],
      ['client_references', 'client_references_i18n', hasArr],
      ['additional_info', 'additional_info_i18n', hasArr],
    ];
    let units = 0; const detail = [];
    for (const [col, i18nCol, has] of textFields) {
      const val = s[col];
      const present = has(val);
      if (!present) continue;
      const h = srcHash(val || (Array.isArray(val) ? [] : val));
      let stale = 0;
      for (const { code } of TARGET_LANGS) if (!isFresh(s[i18nCol], code, h, has)) stale++;
      if (stale) { units += stale; detail.push(`${col}:${stale}/${TARGET_LANGS.length}`); }
    }
    // tier names
    let tierStale = 0;
    for (const lvl of levels) {
      if (!hasStr(lvl.name)) continue;
      const h = srcHash(lvl.name);
      for (const { code } of TARGET_LANGS) if (!isFresh(lvl.name_i18n, code, h, hasStr)) tierStale++;
    }
    if (tierStale) { units += tierStale; detail.push(`tiers:${tierStale}`); }

    grandUnits += units;
    const flag = units === 0 ? '✓ à jour' : `→ ${units} traductions manquantes/périmées`;
    console.log(`• ${t.name} (${t.slug}) [levels:${levels.length}] ${flag}${detail.length ? '  {' + detail.join(', ') + '}' : ''}`);
  }
  const mins = Math.ceil(grandUnits / 5); // throttle ~5 req/min
  console.log(`\nTOTAL: ${grandUnits} appels de traduction à faire · ~${mins} min à 5 req/min (${(mins/60).toFixed(1)} h)`);
  process.exit(0);
})().catch(e => { console.error('AUDIT ERROR:', e.message); process.exit(1); });
