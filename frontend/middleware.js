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
    '/marketplace/:path*',
    '/cgv',
    '/confidentialite',
    '/mentions-legales',
    '/rgpd',
    '/signup',
    '/login',
    '/fonctionnalites/:path*',
    '/cas-dusage/:path*',
    '/integrations',
    '/integrations/:path*',
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
  // Generic default for /marketplace/:slug — overridden in the
  // article-style fetch block below once we have the program data.
  if (path.startsWith('/marketplace/') && path !== '/marketplace/') return {
    title: 'Programme partenaire — RefBoost',
    description: "Découvrez ce programme partenaires sur RefBoost. Conditions, niveaux et avantages détaillés. Postulez en quelques clics.",
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
  if (path === '/integrations') return {
    title: 'Intégrations — RefBoost',
    description: "Connectez RefBoost à vos outils : Notion, HubSpot, Salesforce, Qonto, Google SSO. Synchronisez votre pipeline et automatisez les paiements partenaires.",
  };
  if (path === '/integrations/notion') return {
    title: 'Intégration Notion — RefBoost',
    description: "Synchronisez votre pipeline RefBoost avec Notion. Mapping bidirectionnel des statuts, contacts et entreprises avec détection de doublons.",
  };
  if (path === '/integrations/hubspot') return {
    title: 'Intégration HubSpot — RefBoost',
    description: "Connectez HubSpot CRM à RefBoost. Synchronisez automatiquement vos referrals, contacts et deals avec HubSpot via OAuth sécurisé.",
  };
  if (path === '/integrations/salesforce') return {
    title: 'Intégration Salesforce — RefBoost',
    description: "Connectez Salesforce à RefBoost. Synchronisez Opportunities, Contacts et Accounts avec mapping personnalisé des objets standards et custom.",
  };
  if (path === '/integrations/qonto') return {
    title: 'Intégration Qonto — RefBoost',
    description: "Automatisez le paiement de vos commissions partenaires via Qonto. Virements SEPA en un clic avec validation SCA sécurisée et preuve par email.",
  };
  if (path === '/integrations/google-sso') return {
    title: 'Google SSO — RefBoost',
    description: "Permettez à vos équipes et partenaires de se connecter à RefBoost via Google SSO. Connexion sécurisée sans mot de passe, multi-tenant.",
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
  let marketplaceProgram = null;
  let marketplaceIndexPartners = null;
  let marketplaceSimilar = null;

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
  } else if (path.startsWith('/marketplace/') && path !== '/marketplace/' && path !== '/marketplace') {
    try {
      const slug = path.slice('/marketplace/'.length).replace(/\/+$/, '');
      if (slug) {
        // Fire the program fetch and the similar-programs fetch in
        // parallel — both are needed for the detail-page noscript
        // (the program for hero copy + JSON-LD, the similar list
        // for the cross-links that turn each detail page into a
        // hub instead of a leaf in the crawl graph).
        const programUrl = new URL('/api/marketplace/programs/' + encodeURIComponent(slug), url.origin).toString();
        const similarUrl = new URL('/api/marketplace/programs/' + encodeURIComponent(slug) + '/similar', url.origin).toString();
        const [progRes, simRes] = await Promise.all([
          fetch(programUrl, { cf: { cacheTtl: 300 } }),
          fetch(similarUrl, { cf: { cacheTtl: 300 } }).catch(() => null),
        ]);
        if (progRes && progRes.ok) {
          const data = await progRes.json().catch(() => null);
          const program = data && data.program;
          if (program) {
            marketplaceProgram = program;
            const company = String(program.company_name || 'Programme').slice(0, 40);
            const title = `Programme partenaire ${company} | RefBoost`.slice(0, 60);
            const desc = String(program.page_description || program.short_description || '')
              .replace(/\s+/g, ' ').trim().slice(0, 160);
            meta = {
              title,
              description: desc || meta.description,
            };
          }
        }
        if (simRes && simRes.ok) {
          const simData = await simRes.json().catch(() => null);
          if (simData && Array.isArray(simData.programs)) marketplaceSimilar = simData.programs;
        }
      }
    } catch { /* keep generic marketplace meta */ }
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
  } else if (path === '/marketplace') {
    // Same crawler-discovery rationale as /blog above. Without this
    // block, /marketplace ships the empty SPA shell and Ahrefs sees
    // zero outbound links to /marketplace/:slug — every detail page
    // gets flagged "Orphan page (has no incoming internal links)".
    // The XML sitemap already lists them, but Ahrefs (and Google's
    // PageRank graph) needs an actual <a href> trail too.
    try {
      const apiUrl = new URL('/api/marketplace/', url.origin).toString();
      const apiRes = await fetch(apiUrl, { cf: { cacheTtl: 300 } });
      if (apiRes.ok) {
        const data = await apiRes.json().catch(() => null);
        if (data && Array.isArray(data.partners)) marketplaceIndexPartners = data.partners;
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

  // /integrations* and other static routes → inject a brief noscript
  // intro block so the static HTML carries real content for crawlers.
  // Same rationale as the /blog noscript: Googlebot's JS budget is
  // limited on new/low-authority paths and the SPA shell with empty
  // <div id="root"> got these URLs parked in "Discovered — currently
  // not indexed". Hardcoded here (not imported from the SPA bundle)
  // because Vercel Edge bundles middleware separately and we don't
  // want to drag the React app's data files into the edge runtime.
  const STATIC_BODIES = {
    '/integrations':
      '<h2>Connectez vos outils</h2>' +
      '<p>RefBoost s\'intègre avec vos CRM, outils de paiement et d\'authentification pour automatiser votre programme partenaires.</p>' +
      '<h2>Intégrations disponibles</h2>' +
      '<ul>' +
      '<li><a href="' + SITE + '/integrations/notion">Notion — Synchronisez votre pipeline avec vos bases Notion (CRM)</a></li>' +
      '<li><a href="' + SITE + '/integrations/hubspot">HubSpot — Poussez vos referrals vers HubSpot Deals (CRM)</a></li>' +
      '<li><a href="' + SITE + '/integrations/salesforce">Salesforce — Connectez vos Opportunities Salesforce (CRM)</a></li>' +
      '<li><a href="' + SITE + '/integrations/qonto">Qonto — Virements SEPA automatisés (Paiements)</a></li>' +
      '<li><a href="' + SITE + '/integrations/google-sso">Google SSO — Connexion sans mot de passe (Authentification)</a></li>' +
      '</ul>',
    '/integrations/notion':
      '<h2>Intégration Notion</h2>' +
      '<p>Connectez vos bases Notion à RefBoost pour synchroniser votre pipeline partenaires en temps réel. Mapping bidirectionnel des statuts, des champs et des contacts.</p>' +
      '<h2>Ce que vous pouvez faire</h2>' +
      '<ul><li>Sync bidirectionnelle des referrals entre RefBoost et Notion sans duplication.</li>' +
      '<li>Mapping personnalisé des propriétés Notion aux champs RefBoost.</li>' +
      '<li>Mapping des colonnes de statut Notion avec les étapes du pipeline RefBoost.</li>' +
      '<li>Détection des doublons avant chaque écriture, vos données sont protégées.</li></ul>' +
      '<p><a href="' + SITE + '/integrations">Toutes les intégrations</a></p>',
    '/integrations/hubspot':
      '<h2>Intégration HubSpot</h2>' +
      '<p>Connectez votre HubSpot CRM à RefBoost. Chaque referral devient un Deal HubSpot, chaque prospect un Contact, le tout synchronisé en temps réel via OAuth.</p>' +
      '<h2>Ce que vous pouvez faire</h2>' +
      '<ul><li>Sync des deals HubSpot dans le pipeline de votre choix.</li>' +
      '<li>Création automatique des Contacts HubSpot avec les infos partenaire associées.</li>' +
      '<li>Mapping des étapes de Deal HubSpot avec les statuts RefBoost.</li>' +
      '<li>Liens automatiques aux contacts existants pour éviter les doublons.</li></ul>' +
      '<p><a href="' + SITE + '/integrations">Toutes les intégrations</a></p>',
    '/integrations/salesforce':
      '<h2>Intégration Salesforce</h2>' +
      '<p>Connectez votre instance Salesforce à RefBoost. Synchronisation des Opportunities, Contacts et Accounts avec mapping personnalisé des objets standards et custom.</p>' +
      '<h2>Ce que vous pouvez faire</h2>' +
      '<ul><li>Chaque referral RefBoost devient une Opportunity Salesforce.</li>' +
      '<li>Création automatique des Contacts liés aux Accounts existants.</li>' +
      '<li>Mapping des Stages Salesforce avec les statuts RefBoost.</li>' +
      '<li>Support des custom objects et fields via l\'éditeur de mapping.</li></ul>' +
      '<p><a href="' + SITE + '/integrations">Toutes les intégrations</a></p>',
    '/integrations/qonto':
      '<h2>Intégration Qonto</h2>' +
      '<p>Connectez votre compte pro Qonto à RefBoost et payez les commissions de vos partenaires en un clic. Virements SEPA, validation SCA conforme DSP2 et preuve de virement automatisée.</p>' +
      '<h2>Ce que vous pouvez faire</h2>' +
      '<ul><li>Virements SEPA automatisés depuis votre compte Qonto, sans ressaisie d\'IBAN.</li>' +
      '<li>Validation SCA sécurisée conforme DSP2 sur votre app Qonto.</li>' +
      '<li>Paiements groupés jusqu\'à 400 commissions en une action.</li>' +
      '<li>Email de preuve de virement envoyé automatiquement au partenaire.</li></ul>' +
      '<p>Disponible avec le plan Business. <a href="' + SITE + '/pricing">Voir les tarifs</a> · <a href="' + SITE + '/integrations">Toutes les intégrations</a></p>',
    '/integrations/google-sso':
      '<h2>Google SSO</h2>' +
      '<p>Activé par défaut sur tous les plans. Vos équipes et vos partenaires se connectent à RefBoost via leur compte Google en un clic — zéro mot de passe à gérer, sécurité renforcée.</p>' +
      '<h2>Ce que vous pouvez faire</h2>' +
      '<ul><li>Connexion en un clic via le compte Google de l\'utilisateur.</li>' +
      '<li>Multi-tenant : un même compte Google peut accéder à plusieurs espaces partenaires.</li>' +
      '<li>Sécurité renforcée : pas de mot de passe stocké, 2FA hérité de Google.</li>' +
      '<li>Onboarding simplifié, fini les mots de passe oubliés.</li></ul>' +
      '<p><a href="' + SITE + '/integrations">Toutes les intégrations</a></p>',
  };
  if (STATIC_BODIES[path]) {
    const block = STATIC_BODIES[path];
    if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
      html = html.replace(/<\/noscript>/, block + '</noscript>');
    } else {
      html = html.replace('</body>', `<noscript>${block}</noscript>\n  </body>`);
    }
  }

  // /integrations* → inject hreflang + WebPage JSON-LD server-side so
  // crawlers without JS (Ahrefs, link previewers) see the language
  // signals and structured data. The Helmet tags rendered client-side
  // never make it into the static HTML on this Vite SPA, so this is
  // the only place the meta is actually crawlable.
  if (path === '/integrations' || path.startsWith('/integrations/')) {
    // Single x-default — every locale on this site is served from the
    // same URL (no /en/* / /es/* paths exist), so emitting 7 hreflang
    // tags pointing at the same href triggers Ahrefs' "page referenced
    // for more than one language" error. x-default alone is the
    // documented signal for "any language, same URL".
    html = html.replace('</head>', '    <link rel="alternate" hrefLang="x-default" href="' + esc(canonical) + '" />\n  </head>');

    const webpageLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      url: canonical,
    };
    const ldScript = `<script type="application/ld+json">${JSON.stringify(webpageLd).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', '    ' + ldScript + '\n  </head>');
  }

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

    // Inject the article body inside a <noscript> so crawlers that
    // don't run JS (and Googlebot when its JS budget gets cut) still
    // see real content on /blog/:slug. Without this, every article
    // page returned the empty SPA shell and Google parked them in
    // "Discovered — currently not indexed" forever. JS-running
    // visitors never see this — React mounts into <div id="root">
    // which sits outside the noscript.
    const articleBody = String(articlePost.content || '');
    const authorLine = esc(articlePost.author || 'RefBoost');
    const dateRaw = articlePost.published_at || articlePost.created_at || '';
    const dateLabel = dateRaw ? esc(String(dateRaw).slice(0, 10)) : '';
    const articleBlock =
      `<article>` +
      `<h2>${esc(articlePost.title || '')}</h2>` +
      (dateLabel ? `<p><em>${authorLine} · ${dateLabel}</em></p>` : `<p><em>${authorLine}</em></p>`) +
      articleBody +
      `<p><a href="${SITE}/blog">← Tous les articles</a></p>` +
      `</article>`;
    if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
      html = html.replace(/<\/noscript>/, articleBlock + '</noscript>');
    } else {
      html = html.replace('</body>', `<noscript>${articleBlock}</noscript>\n  </body>`);
    }
  }

  // /marketplace/:slug → WebPage JSON-LD + noscript body for crawlers.
  // Same pattern as the blog: the SPA shell is empty, so without
  // injecting real content here Googlebot sees nothing and the page
  // never gets indexed. Hreflang for the 7 supported langs points at
  // the same canonical (single-locale URL pattern this site uses).
  if (marketplaceProgram) {
    const p = marketplaceProgram;
    if (p.logo_url) {
      html = upsertMeta(html, 'property="og:image"', `<meta property="og:image" content="${esc(p.logo_url)}" />`);
    }
    // Single x-default per same-URL-for-all-locales pattern (see
    // /integrations* block above for the full reasoning).
    html = html.replace('</head>', '    <link rel="alternate" hrefLang="x-default" href="' + esc(canonical) + '" />\n  </head>');

    const webpageLd = {
      '@context': 'https://schema.org',
      '@type': 'WebPage',
      name: meta.title,
      description: meta.description,
      url: canonical,
      breadcrumb: {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Accueil', item: SITE + '/' },
          { '@type': 'ListItem', position: 2, name: 'Marketplace', item: SITE + '/marketplace' },
          { '@type': 'ListItem', position: 3, name: p.company_name },
        ],
      },
    };
    const ldScript = `<script type="application/ld+json">${JSON.stringify(webpageLd).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', '    ' + ldScript + '\n  </head>');

    // noscript body — h1, hero description, why_join list, references list,
    // and a back-link to the marketplace index for crawl-graph weight.
    const safe = (s) => esc(String(s || ''));
    const items = (arr, fmt) => Array.isArray(arr) && arr.length
      ? '<ul>' + arr.map(fmt).join('') + '</ul>'
      : '';
    const whyJoin = items(p.why_join, it => `<li>${safe(it && it.text)}</li>`);
    const refs = items(p.client_references, r =>
      `<li><strong>${safe(r && r.name)}</strong>${r && r.description ? ': ' + safe(r.description) : ''}</li>`);
    const conditions = items(p.commission_blocks, c =>
      `<li><strong>${safe(c && c.metric)} ${safe(c && c.label)}</strong>${c && c.description ? ' — ' + safe(c.description) : ''}</li>`);
    // Cross-links to 2-3 other published programs. Without this
    // the detail pages were leaf nodes in the crawl graph — Ahrefs
    // could reach them from /marketplace but couldn't discover any
    // outgoing internal links, so PageRank stopped flowing past
    // them. The similar-programs API already returns up to 3 rows
    // ordered by sector match, so we just need to reshape them
    // into <a href> rows.
    const crossLinks = Array.isArray(marketplaceSimilar) && marketplaceSimilar.length
      ? '<h2>Programmes similaires</h2><ul>' + marketplaceSimilar.slice(0, 3).map(s =>
          `<li><a href="${SITE}/marketplace/${encodeURIComponent(s.slug)}">${safe(s.company_name)}</a>${s.sector ? ' — ' + safe(s.sector) : ''}</li>`
        ).join('') + '</ul>'
      : '';
    const block = `<article>` +
      `<h2>${safe(p.company_name)}</h2>` +
      (p.short_description ? `<p>${safe(p.short_description)}</p>` : '') +
      (p.page_description ? `<p>${safe(p.page_description)}</p>` : '') +
      (conditions ? `<h2>Conditions du programme</h2>${conditions}` : '') +
      (whyJoin ? `<h2>Pourquoi devenir partenaire</h2>${whyJoin}` : '') +
      (refs ? `<h2>Ils nous font confiance</h2>${refs}` : '') +
      crossLinks +
      `<p><a href="${SITE}/marketplace">← Tous les programmes</a> · ` +
      `<a href="${SITE}/">Accueil RefBoost</a></p>` +
      `</article>`;
    if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
      html = html.replace(/<\/noscript>/, block + '</noscript>');
    } else {
      html = html.replace('</body>', `<noscript>${block}</noscript>\n  </body>`);
    }
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

  // /marketplace → same crawler-discovery pattern as /blog. Renders
  // every published program as a bare <a href> inside <noscript> so
  // each /marketplace/:slug page has at least one inbound internal
  // link visible to non-JS crawlers (Ahrefs in particular doesn't
  // execute JS, so the React-rendered cards on the SPA side don't
  // count). Tiny payload — slug + name + sector + truncated short
  // description per row.
  if (marketplaceIndexPartners && marketplaceIndexPartners.length) {
    const items = marketplaceIndexPartners.map(p => {
      const href = SITE + '/marketplace/' + encodeURIComponent(p.slug);
      const name = esc(p.name || p.slug);
      const sector = p.sector ? ' — ' + esc(p.sector) : '';
      const desc = p.short_description
        ? ' — ' + esc(String(p.short_description).slice(0, 140))
        : '';
      return `<li><a href="${href}">${name}</a>${sector}${desc}</li>`;
    }).join('');
    const block = `<nav aria-label="Programmes partenaires sur la marketplace RefBoost"><h2>Programmes partenaires</h2><ul>${items}</ul></nav>`;
    if (/<noscript>[\s\S]*?<\/noscript>/.test(html)) {
      html = html.replace(/<\/noscript>/, block + '</noscript>');
    } else {
      html = html.replace('</body>', `<noscript>${block}</noscript>\n  </body>`);
    }
  }

  // ─── Final fallback: hreflang + WebPage JSON-LD ─────────────────────
  // For every matched path that hasn't already had per-path hreflang or
  // structured data injected upstream (e.g. /integrations*, /blog/:slug,
  // /marketplace/:slug all do their own), inject a generic hreflang
  // bundle + WebPage JSON-LD here. Idempotent via .includes() guards
  // so the injections never duplicate. Same single-canonical pattern
  // the rest of the site uses (every locale's hreflang points at the
  // same URL — no per-locale paths exist on this site).
  // hreflang fallback: single x-default for any matched path that
  // doesn't already have hreflang set upstream. Single URL per
  // locale = single x-default, NOT 7 same-URL hreflang tags
  // (Ahrefs flags those as "page referenced for more than one
  // language").
  const hasHreflang = html.includes('rel="alternate" hrefLang') || html.includes('rel="alternate" hreflang');
  if (!hasHreflang) {
    html = html.replace('</head>', '    <link rel="alternate" hrefLang="x-default" href="' + esc(canonical) + '" />\n  </head>');
  }
  // Per-path-aware @type for the WebPage / WebSite / CollectionPage
  // fallback, so Google's structured-data validator picks the right
  // schema for each page kind. /blog/:slug already gets Article LD
  // upstream and is skipped here.
  // WebApplication schema — homepage only. Used to live in the
  // static index.html (Ahrefs flagged ~70 duplicates), then briefly
  // moved here as SoftwareApplication, which Google rejects without
  // aggregateRating / review. WebApplication keeps the same shape
  // and metadata but isn't gated on a rating, so the Rich Results
  // test passes. The Organization schema in index.html stays — it's
  // accurate everywhere.
  if (path === '/' || path === '') {
    const softwareLd = {
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'RefBoost',
      applicationCategory: 'BusinessApplication',
      operatingSystem: 'Web',
      description: "Plateforme SaaS de gestion de programme partenaires et d'apporteurs d'affaires",
      url: SITE + '/',
      offers: {
        '@type': 'AggregateOffer',
        lowPrice: '0',
        highPrice: '79',
        priceCurrency: 'EUR',
        offerCount: '3',
      },
      author: { '@type': 'Organization', name: 'RefBoost', url: SITE + '/' },
    };
    const softwareScript = `<script type="application/ld+json">${JSON.stringify(softwareLd).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', '    ' + softwareScript + '\n  </head>');
  }

  if (!html.includes('application/ld+json')) {
    let ld;
    if (path === '/' || path === '') {
      ld = {
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: 'RefBoost',
        url: SITE + '/',
        potentialAction: {
          '@type': 'SearchAction',
          target: SITE + '/blog?q={search_term_string}',
          'query-input': 'required name=search_term_string',
        },
      };
    } else if (path === '/blog' || path === '/marketplace') {
      ld = {
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: meta.title,
        description: meta.description,
        url: canonical,
        isPartOf: { '@type': 'WebSite', name: 'RefBoost', url: SITE + '/' },
      };
    } else {
      ld = {
        '@context': 'https://schema.org',
        '@type': 'WebPage',
        name: meta.title,
        description: meta.description,
        url: canonical,
        isPartOf: { '@type': 'WebSite', name: 'RefBoost', url: SITE + '/' },
      };
    }
    const ldScript = `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`;
    html = html.replace('</head>', '    ' + ldScript + '\n  </head>');
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
