import { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../lib/api';

const SITE = 'https://refboost.io';
const C = { p: '#059669', s: '#0f172a', m: '#64748b', bg: '#f8fafc' };

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function BlogPostPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const [post, setPost] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true);
    setNotFound(false);
    api.request('/blog/posts/' + slug)
      .then(d => setPost(d.post))
      .catch(err => { if (err?.status === 404 || err?.message?.includes('404')) setNotFound(true); })
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.m }}>
      Chargement…
    </div>
  );

  if (notFound || !post) return (
    <div style={{ minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <h1 style={{ color: C.s, fontSize: 24 }}>Article introuvable</h1>
      <Link to="/blog" style={{ color: C.p, fontWeight: 600 }}>← Retour au blog</Link>
    </div>
  );

  const canonicalUrl = SITE + '/blog/' + post.slug;
  const metaTitle = post.meta_title || (post.title + ' — Blog RefBoost');
  const metaDesc = post.meta_description || post.excerpt || 'Découvrez cet article sur le blog RefBoost.';

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: metaDesc,
    url: canonicalUrl,
    datePublished: post.published_at,
    dateModified: post.updated_at || post.published_at,
    author: { '@type': 'Person', name: post.author || 'RefBoost' },
    publisher: {
      '@type': 'Organization',
      name: 'RefBoost',
      url: SITE,
      logo: { '@type': 'ImageObject', url: SITE + '/logo.png' },
    },
    image: post.cover_image_url || SITE + '/og-default.png',
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
    articleSection: post.category || 'Blog',
    keywords: (post.tags || []).join(', '),
    wordCount: post.content ? post.content.replace(/<[^>]+>/g, '').split(/\s+/).length : 0,
    timeRequired: 'PT' + (post.reading_time_minutes || 5) + 'M',
  };

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: SITE + '/blog' },
      { '@type': 'ListItem', position: 3, name: post.title, item: canonicalUrl },
    ],
  };

  return (
    <>
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDesc} />
        <link rel="canonical" href={canonicalUrl} />
        <meta property="og:type" content="article" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDesc} />
        <meta property="og:url" content={canonicalUrl} />
        {post.cover_image_url && <meta property="og:image" content={post.cover_image_url} />}
        <meta property="article:published_time" content={post.published_at} />
        <meta property="article:modified_time" content={post.updated_at || post.published_at} />
        {post.category && <meta property="article:section" content={post.category} />}
        {(post.tags || []).map(t => <meta key={t} property="article:tag" content={t} />)}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={metaTitle} />
        <meta name="twitter:description" content={metaDesc} />
        {post.cover_image_url && <meta name="twitter:image" content={post.cover_image_url} />}
        <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>
        <script type="application/ld+json">{JSON.stringify(breadcrumbLd)}</script>
      </Helmet>

      <main style={{ maxWidth: 780, margin: '0 auto', padding: '48px 24px 80px' }}>
        {/* Breadcrumb */}
        <nav aria-label="Fil d'Ariane" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 32, fontSize: 14, color: C.m }}>
          <Link to="/" style={{ color: C.m, textDecoration: 'none' }}>Accueil</Link>
          <span>›</span>
          <Link to="/blog" style={{ color: C.m, textDecoration: 'none' }}>Blog</Link>
          <span>›</span>
          <span style={{ color: C.s, fontWeight: 500 }}>{post.title}</span>
        </nav>

        {/* Header */}
        <header style={{ marginBottom: 40 }}>
          {post.category && (
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 1 }}>
              {post.category}
            </p>
          )}
          <h1 style={{ margin: '0 0 20px', fontSize: 38, fontWeight: 800, color: C.s, lineHeight: 1.25 }}>{post.title}</h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', color: C.m, fontSize: 14 }}>
            <span>Par <strong style={{ color: C.s }}>{post.author || 'RefBoost'}</strong></span>
            <span>·</span>
            <time dateTime={post.published_at}>{formatDate(post.published_at)}</time>
            <span>·</span>
            <span>{post.reading_time_minutes || 5} min de lecture</span>
          </div>
          {post.excerpt && (
            <p style={{ margin: '24px 0 0', fontSize: 18, color: C.m, lineHeight: 1.7, fontStyle: 'italic', borderLeft: '3px solid ' + C.p, paddingLeft: 20 }}>
              {post.excerpt}
            </p>
          )}
        </header>

        {/* Image de couverture */}
        {post.cover_image_url && (
          <figure style={{ margin: '0 0 40px' }}>
            <img src={post.cover_image_url} alt={post.title} style={{ width: '100%', borderRadius: 16, maxHeight: 460, objectFit: 'cover', display: 'block' }} />
          </figure>
        )}

        {/* Contenu */}
        <article
          className="blog-content"
          dangerouslySetInnerHTML={{ __html: post.content }}
          style={{ fontSize: 17, lineHeight: 1.85, color: '#1e293b' }}
        />

        {/* Tags */}
        {post.tags?.length > 0 && (
          <footer style={{ marginTop: 48, paddingTop: 32, borderTop: '1px solid #e2e8f0' }}>
            <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 600, color: C.m, textTransform: 'uppercase', letterSpacing: 1 }}>Tags</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {post.tags.map(t => (
                <span key={t} style={{ padding: '4px 12px', background: '#f0fdf4', color: C.p, borderRadius: 20, fontSize: 13, fontWeight: 600 }}>{t}</span>
              ))}
            </div>
          </footer>
        )}

        {/* Retour */}
        <div style={{ marginTop: 48, textAlign: 'center' }}>
          <Link to="/blog" style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '12px 28px', borderRadius: 12, border: '1.5px solid ' + C.p, color: C.p, fontWeight: 700, textDecoration: 'none', fontSize: 15 }}>
            ← Retour au blog
          </Link>
        </div>
      </main>
    </>
  );
}
