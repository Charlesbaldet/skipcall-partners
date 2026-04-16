import i18n from '../i18n';

export const STATUS_CONFIG = {
  new:       { get label() { return i18n.t('status.new',       'Nouveau');    }, color: 'var(--rb-primary, #059669)', bg: '#eef2ff' },
  contacted: { get label() { return i18n.t('status.contacted', 'Contact\u00e9');  }, color: '#0891b2', bg: '#ecfeff' },
  meeting:   { get label() { return i18n.t('status.meeting',   'RDV planifi\u00e9'); }, color: '#ca8a04', bg: '#fefce8' },
  proposal:  { get label() { return i18n.t('status.proposal',  'Proposition'); }, color: '#8b5cf6', bg: '#f5f3ff' },
  won:       { get label() { return i18n.t('status.won',       'Gagn\u00e9');  }, color: '#16a34a', bg: '#f0fdf4' },
  lost:      { get label() { return i18n.t('status.lost',      'Perdu');       }, color: '#dc2626', bg: '#fef2f2' },
  duplicate: { get label() { return i18n.t('status.duplicate', 'Doublon');     }, color: '#94a3b8', bg: '#f8fafc' },
};

export const STATUS_ORDER = ['new','contacted','meeting','proposal','won','lost','duplicate'];

export const LEVEL_CONFIG = {
  Bronze:   { get label() { return i18n.t('level.Bronze',   'Bronze');   }, color: '#cd7f32', bg: '#fef3e2', icon: '\ud83e\udd49' },
  Silver:   { get label() { return i18n.t('level.Silver',   'Silver');   }, color: '#6b7280', bg: '#f3f4f6', icon: '\ud83e\udd48' },
  Gold:     { get label() { return i18n.t('level.Gold',     'Gold');     }, color: '#d97706', bg: '#fffbeb', icon: '\ud83e\udd47' },
  Platinum: { get label() { return i18n.t('level.Platinum', 'Platinum'); }, color: 'var(--rb-primary, #059669)', bg: '#eef2ff', icon: '\ud83d\udc8e' },
};

export const fmt = (n) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);
export const fmtDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR') : '—';
export const fmtDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR') : '—';
