const express = require('express');
const { query } = require('../db');
const { authenticate, authorize, tenantScope } = require('../middleware/auth');

const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

const router = express.Router();

// ─── Plan catalog ───────────────────────────────────────────────────
// Partner limits: -1 = unlimited. Keep in sync with landing + signup.
// Each paid plan has a monthly price id (hard-coded, lives in Stripe)
// and an annual price id (env-overridable placeholder — set via
// STRIPE_PRICE_PRO_ANNUAL / STRIPE_PRICE_BUSINESS_ANNUAL when the real
// annual prices are created in the Stripe dashboard).
const PRICE_PRO_MONTHLY = 'price_1TNSyKLO4aHvEb3qMzUBhtbe';
const PRICE_BUSINESS_MONTHLY = 'price_1TNSyfLO4aHvEb3qM7f7A14c';
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
            stripe_subscription_id, plan_started_at, plan_ends_at
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
    res.json({
      plan: tenant.plan || 'starter',
      partnerLimit: tenant.plan_partner_limit ?? 5,
      partnerCount,
      stripeCustomerId: tenant.stripe_customer_id || null,
      subscriptionId: tenant.stripe_subscription_id || null,
      planStartedAt: tenant.plan_started_at,
      planEndsAt: tenant.plan_ends_at,
    });
  } catch (err) {
    console.error('[billing.plan] error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ─── POST /api/billing/checkout ──────────────────────────────────────
// Creates a Stripe Checkout Session for upgrading. Returns { url }.
// Creates a Stripe Customer on the tenant if one doesn't exist yet so
// we can re-use it for the portal + future subscription changes.
router.post('/checkout', authenticate, tenantScope, authorize('admin'), async (req, res) => {
  try {
    if (!stripe) return res.status(500).json({ error: 'Stripe non configuré' });
    if (!req.tenantId) return res.status(400).json({ error: 'Tenant introuvable' });
    const { priceId } = req.body || {};
    if (!priceId) return res.status(400).json({ error: 'priceId requis' });

    const planKey = planKeyFromPriceId(priceId);
    if (!planKey) return res.status(400).json({ error: 'Plan inconnu' });

    const tenant = await loadTenantPlan(req.tenantId);
    if (!tenant) return res.status(404).json({ error: 'Tenant introuvable' });

    // Make sure we have a Stripe customer.
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
    const portal = await stripe.billingPortal.sessions.create({
      customer: tenant.stripe_customer_id,
      return_url: frontend + '/billing',
    });
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
    res.json({ ok: true, cancelAt: sub.cancel_at });
  } catch (err) {
    console.error('[billing.cancel] error:', err);
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
           plan_ends_at = NULL
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
        sub.id,
        sub.current_period_start ? new Date(sub.current_period_start * 1000) : null,
        sub.current_period_end ? new Date(sub.current_period_end * 1000) : null,
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
