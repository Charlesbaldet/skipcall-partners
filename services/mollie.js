/**
 * Mollie Payment Service
 * 
 * Handles automatic commission payouts to partners via Mollie API.
 * 
 * Setup:
 * 1. npm install @mollie/api-client
 * 2. Set MOLLIE_API_KEY in environment variables
 * 3. Set MOLLIE_WEBHOOK_URL to your backend URL + /api/payments/webhook
 * 
 * Flow:
 * - Commission approved → createPayout() → Mollie processes payment
 * - Mollie sends webhook → handleWebhook() → Commission marked as "paid"
 */

const { createMollieClient } = require('@mollie/api-client');

let mollieClient = null;

function getClient() {
  if (!mollieClient && process.env.MOLLIE_API_KEY) {
    mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
  }
  return mollieClient;
}

/**
 * Create a payout/payment for a commission.
 * Uses Mollie Payments API to initiate a bank transfer.
 * 
 * @param {Object} commission - The commission object with amount, partner info
 * @param {Object} partner - The partner object with bank details
 * @returns {Object} Mollie payment object
 */
async function createPayout(commission, partner) {
  const client = getClient();
  if (!client) throw new Error('Mollie non configur\u00e9 (MOLLIE_API_KEY manquant)');

  const payment = await client.payments.create({
    amount: {
      currency: 'EUR',
      value: parseFloat(commission.amount).toFixed(2),
    },
    description: `Commission Skipcall - ${partner.name} - ${commission.prospect_name || 'Deal'}`,
    redirectUrl: `${process.env.FRONTEND_URL}/commissions`,
    webhookUrl: `${process.env.MOLLIE_WEBHOOK_URL || process.env.BACKEND_URL}/api/payments/webhook`,
    metadata: {
      commission_id: commission.id,
      partner_id: commission.partner_id,
      type: 'commission_payout',
    },
  });

  return payment;
}

/**
 * Check payment status from Mollie
 * @param {string} paymentId - Mollie payment ID
 * @returns {Object} Payment status
 */
async function getPaymentStatus(paymentId) {
  const client = getClient();
  if (!client) throw new Error('Mollie non configur\u00e9');

  return await client.payments.get(paymentId);
}

/**
 * Check if Mollie is configured
 */
function isConfigured() {
  return !!process.env.MOLLIE_API_KEY;
}

module.exports = { createPayout, getPaymentStatus, isConfigured };
