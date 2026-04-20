const { query } = require('../db');

// Small in-memory cache so we don't re-hit the DB on every request.
const TTL_MS = 15 * 1000;
const cache = new Map(); // tenantId → { at, flags }

async function getFeatures(tenantId) {
  if (!tenantId) return null;
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.flags;
  const { rows } = await query(
    `SELECT feature_referral_links, feature_promo_codes, feature_tracking_script,
            tracking_redirect_url, tracking_cookie_days
       FROM tenants
      WHERE id = $1
      LIMIT 1`,
    [tenantId]
  );
  const flags = rows[0] || {
    feature_referral_links: false,
    feature_promo_codes: false,
    feature_tracking_script: false,
    tracking_redirect_url: null,
    tracking_cookie_days: 30,
  };
  cache.set(tenantId, { at: Date.now(), flags });
  return flags;
}

function invalidate(tenantId) {
  if (tenantId) cache.delete(tenantId);
}

// Express middleware factory — blocks the request with 403 unless the
// named feature is enabled for the caller's tenant.
function requireFeature(name) {
  return async (req, res, next) => {
    try {
      const flags = await getFeatures(req.tenantId);
      if (!flags || !flags[name]) {
        return res.status(403).json({ error: 'This feature is not enabled' });
      }
      req.tenantFeatures = flags;
      next();
    } catch (err) {
      console.error('[featureFlag]', name, err.message);
      res.status(500).json({ error: 'Erreur serveur' });
    }
  };
}

module.exports = { requireFeature, getFeatures, invalidate };
