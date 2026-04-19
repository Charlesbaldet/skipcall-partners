const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;
const { sendEmail, billingSubscriptionCancelingTpl } = require('../services/emailService');

const router = express.Router();

async function tenantAdminEmails(tenantId) {
  if (!tenantId) return [];
  const { rows } = await query(
    "SELECT email, full_name FROM users WHERE tenant_id = $1 AND role = 'admin' AND is_active = TRUE",
    [tenantId]
  );
  return rows;
}

// ─── Plan catalog ───────────────────────────────────────────────────
// Partner limits: -1 = unlimited. Keep in sync with landing + signup.
// Each paid plan has a monthly price id (hard-coded, lives in Stripe)
// and an annual price id (env-overridable placeholder — set via
// STRIPE_PRICE_PRO_ANNUAL / STRIPE_PRICE_BUSINESS_ANNUAL when the real
// annual prices are created in the Stripe dashboard).
const PRICE_PRO_MONTHLY = 'price_1TNptZLG65VWFQyt9Dj7QNqt';
const PRICE_BUSINESS_MONTHLY = 'price_1TNptZLG65VWFQytkMfbve38';
const PRICE_PRO_ANNUAL = process.env.STRIPE_PRICE_PRO_ANNUAL || 'STRIPE_PRICE_PRO_ANNUAL';
const PRICE_BUSINESS_ANNUAL = process.env.STRIPE_PRICE_BUSINESS_ANNUAL || 'STRIPE_PRICE_BUSINESS_ANNUAL';

const PLANS = {
  starter: {
    name: 'Starter', priceMonthly: 0, priceAnnual: 0, partnerLimit: 3,
    priceIds: [],
  },
  pro: {
    name: 'Pro', priceMonthly: 29, priceAnnual: 278, partnerLimit: 25,
    priceIds: [PRICE_PRO_MONTHLY, PRICE_PRO_ANNUAL],
  },
  business: {
    name: 'Business', priceMonthly: 79, priceAnnual: 758, partnerLimit: -1,
    priceIds: [PRICE_BUSINESS_MONTHLY, PRICE_BUSINESS_ANNUAL],
  },
};

function planKeyFromPriceId(priceId) {
  for (const [k, v] of Object.entries(PLANS)) {
    if (v.priceIds && v.priceIds.includes(priceId)) return k;
  }
  return null;
}

async function countActivePartners(tenantId) {
  const { rows } = await query(
    'SELECT COUNT(*)::int AS n FROM partners WHERE is_active = TRUE AND tenant_id = $1',
    [tenantId]
  );
  return rows[0]?.n || 0;
}

async function loadTenantPlan(tenantId) {
  const { rows } = await query(
    `SELECT id, name, plan, plan_partner_limit, stripe_customer_id,
            stripe_subscription_id, plan_started_at, plan_ends_at,
            payment_status
       FROM tenants WHERE id = $1`,
    [tenantId]
  );
  return rows[0] || null;
}

