// ─── /api/payouts — paie groupée par partenaire (F2a) ───────────────
// Routes pour la cadence non-unitary (monthly/quarterly). Pour les
// tenants en cadence 'unitary' (= défaut F1), ces endpoints renvoient
// 400 cadence_unitary_no_batch_needed et le flux historique pay-qonto
// par commission reste la seule voie de paiement.
//
// 4 endpoints :
//   - POST /preview-batches       — admin, agrégation lecture-seule des
//                                   commissions à batcher pour la période
//                                   courante.
//   - POST /create-batches        — admin, crée 1 batch par partenaire
//                                   éligible, attache les commissions
//                                   via payout_batch_id, envoie l'email
//                                   payoutBatchInvoiceRequest.
//   - POST /batches/:id/upload-invoice — partenaire OU admin, upload de
//                                        la facture mensuelle/trim. unique.
//   - POST /batches/:id/pay-qonto — admin, déclenche le SEPA Qonto sur
//                                   le total TTC du batch.
//
// + worker exporté reconcileBatchTransfers — calque exact de
// reconcileQontoTransfers de routes/commissions.js pour les batches.
// Le tick server.js (cf. server.js zone Qonto polling) le chaine avec
// le tick commission existant : un seul cron, deux scans additifs.
//
// Propagation α (statut commission ↔ batch) — bornée par
// commissions_status_check_v3 :
//   - upload-invoice batch : batch.status awaiting_invoice → ready_to_pay.
//     Les commissions du batch RESTENT en 'awaiting_invoice' (le CHECK
//     v3 ne connaît pas 'ready_to_pay'). L'état métier "facture déposée"
//     est porté par le batch, pas par chaque commission.
//   - pay-qonto batch settled : batch.status ready_to_pay → paid +
//     UPDATE commissions SET status='paid' WHERE payout_batch_id=$1
//     (cette transition-là EST dans le CHECK v3 → propagation safe).

const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, partnerScope, tenantScope } = require('../middleware/auth');
const { sendEmail } = require('../services/emailService');
const notify = require('../services/notifyService');
const emailTemplates = require('../utils/emailTemplates');
const qonto = require('../services/qontoService');

const router = express.Router();

router.use(authenticate);
router.use(tenantScope);
router.use(partnerScope);

// ─── Local helpers (inlined to avoid cross-router coupling) ─────────
// Calques 1:1 des helpers privés de routes/commissions.js. Volontairement
// dupliqués ici plutôt qu'exportés depuis commissions.js — ce sont des
// utilitaires triviaux et la duplication tient sur ~50 lignes. Toute
// évolution du fmtMoney / sanitizePaymentError côté commissions devra
// être répercutée ici (note explicite : voir commissions.js helpers
// historiques pour la source de vérité).

async function partnerUsers(partnerId) {
  if (!partnerId) return [];
  const { rows } = await query(
    "SELECT id, email, full_name FROM users WHERE partner_id = $1 AND is_active = TRUE",
    [partnerId]
  );
  return rows;
}

const fmtMoney = (n) => {
  const num = parseFloat(n) || 0;
  try { return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(num); }
  catch { return num.toFixed(2) + ' €'; }
};

async function loadPaymentIntegration(tenantId) {
  const { rows } = await query(
    `SELECT bank_account_id, bank_account_iban, is_active
       FROM payment_integrations
      WHERE tenant_id = $1 AND provider = 'qonto'`,
    [tenantId]
  );
  return rows[0] || null;
}

