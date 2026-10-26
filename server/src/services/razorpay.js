import crypto from 'node:crypto';
import { config } from '../config.js';
import { Group } from '../models/Group.js';
import { Payment } from '../models/Payment.js';
import { Settlement } from '../models/Settlement.js';
import { todayCalendar } from '../utils/dates.js';
import { AppError } from '../utils/errors.js';
import { logActivity } from './activity.js';
import { nameMap } from './expenses.js';

const hmacHex = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/** Razorpay Checkout signature: HMAC-SHA256(order_id + "|" + payment_id, key_secret). */
export function isValidPaymentSignature(orderId, paymentId, signature) {
  return safeEqualHex(hmacHex(config.razorpayKeySecret, `${orderId}|${paymentId}`), signature);
}

/** Razorpay webhook signature: HMAC-SHA256(raw request body, webhook secret). */
export function isValidWebhookSignature(rawBody, signature) {
  if (!config.razorpayWebhookSecret || !rawBody) return false;
  return safeEqualHex(hmacHex(config.razorpayWebhookSecret, rawBody), signature);
}

/** Creates an order through the Razorpay Orders API. Amount is in paise. */
export async function createOrder({ amount, receipt, notes }) {
  const auth = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString('base64');
  let res;
  try {
    res = await fetch(`${config.razorpayApiBase}/v1/orders`, {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount, currency: 'INR', receipt, notes }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('[razorpay] order request failed:', err.message);
    throw new AppError(502, 'PAYMENT_PROVIDER_DOWN', "Couldn't reach Razorpay. Please try again in a moment.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    // Never forward Razorpay's raw error to the browser; log it for us instead.
    console.error('[razorpay] order rejected:', res.status, data?.error?.description);
    const message =
      res.status === 401
        ? 'Online payments are misconfigured (Razorpay rejected the API keys).'
        : 'Razorpay could not start this payment. Please try again.';
    throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', message);
  }
  return data;
}

/**
 * Marks a payment as paid and records the matching settlement, exactly once.
 * Safe to call from both the checkout callback and the webhook, in any order and
 * concurrently: the status flip is a compare-and-set, and the settlement has a unique
 * key derived from the Razorpay payment id.
 */
export async function settlePayment(payment, paymentId, via) {
  if (payment.status === 'created') {
    const claimed = await Payment.findOneAndUpdate(
      { _id: payment._id, status: 'created' },
      { $set: { status: 'paid', paymentId, paidVia: via, paidAt: new Date() } },
      { new: true },
    );
    payment = claimed ?? (await Payment.findById(payment._id));
  }
  if (payment.paymentId !== paymentId) {
    // The order was already paid by a different payment id: never double count.
    throw new AppError(409, 'ALREADY_PAID', 'This payment was already completed');
  }

  const key = `razorpay:${paymentId}`;
  let settlement = await Settlement.findOne({ group: payment.group, clientRequestId: key });
  let created = false;
  if (!settlement) {
    try {
      settlement = await Settlement.create({
        group: payment.group,
        from: payment.from,
        to: payment.to,
        amount: payment.amount,
        note: `Paid online via Razorpay (${paymentId})`,
        date: todayCalendar(),
        createdBy: payment.from,
        clientRequestId: key,
        method: 'razorpay',
        providerRef: paymentId,
      });
      created = true;
    } catch (err) {
      if (err?.code !== 11000) throw err;
      settlement = await Settlement.findOne({ group: payment.group, clientRequestId: key });
    }
  }
  if (!payment.settlement) await Payment.updateOne({ _id: payment._id }, { $set: { settlement: settlement._id } });
  if (created) {
    const names = await nameMap([payment.from, payment.to]);
    const group = await Group.findById(payment.group);
    if (group) {
      await logActivity(group, payment.from, 'payment.received', {
        from: names.get(String(payment.from)),
        to: names.get(String(payment.to)),
        amount: payment.amount,
        paymentId,
      });
    }
  }
  return { settlement, created };
}
