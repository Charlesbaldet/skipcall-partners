#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// One-off: translate marketplace descriptions and blog posts from FR
// into EN, ES, DE, IT, NL, PT using the Anthropic API.
//
// Idempotent: skips any row where the target-language column is already
// populated. Safe to re-run after adding new rows.
//
// Prerequisites:
//   1. Run backend/db/migrate_i18n_content.sql first.
//   2. Set ANTHROPIC_API_KEY in the environment.
//   3. DATABASE_URL must point at the target Postgres.
//
// Usage: node backend/scripts/translate-content.js
//        node backend/scripts/translate-content.js --dry-run
// ═══════════════════════════════════════════════════════════════════════

require('dotenv').config();
const { query } = require('../db');

const MODEL = 'claude-sonnet-4-20250514';
const TARGET_LANGS = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese (European)' },
];

const DRY_RUN = process.argv.includes('--dry-run');
const API_KEY = process.env.ANTHROPIC_API_KEY;
if (!API_KEY) {
  console.error('✗ ANTHROPIC_API_KEY is not set.');
  process.exit(1);
}

// ─── Rate-limit helpers ────────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Track the last request time to enforce a minimum spacing (5 req/min
// means >=12s between calls; use 13s for safety).
let lastCallAt = 0;
const MIN_SPACING_MS = 13000;
async function throttle() {
  const since = Date.now() - lastCallAt;
  if (since < MIN_SPACING_MS) await sleep(MIN_SPACING_MS - since);
  lastCallAt = Date.now();
}

// ─── Anthropic Messages API call ───────────────────────────────────────
async function translate(sourceText, targetLangName, kind) {
  // `kind` tells the model whether to preserve HTML, keep it short, etc.
  const instructions = {
    description: 'Translate the following French marketing description into {LANG}. Return only the translation, with no preamble, no quotes, no explanation. Preserve line breaks. Keep it concise and natural — this will be shown in a product marketplace card.',
    title: 'Translate the following French blog-post title into {LANG}. Return only the translated title, with no quotes or preamble. Keep the same tone and length.',
    meta: 'Translate the following French SEO meta description into {LANG}. Return only the translation (max ~160 characters), no quotes, no preamble.',
    content: 'Translate the following French blog article into {LANG}. Preserve ALL HTML tags exactly (including attributes, class names, href values, image src). Only translate human-readable text inside the tags and in text nodes. Return only the translated HTML, with no preamble, no fences, no explanation.',
  }[kind];
  if (!instructions) throw new Error(`unknown kind: ${kind}`);

  const system = instructions.replace('{LANG}', targetLangName);

  const body = {
    model: MODEL,
    max_tokens: kind === 'content' ? 16000 : 1024,
    system,
    messages: [{ role: 'user', content: sourceText }],
  };

  // Up to 5 attempts with backoff on 429 / 5xx.
  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await throttle();
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const out = (data.content || []).map(b => b.text || '').join('').trim();
      if (!out) throw new Error('empty response from Anthropic');
      return out;
    }

    const retryable = res.status === 429 || (res.status >= 500 && res.status < 600);
    const text = await res.text();
    lastErr = `Anthropic ${res.status}: ${text.slice(0, 200)}`;
    if (!retryable) throw new Error(lastErr);

    // Prefer server-supplied Retry-After (seconds). Otherwise exponential backoff.
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    const waitMs = Number.isFinite(ra) && ra > 0
      ? ra * 1000
      : Math.min(60000, 15000 * attempt);
    console.log(`    ⏳ ${res.status} — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/5)`);
    await sleep(waitMs);
  }
  throw new Error(lastErr || 'exhausted retries');
}

// ─── Tenants: short_description ────────────────────────────────────────
async function translateTenants() {
  const { rows } = await query(`
    SELECT id, name, short_description,
           short_description_en, short_description_es, short_description_de,
           short_description_it, short_description_nl, short_description_pt
    FROM tenants
    WHERE short_description IS NOT NULL AND short_description <> ''
  `);
  console.log(`\n[tenants] ${rows.length} row(s) with a short_description`);

  for (const row of rows) {
    for (const { code, name } of TARGET_LANGS) {
      const col = `short_description_${code}`;
      if (row[col] && row[col].trim()) {
        console.log(`  skip ${row.name} [${code}] — already translated`);
        continue;
      }
      try {
        const translated = await translate(row.short_description, name, 'description');
        console.log(`  ✓ ${row.name} [${code}]: ${translated.slice(0, 60)}${translated.length > 60 ? '…' : ''}`);
        if (!DRY_RUN) {
          await query(`UPDATE tenants SET ${col} = $1 WHERE id = $2`, [translated, row.id]);
        }
      } catch (err) {
        console.error(`  ✗ ${row.name} [${code}]: ${err.message}`);
      }
    }
  }
}

