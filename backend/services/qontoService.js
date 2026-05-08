// Qonto Banking integration service.
//
// Wraps the OAuth flow and the subset of the thirdparty.qonto.com API
// we need to drive automated commission payments:
//   1. exchange OAuth code → tokens
//   2. refresh tokens before they expire
//   3. list the connected organization's bank accounts (so the admin
//      picks which one to debit)
//   4. upload the partner's invoice PDF as a Qonto attachment
//   5. look up an existing trusted beneficiary by IBAN
//   6. POST a single SEPA transfer or POST a bulk SEPA transfer
//   7. fetch a transfer's status (so the polling worker can flip the
//      commission to 'paid' once Qonto reports completion)
//
// Defensive note: Qonto's API requires SCA for untrusted beneficiaries,
// so creating a transfer to a brand-new IBAN requires the admin to
// approve it inside their Qonto app. We expose that nuance to the
// caller via the `requires_sca` field on the transfer response.

const crypto = require('crypto');
const { query } = require('../db');
const logger = require('./logger');

// Generate a fresh UUIDv4 for use as a Qonto X-Qonto-Idempotency-Key.
// Qonto requires this header on every transfer / bulk-transfer /
// attachment POST and uses it to dedupe retries — if the same key
// arrives twice, the second call returns the original response
// instead of creating a second transfer.
function newIdempotencyKey() {
  // Node 14.17+ has crypto.randomUUID available globally; fall back to
  // a manual v4 builder if we land on an older runtime.
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.randomBytes(16);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const OAUTH_AUTHORIZE_URL = 'https://oauth.qonto.com/oauth2/auth';
const OAUTH_TOKEN_URL = 'https://oauth.qonto.com/oauth2/token';
const API_BASE = 'https://thirdparty.qonto.com/v2';
// Documented Qonto OAuth scopes we actually exercise.
// attachment.write was dropped in an earlier round because we hit an
// invalid_scope error — but the actual culprit was beneficiary.read,
// not this one. POST /v2/attachments needs attachment.write or it
// 403s with "missing required oauth scope", so it goes back in.
// Existing tenants must reconnect (Settings → Intégrations → Qonto
// → Disconnect / Connect) for the new scope to take effect.
const SCOPES = ['payment.write', 'organization.read', 'attachment.write'];

function clientId() { return process.env.QONTO_CLIENT_ID || ''; }
function clientSecret() { return process.env.QONTO_CLIENT_SECRET || ''; }

function authorizeUrl(state, redirectUri) {
  if (!clientId()) return null;
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId(),
    redirect_uri: redirectUri,
    scope: SCOPES.join(' '),
    state,
  });
  return `${OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

async function exchangeCode(code, redirectUri) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const r = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Qonto token exchange failed (${r.status}): ${txt.slice(0, 300)}`);
  }
  return r.json(); // { access_token, refresh_token, expires_in, token_type }
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
  });
  const r = await fetch(OAUTH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Qonto token refresh failed (${r.status}): ${txt.slice(0, 300)}`);
  }
  return r.json();
}

// Returns a fresh access_token for the tenant, refreshing if it's
// within 60 s of expiry. Persists the new token + expiry back into
// payment_integrations so the next call doesn't re-refresh.
async function getAccessToken(tenantId) {
  const { rows } = await query(
    `SELECT id, access_token, refresh_token, token_expires_at
       FROM payment_integrations
      WHERE tenant_id = $1 AND provider = 'qonto' AND is_active = TRUE`,
    [tenantId]
  );
  const integ = rows[0];
  if (!integ) throw new Error('qonto_not_connected');

  const now = Date.now();
  const expiresAt = integ.token_expires_at ? new Date(integ.token_expires_at).getTime() : 0;
  if (integ.access_token && expiresAt > now + 60_000) {
    return integ.access_token;
  }
  if (!integ.refresh_token) {
    // Token is expired and we can't refresh — force a reconnect.
    throw new Error('qonto_reconnect_required');
  }

  const tokens = await refreshAccessToken(integ.refresh_token);
  const newExpiresAt = new Date(Date.now() + (tokens.expires_in || 3600) * 1000);
  await query(
    `UPDATE payment_integrations
        SET access_token = $2,
            refresh_token = COALESCE($3, refresh_token),
            token_expires_at = $4,
            updated_at = NOW()
      WHERE id = $1`,
    [integ.id, tokens.access_token, tokens.refresh_token || null, newExpiresAt]
  );
  return tokens.access_token;
}

// Generic authenticated fetch with one auto-retry on 401 (token may
// have been revoked between getAccessToken and the actual call).
async function api(tenantId, path, init = {}) {
  const token = await getAccessToken(tenantId);
  const url = path.startsWith('http') ? path : API_BASE + path;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    ...(init.headers || {}),
  };
  if (init.body && !headers['Content-Type'] && !(init.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(url, { ...init, headers });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    const err = new Error(`Qonto ${init.method || 'GET'} ${path} failed (${r.status}): ${txt.slice(0, 500)}`);
    err.status = r.status;
    err.body = txt;
    throw err;
  }
  if (r.status === 204) return null;
  return r.json();
}

async function fetchOrganization(tenantId) {
  // Per Qonto docs the v2/organization endpoint returns the org +
  // bank_accounts array. The exact field for the bank account id is
  // `id` (UUID) and for the IBAN is `iban`.
  return api(tenantId, '/organization');
}

async function listBankAccounts(tenantId) {
  const data = await fetchOrganization(tenantId);
  const org = data?.organization || data;
  return {
    organization_slug: org?.slug || org?.legal_name || null,
    bank_accounts: (org?.bank_accounts || []).map(b => ({
      id: b.id,
      slug: b.slug,
      iban: b.iban,
      bic: b.bic,
      currency: b.currency,
      balance: b.balance,
      label: b.name || b.slug || b.iban,
    })),
  };
}

async function findBeneficiaryByIban(tenantId, iban) {
  if (!iban) return null;
  const cleanIban = iban.replace(/\s+/g, '').toUpperCase();
  try {
    const data = await api(tenantId, `/beneficiaries?iban=${encodeURIComponent(cleanIban)}`);
    const list = data?.beneficiaries || [];
    return list.find(b => (b.iban || '').replace(/\s+/g, '').toUpperCase() === cleanIban) || null;
  } catch (e) {
    // 404 / scope issues fall through to "no trusted beneficiary"
    return null;
  }
}

// Multipart upload of an invoice PDF that's already in memory (we
// store the partner's invoice as a base64 data URL in the DB; the
// caller has already decoded it into a Buffer).
async function uploadAttachment(tenantId, { buffer, filename, contentType, idempotencyKey }) {
  const token = await getAccessToken(tenantId);
  const fd = new FormData();
  // Node 20+ has global FormData + Blob. Fall back gracefully.
  const blob = new Blob([buffer], { type: contentType || 'application/pdf' });
  fd.append('file', blob, filename || 'invoice.pdf');
  const r = await fetch(`${API_BASE}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Qonto-Idempotency-Key': idempotencyKey || newIdempotencyKey(),
    },
    body: fd,
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => '');
    throw new Error(`Qonto attachment upload failed (${r.status}): ${txt.slice(0, 300)}`);
  }
  const data = await r.json();
  return data?.attachment || data;
}

