import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import api from '../lib/api';
import LandingLayout from '../components/LandingLayout';

const SITE = 'https://refboost.io';
const C = { p: '#059669', s: '#0f172a', m: '#64748b', bg: '#f8fafc', card: '#fff' };

function formatDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function BlogCard({ post }) {
  const { t, i18n } = useTranslation();
  const CAT_TRANSLATIONS = {
    en: { 'Stratégie': 'Strategy', 'Analytics': 'Analytics', 'Guide': 'Guide', 'Commissions': 'Commissions' },
    es: { 'Stratégie': 'Estrategia', 'Analytics': 'Analítica', 'Guide': 'Guía', 'Commissions': 'Comisiones' },
    de: { 'Stratégie': 'Strategie', 'Analytics': 'Analytik', 'Guide': 'Leitfaden', 'Commissions': 'Provisionen' },
    it: { 'Stratégie': 'Strategia', 'Analytics': 'Analitica', 'Guide': 'Guida', 'Commissions': 'Commissioni' },
    nl: { 'Stratégie': 'Strategie', 'Analytics': 'Analyse', 'Guide': 'Gids', 'Commissions': 'Commissies' },
    pt: { 'Stratégie': 'Estratégia', 'Analytics': 'Analítica', 'Guide': 'Guia', 'Commissions': 'Comissões' },
  };
  const translateCat = (cat) => CAT_TRANSLATIONS[i18n.language]?.[cat] || cat;
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
        {post.category && <span style={{ fontSize: 12, fontWeight: 700, color: C.p, textTransform: 'uppercase', letterSpacing: 1 }}>{post.category}</span>}
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
  const [total, setTotal] = useState(0);

  useEffect(() => {
    api.request('/blog/categories').then(d => setCategories(d.categories || [])).catch(()=>{});
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = activeCategory ? '?category=' + encodeURIComponent(activeCategory) : '';
    api.request('/blog/posts' + params)
      .then(d => { setPosts(d.posts || []); setTotal(d.total || 0); })
      .catch(()=>{})
      .finally(()=>setLoading(false));
  }, [activeCategory]);

  return (
    <LandingLayout>
      <Helmet>
        <title>{`Blog RefBoost — ${t("blog.subtitle")}`}</title>
        <meta name="description" content={t("blog.page_subtitle")} />
        <meta property="og:title" content="Blog RefBoost" />
        <meta property="og:description" content={t("blog.subtitle")} />
        <meta property="og:type" content="website" />
        <meta property="og:url" content={SITE + '/blog'} />
        <meta name="twitter:card" content="summary_large_image" />
        <link rel="canonical" href={SITE + '/blog'} />
        <script type="application/ld+json">{JSON.stringify({ '@context': 'https://schema.org', '@type': 'Blog', name: 'Blog RefBoost', description: t('blog.page_subtitle'), url: SITE + '/blog', publisher: { '@type': 'Organization', name: 'RefBoost', url: SITE } })}</script>
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
            <button onClick={()=>setActiveCategory('')} style={{ padding: '8px 18px', borderRadius: 20, border: '1.5px solid', borderColor: !activeCategory ? '#059669' : '#e2e8f0', background: !activeCategory ? '#059669' : 'transparent', color: !activeCategory ? '#fff' : C.m, cursor: 'pointer', fontWeight: 600, fontSize: 14 }}>
              {t('blog.all_categories')} ({total})
            </button>
            {categories.map(c => (
              <button key={c.category} onClick={()=>setActiveCategory(c.category === activeCategory ? '' : c.category)}
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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 28 }}>
            {posts.map(post => <BlogCard key={post.id} post={post} />)}
          </div>
        )}
      </main>
    </LandingLayout>
  );
}