// ─── Partners: description (optional — column may be empty) ────────────
async function translatePartners() {
  // Only runs for partners that have a French description populated.
  const { rows } = await query(`
    SELECT id, name, description,
           description_en, description_es, description_de,
           description_it, description_nl, description_pt
    FROM partners
    WHERE description IS NOT NULL AND description <> ''
  `);
  console.log(`\n[partners] ${rows.length} row(s) with a description`);

  for (const row of rows) {
    for (const { code, name } of TARGET_LANGS) {
      const col = `description_${code}`;
      if (row[col] && row[col].trim()) {
        console.log(`  skip ${row.name} [${code}] — already translated`);
        continue;
      }
      try {
        const translated = await translate(row.description, name, 'description');
        console.log(`  ✓ ${row.name} [${code}]: ${translated.slice(0, 60)}${translated.length > 60 ? '…' : ''}`);
        if (!DRY_RUN) {
          await query(`UPDATE partners SET ${col} = $1 WHERE id = $2`, [translated, row.id]);
        }
      } catch (err) {
        console.error(`  ✗ ${row.name} [${code}]: ${err.message}`);
      }
    }
  }
}

// ─── Blog posts: title / content / meta_description ────────────────────
async function translateBlogPosts() {
  const { rows } = await query(`
    SELECT id, slug, title, excerpt, content, meta_description,
           title_en, title_es, title_de, title_it, title_nl, title_pt,
           excerpt_en, excerpt_es, excerpt_de, excerpt_it, excerpt_nl, excerpt_pt,
           content_en, content_es, content_de, content_it, content_nl, content_pt,
           meta_description_en, meta_description_es, meta_description_de,
           meta_description_it, meta_description_nl, meta_description_pt
    FROM blog_posts
  `);
  console.log(`\n[blog_posts] ${rows.length} post(s)`);

  for (const row of rows) {
    for (const { code, name } of TARGET_LANGS) {
      // TITLE
      const titleCol = `title_${code}`;
      if (row[titleCol] && row[titleCol].trim()) {
        console.log(`  skip ${row.slug} [${code}] title — already translated`);
      } else if (row.title && row.title.trim()) {
        try {
          const t = await translate(row.title, name, 'title');
          console.log(`  ✓ ${row.slug} [${code}] title: ${t.slice(0, 60)}${t.length > 60 ? '…' : ''}`);
          if (!DRY_RUN) await query(`UPDATE blog_posts SET ${titleCol} = $1 WHERE id = $2`, [t, row.id]);
        } catch (err) {
          console.error(`  ✗ ${row.slug} [${code}] title: ${err.message}`);
        }
      }

      // EXCERPT (plain text card preview)
      const excerptCol = `excerpt_${code}`;
      if (row[excerptCol] && row[excerptCol].trim()) {
        console.log(`  skip ${row.slug} [${code}] excerpt — already translated`);
      } else if (row.excerpt && row.excerpt.trim()) {
        try {
          const e = await translate(row.excerpt, name, 'description');
          console.log(`  ✓ ${row.slug} [${code}] excerpt: ${e.slice(0, 60)}${e.length > 60 ? '…' : ''}`);
          if (!DRY_RUN) await query(`UPDATE blog_posts SET ${excerptCol} = $1 WHERE id = $2`, [e, row.id]);
        } catch (err) {
          console.error(`  ✗ ${row.slug} [${code}] excerpt: ${err.message}`);
        }
      }

      // META_DESCRIPTION
      const metaCol = `meta_description_${code}`;
      if (row[metaCol] && row[metaCol].trim()) {
        console.log(`  skip ${row.slug} [${code}] meta — already translated`);
      } else if (row.meta_description && row.meta_description.trim()) {
        try {
          const m = await translate(row.meta_description, name, 'meta');
          console.log(`  ✓ ${row.slug} [${code}] meta: ${m.slice(0, 60)}${m.length > 60 ? '…' : ''}`);
          if (!DRY_RUN) await query(`UPDATE blog_posts SET ${metaCol} = $1 WHERE id = $2`, [m, row.id]);
        } catch (err) {
          console.error(`  ✗ ${row.slug} [${code}] meta: ${err.message}`);
        }
      }

      // CONTENT (HTML)
      const contentCol = `content_${code}`;
      if (row[contentCol] && row[contentCol].trim()) {
        console.log(`  skip ${row.slug} [${code}] content — already translated`);
      } else if (row.content && row.content.trim()) {
        try {
          const c = await translate(row.content, name, 'content');
          console.log(`  ✓ ${row.slug} [${code}] content: ${c.length} chars`);
          if (!DRY_RUN) await query(`UPDATE blog_posts SET ${contentCol} = $1 WHERE id = $2`, [c, row.id]);
        } catch (err) {
          console.error(`  ✗ ${row.slug} [${code}] content: ${err.message}`);
        }
      }
    }
  }
}

// ─── Main ──────────────────────────────────────────────────────────────
(async () => {
  console.log(`Translate-content script (model=${MODEL})${DRY_RUN ? ' [DRY RUN]' : ''}`);
  try {
    await translateTenants();
    await translatePartners();
    await translateBlogPosts();
    console.log('\n✅ Done');
    process.exit(0);
  } catch (err) {
    console.error('\n✗ Fatal:', err.message);
    process.exit(1);
  }
})();
