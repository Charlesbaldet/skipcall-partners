const { query } = require('../db');

// Cache tenants for 5 minutes
let tenantCache = {};
let cacheTime = 0;
const CACHE_TTL = 5 * 60 * 1000;

async function loadTenants() {
  if (Date.now() - cacheTime < CACHE_TTL && Object.keys(tenantCache).length > 0) return;
  try {
    const { rows } = await query('SELECT * FROM tenants WHERE is_active = true');
    tenantCache = {};
    rows.forEach(t => {
      tenantCache[t.slug] = t;
      if (t.domain) tenantCache[t.domain] = t;
    });
    cacheTime = Date.now();
  } catch (err) {
    console.error('Failed to load tenants:', err.message);
  }
}

// Middleware: resolve tenant from request
async function tenantMiddleware(req, res, next) {
  await loadTenants();

  // Priority: X-Tenant-ID header > subdomain > domain > default
  let tenant = null;

  // 1. Check header (for API calls)
  const tenantSlug = req.headers['x-tenant-slug'];
  if (tenantSlug && tenantCache[tenantSlug]) {
    tenant = tenantCache[tenantSlug];
  }

  // 2. Check origin/host domain
  if (!tenant) {
    const host = req.headers.host || '';
    const origin = req.headers.origin || '';
    // Try exact domain match
    if (tenantCache[host]) tenant = tenantCache[host];
    // Try from origin
    if (!tenant && origin) {
      try { const url = new URL(origin); if (tenantCache[url.host]) tenant = tenantCache[url.host]; } catch {}
    }
  }

  // 3. Default to first tenant (skipcall)
  if (!tenant) {
    tenant = tenantCache['skipcall'] || Object.values(tenantCache)[0];
  }

  if (!tenant) {
    return res.status(400).json({ error: 'Tenant not found' });
  }

  req.tenant = tenant;
  req.tenantId = tenant.id;
  next();
}

// Helper: get tenant config for frontend
function getTenantConfig(tenant) {
  return {
    id: tenant.id,
    name: tenant.name,
    slug: tenant.slug,
    logo_url: tenant.logo_url,
    primary_color: tenant.primary_color,
    secondary_color: tenant.secondary_color,
    accent_color: tenant.accent_color,
    settings: tenant.settings || {},
  };
}

// Clear cache (call after tenant update)
function clearTenantCache() {
  tenantCache = {};
  cacheTime = 0;
}

module.exports = { tenantMiddleware, getTenantConfig, clearTenantCache };