function buildReference(commissionId) {
  // Qonto SEPA references must be ≤ 35 alphanumeric chars.
  const short = String(commissionId).replace(/-/g, '').slice(0, 12).toUpperCase();
  return `REFBOOSTCOM${short}`.slice(0, 35);
}

// VoP (Verification of Payee) — required by EU regulation since
// October 2025. Every SEPA transfer POST must carry a vop_proof_token
// at the JSON root, obtained from POST /v2/sepa/verify_payee. Without
// it Qonto returns 401 vop_proof_token_missing and the transfer never
// gets created.
//
// The proof_token is valid regardless of the match result — even on
// MATCH_RESULT_NO_MATCH Qonto still issues a token (the admin then
// has to acknowledge the name mismatch in their Qonto app SCA
// challenge before the transfer goes through).
async function verifyPayee(tenantId, { iban, beneficiaryName }) {
  const data = await api(tenantId, '/sepa/verify_payee', {
    method: 'POST',
    body: JSON.stringify({
      iban: iban.replace(/\s+/g, '').toUpperCase(),
      beneficiary_name: beneficiaryName,
    }),
  });
  // Qonto's /v2/sepa/verify_payee response shape isn't fully nailed
  // down in our notes (proof_token vs data.proof_token, string vs
  // object). Log the truncated raw body + the proof_token's type so
  // we can correlate any "must be a string" 400 back to the actual
  // Qonto response shape.
  try {
    console.log('[qonto.vop] verifyPayee full response (truncated):', JSON.stringify(data).slice(0, 200));
  } catch { /* circular or non-serializable, ignore */ }
  console.log('[qonto.vop] verifyPayee proof_token type:', typeof data?.proof_token);
  console.log('[qonto.vop] Verify payee result:', {
    iban_prefix: (iban || '').replace(/\s+/g, '').slice(0, 6) + '…',
    name: beneficiaryName,
    match_result: data?.match_result,
    has_proof_token: !!data?.proof_token,
  });
  return {
    proof_token: data?.proof_token || null,
    // MATCH_RESULT_MATCH / MATCH_RESULT_CLOSE_MATCH /
    // MATCH_RESULT_NO_MATCH / MATCH_RESULT_NOT_POSSIBLE.
    match_result: data?.match_result || null,
    matched_name: data?.matched_name || null,
  };
}

