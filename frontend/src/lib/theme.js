// RefBoost theme loader — fetches the current user's tenant config
// and injects CSS variables into :root so visual components can read them.
import api from './api';

const STYLE_ID = 'rb-theme-vars';

const DEFAULTS = {
  primary: '#047857',
  primaryLight: '#059669',
  primaryDark: '#065f46',
  accent: '#f97316',
  accentLight: '#fb923c',
};

function clamp(n) { return Math.max(0, Math.min(255, Math.round(n))); }

function shift(hex, amount) {
  const h = (hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const nr = clamp(r + amount * 255);
  const ng = clamp(g + amount * 255);
  const nb = clamp(b + amount * 255);
  return '#' + [nr, ng, nb].map(v => v.toString(16).padStart(2, '0')).join('');
}

function injectVars(t) {
  const primary = t.primary_color || DEFAULTS.primary;
  const accent = t.accent_color || DEFAULTS.accent;
  const primaryLight = t.secondary_color || shift(primary, 0.10);
  const primaryDark = shift(primary, -0.08);
  const accentLight = shift(accent, 0.10);

  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `:root {
  --rb-primary: ${primary};
  --rb-primary-light: ${primaryLight};
  --rb-primary-dark: ${primaryDark};
  --rb-accent: ${accent};
  --rb-accent-light: ${accentLight};
}`;
}

export async function loadThemeBySlug(slug) {
  if (!slug) return null;
  try {
    const r = await fetch('/api/tenants/public/' + encodeURIComponent(slug));
    if (!r.ok) return null;
    const d = await r.json();
    if (d && d.tenant) {
      injectVars(d.tenant);
      if (typeof window !== 'undefined') {
        window.__rbTenant = d.tenant;
        window.dispatchEvent(new CustomEvent('rb-theme-loaded', { detail: d.tenant }));
      }
      return d.tenant;
    }
  } catch (e) {}
  return null;
}

export async function loadTheme() {
  try {
    const data = await api.getMyTenant();
    if (data && data.tenant) {
      injectVars(data.tenant);
      if (typeof window !== 'undefined') {
        window.__rbTenant = data.tenant;
        window.dispatchEvent(new CustomEvent('rb-theme-loaded', { detail: data.tenant }));
      }
    }
  } catch (e) {
    // Silent fail — keep default green theme
  }
}

// Expose globally so the onboarding wizard (or anywhere else)
// can re-trigger a theme reload after a settings change.
if (typeof window !== 'undefined') {
  window.__rbLoadTheme = loadTheme;
}
