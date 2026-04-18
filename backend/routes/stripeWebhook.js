// Stripe webhook handler.
//
// Mounted in server.js BEFORE express.json() with `express.raw({ type:
// 'application/json' })` because Stripe signs the raw body — any parsing
// in front of this route breaks signature verification.
//
// Events handled:
//   checkout.session.completed       → persist plan + stripe IDs on tenant
//   customer.subscription.updated    → sync plan (user upgraded/downgraded)
//   customer.subscription.deleted    → revert to starter + 5 partner limit
//   invoice.payment_failed           → (optional) flag tenant (audit only)
const express = require('express');
const { query } = require('../db');
const { PLANS, planKeyFromPriceId } = require('./billing');
const { sendEmail, billingPaymentFailedTpl, billingSubscriptionCanceledTpl } = require('../services/emailService');

async function tenantAdminEmails(tenantId) {
  if (!tenantId) return [];
  const { rows } = await query(
    "SELECT email, full_name FROM users WHERE tenant_id = $1 AND role = 'admin' AND is_active = TRUE",
    [tenantId]
  );
  return rows;
}

const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = stripeKey ? require('stripe')(stripeKey) : null;

const router = express.Router();

async function applyPlanToTenant(tenantId, planKey, { subscriptionId, customerId, periodStart, periodEnd } = {}) {
  if (!tenantId) return;
  const plan = PLANS[planKey] || PLANS.starter;
  await query(
    `UPDATE tenants SET
       plan = $1,
       plan_partner_limit = $2,
       stripe_customer_id = COALESCE($3, stripe_customer_id),
       stripe_subscription_id = COALESCE($4, stripe_subscription_id),
       plan_started_at = COALESCE($5, plan_started_at),
       plan_ends_at = $6
     WHERE id = $7`,
    [
      planKey,
      plan.partnerLimit,
      customerId || null,
      subscriptionId || null,
      periodStart ? new Date(periodStart * 1000) : null,
      periodEnd ? new Date(periodEnd * 1000) : null,
      tenantId,
    ]
  );
}

async function resolveTenantFromCustomer(customerId) {
  if (!customerId) return null;
  const { rows } = await query('SELECT id FROM tenants WHERE stripe_customer_id = $1 LIMIT 1', [customerId]);
  return rows[0]?.id || null;
}