function sanitizePaymentError(err) {
  if (!err) return null;
  const raw = err?.body || err?.message || String(err);
  let code = null;
  let message = null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed && typeof parsed === 'object') {
      code = parsed.code || null;
      message = parsed.message || null;
    }
  } catch {}
  if (!code && typeof raw === 'string') {
    const jsonStart = raw.indexOf('{');
    if (jsonStart >= 0) {
      try {
        const parsed = JSON.parse(raw.slice(jsonStart));
        code = parsed.code || null;
        message = parsed.message || message;
      } catch {}
    }
  }
  if (code === 'sca_required') return null;
  if (code) return code;
  const m = /failed \((\d+)\)/.exec(typeof raw === 'string' ? raw : '');
  if (m) return `qonto_http_${m[1]}`;
  return (message || err?.message || 'qonto_error').slice(0, 200);
}

// ─── Period helpers ─────────────────────────────────────────────────
// Convention F2a (cf. brief Charles) : la "période courante" = mois ou
// trimestre du serveur AU MOMENT du clic admin. Pas de fallback vers
// la période précédente — un admin qui oublie la paie de mai ne peut
// pas la "rattraper" en juin via ce flux, il devra créer un batch
// exception=true pour ce cas (chemin réservé à F2b/F3).

function currentPeriod(cadence, now = new Date()) {
  const y = now.getFullYear();
  if (cadence === 'monthly') {
    const m = String(now.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }
  if (cadence === 'quarterly') {
    const q = Math.floor(now.getMonth() / 3) + 1; // 0..11 → 1..4
    return `${y}-Q${q}`;
  }
  return null; // unitary or unknown — caller already guarded.
}

// Pretty label for email subjects / bodies. "2026-05" → "mai 2026",
// "2026-Q2" → "T2 2026". Falls back to the raw period token if it
// doesn't parse — better than a crash.
function periodLabel(period) {
  if (!period) return '';
  const mMonthly = /^(\d{4})-(\d{2})$/.exec(period);
  if (mMonthly) {
    const months = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];
    const mi = parseInt(mMonthly[2], 10) - 1;
    if (mi >= 0 && mi < 12) return `${months[mi]} ${mMonthly[1]}`;
  }
  const mQuarter = /^(\d{4})-Q([1-4])$/.exec(period);
  if (mQuarter) return `T${mQuarter[2]} ${mQuarter[1]}`;
  return period;
}

// ─── Eligible commissions selector ──────────────────────────────────
// Commissions éligibles à un batch = approuvées (approval_status='approved'),
// pas déjà attachées (payout_batch_id IS NULL), pas payées/annulées
// (status NOT IN ('paid','cancelled')), pas soft-deletées. Le filtre
// reflète exactement la sémantique "facture du partenaire à demander
// au total". Une commission rejetée ou en pending_approval n'a rien
// à faire dans un batch.

async function selectEligibleCommissions(tenantId) {
  const { rows } = await query(
    `SELECT c.id, c.partner_id, c.amount, c.amount_ht, c.amount_tax, c.amount_ttc,
            c.tax_rate_applied, c.status,
            p.name AS partner_name, p.email AS partner_email,
            r.prospect_name, r.prospect_company
       FROM commissions c
       JOIN partners p ON p.id = c.partner_id
       JOIN referrals r ON r.id = c.referral_id
      WHERE c.tenant_id = $1
        AND c.approval_status = 'approved'
        AND c.payout_batch_id IS NULL
        AND c.status NOT IN ('paid','cancelled')
        AND c.deleted_at IS NULL
        AND r.deleted_at IS NULL
      ORDER BY c.partner_id, c.created_at ASC`,
    [tenantId]
  );
  // Group rows by partner_id. Map → array keeps insertion order
  // (postgres ORDER BY partner_id ASC), so successive calls produce
  // deterministic batch creation order — nice for tests.
  const byPartner = new Map();
  for (const row of rows) {
    if (!byPartner.has(row.partner_id)) {
      byPartner.set(row.partner_id, {
        partner_id: row.partner_id,
        partner_name: row.partner_name,
        partner_email: row.partner_email,
        commissions: [],
        total_ht: 0,
        total_tax: 0,
        total_ttc: 0,
      });
    }
    const g = byPartner.get(row.partner_id);
    g.commissions.push(row);
    g.total_ht  += parseFloat(row.amount_ht  ?? row.amount) || 0;
    g.total_tax += parseFloat(row.amount_tax ?? 0)          || 0;
    g.total_ttc += parseFloat(row.amount_ttc ?? row.amount) || 0;
  }
  return Array.from(byPartner.values());
}

