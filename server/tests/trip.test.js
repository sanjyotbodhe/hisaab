import assert from 'node:assert/strict';
import { after, afterEach, before, describe, it } from 'node:test';
import { Expense } from '../src/models/Expense.js';
import { ExternalCache } from '../src/models/ExternalCache.js';
import { clearPlacesMemoryCache } from '../src/services/places.js';
import { groupWith, newUser, startDb, stopDb, today } from './helpers.js';

before(startDb);
after(stopDb);

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

describe('profile: UPI ID', () => {
  it('saves a valid UPI ID, rejects junk, and shows it to group members', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    assert.equal((await a.patch('/api/auth/me', { upiId: 'not a upi' })).status, 400);
    const ok = await a.patch('/api/auth/me', { upiId: 'asha.k@okaxis' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.user.upiId, 'asha.k@okaxis');
    const members = (await b.get(`/api/groups/${g.id}`)).body.group.members;
    assert.equal(members.find((m) => m.id === a.user.id).upiId, 'asha.k@okaxis');
    assert.equal((await a.patch('/api/auth/me', { upiId: '' })).body.user.upiId, ''); // can clear
  });
});

describe('trip settings', () => {
  it('any member can set destination, dates and budget; invalid ranges are rejected', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    const start = addDays(today(), 10);
    const res = await b.put(`/api/groups/${g.id}/trip`, {
      destination: { name: 'Goa', lat: 15.49, lng: 73.82 },
      startDate: start,
      endDate: addDays(start, 3),
      budget: '40000',
    });
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.group.trip, {
      destination: { name: 'Goa', lat: 15.49, lng: 73.82 },
      startDate: start,
      endDate: addDays(start, 3),
      budget: 4000000,
    });
    const backwards = await a.put(`/api/groups/${g.id}/trip`, { startDate: start, endDate: addDays(start, -1) });
    assert.equal(backwards.status, 400);
    const tooLong = await a.put(`/api/groups/${g.id}/trip`, { startDate: start, endDate: addDays(start, 90) });
    assert.equal(tooLong.status, 400);
    const half = await a.put(`/api/groups/${g.id}/trip`, { startDate: null });
    assert.equal(half.status, 400);
    const outsider = await newUser('X');
    assert.equal((await outsider.put(`/api/groups/${g.id}/trip`, { budget: '1' })).status, 404);
  });
});

describe('trip plan', () => {
  it('ideas collect votes atomically and get scheduled into the itinerary', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const c = await newUser('C');
    const g = await groupWith(a, b, c);
    const start = addDays(today(), 5);
    await a.put(`/api/groups/${g.id}/trip`, { startDate: start, endDate: addDays(start, 2) });

    const fort = (
      await a.post(`/api/groups/${g.id}/plan`, {
        title: 'Fort Aguada',
        place: { name: 'Fort Aguada', lat: 15.49, lng: 73.77, url: 'https://en.wikipedia.org/wiki/Fort_Aguada' },
      })
    ).body.item;
    const beach = (await b.post(`/api/groups/${g.id}/plan`, { title: 'Baga beach', kind: 'activity' })).body.item;
    assert.equal(fort.day, null);

    // Everyone votes for the beach at the same moment; one person votes twice.
    await Promise.all([
      a.post(`/api/groups/${g.id}/plan/${beach.id}/vote`, { up: true }),
      b.post(`/api/groups/${g.id}/plan/${beach.id}/vote`, { up: true }),
      c.post(`/api/groups/${g.id}/plan/${beach.id}/vote`, { up: true }),
      c.post(`/api/groups/${g.id}/plan/${beach.id}/vote`, { up: true }),
    ]);
    let plan = (await a.get(`/api/groups/${g.id}/plan`)).body;
    assert.equal(plan.ideas[0].id, beach.id); // most votes first
    assert.equal(plan.ideas[0].votes, 3);
    await c.post(`/api/groups/${g.id}/plan/${beach.id}/vote`, { up: false });
    plan = (await c.get(`/api/groups/${g.id}/plan`)).body;
    assert.equal(plan.ideas[0].votes, 2);
    assert.equal(plan.ideas[0].votedByMe, false);

    // Schedule: must be within the trip dates.
    const outside = await b.patch(`/api/groups/${g.id}/plan/${fort.id}`, { day: addDays(start, 10) });
    assert.equal(outside.status, 400);
    assert.equal(outside.body.error.code, 'OUTSIDE_TRIP');
    await b.patch(`/api/groups/${g.id}/plan/${fort.id}`, { day: addDays(start, 1), time: '16:00' });
    await b.patch(`/api/groups/${g.id}/plan/${beach.id}`, { day: addDays(start, 1), time: '09:30' });
    plan = (await a.get(`/api/groups/${g.id}/plan`)).body;
    assert.deepEqual(
      plan.scheduled.map((i) => i.title),
      ['Baga beach', 'Fort Aguada'], // same day, ordered by time
    );
    assert.equal(plan.ideas.length, 0);
    const badTime = await b.patch(`/api/groups/${g.id}/plan/${fort.id}`, { time: '25:00' });
    assert.equal(badTime.status, 400);

    // Only the creator or an admin can delete.
    assert.equal((await c.del(`/api/groups/${g.id}/plan/${beach.id}`)).status, 403);
    assert.equal((await a.del(`/api/groups/${g.id}/plan/${beach.id}`)).status, 200);
  });
});