router.post('/', async (req, res) => {
  if (!stripe) return res.status(500).send('stripe not configured');

  let event;
  try {
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      // req.body is a Buffer here because the route is mounted with
      // express.raw(). Do NOT change that upstream or verification fails.
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // No secret set yet (pre-production) — accept the event as-is but
      // only do so for local/test-mode traffic. In production, set
      // STRIPE_WEBHOOK_SECRET so we sign-verify every event.
      event = typeof req.body === 'string' || Buffer.isBuffer(req.body)
        ? JSON.parse(req.body.toString())
        : req.body;
    }
  } catch (err) {
    console.error('[stripe webhook] signature verification failed:', err.message);
    return res.status(400).send('invalid signature');
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const tenantId = session.metadata?.tenantId
          || (await resolveTenantFromCustomer(session.customer));
        const planKey = session.metadata?.plan
          || (session.line_items?.data?.[0]?.price?.id
              ? planKeyFromPriceId(session.line_items.data[0].price.id)
              : null);

        if (tenantId && planKey) {
          let periodStart, periodEnd;
          if (session.subscription) {
            try {
              const sub = await stripe.subscriptions.retrieve(session.subscription);
              periodStart = sub.current_period_start;
              periodEnd = sub.current_period_end;
            } catch (e) { /* not fatal — we still have the plan */ }
          }
          await applyPlanToTenant(tenantId, planKey, {
            customerId: session.customer,
            subscriptionId: session.subscription,
            periodStart,
            periodEnd,
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const tenantId = sub.metadata?.tenantId
          || (await resolveTenantFromCustomer(sub.customer));
        const priceId = sub.items?.data?.[0]?.price?.id;
        const planKey = sub.metadata?.plan || planKeyFromPriceId(priceId);
        if (tenantId && planKey) {
          await applyPlanToTenant(tenantId, planKey, {
            customerId: sub.customer,
            subscriptionId: sub.id,
            periodStart: sub.current_period_start,
            periodEnd: sub.current_period_end,
          });
        }
        // Mirror Stripe's subscription status into our payment_status
        // column so the dashboard banner flips in sync with the real
        // state (past_due/unpaid/active). Other Stripe statuses
        // (trialing, incomplete, etc.) leave the column untouched.
        if (tenantId) {
          const stat = sub.status;
          if (stat === 'past_due' || stat === 'unpaid') {
            await query('UPDATE tenants SET payment_status = $1 WHERE id = $2', [stat, tenantId]);
          } else if (stat === 'active') {
            await query("UPDATE tenants SET payment_status = 'active' WHERE id = $1", [tenantId]);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const tenantId = sub.metadata?.tenantId
          || (await resolveTenantFromCustomer(sub.customer));
        if (tenantId) {
          await applyPlanToTenant(tenantId, 'starter', {
            customerId: sub.customer,
            subscriptionId: null,
            periodEnd: null,
          });
          // Clear subscription id + reset payment_status since the sub
          // is gone. Existing partners keep working (the plan-limit
          // gate only blocks NEW adds), we just downgrade their cap.
          await query(
            "UPDATE tenants SET stripe_subscription_id = NULL, payment_status = 'active' WHERE id = $1",
            [tenantId]
          );
          // Notify admins that the sub was canceled + they're back on
          // Starter. Fire-and-forget — email failure must not 500 the
          // webhook or Stripe will retry indefinitely.
          try {
            const admins = await tenantAdminEmails(tenantId);
            for (const a of admins) {
              const tpl = billingSubscriptionCanceledTpl(a.full_name);
              sendEmail(a.email, tpl.subject, tpl.html).catch(() => {});
            }
          } catch (e) { console.error('[sub.deleted email]', e.message); }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const inv = event.data.object;
        const tenantId = await resolveTenantFromCustomer(inv.customer);
        if (tenantId) {
          await query(
            "UPDATE tenants SET payment_status = 'past_due' WHERE id = $1",
            [tenantId]
          );
          try {
            await query(
              "INSERT INTO audit_logs (tenant_id, action, resource_type, resource_id, details) VALUES ($1, 'invoice_payment_failed', 'tenant', $1, $2)",
              [tenantId, JSON.stringify({ invoiceId: inv.id, amount: inv.amount_due })]
            );
          } catch {}
          // Email admins so they can update their card before retries
          // run out and the subscription is canceled for good.
          try {
            const admins = await tenantAdminEmails(tenantId);
            const { rows: tr } = await query('SELECT plan FROM tenants WHERE id = $1', [tenantId]);
            const planLabel = (tr[0]?.plan || 'pro').charAt(0).toUpperCase() + (tr[0]?.plan || 'pro').slice(1);
            for (const a of admins) {
              const tpl = billingPaymentFailedTpl(a.full_name, planLabel);
              sendEmail(a.email, tpl.subject, tpl.html).catch(() => {});
            }
          } catch (e) { console.error('[invoice.failed email]', e.message); }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        // Retry after a past_due period succeeded — clear the banner.
        const inv = event.data.object;
        const tenantId = await resolveTenantFromCustomer(inv.customer);
        if (tenantId) {
          await query(
            "UPDATE tenants SET payment_status = 'active' WHERE id = $1",
            [tenantId]
          );
        }
        break;
      }

      default:
        // ignore other events
        break;
    }
    res.json({ received: true });
  } catch (err) {
    console.error('[stripe webhook] handler error:', err);
    res.status(500).json({ error: 'webhook handler failed' });
  }
});

module.exports = router;
