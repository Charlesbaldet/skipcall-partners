// Static French → other-language map for blog category names.
// Blog categories are stored in French in the DB (Stratégie, Analytics, …);
// this map lets the UI show them in the active language.

import i18n from '../i18n';

export const CAT_TRANSLATIONS = {
  en: { 'Stratégie': 'Strategy', 'Analytics': 'Analytics', 'Guide': 'Guide', 'Commissions': 'Commissions' },
  es: { 'Stratégie': 'Estrategia', 'Analytics': 'Analítica', 'Guide': 'Guía', 'Commissions': 'Comisiones' },
  de: { 'Stratégie': 'Strategie', 'Analytics': 'Analytik', 'Guide': 'Leitfaden', 'Commissions': 'Provisionen' },
  it: { 'Stratégie': 'Strategia', 'Analytics': 'Analitica', 'Guide': 'Guida', 'Commissions': 'Commissioni' },
  nl: { 'Stratégie': 'Strategie', 'Analytics': 'Analyse', 'Guide': 'Gids', 'Commissions': 'Commissies' },
  pt: { 'Stratégie': 'Estratégia', 'Analytics': 'Analítica', 'Guide': 'Guia', 'Commissions': 'Comissões' },
};

export const translateCat = (cat) => CAT_TRANSLATIONS[i18n.language]?.[cat] || cat;
