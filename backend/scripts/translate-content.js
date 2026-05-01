#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// One-off CLI: translate marketplace descriptions, partner descriptions
// and blog posts from FR into EN/ES/DE/IT/NL/PT using the Anthropic API.
//
// Idempotent: skips any row where the target-language column is already
// populated. Safe to re-run after adding new rows.
//
// Prerequisites:
//   1. backend/db/migrate.js v23 has run (per-language columns exist).
//      On Railway this happens automatically on every deploy.
//   2. ANTHROPIC_API_KEY is set in the environment.
//   3. DATABASE_URL points at the target Postgres.
//
// Usage:
//   node backend/scripts/translate-content.js
//   node backend/scripts/translate-content.js --dry-run
//
// Same logic also exposed at POST /api/admin/translate-blog for the
// case where the admin wants to trigger it from the browser/curl.
// ═══════════════════════════════════════════════════════════════════════

require('dotenv').config();
const {
  MODEL,
  translateTenants,
  translatePartners,
  translateBlogPosts,
} = require('../services/translateContentService');

const DRY_RUN = process.argv.includes('--dry-run');
if (!process.env.ANTHROPIC_API_KEY) {
  console.error(' ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

const log = (msg) => console.log(msg);

(async () => {
  console.log(`Translate-content CLI (model=${MODEL})${DRY_RUN ? ' [DRY RUN]' : ''}`);
  try {
    const t = await translateTenants({ dryRun: DRY_RUN, log });
    console.log(`[tenants] done=${t.done} skipped=${t.skipped} failed=${t.failed}`);
    const p = await translatePartners({ dryRun: DRY_RUN, log });
    console.log(`[partners] done=${p.done} skipped=${p.skipped} failed=${p.failed}`);
    const b = await translateBlogPosts({ dryRun: DRY_RUN, log });
    console.log(`[blog_posts] done=${b.done} skipped=${b.skipped} failed=${b.failed}`);
    console.log('\n Done');
    process.exit(0);
  } catch (err) {
    console.error('\n Fatal:', err.message);
    process.exit(1);
  }
})();
