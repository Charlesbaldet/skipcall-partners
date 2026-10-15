import i18n from '../i18n';

export const STATUS_CONFIG = {
  new:       { get label() { return i18n.t('status.new',       'Nouveau');    }, color: 'var(--rb-primary, #0e7a54)', bg: '#eef1ea' },
  contacted: { get label() { return i18n.t('status.contacted', 'Contact\u00e9');  }, color: '#0891b2', bg: '#ecfeff' },
  meeting:   { get label() { return i18n.t('status.meeting',   'RDV planifi\u00e9'); }, color: '#ca8a04', bg: '#fefce8' },
  proposal:  { get label() { return i18n.t('status.proposal',  'Proposition'); }, color: '#0e7a54', bg: '#f5f3ff' },
  won:       { get label() { return i18n.t('status.won',       'Gagn\u00e9');  }, color: '#157a4c', bg: '#e9f1ea' },
  lost:      { get label() { return i18n.t('status.lost',      'Perdu');       }, color: '#b23b2e', bg: '#f7e9e6' },
  duplicate: { get label() { return i18n.t('status.duplicate', 'Doublon');     }, color: '#99a09a', bg: '#f6f2e9' },
};

export const STATUS_ORDER = ['new','contacted','meeting','proposal','won','lost','duplicate'];

export const LEVEL_CONFIG = {
  Bronze:   { get label() { return i18n.t('level.Bronze',   'Bronze');   }, color: '#cd7f32', bg: '#fef3e2', icon: '\ud83e\udd49' },
  Silver:   { get label() { return i18n.t('level.Silver',   'Silver');   }, color: '#6b7280', bg: '#f3f4f6', icon: '\ud83e\udd48' },
  Gold:     { get label() { return i18n.t('level.Gold',     'Gold');     }, color: '#d97706', bg: '#f6efda', icon: '\ud83e\udd47' },
  Platinum: { get label() { return i18n.t('level.Platinum', 'Platinum'); }, color: 'var(--rb-primary, #0e7a54)', bg: '#eef1ea', icon: '\ud83d\udc8e' },
};

// Deal-temperature pill displayed on Kanban cards, table rows and
// the referral detail modal. Keyed by referrals.recommendation_level
// (hot / warm / cold) \u2014 note that two existing call sites were
// passing this value into LEVEL_CONFIG (partner tiers), so the badge
// was silently falling through to raw text. TEMPERATURE_CONFIG is the
// correct config to hand to <Badge>. Colours are the task spec:
// red / orange / blue.
export const TEMPERATURE_CONFIG = {
  hot:  { get label() { return i18n.t('temperature.hot',  'Chaud'); }, color: '#b23b2e', bg: '#FEE2E2' },
  warm: { get label() { return i18n.t('temperature.warm', 'Ti\u00e8de'); }, color: '#D97706', bg: '#f3ead0' },
  cold: { get label() { return i18n.t('temperature.cold', 'Froid'); }, color: '#2563EB', bg: '#DBEAFE' },
};

export const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—';

// Return the display name for a partner category. Any slug that has
// a matching `partner_category.<slug>` i18n key is translated — this
// covers the three defaults (apporteur / conseil / integrateur) plus
// any custom slug an admin has shipped a translation for (e.g.
// `client` via `partner_category.client`). Unknown slugs fall through
// to the raw name saved in the database.
export const categoryName = (cat) => {
  if (!cat) return '';
  const slug = cat.slug || cat.category_slug;
  const rawName = cat.name || cat.category_name || '';
  if (!slug) return rawName;
  return i18n.t('partner_category.' + slug, { defaultValue: rawName });
};
