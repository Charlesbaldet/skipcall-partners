export const STATUS_CONFIG = {
  new: { label: 'Nouveau', color: '#6366f1', bg: '#eef2ff' },
  contacted: { label: 'ContactÃ©', color: '#0891b2', bg: '#ecfeff' },
  meeting: { label: 'RDV planifiÃ©', color: '#ca8a04', bg: '#fefce8' },
  proposal: { label: 'Proposition', color: '#c026d3', bg: '#fdf4ff' },
  won: { label: 'GagnÃ© â', color: '#16a34a', bg: '#f0fdf4' },
  lost: { label: 'Perdu', color: '#dc2626', bg: '#fef2f2' },
  duplicate: { label: 'Doublon CRM', color: '#78716c', bg: '#f5f5f4' },
};

export const LEVEL_CONFIG = {
  hot: { label: 'ð¥ Chaud', color: '#ef4444', bg: '#fef2f2' },
  warm: { label: 'âï¸ TiÃ¨de', color: '#f59e0b', bg: '#fffbeb' },
  cold: { label: 'âï¸ Froid', color: '#3b82f6', bg: '#eff6ff' },
};

export const STATUS_ORDER = ['new', 'contacted', 'meeting', 'proposal', 'won', 'lost', 'duplicate'];

export const fmt = (n) =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);

export const fmtDate = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });

export const fmtDateTime = (d) =>
  new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
