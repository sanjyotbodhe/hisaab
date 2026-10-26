import './setup-env.js';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { client, groupWith, newUser, startDb, stopDb, today } from './helpers.js';

before(startDb);
after(stopDb);

const addDays = (ymd, n) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** First day of the month `back` months before today's month, as YYYY-MM-DD. */
const monthsAgo = (back) => {
  const t = new Date(`${today()}T00:00:00Z`);
  return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - back, 1)).toISOString().slice(0, 10);
};
const spend = (c, groupId, body) =>
  c.post(`/api/groups/${groupId}/expenses`, { splitType: 'equal', category: 'food', date: today(), ...body });

describe('dashboard overview', () => {
  it('needs a session', async () => {
    assert.equal((await client().get('/api/me/overview')).status, 401);
  });

  it("totals the caller's own share across groups, by month and category, with what's coming up", async () => {
    const a = await newUser('Asha');
    const b = await newUser('Bina');
    const c = await newUser('Chirag');
    const flat = await groupWith(a, b);
    const trip = await groupWith(a, c);
    const ok = (r) => assert.ok(r.status === 201, `${r.status} ${JSON.stringify(r.body)}`);

    // this month: Asha's share is 450 + 1500
    ok(
      await spend(a, flat.id, {
        description: 'Dinner',
        amount: '900',
        paidBy: a.user.id,
        participants: [{ user: a.user.id }, { user: b.user.id }],
      }),
    );
    ok(
      await spend(c, trip.id, {
        description: 'Villa',
        amount: '3000',
        category: 'stay',
        paidBy: c.user.id,
        participants: [{ user: a.user.id }, { user: c.user.id }],
      }),
    );
    // not Asha's: she isn't in the split
    ok(
      await spend(b, flat.id, {
        description: 'Bina only',
        amount: '500',
        paidBy: b.user.id,
        participants: [{ user: b.user.id }],
      }),
    );
    // deleted: must not count
    const gone = await spend(a, flat.id, {
      description: 'Oops',
      amount: '9999',
      paidBy: a.user.id,
      participants: [{ user: a.user.id }],
    });
    ok(gone);
    assert.equal((await a.del(`/api/groups/${flat.id}/expenses/${gone.body.expense.id}`)).status, 200);
    // two months ago
    ok(
      await spend(a, flat.id, {
        description: 'Old groceries',
        amount: '600',
        category: 'groceries',
        date: monthsAgo(2),
        paidBy: a.user.id,
        participants: [{ user: a.user.id }, { user: b.user.id }],
      }),
    );

    // coming up: a trip in 5 days and a monthly bill in 10
    const start = addDays(today(), 5);
    assert.equal(
      (
        await a.put(`/api/groups/${trip.id}/trip`, {
          destination: { name: 'Goa', lat: 15.4, lng: 73.8 },
          startDate: start,
          endDate: addDays(start, 3),
        })
      ).status,
      200,
    );
    const rule = await a.post(`/api/groups/${trip.id}/recurring`, {
      description: 'Car rental',
      amount: '2000',
      paidBy: a.user.id,
      splitType: 'equal',
      participants: [{ user: a.user.id }, { user: c.user.id }],
      frequency: 'monthly',
      startDate: addDays(today(), 10),
    });
    assert.equal(rule.status, 201, JSON.stringify(rule.body));

    const res = await a.get('/api/me/overview');
    assert.equal(res.status, 200);
    const o = res.body;

    assert.equal(o.months.length, 6);
    assert.equal(o.months.at(-1).month, today().slice(0, 7));
    assert.equal(o.months.at(-1).amount, 195000);
    assert.equal(o.months.at(-3).month, monthsAgo(2).slice(0, 7));
    assert.equal(o.months.at(-3).amount, 30000);
    assert.equal(o.thisMonth.myShare, 195000);
    assert.equal(o.thisMonth.count, 2);
    assert.deepEqual(
      o.thisMonth.byCategory.map((x) => [x.category, x.amount]),
      [
        ['stay', 150000],
        ['food', 45000],
      ],
    );
    assert.equal(o.thisMonth.biggest.description, 'Villa');
    assert.equal(o.thisMonth.biggest.myShare, 150000);
    assert.equal(o.thisMonth.biggest.group.id, trip.id);
    assert.equal(o.lastMonth.month, monthsAgo(1).slice(0, 7));

    assert.deepEqual(
      o.upcoming.map((u) => [u.kind, u.title, u.inDays]),
      [
        ['trip', 'Goa', 5],
        ['recurring', 'Car rental', 10],
      ],
    );
    assert.equal(o.upcoming[1].amount, 200000);
    assert.ok(o.activity.length > 0 && o.activity.length <= 8);
    assert.ok(o.activity.every((x) => [flat.id, trip.id].includes(x.group.id) && x.group.name));
    assert.deepEqual(o.circle, { groups: 2, people: 2 });

    // Chirag only sees his own share and his own groups
    const co = (await c.get('/api/me/overview')).body;
    assert.equal(co.thisMonth.myShare, 150000);
    assert.equal(co.circle.groups, 1);
    assert.ok(co.activity.every((x) => x.group.id === trip.id));

    // group summary: whole-group spending per month
    const sum = (await b.get(`/api/groups/${flat.id}/summary`)).body;
    assert.equal(sum.byMonth.length, 6);
    assert.equal(sum.byMonth.at(-1).amount, 140000); // 900 + 500
    assert.equal(sum.byMonth.at(-3).amount, 60000);
  });

  it('works for a brand-new user with no groups', async () => {
    const z = await newUser('Zoya');
    const o = (await z.get('/api/me/overview')).body;
    assert.equal(o.thisMonth.myShare, 0);
    assert.equal(o.thisMonth.biggest, null);
    assert.deepEqual(o.upcoming, []);
    assert.deepEqual(o.circle, { groups: 0, people: 0 });
    assert.ok(o.months.every((m) => m.amount === 0));
  });
});
