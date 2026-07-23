// Reusable translation service used by:
//   1. backend/scripts/translate-content.js — one-off CLI runner
//   2. POST /api/admin/translate-blog       — admin-triggered HTTP run
//
// Logic mirrors the original script verbatim (rate-limit, retry on
// 429/5xx, idempotent skip when target column is already populated).
// Pulling it into a service module lets both surfaces share the
// throttle and the model config — when we tune one, both benefit.

const { query } = require('../db');

// claude-sonnet-4-20250514 was retired upstream and started returning
// 404 not_found_error on every call (silent 0/0/0 job, see translate-blog
// fix). claude-sonnet-5 is the current non-deprecated Sonnet.
const MODEL = 'claude-sonnet-5';
const TARGET_LANGS = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'de', name: 'German' },
  { code: 'it', name: 'Italian' },
  { code: 'nl', name: 'Dutch' },
  { code: 'pt', name: 'Portuguese (European)' },
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Every external Anthropic call gets an explicit timeout so a hung socket
// can't stall the whole job indefinitely (the previous silent-failure run
// had no ceiling per request). Aborts surface as a normal Error, caught and
// counted by the per-item try/catch in each translator.
const CALL_TIMEOUT_MS = 60000;
async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    if (err && err.name === 'AbortError') {
      throw new Error(`translator_timeout_${CALL_TIMEOUT_MS / 1000}s`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// 5 req/min → 13s spacing for safety.
const MIN_SPACING_MS = 13000;
let lastCallAt = 0;
async function throttle() {
  const since = Date.now() - lastCallAt;
  if (since < MIN_SPACING_MS) await sleep(MIN_SPACING_MS - since);
  lastCallAt = Date.now();
}

// Per-translation prompt. `kind` controls whether we tell the model
// to preserve HTML, keep it short, etc.
const INSTRUCTIONS = {
  description: 'Translate the following French marketing description into {LANG}. Return only the translation, with no preamble, no quotes, no explanation. Preserve line breaks. Keep it concise and natural — this will be shown in a product marketplace card.',
  // 'label' is for terse UI labels / tag chips (e.g. "Equipes commerciales").
  // The model often returns extra punctuation or capitalisation drift on
  // single-word inputs so the prompt is explicit about returning a bare
  // phrase only.
  label: 'Translate the following short French label or tag into {LANG}. Return only the translation as a bare phrase — no quotes, no period, no preamble, no explanation. Keep it terse: this will be shown as a chip in a UI.',
  title: 'Translate the following French blog-post title into {LANG}. Return only the translated title, with no quotes or preamble. Keep the same tone and length.',
  meta: 'Translate the following French SEO meta description into {LANG}. Return only the translation (max ~160 characters), no quotes, no preamble.',
  content: 'Translate the following French blog article into {LANG}. Preserve ALL HTML tags exactly (including attributes, class names, href values, image src). Only translate human-readable text inside the tags and in text nodes. Return only the translated HTML, with no preamble, no fences, no explanation.',
};

async function translate({ text, targetLangName, kind, log = () => {} }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  const tpl = INSTRUCTIONS[kind];
  if (!tpl) throw new Error(`unknown kind: ${kind}`);
  const system = tpl.replace('{LANG}', targetLangName);

  const body = {
    model: MODEL,
    max_tokens: kind === 'content' ? 16000 : 1024,
    // Sonnet 5 runs adaptive thinking when `thinking` is omitted (Sonnet 4
    // ran thinking-off). Thinking tokens count against max_tokens and would
    // both slow/inflate cost and risk truncating long `content` translations,
    // so keep the prior thinking-off behaviour explicitly.
    thinking: { type: 'disabled' },
    system,
    messages: [{ role: 'user', content: text }],
  };

  let lastErr;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await throttle();
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
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
    const txt = await res.text();
    lastErr = `Anthropic ${res.status}: ${txt.slice(0, 200)}`;
    if (!retryable) throw new Error(lastErr);
    const ra = parseInt(res.headers.get('retry-after') || '', 10);
    const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(60000, 15000 * attempt);
    log(`    ⏳ ${res.status} — waiting ${Math.round(waitMs / 1000)}s (attempt ${attempt}/5)`);
    await sleep(waitMs);
  }
  throw new Error(lastErr || 'exhausted retries');
}

// ─── Long-content chunking ────────────────────────────────────────────
// A blog article translated in ONE call fails two ways on long inputs:
// the request exceeds CALL_TIMEOUT_MS, and/or the model abridges a
// 20k-char guide down to a ~1.5k-char summary (observed: 33/36 articles
// truncated to 6-20% of source across all 6 langs). Splitting the HTML
// on top-level block boundaries and translating each piece keeps every
// call small (fast, no condensing) and reassembles to full length.
//
// Cutting only immediately AFTER a closing block tag guarantees we never
// split inside a tag or across an element's open/close, so tag balance
// is preserved when the chunks are concatenated back.
const CONTENT_CHUNK_MAX = 3500;      // ~chars per chunk (well under timeout)
const CONTENT_CHUNK_THRESHOLD = 4000; // below this, one call is fine
function chunkHtml(html, maxLen = CONTENT_CHUNK_MAX) {
  const parts = html.split(/(?<=<\/(?:h[1-6]|p|ul|ol|li|blockquote|table|pre|div|section)>)/i);
  const chunks = [];
  let buf = '';
  for (const p of parts) {
    if (buf && (buf.length + p.length) > maxLen) { chunks.push(buf); buf = ''; }
    buf += p;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

// Translate blog HTML content, chunking when long. Short content goes
// through a single call (unchanged behaviour). Returns the reassembled
// translation. Any chunk failure throws so the caller's try/catch counts
// the cell as failed rather than writing a partial article.
async function translateContent({ text, targetLangName, log = () => {} }) {
  if (!text || text.length <= CONTENT_CHUNK_THRESHOLD) {
    return translate({ text, targetLangName, kind: 'content', log });
  }
  const chunks = chunkHtml(text);
  log(`    content ${text.length}c → ${chunks.length} chunk(s)`);
  const out = [];
  for (let i = 0; i < chunks.length; i++) {
    const t = await translate({ text: chunks[i], targetLangName, kind: 'content', log });
    out.push(t);
  }
  return out.join('');
}

// ─── Per-table translators ────────────────────────────────────────────

async function translateTenants({ dryRun = false, log = () => {}, onProgress = () => {}, shouldCancel = () => false } = {}) {
  const { rows } = await query(`
    SELECT id, name, short_description,
           short_description_en, short_description_es, short_description_de,
           short_description_it, short_description_nl, short_description_pt
    FROM tenants
    WHERE short_description IS NOT NULL AND short_description <> ''
  `);
  log(`[tenants] ${rows.length} row(s) with a short_description`);
  let attempted = 0, done = 0, skipped = 0, failed = 0, lastError = null;
  const emit = () => onProgress({ table: 'tenants', attempted, done, skipped, failed, lastError });
  for (const row of rows) {
    for (const { code, name } of TARGET_LANGS) {
      if (shouldCancel()) { log('cancelled by user'); return { attempted, done, skipped, failed, lastError }; }
      const col = `short_description_${code}`;
      if (row[col] && row[col].trim()) { skipped++; emit(); continue; }
      attempted++;
      try {
        const t = await translate({ text: row.short_description, targetLangName: name, kind: 'description', log });
        if (!dryRun) await query(`UPDATE tenants SET ${col} = $1 WHERE id = $2`, [t, row.id]);
        log(` ${row.name} [${code}] short_description`);
        done++; emit();
      } catch (err) {
        failed++;
        lastError = { name: row.name, id: row.id, lang: code, field: 'short_description', message: err.message, at: new Date().toISOString() };
        console.error('[translate-blog] failed cell', lastError);
        log(` ${row.name} [${code}]: ${err.message}`);
        emit();
      }
    }
  }
  return { attempted, done, skipped, failed, lastError };
}

async function translatePartners({ dryRun = false, log = () => {}, onProgress = () => {}, shouldCancel = () => false } = {}) {
  const { rows } = await query(`
    SELECT id, name, description,
           description_en, description_es, description_de,
           description_it, description_nl, description_pt
    FROM partners
    WHERE description IS NOT NULL AND description <> ''
  `);
  log(`[partners] ${rows.length} row(s) with a description`);
  let attempted = 0, done = 0, skipped = 0, failed = 0, lastError = null;
  const emit = () => onProgress({ table: 'partners', attempted, done, skipped, failed, lastError });
  for (const row of rows) {
    for (const { code, name } of TARGET_LANGS) {
      if (shouldCancel()) { log('cancelled by user'); return { attempted, done, skipped, failed, lastError }; }
      const col = `description_${code}`;
      if (row[col] && row[col].trim()) { skipped++; emit(); continue; }
      attempted++;
      try {
        const t = await translate({ text: row.description, targetLangName: name, kind: 'description', log });
        if (!dryRun) await query(`UPDATE partners SET ${col} = $1 WHERE id = $2`, [t, row.id]);
        log(` ${row.name} [${code}] description`);
        done++; emit();
      } catch (err) {
        failed++;
        lastError = { name: row.name, id: row.id, lang: code, field: 'description', message: err.message, at: new Date().toISOString() };
        console.error('[translate-blog] failed cell', lastError);
        log(` ${row.name} [${code}]: ${err.message}`);
        emit();
      }
    }
  }
  return { attempted, done, skipped, failed, lastError };
}

async function translateBlogPosts({ dryRun = false, log = () => {}, onProgress = () => {}, shouldCancel = () => false } = {}) {
  const { rows } = await query(`
    SELECT id, slug, title, excerpt, content, meta_description,
           title_en, title_es, title_de, title_it, title_nl, title_pt,
           excerpt_en, excerpt_es, excerpt_de, excerpt_it, excerpt_nl, excerpt_pt,
           content_en, content_es, content_de, content_it, content_nl, content_pt,
           meta_description_en, meta_description_es, meta_description_de,
           meta_description_it, meta_description_nl, meta_description_pt
    FROM blog_posts
  `);
  log(`[blog_posts] ${rows.length} post(s)`);
  let attempted = 0, done = 0, skipped = 0, failed = 0, lastError = null;
  const emit = () => onProgress({ table: 'blog_posts', attempted, done, skipped, failed, lastError });

  // (sourceCol, targetColPrefix, kind) — drives the loop below so the
  // four field types share one code path.
  const FIELDS = [
    { src: 'title', prefix: 'title', kind: 'title' },
    { src: 'excerpt', prefix: 'excerpt', kind: 'description' },
    { src: 'meta_description', prefix: 'meta_description', kind: 'meta' },
    { src: 'content', prefix: 'content', kind: 'content' },
  ];

  for (const row of rows) {
    for (const { code, name } of TARGET_LANGS) {
      for (const f of FIELDS) {
        if (shouldCancel()) { log('cancelled by user'); return { attempted, done, skipped, failed, lastError }; }
        const targetCol = `${f.prefix}_${code}`;
        if (row[targetCol] && row[targetCol].trim()) { skipped++; emit(); continue; }
        if (!row[f.src] || !row[f.src].trim()) { skipped++; emit(); continue; }
        attempted++;
        try {
          // Content is chunked when long (avoids timeout + model
          // abridging); other fields are single-call as before.
          const t = f.kind === 'content'
            ? await translateContent({ text: row[f.src], targetLangName: name, log })
            : await translate({ text: row[f.src], targetLangName: name, kind: f.kind, log });
          if (!dryRun) await query(`UPDATE blog_posts SET ${targetCol} = $1 WHERE id = $2`, [t, row.id]);
          log(` ${row.slug} [${code}] ${f.prefix}: ${t.slice(0, 60)}${t.length > 60 ? '…' : ''}`);
          done++; emit();
        } catch (err) {
          failed++;
          lastError = { slug: row.slug, id: row.id, lang: code, field: f.prefix, message: err.message, at: new Date().toISOString() };
          console.error('[translate-blog] failed cell', lastError);
          log(` ${row.slug} [${code}] ${f.prefix}: ${err.message}`);
          emit();
        }
      }
    }
  }
  return { attempted, done, skipped, failed, lastError };
}

// ─── Progress query ───────────────────────────────────────────────────
// Returns the count of (post × lang × field) cells that are still NULL,
// so the admin status endpoint can show "X / Y remaining" without
// running the whole pipeline.
async function blogPostsProgress() {
  const langs = ['en', 'es', 'de', 'it', 'nl', 'pt'];
  const fields = ['title', 'excerpt', 'meta_description', 'content'];

  // One scan, count all NULL/empty target cells across every
  // (lang, field) pair. The COALESCE/empty-string check matches
  // localizedCol() in routes/blog.js.
  const selects = [];
  for (const lang of langs) {
    for (const field of fields) {
      const col = `${field}_${lang}`;
      const sourceCol = field;
      // Count rows that HAVE source content but lack the translation.
      selects.push(`SUM(CASE WHEN ${sourceCol} IS NOT NULL AND ${sourceCol} <> '' AND (${col} IS NULL OR ${col} = '') THEN 1 ELSE 0 END)::int AS ${field}_${lang}_missing`);
    }
  }
  const sql = `SELECT COUNT(*)::int AS total_posts, ${selects.join(', ')} FROM blog_posts`;
  const { rows: [r] } = await query(sql);

  let totalMissing = 0;
  const byLang = {};
  for (const lang of langs) {
    let missingForLang = 0;
    const byField = {};
    for (const field of fields) {
      const k = `${field}_${lang}_missing`;
      byField[field] = r[k] || 0;
      missingForLang += r[k] || 0;
    }
    byLang[lang] = { missing: missingForLang, byField };
    totalMissing += missingForLang;
  }
  return { totalPosts: r.total_posts, totalMissing, byLang };
}

module.exports = {
  MODEL,
  TARGET_LANGS,
  translate,
  translateContent,
  chunkHtml,
  translateTenants,
  translatePartners,
  translateBlogPosts,
  blogPostsProgress,
};
