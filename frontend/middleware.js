// Vercel Edge Middleware for a Vite SPA.
//
// What this solves: without SSR, every public route returned the same
// static index.html — same <title>, no canonical, no per-page
// description. Helmet fixes that once JS runs, but crawlers that
// don't execute JS (Ahrefs, older bots, link previewers) saw the
// homepage tags on /pricing /blog /marketplace /cgv etc.
//
// What this does: on matched routes, fetch the SPA shell, REPLACE
// title + description + existing og:* + twitter:*, and inject a
// canonical tailored to the path. For /blog it also injects a
// <noscript> list of article links so crawlers can discover them;
// for /blog/:slug it hits /api/blog/posts/:slug to pull the
// article's own meta_title + meta_description and emits an Article
// JSON-LD blob with a guaranteed image.
//
// Kept as plain JS with no framework imports so it runs on Vercel's
// Edge runtime for a non-Next.js project.

export const config = {
  matcher: [
    '/',
    '/pricing',
    '/blog',
    '/blog/:path*',
    '/marketplace',
    '/cgv',
    '/confidentialite',
    '/mentions-legales',
    '/rgpd',
    '/signup',
    '/login',
    '/fonctionnalites/:path*',
    '/cas-dusage/:path*',
  ],
};

const SITE = 'https://refboost.io';
const OG_FALLBACK = SITE + '/og-image.png';