describe('bookings', () => {
  it('saves bookings and turns one into an equal-split expense exactly once', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    const bad = await a.post(`/api/groups/${g.id}/bookings`, {
      type: 'hotel',
      title: 'Hotel',
      startDate: '2026-12-10',
      endDate: '2026-12-08',
    });
    assert.equal(bad.status, 400);

    const noCost = (
      await a.post(`/api/groups/${g.id}/bookings`, { type: 'train', title: 'Goa Express', reference: 'PNR 4211' })
    ).body.booking;
    const r1 = await a.post(`/api/groups/${g.id}/bookings/${noCost.id}/expense`);
    assert.equal(r1.status, 400);
    assert.equal(r1.body.error.code, 'NO_COST');

    const flight = (
      await a.post(`/api/groups/${g.id}/bookings`, {
        type: 'flight',
        title: 'BLR → GOI',
        provider: 'IndiGo',
        reference: 'X7K2PQ',
        startDate: '2026-12-10',
        startTime: '06:15',
        cost: '9000',
        paidBy: a.user.id,
      })
    ).body.booking;

    const attempts = await Promise.all(
      [1, 2, 3].map(() => b.post(`/api/groups/${g.id}/bookings/${flight.id}/expense`)),
    );
    assert.equal(attempts.filter((r) => r.status === 201).length, 1);
    assert.ok(attempts.filter((r) => r.status !== 201).every((r) => r.body.error.code === 'ALREADY_EXPENSED'));
    const expenses = await Expense.find({ group: g.id, deletedAt: null }).lean();
    assert.equal(expenses.length, 1);
    assert.equal(expenses[0].amount, 900000);
    assert.equal(expenses[0].category, 'travel');
    assert.deepEqual(
      expenses[0].splits.map((s) => s.amount),
      [450000, 450000],
    );
    const bal = (await b.get(`/api/groups/${g.id}/balances`)).body;
    assert.equal(bal.net.find((n) => n.user.id === b.user.id).amount, -450000);

    // Cost can't silently change once it is an expense...
    const put = await a.put(`/api/groups/${g.id}/bookings/${flight.id}`, {
      type: 'flight',
      title: 'BLR → GOI',
      cost: '9500',
      paidBy: a.user.id,
    });
    assert.equal(put.status, 409);
    // ...but if that expense is deleted, the booking can be added again.
    await a.del(`/api/groups/${g.id}/expenses/${attempts.find((r) => r.status === 201).body.expenseId}`);
    const list = (await a.get(`/api/groups/${g.id}/bookings`)).body.items;
    assert.equal(list.find((x) => x.id === flight.id).expenseId, null);
    assert.equal((await a.post(`/api/groups/${g.id}/bookings/${flight.id}/expense`)).status, 201);
  });
});

