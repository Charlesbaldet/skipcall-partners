const express = require('express');
const { query } = require('../db');
const { authenticate } = require('../middleware/auth');
const { resolveLang } = require('../middleware/i18n-lang');
const router = express.Router();

// Build SELECT fragments that swap in `<col>_<lang>` (with fallback to the
// base column) when the caller's lang is not fr. `lang` must come from
// resolveLang() — whitelisted, safe to interpolate.
function localizedCol(col, lang) {
  return lang === 'fr'
    ? col
    : `COALESCE(NULLIF(${col}_${lang}, ''), ${col})`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcReadingTime(html) {
  const text = html.replace(/<[^>]+>/g, '');
  const words = text.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

function generateSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 80);
}

// ─── PUBLIC ROUTES ────────────────────────────────────────────────────────────

// GET /api/blog/posts — liste des articles publiés
router.get('/posts', async (req, res) => {
  try {
    const { category, limit = 20, offset = 0 } = req.query;
    const lang = resolveLang(req);
    // Key browser / CDN caches by language so changing locale invalidates.
    res.vary('Accept-Language');
    let where = 'WHERE published = true';
    const params = [];
    let i = 1;
    if (category) {
      where += ` AND category = $${i++}`;
      params.push(category);
    }
    const { rows } = await query(
      `SELECT id, slug,
              ${localizedCol('title', lang)} AS title,
              ${localizedCol('excerpt', lang)} AS excerpt,
              author, category, tags,
              cover_image_url, published_at, reading_time_minutes,
              meta_title,
              ${localizedCol('meta_description', lang)} AS meta_description
       FROM blog_posts ${where}
       ORDER BY published_at DESC
       LIMIT $${i++} OFFSET $${i++}`,
      [...params, limit, offset]
    );
    const { rows: [{ count }] } = await query(
      `SELECT COUNT(*) FROM blog_posts WHERE published = true${category ? ' AND category = $1' : ''}`,
      category ? [category] : []
    );
    res.json({ posts: rows, total: parseInt(count) });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/blog/categories — catégories disponibles
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT category, COUNT(*) as count
       FROM blog_posts
       WHERE published = true AND category IS NOT NULL
       GROUP BY category
       ORDER BY count DESC`
    );
    res.json({ categories: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/blog/posts/:slug — article individuel
router.get('/posts/:slug', async (req, res) => {
  try {
    const lang = resolveLang(req);
    res.vary('Accept-Language');
    const { rows } = await query(
      `SELECT id, slug,
              ${localizedCol('title', lang)} AS title,
              ${localizedCol('excerpt', lang)} AS excerpt,
              author, category, tags, cover_image_url,
              published, published_at, created_at, updated_at,
              meta_title,
              ${localizedCol('meta_description', lang)} AS meta_description,
              ${localizedCol('content', lang)} AS content,
              reading_time_minutes
       FROM blog_posts WHERE slug = $1 AND published = true`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Article introuvable' });
    res.json({ post: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// GET /api/blog/sitemap — données pour sitemap XML
router.get('/sitemap', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT slug, updated_at, published_at FROM blog_posts WHERE published = true ORDER BY published_at DESC`
    );
    const base = process.env.FRONTEND_URL || 'https://refboost.io';
    const urls = rows.map(p => ({
      loc: `${base}/blog/${p.slug}`,
      lastmod: (p.updated_at || p.published_at)?.toISOString().split('T')[0],
      changefreq: 'monthly',
      priority: '0.7',
    }));
    urls.unshift({ loc: `${base}/blog`, lastmod: new Date().toISOString().split('T')[0], changefreq: 'weekly', priority: '0.8' });

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(u => `  <url>
    <loc>${u.loc}</loc>
    <lastmod>${u.lastmod}</lastmod>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`).join('\n')}
</urlset>`;
    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    res.status(500).send('Erreur');
  }
});

// ─── ADMIN ROUTES (superadmin only) ─────────────────────────────────────────

function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Accès réservé super admin' });
  }
  next();
}

// GET /api/blog/admin/posts — tous les articles (draft + published)
router.get('/admin/posts', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, slug, title, excerpt, category, published, published_at, created_at, reading_time_minutes
       FROM blog_posts ORDER BY created_at DESC`
    );
    res.json({ posts: rows });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/blog/admin/posts — créer un article
router.post('/admin/posts', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { title, content, excerpt, author, category, tags, cover_image_url, published, meta_title, meta_description } = req.body;
    if (!title || !content) return res.status(400).json({ error: 'Titre et contenu requis' });

    let slug = generateSlug(title);
    // Rendre le slug unique si nécessaire
    const { rows: existing } = await query('SELECT slug FROM blog_posts WHERE slug LIKE $1', [slug + '%']);
    if (existing.length) slug = slug + '-' + Date.now().toString(36);

    const reading_time = calcReadingTime(content);
    const publishedAt = published ? new Date() : null;

    const { rows: [post] } = await query(
      `INSERT INTO blog_posts (slug, title, content, excerpt, author, category, tags, cover_image_url, published, published_at, meta_title, meta_description, reading_time_minutes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *`,
      [slug, title, content, excerpt || '', author || 'RefBoost', category || null, tags || [], cover_image_url || null, !!published, publishedAt, meta_title || null, meta_description || null, reading_time]
    );
    res.status(201).json({ post });
  } catch (err) {
    console.error('[blog] create error:', err.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// PUT /api/blog/admin/posts/:id — modifier un article
router.put('/admin/posts/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { title, content, excerpt, author, category, tags, cover_image_url, published, meta_title, meta_description } = req.body;
    const reading_time = content ? calcReadingTime(content) : undefined;

    const { rows: [current] } = await query('SELECT published, published_at FROM blog_posts WHERE id = $1', [req.params.id]);
    if (!current) return res.status(404).json({ error: 'Article introuvable' });

    const publishedAt = published && !current.published ? new Date() : current.published_at;

    const { rows: [post] } = await query(
      `UPDATE blog_posts SET
        title = COALESCE($1, title),
        content = COALESCE($2, content),
        excerpt = COALESCE($3, excerpt),
        author = COALESCE($4, author),
        category = $5,
        tags = COALESCE($6, tags),
        cover_image_url = $7,
        published = COALESCE($8, published),
        published_at = $9,
        meta_title = $10,
        meta_description = $11,
        reading_time_minutes = COALESCE($12, reading_time_minutes),
        updated_at = NOW()
       WHERE id = $13 RETURNING *`,
      [title, content, excerpt, author, category || null, tags || null, cover_image_url || null, published, publishedAt, meta_title || null, meta_description || null, reading_time || null, req.params.id]
    );
    res.json({ post });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/blog/admin/posts/:id
router.delete('/admin/posts/:id', authenticate, requireSuperAdmin, async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM blog_posts WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Article introuvable' });
    res.json({ message: 'Article supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
