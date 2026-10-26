import './setup-env.js'; // must be first: config reads env at import time
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { config } from '../src/config.js';
import { Payment } from '../src/models/Payment.js';
import { Settlement } from '../src/models/Settlement.js';
import { app, groupWith, newUser, startDb, stopDb, today } from './helpers.js';

before(startDb);
after(stopDb);

const sign = (secret, data) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const realFetch = globalThis.fetch;
let orderCalls = [];
let nextOrder = 0;

beforeEach(() => {
  orderCalls = [];
  // A stand-in for the Razorpay Orders API.
  globalThis.fetch = async (url, opts) => {
    assert.equal(String(url), 'https://api.razorpay.com/v1/orders');
    const auth = Buffer.from(opts.headers.Authorization.replace('Basic ', ''), 'base64').toString();
    assert.equal(auth, 'rzp_test_hisaabTEST:test_key_secret_123');
    const body = JSON.parse(opts.body);
    orderCalls.push(body);
    nextOrder += 1;
    return Response.json({
      id: `order_TEST${String(nextOrder).padStart(6, '0')}`,
      amount: body.amount,
      currency: 'INR',
      status: 'created',
    });
  };
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

/** A owes B 500 after B pays 1000 for both. */
async function owingGroup() {
  const a = await newUser('Payer');
  const b = await newUser('Payee');
  const g = await groupWith(a, b);
  await b.post(`/api/groups/${g.id}/expenses`, {
    description: 'Dinner',
    amount: '1000',
    paidBy: b.user.id,
    splitType: 'equal',
    participants: [{ user: a.user.id }, { user: b.user.id }],
    date: today(),
  });
  return { a, b, g };
}

describe('Razorpay payments', () => {
  it('exposes only the public key id', async () => {
    const a = await newUser('A');
    const g = await groupWith(a);
    const res = await a.get(`/api/groups/${g.id}/payments/config`);
    assert.deepEqual(res.body, { enabled: true, keyId: 'rzp_test_hisaabTEST' });
    assert.ok(!JSON.stringify(res.body).includes('secret'));
  });

  it('creates an order for at most what you owe, then verifies and settles exactly once', async () => {
    const { a, b, g } = await owingGroup();
    const tooMuch = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '600' });
    assert.equal(tooMuch.status, 400);
    assert.equal(tooMuch.body.error.code, 'AMOUNT_TOO_LARGE');
    const creditor = await b.post(`/api/groups/${g.id}/payments/order`, { to: a.user.id, amount: '10' });
    assert.equal(creditor.body.error.code, 'NOTHING_TO_PAY');
    const self = await a.post(`/api/groups/${g.id}/payments/order`, { to: a.user.id, amount: '10' });
    assert.equal(self.body.error.code, 'SAME_PERSON');

    const order = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '500' });
    assert.equal(order.status, 201);
    assert.equal(order.body.amount, 50000);
    assert.equal(orderCalls.at(-1).amount, 50000);
    assert.equal(orderCalls.at(-1).currency, 'INR');

    const paymentId = 'pay_TESTabc123';
    const good = sign('test_key_secret_123', `${order.body.orderId}|${paymentId}`);

    // A forged "success" from the browser is rejected.
    const forged = await a.post(`/api/groups/${g.id}/payments/verify`, {
      orderId: order.body.orderId,
      paymentId,
      signature: sign('wrong_secret', `${order.body.orderId}|${paymentId}`),
    });
    assert.equal(forged.status, 400);
    assert.equal(forged.body.error.code, 'BAD_SIGNATURE');
    assert.equal(await Settlement.countDocuments({ group: g.id }), 0);

    // Double submit of the real callback: one settlement.
    const results = await Promise.all(
      [1, 2].map(() =>
        a.post(`/api/groups/${g.id}/payments/verify`, { orderId: order.body.orderId, paymentId, signature: good }),
      ),
    );
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 201]);
    assert.equal(await Settlement.countDocuments({ group: g.id }), 1);

    const bal = (await a.get(`/api/groups/${g.id}/balances`)).body;
    assert.ok(bal.net.every((n) => n.amount === 0)); // all square
    const list = (await b.get(`/api/groups/${g.id}/settlements`)).body.items;
    assert.equal(list[0].method, 'razorpay');
    // Verified online payments can't be deleted.
    const del = await b.del(`/api/groups/${g.id}/settlements/${list[0].id}`);
    assert.equal(del.status, 409);
    assert.equal(del.body.error.code, 'VERIFIED_PAYMENT');
  });

  it('someone else cannot verify your order', async () => {
    const { a, b, g } = await owingGroup();
    const order = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '100' });
    const res = await b.post(`/api/groups/${g.id}/payments/verify`, {
      orderId: order.body.orderId,
      paymentId: 'pay_TESTzzz999',
      signature: sign('test_key_secret_123', `${order.body.orderId}|pay_TESTzzz999`),
    });
    assert.equal(res.status, 404);
  });

  it('the webhook settles a payment when the browser never comes back, and is idempotent with checkout', async () => {
    const { a, b, g } = await owingGroup();
    const order = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '250' });
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: { id: 'pay_TESTwebhook1', order_id: order.body.orderId, amount: 25000, status: 'captured' },
        },
      },
    });
    const send = (sig) =>
      request(app)
        .post('/api/payments/webhook')
        .set('Content-Type', 'application/json')
        .set('X-Razorpay-Signature', sig)
        .send(payload);

    assert.equal((await send(sign('nope', payload))).status, 400);
    assert.equal((await send(sign('test_webhook_secret_456', payload))).status, 200);
    assert.equal((await send(sign('test_webhook_secret_456', payload))).status, 200); // Razorpay retries
    assert.equal(await Settlement.countDocuments({ group: g.id }), 1);
    const p = await Payment.findOne({ orderId: order.body.orderId });
    assert.equal(p.status, 'paid');
    assert.equal(p.paidVia, 'webhook');

    // The late checkout callback for the same payment changes nothing.
    const late = await a.post(`/api/groups/${g.id}/payments/verify`, {
      orderId: order.body.orderId,
      paymentId: 'pay_TESTwebhook1',
      signature: sign('test_key_secret_123', `${order.body.orderId}|pay_TESTwebhook1`),
    });
    assert.equal(late.status, 200);
    assert.equal(late.body.duplicate, true);
    assert.equal(await Settlement.countDocuments({ group: g.id }), 1);
  });

  it('reports Razorpay outages cleanly and can be switched off', async () => {
    const { a, b, g } = await owingGroup();
    globalThis.fetch = async () => {
      throw new Error('connect ETIMEDOUT');
    };
    const down = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '100' });
    assert.equal(down.status, 502);
    assert.equal(down.body.error.code, 'PAYMENT_PROVIDER_DOWN');
    globalThis.fetch = async () => Response.json({ error: { description: 'Authentication failed' } }, { status: 401 });
    const badKeys = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '100' });
    assert.equal(badKeys.body.error.code, 'PAYMENT_PROVIDER_ERROR');
    assert.ok(!badKeys.body.error.message.includes('Authentication failed')); // provider text not leaked

    const saved = config.razorpayKeySecret;
    config.razorpayKeySecret = '';
    try {
      assert.equal((await a.get(`/api/groups/${g.id}/payments/config`)).body.enabled, false);
      const off = await a.post(`/api/groups/${g.id}/payments/order`, { to: b.user.id, amount: '100' });
      assert.equal(off.status, 503);
      assert.equal(off.body.error.code, 'PAYMENTS_DISABLED');
    } finally {
      config.razorpayKeySecret = saved;
    }
  });
});
