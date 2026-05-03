import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../lib/api';
import { translateCat } from '../lib/blog-categories';
import LandingLayout from '../components/LandingLayout';
import Pagination from '../components/Pagination';

const SITE = 'https://refboost.io';
const ITEMS_PER_PAGE = 9;
const C = { p: '#059669', s: '#0f172a', m: '#64748b', bg: '#f8fafc', card: '#fff' };

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function BlogCard({ post }) {
  // useTranslation subscribes to language changes so the card re-renders
  // (and translateCat picks up the new i18n.language) when the user switches.
  const { t } = useTranslation();
  return (
    <article style={{ background: C.card, borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', transition: 'transform .2s, box-shadow .2s' }}
      onMouseEnter={e=>{e.currentTarget.style.transform='translateY(-4px)';e.currentTarget.style.boxShadow='0 8px 32px rgba(0,0,0,0.12)';}}
      onMouseLeave={e=>{e.currentTarget.style.transform='';e.currentTarget.style.boxShadow='0 2px 12px rgba(0,0,0,0.06)';}}>
      {post.cover_image_url && (
        <Link to={'/blog/' + post.slug} aria-label={post.title}>
          <img src={post.cover_image_url} alt={post.title} loading="lazy" style={{ width: '100%', height: 200, objectFit: 'cover', display: 'block' }} />
        </Link>
      )}
      <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {post.category && <span style={{ fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 1 }}>{translateCat(post.category)}</span>}
        <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: C.s, lineHeight: 1.4 }}>
          <Link to={'/blog/' + post.slug} style={{ color: 'inherit', textDecoration: 'none' }}>{post.title}</Link>
        </h2>
        {post.excerpt && <p style={{ margin: 0, fontSize: 14, color: C.m, lineHeight: 1.6, flex: 1 }}>{post.excerpt}</p>}
        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
          <time dateTime={post.published_at} style={{ fontSize: 13, color: C.m }}>{formatDate(post.published_at)}</time>
          <span style={{ fontSize: 13, color: C.m }}>{post.reading_time_minutes} {t('blog.min_read')}</span>
        </footer>
        <Link to={'/blog/' + post.slug} style={{ marginTop: 4, fontSize: 14, fontWeight: 600, color: C.p, textDecoration: 'none' }}>
          {t('blog.read_article')}
        </Link>
      </div>
    </article>
  );
}