async function loadTenantCadence(tenantId) {
  const { rows } = await query(
    `SELECT COALESCE(payout_cadence, 'unitary') AS payout_cadence FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return rows[0]?.payout_cadence || 'unitary';
}

// ─── POST /preview-batches ─────────────────────────────────────────
// Lecture seule. Renvoie ce que /create-batches insèrerait, sans
// rien écrire. Utilisé par la modale admin "Lancer la paie groupée"
// pour confirmer avant le commit (F2b côté FE).
router.post('/preview-batches', authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const cadence = await loadTenantCadence(req.tenantId);
    if (cadence === 'unitary') {
      return res.status(400).json({ error: 'cadence_unitary_no_batch_needed' });
    }
    const period = currentPeriod(cadence);
    if (!period) return res.status(500).json({ error: 'invalid_cadence', cadence });

    const groups = await selectEligibleCommissions(req.tenantId);
    const batches = groups.map(g => ({
      partner_id: g.partner_id,
      partner_name: g.partner_name,
      partner_email: g.partner_email,
      commission_count: g.commissions.length,
      total_ht: Number(g.total_ht.toFixed(2)),
      total_tax: Number(g.total_tax.toFixed(2)),
      total_ttc: Number(g.total_ttc.toFixed(2)),
      commission_ids: g.commissions.map(c => c.id),
    }));
    res.json({ period, period_label: periodLabel(period), cadence, batches });
  } catch (err) {
    console.error('[payouts.preview-batches] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /create-batches ──────────────────────────────────────────
// Crée 1 ligne dans commission_payout_batches par partenaire éligible
// et attache les commissions concernées via payout_batch_id +
// status='awaiting_invoice'. Idempotent par index unique partiel
// commission_payout_batches_uidx — un second clic immédiat n'insère
// rien et renvoie skipped > 0.
router.post('/create-batches', authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    if (req.body?.confirm !== true) {
      return res.status(400).json({ error: 'confirmation_required' });
    }
    const cadence = await loadTenantCadence(req.tenantId);
    if (cadence === 'unitary') {
      return res.status(400).json({ error: 'cadence_unitary_no_batch_needed' });
    }
    const period = currentPeriod(cadence);
    if (!period) return res.status(500).json({ error: 'invalid_cadence', cadence });

    const groups = await selectEligibleCommissions(req.tenantId);
    if (groups.length === 0) {
      // Nothing to batch — admin clicked on an empty period. Return
      // 200 (not 400) so the FE renders an empty-state instead of an
      // error toast.
      return res.json({ period, period_label: periodLabel(period), cadence, created: 0, skipped: 0, batches: [] });
    }

    const created = [];
    const skipped = [];

    for (const g of groups) {
      try {
        // Each batch insert is its own atomic unit. We deliberately
        // don't wrap all of them in a single transaction — a
        // duplicate-key race on partner #3 shouldn't roll back
        // partners #1, #2, #4. The partial unique index handles the
        // double-click idempotence per partner.
        const { rows: [batch] } = await query(
          `INSERT INTO commission_payout_batches
             (tenant_id, partner_id, period, status,
              total_amount_ht, total_amount_tax, total_amount_ttc,
              exception, created_at, updated_at)
           VALUES ($1, $2, $3, 'awaiting_invoice', $4, $5, $6, FALSE, NOW(), NOW())
           RETURNING id, tenant_id, partner_id, period, status,
                     total_amount_ht, total_amount_tax, total_amount_ttc,
                     exception, created_at`,
          [req.tenantId, g.partner_id, period,
           Number(g.total_ht.toFixed(2)),
           Number(g.total_tax.toFixed(2)),
           Number(g.total_ttc.toFixed(2))]
        );

        const ids = g.commissions.map(c => c.id);
        // NB: la table `commissions` n'a pas de colonne updated_at
        // (cf. schéma historique v20+). Ne pas l'ajouter ici sans une
        // migration dédiée — laisser uniquement payout_batch_id +
        // status. Bug F2a-FIX (commit 08ae18f) : la version précédente
        // référençait updated_at et plantait silencieusement chaque
        // batch via le swallow trop large.
        await query(
          `UPDATE commissions
              SET payout_batch_id = $1, status = 'awaiting_invoice'
            WHERE id = ANY($2::uuid[])
              AND tenant_id = $3
              AND payout_batch_id IS NULL`,
          [batch.id, ids, req.tenantId]
        );

        created.push({
          id: batch.id,
          partner_id: batch.partner_id,
          partner_name: g.partner_name,
          partner_email: g.partner_email,
          period: batch.period,
          total_ttc: parseFloat(batch.total_amount_ttc),
          total_ht:  parseFloat(batch.total_amount_ht),
          total_tax: parseFloat(batch.total_amount_tax),
          commission_count: ids.length,
          commission_ids: ids,
          commissions: g.commissions,
        });
      } catch (err) {
        // Swallow STRICT pour les violations d'unique index seulement
        // (PostgreSQL 23505 = unique_violation, ici sur le partial
        // index commission_payout_batches_uidx (tenant, partner,
        // period) WHERE exception=false). C'est l'idempotence
        // double-clic attendue.
        if (err && err.code === '23505') {
          console.warn(`[payouts.create-batches] batch already exists for partner ${g.partner_id} period ${period} — skipped (idempotent)`);
          skipped.push({ partner_id: g.partner_id, reason: 'batch_already_exists' });
          continue;
        }
        // Toute autre erreur SQL (column does not exist, FK violation,
        // type mismatch, etc.) doit propager : sans ça, un bug de
        // schéma reste invisible sous une 200 avec skipped=N et le
        // front affiche un faux "0 batches créés" rassurant.
        // F2a-FIX rationale (commit 08ae18f) : la version précédente
        // swallowait `column "updated_at" of relation "commissions"
        // does not exist` en faux-positif skipped.
        console.error(`[payouts.create-batches] insert failed for partner ${g.partner_id}:`, err.message);
        throw err;
      }
    }

    // Fire-and-forget: send the invoice-request email + in-app notif
    // per partner, with the deal list. Decoupled from the response so
    // a slow SMTP / Resend never makes the admin's click feel laggy.
    (async () => {
      for (const b of created) {
        try {
          const users = await partnerUsers(b.partner_id);
          const dealsList = b.commissions.map(c => ({
            prospect_name: c.prospect_name,
            company:       c.prospect_company,
            amount_ttc:    parseFloat(c.amount_ttc ?? c.amount) || 0,
          }));
          for (const u of users) {
            notify.createNotification(u.id, 'commission_approved', {
              title: `Paie groupée à facturer — ${periodLabel(period)}`,
              message: `${b.commission_count} commissions · Total ${fmtMoney(b.total_ttc)} TTC. Merci de déposer votre facture.`,
              link: '/partner/payments',
              tenantId: req.tenantId,
            }).catch(() => {});
            if (u.email) {
              const tpl = emailTemplates.payoutBatchInvoiceRequest({
                partner_first_name: u.full_name,
                period_label: periodLabel(period),
                commission_count: b.commission_count,
                total_ht:  b.total_ht,
                total_tax: b.total_tax,
                total_ttc: b.total_ttc,
                deals_list: dealsList,
              });
              if (tpl) sendEmail(u.email, tpl.subject, tpl.html).catch(() => {});
            }
          }
        } catch (e) {
          console.warn('[payouts.create-batches] notify/email failed for batch', b.id, ':', e.message);
        }
      }
    })();

    res.json({
      period,
      period_label: periodLabel(period),
      cadence,
      created: created.length,
      skipped: skipped.length,
      batches: created.map(b => ({
        id: b.id,
        partner_id: b.partner_id,
        total_ttc: b.total_ttc,
        commission_count: b.commission_count,
      })),
      skipped_details: skipped,
    });
  } catch (err) {
    console.error('[payouts.create-batches] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /batches/:id/upload-invoice ──────────────────────────────
// Partenaire OU admin (le partenaire dépose côté espace Mes Paiements,
// l'admin peut faire un dépôt admin-side si le partenaire envoie la
// facture par email — réutilise le même endpoint). Cap 5 Mo brut
// (≈7 Mo base64), identique à commissions.js:751-753.
router.post('/batches/:id/upload-invoice', async (req, res) => {
  try {
    const { filename, data_url } = req.body || {};
    if (!data_url || typeof data_url !== 'string' || !data_url.startsWith('data:')) {
      return res.status(400).json({ error: 'Fichier requis (PDF)' });
    }
    if (data_url.length > 7_000_000) {
      return res.status(413).json({ error: 'Fichier trop volumineux (5 MB max)' });
    }

    // Scope check: admin sees by tenant, partner sees only its own
    // batches. Calque sur upload-invoice côté commission.
    let where = 'id = $1 AND deleted_at IS NULL';
    const params = [req.params.id];
    let i = 2;
    if (req.tenantId && !req.skipTenantFilter) {
      where += ` AND tenant_id = $${i++}`;
      params.push(req.tenantId);
    }
    if (req.partnerScope) {
      where += ` AND partner_id = $${i++}`;
      params.push(req.partnerScope);
    }

    const { rows: [batch] } = await query(
      `SELECT * FROM commission_payout_batches WHERE ${where}`,
      params
    );
    if (!batch) return res.status(404).json({ error: 'Batch introuvable' });
    if (batch.status !== 'awaiting_invoice') {
      return res.status(409).json({ error: 'batch_not_awaiting_invoice', status: batch.status });
    }
    // Symmetric with the commissions-side payment-in-flight guard.
    // A batch with an initiated-but-not-finalised transfer must not
    // be re-uploaded under — its qonto_request_body is keyed against
    // the current invoice_url.
    if (batch.qonto_transfer_id && !batch.payment_completed_at) {
      return res.status(409).json({ error: 'transfer_in_flight', qonto_transfer_id: batch.qonto_transfer_id });
    }

    const safeName = (filename && typeof filename === 'string' ? filename : 'invoice.pdf')
      .replace(/[^\w.\-]/g, '_').slice(0, 120);

    const { rows: [updated] } = await query(
      `UPDATE commission_payout_batches
          SET invoice_url = $2,
              invoice_filename = $3,
              invoice_uploaded_at = NOW(),
              status = 'ready_to_pay',
              updated_at = NOW()
        WHERE id = $1
        RETURNING id, status, invoice_uploaded_at`,
      [batch.id, data_url, safeName]
    );

    // Propagation α volontairement omise sur les commissions du batch :
    // 'ready_to_pay' n'est PAS dans commissions_status_check_v3, donc on
    // le maintient en awaiting_invoice côté commission. L'état métier
    // "facture déposée" est porté exclusivement par le batch. Si plus
    // tard on veut un sentinel sur la commission, ce sera via une
    // nouvelle colonne (batch_invoice_uploaded BOOLEAN) ou une migration
    // de CHECK v3→v4 — hors scope F2a.

    // Notif admin in-app + email (best-effort).
    (async () => {
      try {
        const { rows: [ctx] } = await query(
          `SELECT p.name AS partner_name
             FROM partners p WHERE p.id = $1`,
          [batch.partner_id]
        );
        notify.fanoutAdminNotification(batch.tenant_id, 'invoice_submitted', {
          title: `Facture de paie groupée reçue — ${ctx?.partner_name || ''}`,
          message: `${periodLabel(batch.period)} · Total ${fmtMoney(batch.total_amount_ttc)} TTC : facture à régler.`,
          link: '/commissions',
        }).catch(() => {});
      } catch (e) {
        console.warn('[payouts.upload-invoice] notify failed:', e.message);
      }
    })();

    res.json({ batch: updated });
  } catch (err) {
    console.error('[payouts.upload-invoice] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /batches/:id/pay-qonto ───────────────────────────────────
// Admin déclenche un virement SEPA unique pour le total TTC du batch.
// Calque conceptuel de commissions.js:1015-1181 (pay-qonto unitaire),
// mais sans la décomposition VAT par commission — le total batch est
// déjà la somme TTC pré-calculée à la création.
router.post('/batches/:id/pay-qonto', authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });

    const integ = await loadPaymentIntegration(req.tenantId);
    if (!integ || !integ.is_active) return res.status(400).json({ error: 'qonto_not_connected' });
    if (!integ.bank_account_id) return res.status(400).json({ error: 'qonto_bank_account_missing' });

    const { rows: [batch] } = await query(
      `SELECT b.*,
              p.name AS partner_name, p.iban, p.account_holder,
              p.tax_subject, p.tax_rate
         FROM commission_payout_batches b
         JOIN partners p ON p.id = b.partner_id
        WHERE b.id = $1 AND b.tenant_id = $2 AND b.deleted_at IS NULL`,
      [req.params.id, req.tenantId]
    );
    if (!batch) return res.status(404).json({ error: 'Batch introuvable' });
    if (batch.status !== 'ready_to_pay') {
      return res.status(409).json({ error: 'batch_not_ready_to_pay', status: batch.status });
    }
    if (batch.qonto_sca_session_token) {
      return res.status(409).json({
        error: 'sca_pending',
        message: 'Validez la SCA dans Qonto puis cliquez sur "J\'ai déjà approuvé".',
      });
    }
    // Mirror du garde-fou paiement-en-vol côté commission.
    if (batch.qonto_transfer_id && !batch.payment_completed_at) {
      return res.status(409).json({
        error: 'transfer_already_initiated',
        transfer_id: batch.qonto_transfer_id,
      });
    }
    if (!batch.iban) return res.status(400).json({ error: 'partner_iban_missing' });
    const amountTtc = parseFloat(batch.total_amount_ttc) || 0;
    if (amountTtc <= 0) return res.status(400).json({ error: 'amount_zero' });

    // Idempotency key strategy identique à commissions.js:1099-1105 :
    // réutiliser le token déjà persisté pour qu'un retry réseau retombe
    // sur le même transfert Qonto au lieu d'en créer un second.
    let idempotencyKey = batch.qonto_idempotency_key || null;
    if (!idempotencyKey) {
      idempotencyKey = qonto.newIdempotencyKey();
      await query(
        'UPDATE commission_payout_batches SET qonto_idempotency_key = $1, updated_at = NOW() WHERE id = $2',
        [idempotencyKey, batch.id]
      );
    }

    const beneficiary = await qonto.findBeneficiaryByIban(req.tenantId, batch.iban).catch(() => null);
    const dealLabel = `Commissions ${periodLabel(batch.period)} (${batch.period})`;

    const result = await qonto.createSingleTransfer(req.tenantId, {
      // Le service utilise commissionId pour client_transfer_id +
      // buildReference + buildNote. On lui passe le batch.id : le
      // reconcile worker batches s'appuie sur qonto_transfer_id pour
      // matcher en retour, le buildReference par-batch.id reste unique.
      commissionId: batch.id,
      bankAccountId: integ.bank_account_id,
      amount: amountTtc,
      amountHt:  parseFloat(batch.total_amount_ht)  || 0,
      amountTax: parseFloat(batch.total_amount_tax) || 0,
      amountTtc: amountTtc,
      taxRate:   batch.tax_subject ? (Number(batch.tax_rate) || 0) : 0,
      partnerName: batch.partner_name,
      dealName: dealLabel,
      iban: batch.iban,
      beneficiaryName: batch.account_holder || batch.partner_name,
      beneficiaryId: beneficiary?.id || null,
      attachmentIds: [], // batch invoice upload is in-DB; Qonto attachment is best-effort/out of F2a.
      idempotencyKey,
      scaSessionToken: batch.qonto_sca_session_token || undefined,
    });

    const transfer = result.transfer || {};

    await query(
      `UPDATE commission_payout_batches
          SET qonto_transfer_id = $2,
              qonto_sca_session_token = $3,
              qonto_request_body = $4,
              payment_initiated_at = NOW(),
              payment_reference = $5,
              payment_error = NULL,
              updated_at = NOW()
        WHERE id = $1`,
      [
        batch.id,
        transfer.id || null,
        result.requires_sca ? (result.sca_session_token || null) : null,
        result.requires_sca ? JSON.stringify(result.request_body) : null,
        result.reference,
      ]
    );

    res.status(202).json({
      ok: true,
      batch_id: batch.id,
      transfer_id: transfer.id || null,
      reference: result.reference,
      status: transfer.status || (result.requires_sca ? 'sca_pending' : 'pending'),
      requires_sca: !!result.requires_sca,
    });
  } catch (err) {
    console.error('[payouts.pay-qonto] error:', err);
    const sanitized = sanitizePaymentError(err);
    try {
      await query(
        'UPDATE commission_payout_batches SET payment_error = $2, updated_at = NOW() WHERE id = $1 AND tenant_id = $3',
        [req.params.id, sanitized, req.tenantId || null]
      );
    } catch {}
    res.status(500).json({ error: sanitized || err.message || 'Erreur serveur' });
  }
});

// ─── reconcileBatchTransfers — worker exporté ───────────────────────
// Calque exact de reconcileQontoTransfers (commissions.js:1378-1788)
// adapté au shape commission_payout_batches. Chaîné depuis le tick
// Qonto existant côté server.js : un seul intervalle, deux scans
// additifs. Sur 'settled' : batch.status='paid' + propagation α aux
// commissions du batch (status='paid', paid_at, payment_completed_at —
// transitions toutes dans le CHECK v3). Sur 'declined/canceled/failed' :
// batch.status retombe à 'ready_to_pay', qonto_transfer_id reset, le
// bouton Payer revient côté FE.
async function reconcileBatchTransfers(tenantId) {
  const { rows } = await query(
    `SELECT b.id, b.qonto_transfer_id, b.total_amount_ttc, b.payment_reference,
            b.tenant_id, b.partner_id, b.period,
            p.email AS partner_email, p.name AS partner_name, p.iban,
            t.name AS tenant_name
       FROM commission_payout_batches b
       JOIN partners p ON p.id = b.partner_id
       JOIN tenants t  ON t.id = b.tenant_id
      WHERE b.qonto_transfer_id IS NOT NULL
        AND b.payment_completed_at IS NULL
        AND b.deleted_at IS NULL
        AND ($1::uuid IS NULL OR b.tenant_id = $1)
      LIMIT 200`,
    [tenantId || null]
  );

  const updates = [];
  for (const b of rows) {
    try {
      const t = await qonto.getTransfer(b.tenant_id, b.qonto_transfer_id);
      const status = t?.status;
      if (status === 'settled' || status === 'completed') {
        // 1. Promote the batch.
        await query(
          `UPDATE commission_payout_batches
              SET status = 'paid',
                  paid_at = COALESCE(paid_at, NOW()),
                  payment_completed_at = NOW(),
                  payment_error = NULL,
                  updated_at = NOW()
            WHERE id = $1`,
          [b.id]
        );
        // 2. Propagation α — commissions du batch passent à 'paid'
        //    en lockstep. Transition autorisée par CHECK v3.
        //    NB: pas de SET updated_at (la table commissions n'a pas
        //    cette colonne — cf. fix F2a, commit 08ae18f).
        await query(
          `UPDATE commissions
              SET status = 'paid',
                  paid_at = COALESCE(paid_at, NOW()),
                  payment_completed_at = NOW(),
                  payment_error = NULL
            WHERE payout_batch_id = $1
              AND status <> 'paid'
              AND deleted_at IS NULL`,
          [b.id]
        );
        // 3. In-app + email partner. Best-effort.
        try {
          const ibanLast4 = (b.iban || '').replace(/\s+/g, '').slice(-4);
          const dateLabel = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
          const tpl = emailTemplates.commissionPaymentSent && emailTemplates.commissionPaymentSent({
            partnerName: b.partner_name,
            amount: parseFloat(b.total_amount_ttc) || 0,
            amountTtc: parseFloat(b.total_amount_ttc) || 0,
            currency: '€',
            tenantName: b.tenant_name,
            dealName: `Commissions ${periodLabel(b.period)}`,
            transferReference: b.payment_reference,
            transferDateLabel: dateLabel,
            ibanLast4,
          });
          if (b.partner_email && tpl) {
            await sendEmail(b.partner_email, tpl.subject, tpl.html);
          }
          const partners = await partnerUsers(b.partner_id);
          for (const u of partners) {
            notify.createNotification(u.id, 'payment_completed', {
              title: `Paie groupée versée — ${fmtMoney(b.total_amount_ttc)}`,
              message: `${periodLabel(b.period)} · réf. ${b.payment_reference || '—'}.`,
              link: '/partner/payments',
              tenantId: b.tenant_id,
            }).catch(() => {});
          }
          notify.fanoutAdminNotification(b.tenant_id, 'payment_completed', {
            title: `Virement de paie groupée confirmé — ${b.partner_name}`,
            message: `${fmtMoney(b.total_amount_ttc)} · ${periodLabel(b.period)}`,
            link: '/commissions',
          }).catch(() => {});
        } catch (e) {
          console.warn('[payouts.reconcile] email failed for batch', b.id, ':', e.message);
        }
        updates.push({ batch_id: b.id, transfer_id: b.qonto_transfer_id, status: 'paid' });
      } else if (status === 'declined' || status === 'canceled' || status === 'cancelled' || status === 'failed') {
        const reason = t?.declined_reason || t?.error_message || t?.failure_reason || `Qonto status: ${status}`;
        await query(
          `UPDATE commission_payout_batches
              SET payment_error = $2,
                  qonto_transfer_id = NULL,
                  payment_initiated_at = NULL,
                  status = 'ready_to_pay',
                  updated_at = NOW()
            WHERE id = $1`,
          [b.id, String(reason).slice(0, 500)]
        );
        try {
          notify.fanoutAdminNotification(b.tenant_id, 'payment_failed', {
            title: `⚠️ Virement de paie groupée échoué — ${b.partner_name}`,
            message: `${fmtMoney(b.total_amount_ttc)} : ${String(reason).slice(0, 120)}`,
            link: '/commissions',
          }).catch(() => {});
        } catch (e) {
          console.warn('[payouts.reconcile] failure-notify failed for batch', b.id, ':', e.message);
        }
        updates.push({ batch_id: b.id, transfer_id: b.qonto_transfer_id, status, reason });
      } else {
        updates.push({ batch_id: b.id, transfer_id: b.qonto_transfer_id, status: status || 'unknown' });
      }
    } catch (e) {
      console.warn('[payouts.reconcile] fetch failed for batch', b.id, ':', e.message);
    }
  }
  return updates;
}

module.exports = router;
module.exports.reconcileBatchTransfers = reconcileBatchTransfers;
