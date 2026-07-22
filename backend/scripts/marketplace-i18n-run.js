// Bulk marketplace translation across all marketplace-visible tenants.
// Uses the deployed translatePage (fingerprint-aware): re-translates
// only stale/missing fields, populates tenant_levels.name_i18n.
//
// Run against prod via:
//   railway run node backend/scripts/marketplace-i18n-run.js            (real)
//   railway run node backend/scripts/marketplace-i18n-run.js --dry-run  (no writes; still calls API)
const { query } = require('../db');
const { translatePage } = require('../services/marketplaceTranslateService');

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const onlySlug = (process.argv.find(a => a.startsWith('--slug=')) || '').split('=')[1] || null;

  let sql = `SELECT id, name, slug FROM tenants
              WHERE marketplace_visible = true
                AND short_description IS NOT NULL AND short_description <> ''`;
  const params = [];
  if (onlySlug) { params.push(onlySlug); sql += ` AND slug = $1`; }
  sql += ' ORDER BY name';
  const { rows: tenants } = await query(sql, params);
  console.log(`${dryRun ? '[DRY-RUN] ' : ''}${tenants.length} tenant(s) à traiter${onlySlug ? ` (slug=${onlySlug})` : ''}\n`);

  const totals = { done: 0, skipped: 0, failed: 0 };
  for (let i = 0; i < tenants.length; i++) {
    const t = tenants[i];
    console.log(`\n===== [${i + 1}/${tenants.length}] ${t.name} (${t.slug}) =====`);
    try {
      const r = await translatePage(t.id, { dryRun, log: m => console.log('  ' + m) });
      console.log(`  → done=${r.done} skipped=${r.skipped} failed=${r.failed}`);
      totals.done += r.done; totals.skipped += r.skipped; totals.failed += r.failed;
    } catch (e) {
      console.error(`  ERREUR tenant ${t.slug}: ${e.message}`);
      totals.failed++;
    }
  }
  console.log(`\n===== TOTAL ${dryRun ? '(DRY-RUN) ' : ''}done=${totals.done} skipped=${totals.skipped} failed=${totals.failed} =====`);
  process.exit(0);
})().catch(e => { console.error('RUN ERROR:', e.message); process.exit(1); });
