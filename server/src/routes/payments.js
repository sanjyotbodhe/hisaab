import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { config, paymentsEnabled } from '../config.js';
import { objectId, validate } from '../middleware/validate.js';
import { Payment } from '../models/Payment.js';
import { userNetInGroup } from '../services/balances.js';
import { createOrder, isValidPaymentSignature, settlePayment } from '../services/razorpay.js';
import { amountField } from '../services/expenses.js';
import { AppError, notFound } from '../utils/errors.js';
import { formatINR } from '../shared/split.js';

// Mounted at /api/groups/:groupId/payments after loadGroupMember.
const router = Router({ mergeParams: true });

const disabled = () => {
  console.warn('[razorpay] payment attempted but RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set');
  return new AppError(
    503,
    'PAYMENTS_DISABLED',
    'Online payments aren’t switched on for this app yet. Pay by UPI or cash and use Record payment.',
  );
};

// The key id is public by design (it goes into the browser); the secret never leaves the server.
router.get('/config', (req, res) => {
  res.json({ enabled: paymentsEnabled(), keyId: paymentsEnabled() ? config.razorpayKeyId : null });
});

const orderLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: config.isTest ? 1000 : 10,
  keyGenerator: (req) => String(req.user._id),
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  handler: (req, res) =>
    res.status(429).json({ error: { code: 'RATE_LIMITED', message: 'Too many payment attempts. Wait a minute.' } }),
});

router.post(
  '/order',
  orderLimiter,
  validate({ body: z.object({ to: objectId, amount: amountField }) }),
  async (req, res) => {
    if (!paymentsEnabled()) throw disabled();
    const { to, amount } = req.valid.body;
    const me = String(req.user._id);
    if (to === me) throw new AppError(400, 'SAME_PERSON', "You can't pay yourself");
    if (!req.group.memberOf(to)) throw new AppError(400, 'NOT_A_MEMBER', 'You can only pay members of this group');
    if (amount < 100) throw new AppError(400, 'AMOUNT_TOO_SMALL', 'Online payments must be at least ₹1');

    // Never take more than the payer actually owes in this group.
    const owed = -(await userNetInGroup(req.group._id, me));
    if (owed <= 0) throw new AppError(400, 'NOTHING_TO_PAY', "You don't owe anything in this group");
    if (amount > owed) {
      throw new AppError(
        400,
        'AMOUNT_TOO_LARGE',
        `You owe ${formatINR(owed)} in this group, so you can pay at most that`,
      );
    }

    const order = await createOrder({
      amount,
      receipt: `hisaab_${Date.now().toString(36)}`,
      notes: { group: String(req.group._id), from: me, to },
    });
    await Payment.create({ group: req.group._id, from: me, to, amount, orderId: order.id });
    const payee = req.group.members.find((m) => String(m.user) === to);
    res.status(201).json({
      keyId: config.razorpayKeyId,
      orderId: order.id,
      amount,
      currency: 'INR',
      description: `Settle up in ${req.group.name}`,
      payee: String(payee.user),
      prefill: { name: req.user.name, email: req.user.email },
    });
  },
);

/**
 * Called by the browser after Razorpay Checkout succeeds. The browser's word is not
 * trusted: the signature proves Razorpay issued this payment id for this order.
 */
router.post(
  '/verify',
  validate({
    body: z.object({
      orderId: z.string().regex(/^order_[A-Za-z0-9]{6,40}$/, 'Invalid order id'),
      paymentId: z.string().regex(/^pay_[A-Za-z0-9]{6,40}$/, 'Invalid payment id'),
      signature: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid signature'),
    }),
  }),
  async (req, res) => {
    if (!paymentsEnabled()) throw disabled();
    const { orderId, paymentId, signature } = req.valid.body;
    const payment = await Payment.findOne({ orderId, group: req.group._id, from: req.user._id });
    if (!payment) throw notFound('Payment');
    if (!isValidPaymentSignature(orderId, paymentId, signature)) {
      console.warn('[razorpay] signature mismatch for', orderId);
      throw new AppError(
        400,
        'BAD_SIGNATURE',
        'We could not verify this payment. If money was deducted, it will be confirmed automatically.',
      );
    }
    const { settlement, created } = await settlePayment(payment, paymentId, 'checkout');
    res
      .status(created ? 201 : 200)
      .json({ settlementId: String(settlement._id), amount: payment.amount, duplicate: !created });
  },
);

export default router;