// ─── GET /api/billing/plan ───────────────────────────────────────────
router.get('/plan', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });
    const partnerCount = await countActivePartners(req.tenantId);

    // Fetch the Stripe subscription live so we can surface
    // cancel_at_period_end + an authoritative period-end date to the UI
    // without waiting on a webhook. Failure is non-fatal — we fall back
    // to the DB column.
    let cancelAtPeriodEnd = false;
    let cancelAt = null;
    let livePeriodEndIso = null;
    if (stripe && tenant.stripe_subscription_id) {
      try {
        const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
        cancelAtPeriodEnd = sub.cancel_at_period_end === true;
        cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000).toISOString()
                  : (sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null);
        if (sub.current_period_end) {
          livePeriodEndIso = new Date(sub.current_period_end * 1000).toISOString();
        }
        // Opportunistically back-fill the DB column when Stripe is the
        // only place that knows the real end date (webhooks may never
        // have landed for this tenant).
        if (livePeriodEndIso && !tenant.plan_ends_at) {
          try {
            await query('UPDATE tenants SET plan_ends_at = $1 WHERE id = $2', [livePeriodEndIso, req.tenantId]);
          } catch { /* non-fatal */ }
        }
      } catch (e) { /* sub may be gone — leave everything null */ }
    }

    // Prefer the live value so the UI always has a date to show (the DB
    // column may be NULL for tenants whose webhook was never wired).
    const planEndsAt = livePeriodEndIso || tenant.plan_ends_at || null;

    res.json({
      plan: tenant.plan || 'starter',
      partnerLimit: tenant.plan_partner_limit ?? 3,
      partnerCount,
      stripeCustomerId: tenant.stripe_customer_id || null,
      subscriptionId: tenant.stripe_subscription_id || null,
      planStartedAt: tenant.plan_started_at,
      planEndsAt,
      paymentStatus: tenant.payment_status || 'active',
      cancelAtPeriodEnd,
      cancelAt,
    });
  } catch (err) {
    console.error('[billing.plan] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/billing/checkout ──────────────────────────────────────
// Dual-purpose:
//   * First-time subscribe (no existing Stripe subscription) →
//     create a Checkout Session, return { url }
//   * Plan change (existing active subscription) →
//     update the sub items in place with prorations, return
//     { updated: true, plan, subscriptionId } — NO new Checkout.
//
// This avoids stacking subscriptions when an admin clicks "Upgrade"
// while already on Pro: Stripe's subscriptions.update handles
// pro-rata charges and refunds for us in a single round-trip.
router.post('/checkout', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const { priceId } = req.body || {};
    if (!priceId) return res.status(400).json({ error: 'priceId requis' });

    const planKey = planKeyFromPriceId(priceId);
    if (!planKey) return res.status(400).json({ error: 'Plan inconnu' });
    const plan = PLANS[planKey];

    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });

    // Ensure the tenant has a Stripe customer — persist the id BEFORE
    // we do anything else so the webhook/sync can reconcile even if
    // this request fails mid-flight.
    let customerId = tenant.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        name: tenant.name,
        metadata: { tenantId: req.tenantId, userId: req.user.id },
      });
      customerId = customer.id;
      await query('UPDATE tenants SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.tenantId]);
    }

    // Plan-change path: we already have a live subscription, so swap
    // its item price rather than minting a new sub.
    let existingSub = null;
    if (tenant.stripe_subscription_id) {
      try {
        existingSub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
      } catch (e) { /* sub may have been deleted on Stripe side — fall back to Checkout */ }
    }
    const isLive = existingSub && !['canceled', 'incomplete_expired'].includes(existingSub.status);

    if (isLive) {
      const currentPriceId = existingSub.items?.data?.[0]?.price?.id;
      if (currentPriceId === priceId) {
        return res.json({ updated: false, noop: true, plan: planKey });
      }
      const itemId = existingSub.items.data[0].id;
      const updated = await stripe.subscriptions.update(existingSub.id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: 'create_prorations',
        metadata: { tenantId: req.tenantId, plan: planKey },
      });
      // Write the new plan back eagerly so the UI reflects it without
      // waiting for a webhook round-trip.
      await query(
        `UPDATE tenants SET
           plan = $1,
           plan_partner_limit = $2,
           stripe_subscription_id = $3,
           plan_started_at = COALESCE(plan_started_at, $4),
           plan_ends_at = $5
         WHERE id = $6`,
        [
          planKey,
          plan.partnerLimit,
          updated.id,
          updated.current_period_start ? new Date(updated.current_period_start * 1000) : null,
          updated.current_period_end ? new Date(updated.current_period_end * 1000) : null,
          req.tenantId,
        ]
      );
      return res.json({
        updated: true,
        plan: planKey,
        subscriptionId: updated.id,
      });
    }

    // First-time subscribe → Stripe Checkout.
    const frontend = process.env.FRONTEND_URL || 'https://refboost.io';
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: frontend + '/billing?success=1',
      cancel_url: frontend + '/billing?canceled=1',
      allow_promotion_codes: true,
      metadata: { tenantId: req.tenantId, plan: planKey },
      subscription_data: {
        metadata: { tenantId: req.tenantId, plan: planKey },
      },
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('[billing.checkout] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── GET /api/billing/preview-change ─────────────────────────────────
// Returns a pro-rata preview of swapping the active subscription to a
// different price. The UI uses this to show "Amount due today: X€" +
// next billing date BEFORE actually upgrading. If the tenant has no
// live subscription, we return a minimal payload so the UI can still
// show the new plan's monthly total.
router.get('/preview-change', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const priceId = req.query.priceId;
    if (!priceId) return res.status(400).json({ error: 'priceId requis' });
    const planKey = planKeyFromPriceId(priceId);
    if (!planKey) return res.status(400).json({ error: 'Plan inconnu' });

    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });

    const newPrice = await stripe.prices.retrieve(priceId);
    const newPlanLabel = PLANS[planKey]?.name || planKey;
    const currentPlanLabel = PLANS[tenant.plan]?.name || tenant.plan || 'starter';

    if (!tenant.stripe_subscription_id) {
      return res.json({
        hasActiveSub: false,
        currentPlan: { key: tenant.plan || 'starter', label: currentPlanLabel },
        newPlan: { key: planKey, label: newPlanLabel, amount: (newPrice.unit_amount || 0) / 100, currency: newPrice.currency },
        credit: 0,
        amountDue: (newPrice.unit_amount || 0) / 100,
        nextBillingDate: null,
      });
    }

    const sub = await stripe.subscriptions.retrieve(tenant.stripe_subscription_id);
    const itemId = sub.items.data[0].id;

    let invoice;
    try {
      invoice = await stripe.invoices.retrieveUpcoming({
        customer: tenant.stripe_customer_id,
        subscription: tenant.stripe_subscription_id,
        subscription_items: [{ id: itemId, price: priceId }],
        subscription_proration_behavior: 'create_prorations',
      });
    } catch (e) {
      // Newer Stripe API versions moved this to invoices.createPreview.
      try {
        invoice = await stripe.invoices.createPreview({
          customer: tenant.stripe_customer_id,
          subscription: tenant.stripe_subscription_id,
          subscription_details: {
            items: [{ id: itemId, price: priceId }],
            proration_behavior: 'create_prorations',
          },
        });
      } catch (e2) {
        // Both preview methods unavailable (SDK version mismatch, API
        // restriction, etc.) — return a DEGRADED preview instead of
        // 500'ing. The UI still opens the confirm modal so the user can
        // proceed; Stripe will compute the real proration on
        // subscriptions.update anyway.
        console.warn('[billing.preview-change] invoice preview unavailable, returning degraded payload:', e2.message);
        return res.json({
          hasActiveSub: true,
          preview_unavailable: true,
          currentPlan: { key: tenant.plan || 'starter', label: currentPlanLabel },
          newPlan: { key: planKey, label: newPlanLabel, amount: (newPrice.unit_amount || 0) / 100, currency: newPrice.currency },
          credit: 0,
          amountDue: (newPrice.unit_amount || 0) / 100,
          currency: newPrice.currency,
          nextBillingDate: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
        });
      }
    }

    // Sum prorations (negative = credit from unused time on the old
    // plan, positive = charge for remaining days on the new one) so
    // the UI can show the separate credit line even when Stripe
    // bundles them into one net total.
    const prorationLines = (invoice.lines?.data || []).filter(l => l.proration);
    let creditCents = 0;
    for (const line of prorationLines) {
      if (line.amount < 0) creditCents += line.amount; // keeps the negative sign
    }
    const amountDueCents = invoice.amount_due ?? invoice.total ?? 0;
    const currency = invoice.currency || newPrice.currency;

    res.json({
      hasActiveSub: true,
      preview_unavailable: false,
      currentPlan: { key: tenant.plan || 'starter', label: currentPlanLabel },
      newPlan: { key: planKey, label: newPlanLabel, amount: (newPrice.unit_amount || 0) / 100, currency },
      credit: creditCents / 100,
      amountDue: amountDueCents / 100,
      currency,
      nextBillingDate: invoice.next_payment_attempt
        ? new Date(invoice.next_payment_attempt * 1000).toISOString()
        : (sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null),
    });
  } catch (err) {
    console.error('[billing.preview-change] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── GET /api/billing/cleanup ────────────────────────────────────────
// Admin-triggered: find any duplicate ACTIVE subscriptions for this
// tenant's Stripe customer and cancel all but the most recent. Used
// to clean up the mess from the old POST /checkout that created a
// fresh sub on every upgrade click.
router.get('/cleanup', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant || !tenant.stripe_customer_id) {
      return res.json({ canceled: [], kept: null, reason: 'no_customer' });
    }

    const list = await stripe.subscriptions.list({
      customer: tenant.stripe_customer_id,
      status: 'all',
      limit: 25,
    });
    const live = (list.data || []).filter(s => ['active', 'trialing', 'past_due', 'unpaid'].includes(s.status));
    if (live.length <= 1) {
      return res.json({ canceled: [], kept: live[0]?.id || null, reason: 'nothing_to_clean' });
    }
    // Keep the newest, cancel the rest immediately.
    live.sort((a, b) => (b.created || 0) - (a.created || 0));
    const keep = live[0];
    const toCancel = live.slice(1);
    const canceled = [];
    for (const sub of toCancel) {
      try {
        await stripe.subscriptions.cancel(sub.id);
        canceled.push(sub.id);
      } catch (e) {
        console.error('[billing.cleanup] cancel failed:', sub.id, e.message);
      }
    }
    // Re-pin the tenant to the kept subscription.
    const priceId = keep.items?.data?.[0]?.price?.id;
    const planKey = keep.metadata?.plan || planKeyFromPriceId(priceId) || tenant.plan || 'starter';
    const plan = PLANS[planKey] || PLANS.starter;
    await query(
      `UPDATE tenants SET
         plan = $1,
         plan_partner_limit = $2,
         stripe_subscription_id = $3,
         plan_ends_at = $4
       WHERE id = $5`,
      [
        planKey,
        plan.partnerLimit,
        keep.id,
        keep.current_period_end ? new Date(keep.current_period_end * 1000) : null,
        req.tenantId,
      ]
    );
    res.json({ canceled, kept: keep.id, plan: planKey });
  } catch (err) {
    console.error('[billing.cleanup] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── POST /api/billing/portal ────────────────────────────────────────
// Opens the Stripe Customer Portal so the user can swap plans, update
// payment methods, and download invoices without leaving Stripe's UI.
router.post('/portal', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant || !tenant.stripe_customer_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }
    const frontend = process.env.FRONTEND_URL || 'https://refboost.io';
    // flow_data: payment_method_update takes the user straight into the
    // "Update payment method" flow in Stripe's portal — skipping the
    // subscription management screen. If the portal configuration
    // doesn't allow the flow (older account, disabled feature), we
    // fall back to the default portal.
    let portal;
    try {
      portal = await stripe.billingPortal.sessions.create({
        customer: tenant.stripe_customer_id,
        return_url: frontend + '/billing',
        flow_data: { type: 'payment_method_update' },
      });
    } catch (e) {
      console.warn('[billing.portal] payment_method_update flow unavailable, falling back:', e.message);
      portal = await stripe.billingPortal.sessions.create({
        customer: tenant.stripe_customer_id,
        return_url: frontend + '/billing',
      });
    }
    res.json({ url: portal.url });
  } catch (err) {
    console.error('[billing.portal] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── POST /api/billing/cancel ────────────────────────────────────────
// Cancels the subscription at period end so the user keeps access until
// their renewal date.
router.post('/cancel', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant || !tenant.stripe_subscription_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }
    const sub = await stripe.subscriptions.update(tenant.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    // Persist the period end on the tenant so the UI (and any
    // webhook-less fetch paths) can show the cancellation date
    // consistently even before the customer.subscription.updated
    // webhook lands.
    if (sub.current_period_end) {
      try {
        await query(
          'UPDATE tenants SET plan_ends_at = $1 WHERE id = $2',
          [new Date(sub.current_period_end * 1000), req.tenantId]
        );
      } catch { /* non-fatal */ }
    }

    // Fire-and-forget "sorry to see you go" email. Failure must not
    // block the response — a swallowed email is strictly better than
    // a 500 on cancel, which would leave Stripe + DB out of sync with
    // the user's perception.
    try {
      const endDateStr = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
        : '';
      const planLabel = (PLANS[tenant.plan]?.name) || (tenant.plan || 'Pro');
      const admins = await tenantAdminEmails(req.tenantId);
      for (const a of admins) {
        const tpl = billingSubscriptionCancelingTpl(a.full_name, planLabel, endDateStr, tenant.name);
        sendEmail(a.email, tpl.subject, tpl.html).catch(() => {});
      }
    } catch (e) { console.error('[billing.cancel email]', e.message); }

    res.json({ ok: true, cancelAt: sub.cancel_at, cancelAtPeriodEnd: sub.cancel_at_period_end === true });
  } catch (err) {
    console.error('[billing.cancel] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── POST /api/billing/reactivate ────────────────────────────────────
// Undo a scheduled cancellation. Safe to call when cancel_at_period_end
// is already false — Stripe just acks with the same sub.
router.post('/reactivate', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant || !tenant.stripe_subscription_id) {
      return res.status(400).json({ error: 'Aucun abonnement actif' });
    }
    const sub = await stripe.subscriptions.update(tenant.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    res.json({ ok: true, cancelAtPeriodEnd: sub.cancel_at_period_end === true });
  } catch (err) {
    console.error('[billing.reactivate] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── GET /api/billing/sync ───────────────────────────────────────────
// Webhook-less plan sync. Called by the frontend right after the user
// returns from Stripe Checkout (…/billing?success=1). Looks up the
// tenant's Stripe customer, finds the most recent subscription, maps
// the price id to a plan key, and writes the result back to the
// tenants row — so the UI reflects reality even when no webhook has
// arrived yet (local dev, or before STRIPE_WEBHOOK_SECRET is wired).
router.get('/sync', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });
    if (!tenant.stripe_customer_id) {
      // Nothing to sync — no customer was ever created.
      return res.json({ synced: false, reason: 'no_customer' });
    }

    // Prefer active/trialing; fall back to most recent if nothing active.
    const subs = await stripe.subscriptions.list({
      customer: tenant.stripe_customer_id,
      status: 'all',
      limit: 5,
    });
    const priorityOrder = ['active', 'trialing', 'past_due', 'unpaid'];
    const ranked = [...(subs.data || [])].sort((a, b) => {
      const ai = priorityOrder.indexOf(a.status);
      const bi = priorityOrder.indexOf(b.status);
      const aa = ai === -1 ? 99 : ai;
      const bb = bi === -1 ? 99 : bi;
      if (aa !== bb) return aa - bb;
      return (b.created || 0) - (a.created || 0);
    });
    const sub = ranked[0];

    if (!sub || ['canceled', 'incomplete_expired'].includes(sub.status)) {
      // No live subscription — make sure the tenant is on starter.
      await query(
        `UPDATE tenants SET
           plan = 'starter',
           plan_partner_limit = $1,
           stripe_subscription_id = NULL,
           plan_ends_at = NULL,
           payment_status = 'active'
         WHERE id = $2`,
        [PLANS.starter.partnerLimit, req.tenantId]
      );
      return res.json({ synced: true, plan: 'starter' });
    }

    const priceId = sub.items?.data?.[0]?.price?.id;
    const planKey = sub.metadata?.plan || planKeyFromPriceId(priceId);
    if (!planKey) {
      return res.status(422).json({ error: 'Plan Stripe inconnu', priceId });
    }
    const plan = PLANS[planKey] || PLANS.starter;

    // Mirror Stripe's subscription status → our payment_status column.
    const ps = (sub.status === 'past_due' || sub.status === 'unpaid')
      ? sub.status
      : 'active';
    await query(
      `UPDATE tenants SET
         plan = $1,
         plan_partner_limit = $2,
         stripe_subscription_id = $3,
         plan_started_at = COALESCE(plan_started_at, $4),
         plan_ends_at = $5,
         payment_status = $6
       WHERE id = $7`,
      [
        planKey,
        plan.partnerLimit,
        sub.id,
        sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
        sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
        ps,
        req.tenantId,
      ]
    );

    res.json({
      synced: true,
      plan: planKey,
      partnerLimit: plan.partnerLimit,
      subscriptionId: sub.id,
      status: sub.status,
    });
  } catch (err) {
    console.error('[billing.sync] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

// ─── GET /api/billing/invoices ───────────────────────────────────────
router.get('/invoices', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.json({ invoices: [] });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant || !tenant.stripe_customer_id) return res.json({ invoices: [] });

    const list = await stripe.invoices.list({
      customer: tenant.stripe_customer_id,
      limit: 24,
    });
    const invoices = (list.data || []).map(inv => ({
      id: inv.id,
      date: inv.created ? new Date(inv.created * 1000).toISOString() : null,
      amount: (inv.amount_paid || inv.amount_due || 0) / 100,
      currency: inv.currency,
      status: inv.status,
      pdf_url: inv.invoice_pdf || null,
      hosted_url: inv.hosted_invoice_url || null,
      number: inv.number || null,
    }));
    res.json({ invoices });
  } catch (err) {
    console.error('[billing.invoices] error:', err);
    res.status(500).json({ error: 'Erreur Stripe' });
  }
});

module.exports = { router, PLANS, planKeyFromPriceId };
