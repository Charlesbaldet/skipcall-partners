import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Locale JSONs are served from /public/locales/<lng>/translation.json
// (one HTTP fetch per language). Only the active language loads on
// init; switching language with i18n.changeLanguage('en') triggers
// a second fetch on demand. This keeps the main JS bundle ~1 MB
// lighter than the previous setup — every locale used to be bundled
// synchronously into the entry chunk via top-level imports.
//
// React Suspense is enabled below so a t() call against a not-yet-
// loaded key suspends the component tree until the locale arrives.
// App.jsx already wraps <Routes> in <Suspense fallback={...}>, so
// the same "Chargement…" fallback covers route-change suspense AND
// language-switch suspense — no separate loading UI to maintain.

i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    backend: {
      // Static-asset path. Vercel serves /public/* as-is, so the
      // request is a single CDN-edge GET with normal browser
      // caching. If a translation deploy needs to invalidate
      // stale browser caches sooner than default, we'd add a
      // ?v=<hash> query string — left off for now to keep URLs
      // clean.
      loadPath: '/locales/{{lng}}/translation.json',
    },
    lng: (typeof window !== 'undefined' && window.localStorage?.getItem('i18nextLng')) || 'fr',
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'it', 'es', 'de', 'nl', 'pt'],
    // localStorage only — if the user has picked a language it sticks,
    // otherwise the site renders in French. Navigator-based detection
    // was leaving French-content pages with an English nav for users
    // on English browsers.
    detection: { order: ['localStorage'], caches: ['localStorage'] },
    interpolation: { escapeValue: false },
    react: {
      // Suspense mode: components reading t() before their resource
      // bundle has arrived throw a Promise that React Suspense
      // catches. Trades a synchronous render for a one-time wait on
      // first paint — covered by the route-level Suspense in App.jsx.
      useSuspense: true,
    },
  });

// Garder <html lang> synchronisé avec la langue active. C'est le standard web
// (accessibilité + SEO : l'attribut doit refléter la langue du contenu affiché)
// et c'est ce que lit le widget de support LOGPOSE pour s'afficher dans la
// langue du SITE plutôt que celle du navigateur. index.html fige lang="fr" au
// chargement ; on le met à jour ici à l'init ET à chaque changement de langue.
if (typeof document !== 'undefined') {
  const syncHtmlLang = (lng) => {
    if (lng) document.documentElement.setAttribute('lang', String(lng).slice(0, 2));
  };
  i18n.on('languageChanged', syncHtmlLang);
  syncHtmlLang(i18n.language || i18n.options?.lng);
}

export default i18n;