describe('spending summary', () => {
  it('totals by category and payer, with my share and the budget', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    await a.put(`/api/groups/${g.id}/trip`, { budget: '5000' });
    const add = (who, amount, category) =>
      who.post(`/api/groups/${g.id}/expenses`, {
        description: 'x',
        amount,
        paidBy: who.user.id,
        splitType: 'equal',
        participants: [{ user: a.user.id }, { user: b.user.id }],
        category,
        date: today(),
      });
    await add(a, '1000', 'food');
    await add(b, '3000', 'stay');
    await add(a, '500', 'food');
    const s = (await a.get(`/api/groups/${g.id}/summary`)).body;
    assert.equal(s.total, 450000);
    assert.equal(s.budget, 500000);
    assert.equal(s.myShare, 225000);
    assert.deepEqual(
      s.byCategory.map((c) => [c.category, c.amount]),
      [
        ['stay', 300000],
        ['food', 150000],
      ],
    );
    assert.deepEqual(
      s.byPayer.map((p) => p.amount),
      [300000, 150000],
    );
  });
});

describe('places (map search and attractions)', () => {
  const realFetch = globalThis.fetch;
  afterEach(async () => {
    globalThis.fetch = realFetch;
    clearPlacesMemoryCache();
    await ExternalCache.deleteMany({});
  });

  it('searches places through a shared cache and identifies itself to the provider', async () => {
    const a = await newUser('A');
    let calls = 0;
    let userAgent = '';
    globalThis.fetch = async (url, opts) => {
      calls += 1;
      userAgent = opts.headers['User-Agent'];
      assert.match(String(url), /nominatim\.openstreetmap\.org\/search/);
      return Response.json([{ name: 'Goa', display_name: 'Goa, India', lat: '15.3', lon: '74.1', type: 'state' }]);
    };
    const first = await a.get('/api/places/search?q=Goa');
    assert.equal(first.status, 200);
    assert.deepEqual(first.body.results[0], {
      name: 'Goa',
      address: 'Goa, India',
      lat: 15.3,
      lng: 74.1,
      kind: 'state',
    });
    assert.match(userAgent, /Hisaab/);
    clearPlacesMemoryCache(); // simulate another serverless instance: MongoDB cache still hits
    const second = await a.get('/api/places/search?q=goa');
    assert.deepEqual(second.body, first.body);
    assert.equal(calls, 1);
    assert.equal((await a.get('/api/places/search?q=G')).status, 400);
  });

  it('lists attractions with photos first, and reports provider failures cleanly', async () => {
    const a = await newUser('A');
    globalThis.fetch = async (url) => {
      assert.match(String(url), /wikipedia\.org/);
      return Response.json({
        query: {
          pages: [
            { title: 'Some road', index: 1, coordinates: [{ lat: 15.5, lon: 73.8 }] },
            {
              title: 'Fort Aguada',
              index: 2,
              description: 'Portuguese fort',
              coordinates: [{ lat: 15.49, lon: 73.77 }],
              thumbnail: { source: 'https://upload.wikimedia.org/fort.jpg' },
              fullurl: 'https://en.wikipedia.org/wiki/Fort_Aguada',
            },
            { title: 'No coordinates', index: 3 },
          ],
        },
      });
    };
    const res = await a.get('/api/places/attractions?lat=15.49&lng=73.82');
    assert.equal(res.status, 200);
    assert.equal(res.body.results.length, 2);
    assert.equal(res.body.results[0].name, 'Fort Aguada');
    assert.equal(res.body.results[0].thumbnail, 'https://upload.wikimedia.org/fort.jpg');

    globalThis.fetch = async () => {
      throw new Error('network down');
    };
    const down = await a.get('/api/places/attractions?lat=10&lng=10');
    assert.equal(down.status, 502);
    assert.equal(down.body.error.code, 'UPSTREAM_FAILED');
    assert.equal((await a.get('/api/places/attractions?lat=999&lng=10')).status, 400);
  });
});