export default function BlogPage() {
  const { t } = useTranslation();
  const [posts, setPosts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState('');
  const [loading, setLoading] = useState(true);

  // URL is the source of truth for both filters. ?page= is read on
  // mount and on every browser back/forward; ?category= mirrors
  // activeCategory so the same URL bookmarks the same view.
  const [searchParams, setSearchParams] = useSearchParams();
  const currentPage = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);

  // Sync activeCategory ← URL on mount + popstate.
  useEffect(() => {
    const cat = searchParams.get('category') || '';
    if (cat !== activeCategory) setActiveCategory(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    api.request('/blog/categories').then(d => setCategories(d.categories || [])).catch(()=>{});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = activeCategory ? '?category=' + encodeURIComponent(activeCategory) : '';
    api.request('/blog/posts' + params)
      .then(d => { setPosts(d.posts || []); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, [activeCategory]);

  // "Tous" must always show the grand total, never the filtered
  // count. Sum once from the categories payload (which is fetched
  // unfiltered on mount) and memo-ise so it doesn't shift when the
  // user clicks a category pill.
  const totalAll = categories.reduce((s, c) => s + (parseInt(c.count, 10) || 0), 0);

  // Pagination — slice after filtering. Server already filters by
  // category so `posts` is the visible set; we just window it.
  const totalPages = Math.max(1, Math.ceil(posts.length / ITEMS_PER_PAGE));
  // Guard: if a stale ?page= points past the new last page after a
  // filter change, snap to the last available page on the next URL
  // edit (handled inside handlePageChange — UI shows the clamped
  // slice immediately).
  const safePage = Math.min(currentPage, totalPages);
  const paginated = posts.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

  // Canonical URL: /blog for page 1 (drop the querystring entirely
  // so /blog and /blog?page=1 don't both index), /blog?page=N
  // otherwise. Category never appears in the canonical so search
  // engines treat the filtered views as the same page —
  // intentional: the SEO weight stays on the unfiltered listing.
  const canonical = SITE + '/blog' + (currentPage > 1 ? '?page=' + currentPage : '');

  const updateUrl = (next) => {
    setSearchParams(next, { replace: false });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePageChange = (page) => {
    const next = new URLSearchParams(searchParams);
    if (page <= 1) next.delete('page');
    else next.set('page', String(page));
    updateUrl(next);
  };

  const handleCategoryChange = (cat) => {
    setActiveCategory(cat);
    const next = new URLSearchParams(searchParams);
    if (cat) next.set('category', cat);
    else next.delete('category');
    // Filter change always resets to page 1 so the user doesn't
    // land on an empty page-3 of a small category.
    next.delete('page');
    updateUrl(next);
  };

  return (
    <LandingLayout>
      <Helmet>
        <title>Blog RefBoost — Conseils et ressources pour programmes partenaires B2B</title>
        <meta name="description" content="Stratégies, guides et bonnes pratiques pour créer et gérer un programme d'apporteurs d'affaires performant." />
        <link rel="canonical" href={canonical} />
        <meta property="og:title" content="Blog RefBoost — Conseils pour programmes partenaires B2B" />
        <meta property="og:description" content="Stratégies, guides et bonnes pratiques pour créer et gérer un programme d'apporteurs d'affaires performant." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE + '/blog'} />
        <meta property="og:image" content={SITE + '/og-image.png'} />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Blog RefBoost" />
        <meta name="twitter:image" content={SITE + '/og-image.png'} />
        <script type="application/ld+json">{JSON.stringify({ '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog RefBoost', description: "Stratégies, guides et bonnes pratiques pour créer et gérer un programme d'apporteurs d'affaires performant.", url: SITE + '/blog', publisher: { '@type': 'Organization', name: 'RefBoost', url: SITE } })}</script>
      </Helmet>

      {/* Hero */}
      <section style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)', padding: '72px 48px 64px', textAlign: 'center' }}>
        <p style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: 2 }}>Blog</p>
        <h1 style={{ margin: '0 0 16px', fontSize: 44, fontWeight: 800, color: '#fff', lineHeight: 1.15 }}>{t("blog.subtitle")}</h1>
        <p style={{ margin: '0 auto', fontSize: 18, color: '#94a3b8', maxWidth: 560, lineHeight: 1.6 }}>
          {t('blog.page_subtitle')}
        </p>
      </section>

      <main style={{ maxWidth: 1100, margin: '0 auto', padding: '48px 24px' }}>
        {/* Filtres */}
        {categories.length > 0 && (
          <nav aria-label={t('blog.categories')} style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', marginBottom: 40 }}>
            <button onClick={()=>handleCategoryChange('')} style={{ padding: '8px 18px', borderRadius: 20, border: '1.5px solid', borderColor: !activeCategory ? '#059669' : '#e2e8f0', background: !activeCategory ? '#059669' : 'transparent', color: !activeCategory ? '#fff' : C.m, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              {t('blog.all_categories')} ({totalAll})
            </button>
            {categories.map(c => (
              <button key={c.category} onClick={()=>handleCategoryChange(c.category === activeCategory ? '' : c.category)}
                style={{ padding: '8px 18px', borderRadius: 20, border: '1.5px solid', borderColor: activeCategory === c.category ? '#059669' : '#e2e8f0', background: activeCategory === c.category ? '#059669' : 'transparent', color: activeCategory === c.category ? '#fff' : C.m, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
                {translateCat(c.category)} ({c.count})
              </button>
            ))}
          </nav>
        )}

        {/* Grille */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 80, color: C.m }}>{t('common.loading')}</div>
        ) : posts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 80 }}>
            <p style={{ fontSize: 18, color: C.m }}>{t('blog.no_articles')}</p>
            <p style={{ color: C.m, fontSize: 14 }}>{t('blog.come_back_soon')}</p>
          </div>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 28 }}>
              {paginated.map(post => <BlogCard key={post.id} post={post} />)}
            </div>
            <Pagination currentPage={safePage} totalPages={totalPages} onPageChange={handlePageChange} />
          </>
        )}
      </main>
    </LandingLayout>
  );
}