// Bulk-mode counterpart: one POST gets a single proof_token good for
// up to 23h that covers every (iban, name) tuple in `requests`. Used
// by the bulk pay path to avoid N round-trips when sending dozens of
// transfers at once.
async function skipVerifyPayee(tenantId, beneficiaries) {
  const data = await api(tenantId, '/sepa/skip_verify_payee', {
    method: 'POST',
    body: JSON.stringify({
      requests: beneficiaries.map(b => ({
        id: b.id,
        beneficiary_name: b.beneficiary_name,
        iban: (b.iban || '').replace(/\s+/g, '').toUpperCase(),
      })),
    }),
  });
  console.log('[qonto.vop] Skip verify payee result:', {
    count: beneficiaries.length,
    has_proof_token: !!data?.proof_token,
  });
  return { proof_token: data?.proof_token || null };
}

// Decode a 428 sca_required body + extract VOP proof token if present.
// Returns null when the response isn't actually an SCA challenge so the
// caller can rethrow. Some Qonto 428 responses ship the
// (already-created) transfer alongside the challenge — when that's the
// case we forward the transfer id so the caller can persist it and the
// polling worker can fetch its status without having to re-POST.
function parseScaChallenge(err) {
  if (!err || err.status !== 428) return null;
  try {
    const body = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
    if (body && body.code === 'sca_required' && body.sca_session_token) {
      if (!body.vop_proof_token) {
        // Old-API tenants don't ship a VOP token; the replay still
        // works without the VOP-Proof-Token header in that case.
        // Logged so we can correlate later 401 vop_proof_token_missing
        // errors back to the originating 428.
        logger.warn('qonto.parseScaChallenge 428 sca_required without vop_proof_token');
      }
      return {
        sca_session_token: body.sca_session_token,
        // Newer Qonto API versions require this token in the
        // VOP-Proof-Token header on the SCA replay POST.
        vop_proof_token: body.vop_proof_token || null,
        sca_recovery_token: body.sca_recovery_token || null,
        action_type: body.action_type || null,
        // Best-effort id extraction — Qonto's 428 shape isn't fully
        // documented and varies by endpoint.
        transfer_id: body.transfer?.id || body.id || body.resource_id || null,
        transfer: body.transfer || null,
      };
    }
  } catch (e) {
    logger.warn('qonto.parseScaChallenge failed to parse 428 body', { error: e.message });
  }
  return null;
}

