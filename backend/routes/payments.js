const express = require('express');
const { query } = require('../db');
const { authenticate, authorize } = require('../middleware/auth');
const mollie = require('../services/mollie');

const router = express.Router();

router.get('/config', authenticate, authorize('admin'), (req, res) => {
  res.json({ configured: mollie.isConfigured() });
});

router.post('/create/:commissionId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { rows: [commission] } = await query(
      `SELECT c.*, p.name as partner_name, r.prospect_name
       FROM commissions c JOIN partners p ON c.partner_id = p.id JOIN referrals r ON c.referral_id = r.id
       WHERE c.id = $1`, [req.params.commissionId]
    );
    if (!commission) return res.status(404).json({ error: 'Commission introuvable' });
    if (commission.status !== 'approved') return res.status(400).json({ error: 'Commission doit etre approuvee' });

    const { rows: [partner] } = await query('SELECT * FROM partners WHERE id = $1', [commission.partner_id]);
    const payment = await mollie.createPayout(commission, partner);

    await query('UPDATE commissions SET mollie_payment_id = $2, payment_status = $3 WHERE id = $1',
      [commission.id, payment.id, payment.status]);

    res.json({ success: true, payment_id: payment.id, status: payment.status,
      checkout_url: payment._links?.checkout?.href || null });
  } catch (err) {
    console.error('Mollie error:', err);
    res.status(500).json({ error: err.message || 'Erreur Mollie' });
  }
});

router.post('/webhook', async (req, res) => {
  try {
    const { id: paymentId } = req.body;
    if (!paymentId) return res.status(200).send('OK');

    const payment = await mollie.getPaymentStatus(paymentId);
    const { rows: [commission] } = await query(
      'SELECT * FROM commissions WHERE mollie_payment_id = $1', [paymentId]);
    if (!commission) return res.status(200).send('OK');

    if (payment.status === 'paid') {
      await query('UPDATE commissions SET status = $2, paid_at = $3, payment_status = $4 WHERE id = $1',
        [commission.id, 'paid', new Date().toISOString(), 'paid']);
    } else {
      await query('UPDATE commissions SET payment_status = $2 WHERE id = $1',
        [commission.id, payment.status]);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error('Webhook error:', err);
    res.status(200).send('OK');
  }
});

router.get('/status/:commissionId', authenticate, authorize('admin'), async (req, res) => {
  try {
    const { rows: [c] } = await query(
      'SELECT mollie_payment_id, payment_status FROM commissions WHERE id = $1', [req.params.commissionId]);
    if (!c || !c.mollie_payment_id) return res.json({ status: 'not_initiated' });
    const payment = await mollie.getPaymentStatus(c.mollie_payment_id);
    res.json({ payment_id: c.mollie_payment_id, status: payment.status });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