// Per-path meta. Descriptions are kept in the 120-160 char sweet spot
// for SERP snippets (Ahrefs flags anything under 120). /blog/:slug is
// resolved separately against the API.
function resolveMeta(path) {
  if (path === '/pricing') return {
    title: 'Tarifs RefBoost — Starter gratuit, Pro 29€, Business 79€',
    description: "Découvrez les tarifs RefBoost. Plan Starter gratuit à vie, Pro à 29€/mois, Business à 79€/mois avec CRM et webhooks illimités pour scaler.",
  };
  if (path === '/blog') return {
    title: 'Blog RefBoost — Conseils pour programmes partenaires B2B',
    description: "Articles, guides et stratégies pour créer et développer votre programme de partenaires et apporteurs d'affaires performant en B2B SaaS.",
  };
  if (path === '/marketplace') return {
    title: "Marketplace RefBoost — Programmes d'apporteurs d'affaires",
    description: "Découvrez les programmes d'apporteurs d'affaires disponibles sur RefBoost Marketplace. Postulez en quelques clics aux meilleurs programmes B2B.",
  };
  if (path === '/cgv') return {
    title: 'Conditions générales de vente — RefBoost',
    description: "Conditions générales de vente RefBoost : abonnements, facturation, résiliation, garanties et responsabilités de la plateforme SaaS partenaires.",
  };
  if (path === '/confidentialite') return {
    title: 'Politique de Confidentialité — RefBoost',
    description: "Comment RefBoost collecte, utilise et protège vos données personnelles. Détail de nos engagements conformes au RGPD et à la protection de la vie privée.",
  };
  if (path === '/mentions-legales') return {
    title: 'Mentions légales & éditeur du site — RefBoost',
    description: "Mentions légales du site RefBoost : informations sur l'éditeur, le directeur de publication, l'hébergeur et les conditions d'utilisation du site.",
  };
  if (path === '/rgpd') return {
    title: 'RGPD & protection des données — RefBoost',
    description: "Comment RefBoost assure sa conformité au RGPD : vos droits d'accès, rectification et suppression, nos engagements et les mesures de protection de vos données.",
  };
  if (path === '/signup') return {
    title: 'Créer votre compte RefBoost — Gratuit, sans carte bancaire',
    description: "Créez votre programme partenaires en 5 minutes avec RefBoost. Suivi des referrals, commissions, tableau de bord — gratuit à vie, sans carte bancaire.",
  };
  if (path === '/login') return {
    title: 'Connexion à votre espace partenaires RefBoost',
    description: "Connectez-vous à votre espace RefBoost pour gérer vos partenaires, suivre vos referrals, valider les commissions et piloter votre programme B2B.",
  };
  if (path === '/fonctionnalites/pipeline') return {
    title: 'Pipeline partenaires — Kanban RefBoost',
    description: "Visualisez et pilotez votre pipeline de leads partenaires avec un Kanban personnalisable. Suivez chaque deal de la soumission à la conversion en B2B.",
  };
  if (path === '/fonctionnalites/commissions') return {
    title: 'Commissions partenaires automatisées — RefBoost',
    description: "Automatisez le calcul des commissions partenaires. Règles flexibles, validation en un clic, paiements tracés — tout ce qu'il faut pour scaler le programme.",
  };
  if (path === '/fonctionnalites/analytics') return {
    title: 'Analytics de programme partenaires — RefBoost',
    description: "Mesurez la performance de chaque partenaire, chaque source et chaque campagne. Dashboards, cohortes et exports pour piloter votre programme par la data.",
  };
  if (path === '/fonctionnalites/personnalisation') return {
    title: 'Portail partenaire personnalisé — RefBoost',
    description: "Offrez à vos partenaires un portail à vos couleurs : logo, domaine, catégories, pipeline et règles de commission adaptés à votre programme B2B.",
  };
  if (path === '/fonctionnalites/tracking') return {
    title: 'Tracking referrals et liens partenaires — RefBoost',
    description: "Tracez chaque clic, chaque lead et chaque conversion avec des liens partenaires uniques. Script JS, UTM, codes promo et attribution multi-touch intégrés.",
  };
  if (path === '/cas-dusage') return {
    title: "Cas d'usage RefBoost — Programmes partenaires par secteur",
    description: "Découvrez comment RefBoost s'adapte à votre modèle : SaaS B2B, cabinet de conseil, startup, réseau de distribution, marketplace ou agence marketing.",
  };
  if (path === '/cas-dusage/saas-b2b') return {
    title: 'Programme partenaire SaaS B2B — RefBoost',
    description: "Créez un canal partenaire rentable pour votre SaaS B2B. Pipeline visuel, commissions automatiques, intégrations CRM. CAC 4x inférieur au direct.",
  };
  if (path === '/cas-dusage/cabinet-conseil') return {
    title: "Apporteur d'affaires cabinet conseil — RefBoost",
    description: "Vous recommandez des solutions à vos clients ? Monétisez chaque recommandation avec RefBoost. Portail dédié, suivi temps réel, commissions auto.",
  };
  if (path === '/cas-dusage/startup') return {
    title: 'Programme partenaire startup — RefBoost',
    description: "Lancez votre programme d'apporteurs d'affaires sans budget avec le plan gratuit RefBoost. Recrutez vos premiers partenaires et payez au résultat.",
  };
  if (path === '/cas-dusage/reseau-distribution') return {
    title: 'Gestion revendeurs et prescripteurs — RefBoost',
    description: "Gérez des dizaines de revendeurs et prescripteurs sur une seule plateforme. Niveaux, gamification, synchronisation CRM et commissions automatiques.",
  };
  if (path === '/cas-dusage/marketplace-plateforme') return {
    title: 'Programme ambassadeur marketplace — RefBoost',
    description: "Transformez vos utilisateurs en ambassadeurs. Liens de recommandation, portail en marque blanche, analytics par partenaire. Conversion 2 à 4x supérieure.",
  };
  if (path === '/cas-dusage/agence-marketing') return {
    title: 'Gestion programme partenaire multi-client — RefBoost',
    description: "Gérez les programmes partenaires de tous vos clients depuis une seule plateforme. Multi-tenant, marque blanche, reporting ROI par client inclus.",
  };
  return {
    title: 'RefBoost — Gestion de programme partenaires B2B',
    description: "RefBoost est la plateforme SaaS de gestion de programme partenaires et d'apporteurs d'affaires. Automatisez referrals, commissions et performance en 5 min.",
  };
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Normalise the path for the canonical URL: keep "/" but strip any
// trailing slash on deeper paths.
function canonicalPath(path) {
  if (!path || path === '/') return '/';
  return path.replace(/\/+$/, '');
}

// Build a title that respects the 60-char Ahrefs limit. For blog
// articles we trust the authored meta_title as-is (it was designed
// for SERP); only when it's missing do we truncate the full title
// and append the brand.
function buildBlogTitle(post) {
  if (post.meta_title && post.meta_title.length <= 60) return post.meta_title;
  const raw = post.title || 'Article';
  const max = 55 - ' — RefBoost'.length + 10; // aim for ≤60 total
  if (raw.length <= 60 - ' — RefBoost'.length) return raw + ' — RefBoost';
  return raw.slice(0, 55 - 1).trim() + '… — RefBoost';
}

// Swap an existing <meta ... > tag (matched by attribute+value) or
// append it if missing. Used so we never leave two og:title tags on
// the page after the middleware runs.
function upsertMeta(html, selector, replacement) {
  const re = new RegExp('<meta\\s+' + selector + '[^>]*>', 'i');
  if (re.test(html)) return html.replace(re, replacement);
  return html.replace('</head>', '    ' + replacement + '\n  </head>');
}

function upsertLink(html, rel, replacement) {
  const re = new RegExp('<link\\s+rel="' + rel + '"[^>]*>', 'i');
  if (re.test(html)) return html.replace(re, replacement);
  return html.replace('</head>', '    ' + replacement + '\n  </head>');
}

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;

  // Fetch the SPA shell. /index.html is not in the matcher so this
  // won't re-enter the middleware.
  const shellUrl = new URL('/index.html', url.origin).toString();
  let res;
  try {
    res = await fetch(shellUrl, { cf: { cacheTtl: 60 } });
  } catch {
    return; // fall through to Vercel default static handler
  }
  if (!res || !res.ok) return;
  let html = await res.text();

  // Resolve meta. Blog articles hit the API for their own meta_title +
  // meta_description so every post gets a unique crawlable head.
  let meta = resolveMeta(path);
  let articlePost = null;
  let blogIndexPosts = null;

  if (path.startsWith('/blog/') && path !== '/blog/' && path !== '/blog') {
    try {
      const slug = path.slice('/blog/'.length).replace(/\/+$/, '');
      if (slug) {
        const apiUrl = new URL('/api/blog/posts/' + encodeURIComponent(slug), url.origin).toString();
        const apiRes = await fetch(apiUrl, { cf: { cacheTtl: 300 } });
        if (apiRes.ok) {
          const data = await apiRes.json().catch(() => null);
          const post = data && data.post;
          if (post) {
            articlePost = post;
            meta = {
              title: buildBlogTitle(post),
              description: post.meta_description || post.excerpt || meta.description,
            };
          }
        }
      }
    } catch { /* keep generic blog meta */ }
  } else if (path === '/blog') {
    // Preload article list for the <noscript> block so crawlers that
    // don't run JS still have linkable hrefs to every post. The XML
    // sitemap already covers discovery, but visible in-page links
    // give us internal-link signal too.
    try {
      const apiUrl = new URL('/api/blog/posts?limit=200', url.origin).toString();
      const apiRes = await fetch(apiUrl, { cf: { cacheTtl: 300 } });
      if (apiRes.ok) {
        const data = await apiRes.json().catch(() => null);
        if (data && Array.isArray(data.posts)) blogIndexPosts = data.posts;
      }
    } catch { /* silent */ }
  }

  const canonical = SITE + canonicalPath(path);
  const title = esc(meta.title);
  const description = esc(meta.description);

  // Replace the static <title>.
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);

  // Replace existing meta / link tags (or append if missing). Using
  // upsert — not inject — keeps og:url single-valued, which was the
  // root cause of Ahrefs' "og:url ≠ canonical" warnings: the static
  // index.html shipped a homepage og:url that stayed alongside the
  // injected per-path one.
  html = upsertMeta(html, 'name="description"', `<meta name="description" content="${description}" />`);
  html = upsertLink(html, 'canonical', `<link rel="canonical" href="${canonical}" />`);
  html = upsertMeta(html, 'property="og:url"', `<meta property="og:url" content="${canonical}" />`);
  html = upsertMeta(html, 'property="og:title"', `<meta property="og:title" content="${title}" />`);
  html = upsertMeta(html, 'property="og:description"', `<meta property="og:description" content="${description}" />`);
  html = upsertMeta(html, 'name="twitter:title"', `<meta name="twitter:title" content="${title}" />`);
  html = upsertMeta(html, 'name="twitter:description"', `<meta name="twitter:description" content="${description}" />`);

  // /blog/:slug → Article JSON-LD with a guaranteed image (falls back
  // to the site OG image so Google's structured-data validator stops
  // complaining about the required `image` field on articles without
  // a cover_image_url.
  if (articlePost) {
    const img = articlePost.cover_image_url || OG_FALLBACK;
    html = upsertMeta(html, 'property="og:image"', `<meta property="og:image" content="${esc(img)}" />`);
    html = upsertMeta(html, 'property="og:type"', `<meta property="og:type" content="article" />`);
    // Google's Rich Results test has been firing warnings on blog
    // posts for a few reasons we can fix without changing content:
    // (a) publisher.logo should be an ImageObject with explicit
    //     width/height (Google docs specify a 60x60 minimum, square
    //     or wide; we use the 180×180 apple-touch-icon).
    // (b) image should carry a width/height for the page-level image
    //     too — otherwise Ahrefs' validator flags it as missing.
    // (c) headline must not exceed 110 characters — some long post
    //     titles were being rejected silently.
    // (d) Article with the new ImageObject shape keeps passing
    //     Google's validator.
    const headline = String(articlePost.title || meta.title || 'Article').slice(0, 110);
    const articleLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline,
      description: articlePost.meta_description || articlePost.excerpt || meta.description,
      url: canonical,
      datePublished: articlePost.published_at || articlePost.created_at,
      dateModified: articlePost.updated_at || articlePost.published_at,
      author: { '@type': 'Person', name: articlePost.author || 'RefBoost' },
      publisher: {
        '@type': 'Organization',
        name: 'RefBoost',
        logo: { '@type': 'ImageObject', url: SITE + '/apple-touch-icon.png', width: 180, height: 180 },
      },
      image: {
        '@type': 'ImageObject',
        url: img,
        width: 1200,
        height: 630,
      },
      mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
    };
    const ld = `<script type="application/ld+json">${JSON.stringify(articleLd).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', '    ' + ld + '\n  </head>');
  }

  // /blog → noscript index of every article so non-JS crawlers see
  // linkable hrefs for every post. These are the 26 "orphan" URLs
  // Ahrefs flagged — the SPA Link elements in the grid never show up
  // in the static HTML.
  if (blogIndexPosts && blogIndexPosts.length) {
    const items = blogIndexPosts.map(p => {
      const href = SITE + '/blog/' + encodeURIComponent(p.slug);
      const label = esc(p.title || p.slug);
      return `<li><a href="${href}">${label}</a></li>`;
    }).join('');
    const block = `<nav aria-label="Liste des articles de blog"><h2>Articles publiés</h2><ul>${items}</ul></nav>`;
    // Insert just inside the existing <noscript> so there's only ever
    // one such block even on repeated middleware runs.
    if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
      html = html.replace(/<\/noscript>/, block + '</noscript>');
    } else {
      html = html.replace('</body>', `<noscript>${block}</noscript>\n  </body>`);
    }
  }

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Let the edge cache briefly so crawlers hitting the same
      // route don't stampede the API.
      'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
    },
  });
}