// Build a 140-char Qonto note. RefBoost's accounting export reads
// this field; we embed the VAT breakdown here when the partner is
// subject so each transfer line shows HT / VAT / TTC. Falls back to
// the legacy `Commission partenaire — name — deal` shape when no
// VAT is applied. Note is hard-capped at 140 by Qonto, so we
// truncate the human-readable prefix first and always preserve the
// trailing breakdown intact.
function buildNote({ partnerName, dealName, taxRate, amountHt, amountTax, amountTtc }) {
  const NOTE_LIMIT = 140;
  const tail = (taxRate > 0 && amountTtc != null)
    ? ` | HT ${Number(amountHt).toFixed(2)} | TVA ${Number(taxRate)}% ${Number(amountTax).toFixed(2)} | TTC ${Number(amountTtc).toFixed(2)}`
    : '';
  const head = `Commission partenaire — ${partnerName || ''}${dealName ? ' — ' + dealName : ''}`;
  const headBudget = Math.max(0, NOTE_LIMIT - tail.length);
  return (head.length <= headBudget ? head : head.slice(0, headBudget)) + tail;
}

async function createSingleTransfer(tenantId, {
  commissionId,
  bankAccountId,
  amount,           // legacy single amount (back-compat). Ignored when amountTtc is set.
  // VAT breakdown — when present, amountTtc is the gross figure wired
  // to Qonto and amountHt/amountTax/taxRate hydrate the note for the
  // accounting export. When all three are absent, behaviour is
  // identical to the pre-VAT code (sends `amount` as the gross EUR).
  amountHt,
  amountTax,
  amountTtc,
  taxRate = 0,
  partnerName,
  dealName,
  iban,
  beneficiaryName,
  beneficiaryId, // optional, when we found a trusted match
  attachmentIds = [],
  idempotencyKey,
  scaSessionToken,
  vopProofToken, // optional — auto-fetched via verifyPayee when absent
}) {
  if (!bankAccountId) {
    // Defense-in-depth: the route already 400s on this case, but
    // throwing here keeps the service honest if a caller forgets.
    throw new Error('qonto_bank_account_missing');
  }

  // Step 1 — VoP. Required since October 2025; without a fresh
  // proof_token at the body root Qonto returns 401
  // vop_proof_token_missing. Callers that already hold a valid token
  // (e.g. SCA replay through createSingleTransfer) can pass it in.
  let proofToken = vopProofToken || null;
  if (!proofToken) {
    const vop = await verifyPayee(tenantId, { iban, beneficiaryName });
    proofToken = vop.proof_token;
  }
  // Defensive coercion. Qonto rejects requests with
  //   {"code":"not_a_string","detail":"vop_proof_token must be a string"}
  // when the body field isn't a plain string. If verifyPayee returned
  // a wrapper object (different API version / SDK quirk), unwrap it
  // before sending. Log the type either way so we can correlate any
  // 400 back to the actual shape we got.
  console.log('[qonto.transfer] vop_proof_token type:', typeof proofToken, 'value prefix:', String(proofToken).slice(0, 20));
  if (proofToken && typeof proofToken !== 'string') {
    logger.error('qonto.transfer vop_proof_token is not a string', { type: typeof proofToken, sample: JSON.stringify(proofToken).slice(0, 200) });
    if (typeof proofToken === 'object') {
      proofToken = proofToken.proof_token || proofToken.token || JSON.stringify(proofToken);
    } else {
      proofToken = String(proofToken);
    }
  }

  const reference = buildReference(commissionId);
  const note = buildNote({ partnerName, dealName, taxRate, amountHt, amountTax, amountTtc });
  // The amount actually wired: TTC when VAT is being applied,
  // otherwise the legacy `amount` arg. Both branches converge on a
  // single 2-decimal EUR string for Qonto's API.
  const grossAmount = (amountTtc != null) ? amountTtc : amount;

  // Qonto's POST /v2/sepa/transfers expects the source account under
  // `bank_account_id` (not `debit_bank_account_id`). Without it the
  // API responds with "bank_account_id is missing".
  const transfer = {
    bank_account_id: bankAccountId,
    reference,
    note,
    currency: 'EUR',
    amount: Number(grossAmount).toFixed(2),
  };
  if (beneficiaryId) {
    transfer.beneficiary_id = beneficiaryId;
  } else {
    // Inline beneficiary — Qonto will create an untrusted one and
    // require the admin to approve via SCA. The response carries
    // requires_sca so the caller can surface that.
    transfer.beneficiary = {
      iban: iban.replace(/\s+/g, '').toUpperCase(),
      name: beneficiaryName,
    };
  }
  if (attachmentIds.length) transfer.attachment_ids = attachmentIds;

  const key = idempotencyKey || newIdempotencyKey();
  const headers = { 'X-Qonto-Idempotency-Key': key };
  // When we already have an SCA session token (admin approved or we're
  // retrying after a prior 428), forward it so Qonto skips the
  // challenge and returns the actual transfer.
  if (scaSessionToken) headers['X-Qonto-Sca-Session-Token'] = scaSessionToken;

  // Capture the exact body we send so the caller can persist it for
  // a verbatim SCA replay later. Qonto's docs require the replay to
  // be byte-identical to the original — anything reconstructed from
  // current row state on retry could drift. Note: vop_proof_token
  // sits at the JSON ROOT, OUTSIDE the `transfer` object — that's
  // where Qonto looks for it.
  const requestBody = { vop_proof_token: proofToken, transfer };
  console.log('[qonto.transfer] Request body keys:', Object.keys(requestBody), '| vop_proof_token type:', typeof requestBody.vop_proof_token);

  let data;
  try {
    data = await api(tenantId, '/sepa/transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const sca = parseScaChallenge(err);
    if (sca) {
      // 428 sca_required is the EXPECTED branch when the beneficiary
      // isn't trusted yet — Qonto did NOT create the transfer, it
      // created an SCA challenge. The admin approves on their phone,
      // then we replay this exact body with the X-Qonto-Sca-Session-Token
      // header to actually create the transfer.
      return {
        transfer: sca.transfer || (sca.transfer_id ? { id: sca.transfer_id } : null),
        requires_sca: true,
        sca_session_token: sca.sca_session_token,
        vop_proof_token: sca.vop_proof_token,
        reference,
        idempotency_key: key,
        request_body: requestBody,
      };
    }
    throw err;
  }

  return {
    transfer: data?.transfer || data,
    requires_sca: !!(data?.transfer?.requires_sca || data?.requires_sca),
    reference,
    idempotency_key: key,
    request_body: requestBody,
  };
}

// Replay a previously-saved transfer body after the admin approves
// the SCA challenge on their Qonto mobile app. The replay must
// re-POST the original body byte-identically with the saved
// idempotency key + the X-Qonto-Sca-Session-Token header. On newer
// Qonto API versions, the VOP-Proof-Token header is also required
// (delivered alongside the SCA challenge in the initial 428).
//
// Returns:
//   { ok: true, transfer }                                 — Qonto accepted, transfer created
//   { ok: false, expired }                                 — 412, SCA token aged out (15 min)
//   { ok: false, not_found }                               — 422 (session lost / admin rejected)
//                                                            or 401 vop_proof_token_missing
//   { ok: false, sca_still_pending, sca_session_token,
//     vop_proof_token }                                    — still 428 (admin hasn't approved yet)
//   throws otherwise
async function replayTransfer(tenantId, { body, idempotencyKey, scaSessionToken, vopToken }) {
  // body + idempotencyKey are mandatory. scaSessionToken is optional —
  // /confirm-sca tolerates a null token (typical after a partial reset
  // by the reconcile worker on 412/422) and posts without the header
  // so Qonto either reuses the saved approval or returns a fresh 428.
  if (!body || !idempotencyKey) {
    throw new Error('replay_missing_args');
  }
  // Normalize to a JS object first, then stringify once. Tolerates
  // both column shapes:
  //   * JS object (JSONB → node-postgres parses on read)
  //   * pre-serialized JSON string (legacy callers / TEXT column)
  // Going through parse → stringify guarantees a canonical
  // serialization regardless of how the row was written, and avoids
  // the double-encoding hazard of stringifying a string.
  let requestBody;
  try {
    requestBody = typeof body === 'string' ? JSON.parse(body) : body;
  } catch (e) {
    throw new Error('replay_body_invalid_json');
  }
  if (!requestBody || typeof requestBody !== 'object') {
    throw new Error('replay_body_not_object');
  }
  const headers = {
    'Content-Type': 'application/json',
    'X-Qonto-Idempotency-Key': idempotencyKey,
  };
  if (scaSessionToken) {
    headers['X-Qonto-Sca-Session-Token'] = scaSessionToken;
  }
  // Newer Qonto API versions require the VOP (Verification of Payee)
  // proof token in this header on the replay; without it the replay
  // 401s with vop_proof_token_missing (handled below). The token is
  // delivered alongside the SCA challenge in the initial 428 response.
  if (vopToken) {
    headers['VOP-Proof-Token'] = vopToken;
    console.log('[qonto.replayTransfer] forwarding VOP-Proof-Token on replay');
  } else {
    logger.warn('qonto.replayTransfer no VOP-Proof-Token available — replay will likely 401');
  }
  try {
    const data = await api(tenantId, '/sepa/transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });
    return {
      ok: true,
      transfer: data?.transfer || data,
    };
  } catch (err) {
    // 412 Precondition Failed — SCA session aged out (15 min limit).
    if (err.status === 412) return { ok: false, expired: true };
    // 422 Unprocessable — Qonto either lost the SCA session or the
    // admin's approval got rejected on their phone ("un problème
    // est survenu"). Surface as not_found so the caller can reset
    // the row instead of crashing on the generic throw.
    if (err.status === 422) return { ok: false, not_found: true };
    // 401 vop_proof_token_missing — Qonto upgraded its API and now
    // requires the VOP-Proof-Token header on the replay, but we
    // didn't have one saved (typical for rows that hit 428 before
    // the VOP plumbing was deployed). Same recovery as 422: the
    // caller resets the row so the next Pay click captures a
    // fresh challenge and a fresh VOP token.
    if (err.status === 401) {
      let parsed = null;
      try {
        parsed = typeof err.body === 'string' ? JSON.parse(err.body) : err.body;
      } catch { /* not JSON, leave as null */ }
      const errors = parsed?.errors || [];
      if (errors.some(e => e?.code === 'vop_proof_token_missing')) {
        logger.warn('qonto.replayTransfer 401 vop_proof_token_missing — treating as not_found');
        return { ok: false, not_found: true };
      }
    }
    // 428 Precondition Required — admin hasn't approved on their
    // phone yet. Refresh the SCA + VOP tokens in case Qonto rotated.
    const sca = parseScaChallenge(err);
    if (sca) {
      return {
        ok: false,
        sca_still_pending: true,
        sca_session_token: sca.sca_session_token,
        vop_proof_token: sca.vop_proof_token,
      };
    }
    throw err;
  }
}

async function createBulkTransfer(tenantId, {
  bankAccountId,
  // Each transfer item now optionally carries a VAT breakdown:
  // [{ commissionId, amount, amountHt, amountTax, amountTtc, taxRate,
  //    iban, beneficiaryName, partnerName, dealName, attachmentIds }]
  // When amountTtc is set, it's the gross EUR wired to Qonto and the
  // note carries `| HT … | TVA …% … | TTC …`. When not, behaviour
  // matches the pre-VAT code (sends `amount`, no breakdown in note).
  transfers,
  idempotencyKey,
  scaSessionToken,
}) {
  if (!bankAccountId) {
    throw new Error('qonto_bank_account_missing');
  }
  // Qonto's POST /v2/sepa/bulk_transfers expects, at the JSON
  // ROOT, two keys:
  //   bank_account_id  → which Qonto account to debit (single)
  //   bulk_transfers   → array of transfer items (PLURAL, with `s`)
  // The API rejects any wrapper around them with the misleading
  // "bank_account_id is missing" / "bulk_transfers is missing"
  // messages whose JSON pointers ("/bank_account_id",
  // "/bulk_transfers") explicitly tell us they live at the root.
  const items = transfers.map(t => {
    const grossAmount = (t.amountTtc != null) ? t.amountTtc : t.amount;
    const item = {
      // Each line MUST carry a client_transfer_id (unique string we
      // generate) — Qonto's bulk response uses it to report which
      // lines succeeded/failed. Reuse the commission UUID since
      // it's already unique per row across the tenant; fall back to
      // a fresh uuid if the caller forgot.
      client_transfer_id: String(t.commissionId || newIdempotencyKey()),
      reference: buildReference(t.commissionId),
      note: buildNote({
        partnerName: t.partnerName,
        dealName: t.dealName,
        taxRate: t.taxRate || 0,
        amountHt: t.amountHt,
        amountTax: t.amountTax,
        amountTtc: t.amountTtc,
      }),
      currency: 'EUR',
      amount: Number(grossAmount).toFixed(2),
    };
    if (t.beneficiaryId) item.beneficiary_id = t.beneficiaryId;
    else item.beneficiary = { iban: t.iban.replace(/\s+/g, '').toUpperCase(), name: t.beneficiaryName };
    // attachment_ids intentionally omitted: stale ids from earlier
    // failed flows have been making the bulk endpoint 422 every line
    // with "Not found". Once the basic transfer flow is stable in
    // production we can wire fresh per-request uploads back in.
    return item;
  });

  const body = {
    bank_account_id: bankAccountId,
    bulk_transfers: items,
  };

  const key = idempotencyKey || newIdempotencyKey();
  const headers = { 'X-Qonto-Idempotency-Key': key };
  // Qonto's documented header is X-Qonto-Sca-Session-Token (title
  // case). HTTP makes header names case-insensitive in theory but
  // some intermediaries are picky — match the docs verbatim.
  if (scaSessionToken) headers['X-Qonto-Sca-Session-Token'] = scaSessionToken;

  console.log('[qonto.bulk] Request body:', JSON.stringify(body, null, 2));

  let data;
  try {
    data = await api(tenantId, '/sepa/bulk_transfers', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
  } catch (err) {
    const sca = parseScaChallenge(err);
    if (sca) {
      return {
        bulk_id: null,
        transfers: [],
        requires_sca: true,
        sca_session_token: sca.sca_session_token,
        idempotency_key: key,
      };
    }
    throw err;
  }
  // Qonto returns the list of created transfers (id + status). Map
  // them positionally back to the input commissions. The response
  // shape tracks the request shape, so try `bulk_transfers` first
  // and fall through to legacy alternatives.
  const created = data?.bulk_transfers
    || data?.transfers
    || data?.bulk_transfer?.transfers
    || [];
  return {
    bulk_id: data?.bulk_transfer?.id || data?.id || null,
    transfers: created,
    requires_sca: !!(data?.requires_sca || data?.bulk_transfer?.requires_sca),
    idempotency_key: key,
  };
}

async function getTransfer(tenantId, transferId) {
  const data = await api(tenantId, `/sepa/transfers/${transferId}`);
  return data?.transfer || data;
}

// Recent SEPA transfers — used as the fallback when a 428 didn't
// carry a transfer_id but Qonto did actually create the transfer
// behind the scenes. We then match by reference / amount client-
// side.
//
// IMPORTANT: don't pass any status filter. Earlier attempts with
// status[]=completed (which Qonto rejects) and even with the
// canonical { pending, processing, settled, declined, canceled }
// returned the empty list for SCA-pending transfers. The unfiltered
// call returns everything reliably; we filter post-fetch in the
// caller.
async function listRecentTransfers(tenantId, { perPage = 100 } = {}) {
  const data = await api(tenantId, `/sepa/transfers?per_page=${perPage}`);
  return data?.transfers || data || [];
}

module.exports = {
  authorizeUrl,
  exchangeCode,
  refreshAccessToken,
  getAccessToken,
  fetchOrganization,
  listBankAccounts,
  findBeneficiaryByIban,
  uploadAttachment,
  verifyPayee,
  skipVerifyPayee,
  createSingleTransfer,
  createBulkTransfer,
  replayTransfer,
  getTransfer,
  listRecentTransfers,
  buildReference,
  newIdempotencyKey,
  SCOPES,
};
