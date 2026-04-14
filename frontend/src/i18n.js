import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import fr from './locales/fr/translation.json';
import en from './locales/en/translation.json';
import it from './locales/it/translation.json';
import es from './locales/es/translation.json';
import de from './locales/de/translation.json';
import nl from './locales/nl/translation.json';
import pt from './locales/pt/translation.json';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      fr: { translation: fr },
      en: { translation: en },
      it: { translation: it },
      es: { translation: es },
      de: { translation: de },
      nl: { translation: nl },
      pt: { translation: pt },
    },
    fallbackLng: 'fr',
    supportedLngs: ['fr', 'en', 'it', 'es', 'de', 'nl', 'pt'],
    detection: { order: ['localStorage', 'navigator', 'htmlTag'], caches: ['localStorage'] },
    interpolation: { escapeValue: false },
  });

export default i18n;
