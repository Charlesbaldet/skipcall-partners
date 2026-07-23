// One-off data fix: re-translate blog CONTENT cells that are MISSING or
// TRUNCATED (< 50% of FR source length) using chunked translation.
//
// Context: an earlier run produced abridged summaries of long articles
// (33/36 posts truncated to 6-20% of source across all 6 langs). The
// normal worker (translateBlogPosts) SKIPS non-empty cells, so it won't
// repair truncated content — this script targets and OVERWRITES it.
// Chunking (via translateContent) yields full-length output. Resumable:
// re-detects remaining bad cells on each run.
//
// Run in the container:  node scripts/blog-retranslate.js
//   --dry-run   list the work, don't call API or write
const { translateContent, TARGET_LANGS } = require('../services/translateContentService');
const { query } = require('../db');

(async () => {
  const dryRun = process.argv.includes('--dry-run');
  const { rows } = await query(
    `SELECT id, slug, length(content) fr, content,
            length(content_en) en, length(content_es) es, length(content_de) de,
            length(content_it) it, length(content_nl) nl, length(content_pt) pt
       FROM blog_posts
      WHERE published AND content IS NOT NULL AND content <> ''
      ORDER BY slug`);

  const work = [];
  for (const r of rows) {
    for (const l of TARGET_LANGS) {
      const cur = r[l.code];
      if (cur == null || cur < 0.5 * r.fr) {
        work.push({ id: r.id, slug: r.slug, fr: r.fr, content: r.content, code: l.code, name: l.name, cur: cur == null ? 0 : cur });
      }
    }
  }
  console.log(`${dryRun ? '[DRY-RUN] ' : ''}${work.length} cellule(s) content à re-traduire (manquantes ou <50%)\n`);
  if (dryRun) {
    work.forEach(w => console.log(`  ${w.slug} [${w.code}] ${w.cur}c / ${w.fr}c`));
    process.exit(0);
  }

  let done = 0, failed = 0;
  for (let i = 0; i < work.length; i++) {
    const w = work[i];
    const t0 = Date.now();
    try {
      const out = await translateContent({ text: w.content, targetLangName: w.name, log: () => {} });
      await query(`UPDATE blog_posts SET content_${w.code} = $1, updated_at = NOW() WHERE id = $2`, [out, w.id]);
      done++;
      console.log(`[${i + 1}/${work.length}] ✓ ${w.slug} [${w.code}] ${w.cur}c→${out.length}c (${Math.round(out.length / w.fr * 100)}%) ${Math.round((Date.now() - t0) / 1000)}s`);
    } catch (e) {
      failed++;
      console.error(`[${i + 1}/${work.length}] ✗ ${w.slug} [${w.code}]: ${e.message}`);
    }
  }
  console.log(`\n===== TOTAL done=${done} failed=${failed} =====`);
  process.exit(0);
})().catch(e => { console.error('RUN ERROR:', e.message); process.exit(1); });
