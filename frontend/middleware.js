// Vercel Edge Middleware for a Vite SPA.
//
// What this solves: without SSR, every public route returned the same
// static index.html — same <title>, no canonical, no per-page
// description. Helmet fixes that once JS runs, but crawlers that
// don't execute JS (Ahrefs, older bots, link previewers) saw the
// homepage tags on /pricing /blog /marketplace /cgv etc.
//
// What this does: on matched routes, fetch the SPA shell,
// string-replace the <title> + description, and inject a canonical
// + og tags tailored to the path. For /blog/:slug it hits
// /api/blog/posts/:slug to pull the article's own meta_title +
// meta_description.
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
  ],
};

const SITE = 'https://refboost.io';

// Per-path meta. /blog/:slug is resolved separately against the API.
function resolveMeta(path) {
  if (path === '/pricing') return {
    title: 'Tarifs — RefBoost | Starter gratuit, Pro 29€/mois, Business 79€/mois',
    description: "Découvrez les tarifs RefBoost. Plan Starter gratuit, Pro à 29€/mois, Business à 79€/mois.",
  };
  if (path === '/blog') return {
    title: 'Blog — Conseils et ressources pour programmes partenaires B2B',
    description: "Articles, guides et stratégies pour créer et développer votre programme de partenaires et apporteurs d'affaires.",
  };
  if (path === '/marketplace') return {
    title: "Marketplace — Programmes d'apporteurs d'affaires disponibles",
    description: "Découvrez les programmes d'apporteurs d'affaires disponibles sur RefBoost Marketplace.",
  };
  if (path === '/cgv') return {
    title: 'CGV — RefBoost',
    description: "Conditions générales de vente de RefBoost, plateforme SaaS de gestion de programmes d'apporteurs d'affaires et partenaires.",
  };
  if (path === '/confidentialite') return {
    title: 'Politique de Confidentialité — RefBoost',
    description: 'Comment RefBoost collecte, utilise et protège vos données personnelles.',
  };
  if (path === '/mentions-legales') return {
    title: 'Mentions Légales — RefBoost',
    description: "Mentions légales du site RefBoost. Informations sur l'éditeur et l'hébergeur.",
  };
  if (path === '/rgpd') return {
    title: 'RGPD — RefBoost',
    description: 'Comment RefBoost assure sa conformité au RGPD. Vos droits, nos engagements, et les mesures de protection de vos données.',
  };
  if (path === '/signup') return {
    title: 'Créer un compte — RefBoost',
    description: 'Créez votre programme partenaires en 5 minutes. Gratuit, sans carte bancaire.',
  };
  if (path === '/login') return {
    title: 'Connexion — RefBoost',
    description: 'Connectez-vous à votre espace RefBoost.',
  };
  return {
    title: 'RefBoost — Plateforme de gestion de programme partenaires et apporteurs d\'affaires',
    description: "RefBoost est la plateforme SaaS de gestion de programme partenaires et d'apporteurs d'affaires. Automatisez le suivi des referrals, commissions et performance.",
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
            meta = {
              title: (post.meta_title || post.title || 'Article') + ' — RefBoost',
              description: post.meta_description || post.excerpt || meta.description,
            };
          }
        }
      }
    } catch { /* keep generic blog meta */ }
  }

  const canonical = SITE + canonicalPath(path);
  const title = esc(meta.title);
  const description = esc(meta.description);

  // Replace the static <title> and description (the SPA shell ships
  // exactly one of each so a simple regex is safe).
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${title}</title>`);
  html = html.replace(/<meta\s+name="description"[^>]*>/, `<meta name="description" content="${description}" />`);

  // Inject canonical + og:* just before </head>. The SPA shell no
  // longer ships a static canonical, so we're always adding (not
  // replacing) these.
  const injected = [
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ].map(s => '    ' + s).join('\n');
  html = html.replace('</head>', injected + '\n  </head>');

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
