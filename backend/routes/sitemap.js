const express = require('express');
const { query } = require('../db');

const router = express.Router();

// Static public pages, keyed by path → {changefreq, priority}.
// Matches the robots.txt allow-list so every crawlable page ships a
// sitemap entry.
const STATIC_PAGES = [
  { path: '', changefreq: 'weekly', priority: '1.0' },
  { path: '/pricing', changefreq: 'monthly', priority: '0.9' },
  { path: '/marketplace', changefreq: 'weekly', priority: '0.8' },
  { path: '/blog', changefreq: 'weekly', priority: '0.8' },
  { path: '/signup', changefreq: 'monthly', priority: '0.5' },
  { path: '/login', changefreq: 'monthly', priority: '0.3' },
];

const xmlEscape = (s) => String(s)
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

// GET /api/sitemap.xml — combined sitemap: static pages + blog articles.
router.get('/sitemap.xml', async (req, res) => {
  try {
    const base = (process.env.FRONTEND_URL || 'https://refboost.io').replace(/\/$/, '');
    const today = new Date().toISOString().split('T')[0];

    let posts = [];
    try {
      const { rows } = await query(
        `SELECT slug, updated_at, published_at
         FROM blog_posts
         WHERE published = true
         ORDER BY published_at DESC`
      );
      posts = rows;
    } catch (err) {
      // Blog table may not exist in some environments — degrade gracefully
      // so the static pages still get served.
      console.warn('[sitemap] blog query failed:', err.message);
    }

    const entries = [
      ...STATIC_PAGES.map(p => ({
        loc: `${base}${p.path}`,
        lastmod: today,
        changefreq: p.changefreq,
        priority: p.priority,
      })),
      ...posts.map(p => ({
        loc: `${base}/blog/${p.slug}`,
        lastmod: (p.updated_at || p.published_at)?.toISOString().split('T')[0] || today,
        changefreq: 'monthly',
        priority: '0.7',
      })),
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map(u => `  <url>
    <loc>${xmlEscape(u.loc)}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', 'public, max-age=3600');
    res.send(xml);
  } catch (err) {
    console.error('[sitemap] error:', err);
    res.status(500).send('sitemap error');
  }
});

module.exports = router;
