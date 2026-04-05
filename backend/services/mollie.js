const { createMollieClient } = require('@mollie/api-client');

let mollieClient = null;

function getClient() {
  if (!mollieClient && process.env.MOLLIE_API_KEY) {
    mollieClient = createMollieClient({ apiKey: process.env.MOLLIE_API_KEY });
  }
  return mollieClient;
}

/**
 * Create a payment for a commission.
 * The partner's IBAN is stored in the metadata for manual or automated transfer.
 * 
 * Mollie Payments API creates a payment link.
 * For direct bank transfers to partners, use Mollie Connect (marketplace) 
 * or process payouts via your own bank using the stored IBAN.
 * 
 * Flow:
 * 1. Commission approved -> admin clicks "Payer"
 * 2. If partner has IBAN -> record payout with bank details
 * 3. Mollie tracks the payment status
 */
async function createPayout(commission, partner) {
  const client = getClient();
  if (!client) throw new Error('Mollie non configur\u00e9 (MOLLIE_API_KEY manquant)');
  
  if (!partner.iban) {
    throw new Error('IBAN manquant pour ' + partner.name + '. Ajoutez-le dans la fiche partenaire.');
  }

  const payment = await client.payments.create({
    amount: { currency: 'EUR', value: parseFloat(commission.amount).toFixed(2) },
    description: 'Commission Skipcall - ' + partner.name + ' - ' + (commission.prospect_name || 'Deal'),
    redirectUrl: process.env.FRONTEND_URL + '/commissions',
    webhookUrl: (process.env.BACKEND_URL || process.env.FRONTEND_URL.replace('vercel.app','up.railway.app')) + '/api/payments/webhook',
    metadata: {
      commission_id: commission.id,
      partner_id: commission.partner_id,
      partner_name: partner.name,
      partner_iban: partner.iban,
      partner_bic: partner.bic || '',
      partner_account_holder: partner.account_holder || partner.contact_name,
      type: 'commission_payout',
    },
  });
  return payment;
}

async function getPaymentStatus(paymentId) {
  const client = getClient();
  if (!client) throw new Error('Mollie non configur\u00e9');
  return await client.payments.get(paymentId);
}

function isConfigured() { return !!process.env.MOLLIE_API_KEY; }

module.exports = { createPayout, getPaymentStatus, isConfigured };
