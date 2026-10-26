import { Router } from 'express';
import { Payment } from '../models/Payment.js';
import { isValidWebhookSignature, settlePayment } from '../services/razorpay.js';
import { config } from '../config.js';

// POST /api/payments/webhook — called by Razorpay's servers, not by a browser:
// no cookie, no CSRF header; authenticity comes from the HMAC signature on the raw body.
const router = Router();

router.post('/webhook', async (req, res) => {
  if (!config.razorpayWebhookSecret)
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Not found' } });
  if (!isValidWebhookSignature(req.rawBody, req.get('X-Razorpay-Signature'))) {
    return res.status(400).json({ error: { code: 'BAD_SIGNATURE', message: 'Invalid signature' } });
  }
  const event = req.body?.event;
  const entity = req.body?.payload?.payment?.entity;
  if (!['payment.captured', 'order.paid'].includes(event) || !entity?.order_id || !entity?.id) {
    return res.json({ ok: true, ignored: true }); // acknowledge so Razorpay doesn't retry
  }
  const payment = await Payment.findOne({ orderId: entity.order_id });
  if (!payment) return res.json({ ok: true, ignored: true });
  if (entity.amount !== payment.amount) {
    console.error('[razorpay] webhook amount mismatch', entity.order_id, entity.amount, payment.amount);
    return res.json({ ok: true, ignored: true });
  }
  try {
    await settlePayment(payment, entity.id, 'webhook');
  } catch (err) {
    if (err.code !== 'ALREADY_PAID') throw err;
  }
  res.json({ ok: true });
});

export default router;
