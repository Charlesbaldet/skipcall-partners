/**
 * contactxLookup — interroge Contact X (CRM Suite X) AVANT d'enregistrer un referral
 * pour savoir si l'entreprise est DÉJÀ connue dans le CRM de l'entité correspondante.
 *
 * On réutilise le webhook_endpoint Contact X configuré pour le tenant (même URL, même
 * secret HMAC) : l'URL de lookup se déduit du webhook (…/webhook → …/lookup) et le corps
 * est signé avec le secret du endpoint, exactement comme les webhooks sortants.
 *
 * BEST-EFFORT : toute absence d'intégration, erreur réseau ou réponse non-OK renvoie
 * `{ exists: false }` → on NE BLOQUE JAMAIS une soumission à cause d'un incident Contact X.
 */
const crypto = require('crypto');
const { query } = require('../db');

async function checkContactXDuplicate(tenantId, { company, email }) {
  const empty = { exists: false, message: null };
  if (!tenantId) return empty;

  let endpoint;
  try {
    const { rows } = await query(
      `SELECT url, secret FROM webhook_endpoints
        WHERE tenant_id = $1 AND is_active = TRUE
          AND url LIKE '%/api/refboost/%/webhook'
        ORDER BY created_at DESC LIMIT 1`,
      [tenantId]
    );
    endpoint = rows[0];
  } catch (e) {
    console.warn('[contactxLookup] lecture webhook_endpoints échouée:', e.message);
    return empty;
  }
  // Aucune intégration Contact X pour ce tenant → on laisse passer.
  if (!endpoint || !endpoint.url || !endpoint.secret) return empty;

  const lookupUrl = endpoint.url.replace(/\/webhook$/, '/lookup');
  const raw = JSON.stringify({ company: company || null, email: email || null });
  const sig = 'sha256=' + crypto.createHmac('sha256', endpoint.secret).update(raw).digest('hex');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(lookupUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-refboost-signature': sig,
        'x-refboost-event': 'referral.lookup',
      },
      body: raw,
      signal: controller.signal,
    });
    if (!res.ok) {
      console.warn('[contactxLookup] réponse non-OK', res.status);
      return empty;
    }
    const j = await res.json().catch(() => ({}));
    return { exists: !!j.exists, message: j.message || null };
  } catch (e) {
    console.warn('[contactxLookup] appel échoué (best-effort):', e.message);
    return empty;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { checkContactXDuplicate };
