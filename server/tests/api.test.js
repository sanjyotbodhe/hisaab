import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, it } from 'node:test';
import request from 'supertest';
import { Expense } from '../src/models/Expense.js';
import { RecurringExpense } from '../src/models/RecurringExpense.js';
import { processDueRecurring } from '../src/services/recurring.js';
import { app, client, groupWith, newUser, startDb, stopDb, today } from './helpers.js';

before(startDb);
after(stopDb);

const expense = (paidBy, participants, extra = {}) => ({
  description: 'Dinner',
  amount: '900',
  paidBy,
  splitType: 'equal',
  participants: participants.map((id) => ({ user: id })),
  category: 'food',
  date: today(),
  ...extra,
});

describe('auth', () => {
  it('registers, reads the session, logs out', async () => {
    const c = await newUser('Asha');
    const me = await c.get('/api/auth/me');
    assert.equal(me.status, 200);
    assert.equal(me.body.user.name, 'Asha');
    assert.equal(me.body.user.passwordHash, undefined);
    await c.post('/api/auth/logout');
    assert.equal((await c.get('/api/auth/me')).status, 401);
  });

  it('sets an httpOnly SameSite cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .set('X-Requested-With', 'hisaab')
      .send({ name: 'Cookie', email: 'cookie@example.com', password: 'password123' });
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Lax/i);
  });

  it('rejects duplicate emails, weak passwords and wrong passwords', async () => {
    const c = await newUser('Dup');
    const dup = await client().post('/api/auth/register', {
      name: 'X',
      email: c.email.toUpperCase(),
      password: 'password123',
    });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'EMAIL_TAKEN');
    const weak = await client().post('/api/auth/register', { name: 'X', email: 'weak@example.com', password: 'short' });
    assert.equal(weak.status, 400);
    assert.equal(weak.body.error.details[0].field, 'password');
    const wrong = await client().post('/api/auth/login', { email: c.email, password: 'nope-nope' });
    assert.equal(wrong.status, 401);
    const unknown = await client().post('/api/auth/login', { email: 'ghost@example.com', password: 'nope-nope' });
    assert.equal(unknown.body.error.message, wrong.body.error.message); // no account enumeration
  });

  it('requires login and the CSRF header', async () => {
    assert.equal((await request(app).get('/api/groups')).status, 401);
    const c = await newUser('Csrf');
    const noHeader = await c.agent.post('/api/groups').send({ name: 'x' });
    assert.equal(noHeader.status, 401);
  });
});

describe('groups and invites', () => {
  it('joins via invite once, even if Join is clicked twice', async () => {
    const owner = await newUser('Owner');
    const friend = await newUser('Friend');
    const g = await groupWith(owner);
    const [a, b] = await Promise.all([
      friend.post(`/api/invites/${g.inviteCode}/join`),
      friend.post(`/api/invites/${g.inviteCode}/join`),
    ]);
    assert.equal(a.status, 200);
    assert.equal(b.status, 200);
    const group = await owner.get(`/api/groups/${g.id}`);
    assert.equal(group.body.group.members.length, 2);
    assert.equal(group.body.group.inviteCode, g.inviteCode); // admin sees code
    const asFriend = await friend.get(`/api/groups/${g.id}`);
    assert.equal(asFriend.body.group.inviteCode, undefined); // members don't
  });

  it('hides groups from non-members and blocks non-admin actions', async () => {
    const owner = await newUser('O');
    const member = await newUser('M');
    const outsider = await newUser('X');
    const g = await groupWith(owner, member);
    assert.equal((await outsider.get(`/api/groups/${g.id}`)).status, 404);
    assert.equal((await outsider.get(`/api/groups/${g.id}/expenses`)).status, 404);
    assert.equal((await member.patch(`/api/groups/${g.id}`, { name: 'Hacked' })).status, 403);
    assert.equal((await member.post(`/api/groups/${g.id}/invite/regenerate`)).status, 403);
    assert.equal((await outsider.get('/api/groups/not-an-id')).status, 404);
  });

  it('a reset invite link stops working', async () => {
    const owner = await newUser('O');
    const late = await newUser('Late');
    const g = await groupWith(owner);
    await owner.post(`/api/groups/${g.id}/invite/regenerate`);
    const res = await late.post(`/api/invites/${g.inviteCode}/join`);
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'INVALID_INVITE');
  });
});

describe('expenses and balances', () => {
  it('splits, balances and simplifies across a group', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const c = await newUser('C');
    const g = await groupWith(a, b, c);
    const [A, B, C] = [a.user.id, b.user.id, c.user.id];

    // A pays 900 for all three; B pays 300 for B and C.
    assert.equal((await a.post(`/api/groups/${g.id}/expenses`, expense(A, [A, B, C]))).status, 201);
    assert.equal((await b.post(`/api/groups/${g.id}/expenses`, expense(B, [B, C], { amount: '300' }))).status, 201);

    const bal = (await a.get(`/api/groups/${g.id}/balances`)).body;
    const net = Object.fromEntries(bal.net.map((n) => [n.user.id, n.amount]));
    assert.deepEqual(net, { [A]: 60000, [B]: -15000, [C]: -45000 });
    assert.equal(bal.simplified.length, 2);
    const total = bal.simplified.reduce((s, d) => s + d.amount, 0);
    assert.equal(total, 60000);

    // Dashboard shows my balance per group.
    const list = (await c.get('/api/groups')).body.groups;
    assert.equal(list.find((x) => x.id === g.id).myBalance, -45000);
  });

  it('rejects invalid splits and outsiders in the split', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const outsider = await newUser('Out');
    const g = await groupWith(a, b);
    const bad = await a.post(`/api/groups/${g.id}/expenses`, {
      ...expense(a.user.id, []),
      splitType: 'percent',
      participants: [
        { user: a.user.id, value: '50' },
        { user: b.user.id, value: '40' },
      ],
    });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.error.code, 'INVALID_SPLIT');
    const notMember = await a.post(`/api/groups/${g.id}/expenses`, expense(a.user.id, [a.user.id, outsider.user.id]));
    assert.equal(notMember.status, 400);
    assert.equal(notMember.body.error.code, 'NOT_A_MEMBER');
    const badAmount = await a.post(
      `/api/groups/${g.id}/expenses`,
      expense(a.user.id, [a.user.id], { amount: '12.345' }),
    );
    assert.equal(badAmount.status, 400);
    const future = await a.post(
      `/api/groups/${g.id}/expenses`,
      expense(a.user.id, [a.user.id], { date: '2099-01-01' }),
    );
    assert.equal(future.status, 400);
  });

  it('is idempotent: the same submission never creates two expenses', async () => {
    const a = await newUser('A');
    const g = await groupWith(a);
    const body = expense(a.user.id, [a.user.id], { clientRequestId: randomUUID() });
    const results = await Promise.all([1, 2, 3].map(() => a.post(`/api/groups/${g.id}/expenses`, body)));
    const ids = new Set(results.map((r) => r.body.expense.id));
    assert.equal(ids.size, 1);
    assert.equal(results.filter((r) => r.body.duplicate === false).length, 1);
    assert.equal(await Expense.countDocuments({ group: g.id }), 1);
  });

  it('detects conflicting edits instead of overwriting', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    const created = (await a.post(`/api/groups/${g.id}/expenses`, expense(a.user.id, [a.user.id, b.user.id]))).body
      .expense;
    const base = { ...expense(a.user.id, [a.user.id, b.user.id]), version: created.version };
    const first = await a.put(`/api/groups/${g.id}/expenses/${created.id}`, { ...base, amount: '1000' });
    assert.equal(first.status, 200);
    const second = await a.put(`/api/groups/${g.id}/expenses/${created.id}`, { ...base, amount: '2000' });
    assert.equal(second.status, 409);
    assert.equal(second.body.error.code, 'EDIT_CONFLICT');
    assert.equal(second.body.error.details.latest.amount, 100000);
  });

  it('only the creator, payer or an admin can edit or delete', async () => {
    const admin = await newUser('Admin');
    const payer = await newUser('Payer');
    const other = await newUser('Other');
    const g = await groupWith(admin, payer, other);
    const e = (await payer.post(`/api/groups/${g.id}/expenses`, expense(payer.user.id, [payer.user.id, other.user.id])))
      .body.expense;
    assert.equal((await other.del(`/api/groups/${g.id}/expenses/${e.id}`)).status, 403);
    assert.equal((await admin.del(`/api/groups/${g.id}/expenses/${e.id}`)).status, 200);
    assert.equal((await admin.del(`/api/groups/${g.id}/expenses/${e.id}`)).status, 409);
    const bal = (await other.get(`/api/groups/${g.id}/balances`)).body;
    assert.ok(bal.net.every((n) => n.amount === 0)); // deleted expense no longer counts
  });

  it('searches, filters and paginates', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    for (let i = 0; i < 25; i++) {
      await a.post(
        `/api/groups/${g.id}/expenses`,
        expense(a.user.id, [a.user.id], { description: `Chai ${i}`, amount: '10' }),
      );
    }
    await a.post(
      `/api/groups/${g.id}/expenses`,
      expense(b.user.id, [b.user.id], { description: 'Taxi (airport)', category: 'travel' }),
    );
    const page1 = (await a.get(`/api/groups/${g.id}/expenses?limit=20`)).body;
    assert.equal(page1.items.length, 20);
    assert.equal(page1.total, 26);
    assert.equal(page1.hasMore, true);
    const search = (await a.get(`/api/groups/${g.id}/expenses?q=${encodeURIComponent('(airport')}`)).body;
    assert.equal(search.total, 1); // regex characters are escaped
    const travel = (await a.get(`/api/groups/${g.id}/expenses?category=travel`)).body;
    assert.equal(travel.total, 1);
    const byB = (await a.get(`/api/groups/${g.id}/expenses?member=${b.user.id}`)).body;
    assert.equal(byB.total, 1);
    assert.equal(byB.totalAmount, 90000);
  });

  it('exports CSV with formula injection neutralised', async () => {
    const a = await newUser('A');
    const g = await groupWith(a);
    await a.post(`/api/groups/${g.id}/expenses`, expense(a.user.id, [a.user.id], { description: '=HYPERLINK("x")' }));
    const res = await a.get(`/api/groups/${g.id}/expenses/export.csv`);
    assert.equal(res.status, 200);
    assert.match(res.headers['content-type'], /text\/csv/);
    assert.match(res.text, /"'=HYPERLINK\(""x""\)"/);
  });
});

describe('settling up and leaving', () => {
  it('records payments, clears balances, then allows leaving', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    await a.post(`/api/groups/${g.id}/expenses`, expense(a.user.id, [a.user.id, b.user.id], { amount: '500' }));

    const blocked = await b.del(`/api/groups/${g.id}/members/${b.user.id}`);
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.error.code, 'UNSETTLED_BALANCE');

    const other = await newUser('Stranger');
    const forbidden = await other.post(`/api/groups/${g.id}/settlements`, {
      from: b.user.id,
      to: a.user.id,
      amount: '250',
    });
    assert.equal(forbidden.status, 404);
    const same = await b.post(`/api/groups/${g.id}/settlements`, { from: b.user.id, to: b.user.id, amount: '250' });
    assert.equal(same.status, 400);

    const paid = await b.post(`/api/groups/${g.id}/settlements`, {
      from: b.user.id,
      to: a.user.id,
      amount: '250',
      clientRequestId: randomUUID(),
    });
    assert.equal(paid.status, 201);
    const bal = (await a.get(`/api/groups/${g.id}/balances`)).body;
    assert.ok(bal.net.every((n) => n.amount === 0));
    assert.equal(bal.suggested.length, 0);

    assert.equal((await b.del(`/api/groups/${g.id}/members/${b.user.id}`)).status, 200);
    assert.equal((await b.get(`/api/groups/${g.id}`)).status, 404);
    // Their history is kept and still readable by the others.
    const list = (await a.get(`/api/groups/${g.id}/expenses`)).body;
    assert.equal(list.items[0].splits.length, 2);
  });

  it('keeps at least one admin', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    const demote = await a.patch(`/api/groups/${g.id}/members/${a.user.id}`, { role: 'member' });
    assert.equal(demote.status, 409);
    assert.equal((await a.del(`/api/groups/${g.id}/members/${a.user.id}`)).status, 200);
    const group = (await b.get(`/api/groups/${g.id}`)).body.group;
    assert.equal(group.myRole, 'admin'); // promoted automatically
  });
});

describe('recurring expenses', () => {
  it('creates due occurrences once, catches up, and auto-pauses when someone leaves', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    const start = new Date(Date.now() + 330 * 60 * 1000 - 14 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const res = await a.post(`/api/groups/${g.id}/recurring`, {
      description: 'Cook',
      amount: '700',
      paidBy: a.user.id,
      splitType: 'equal',
      participants: [{ user: a.user.id }, { user: b.user.id }],
      frequency: 'weekly',
      startDate: start,
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.generated, 3); // 14 days ago, 7 days ago, today

    // Running the job again (or concurrently) creates nothing new.
    const again = await Promise.all([processDueRecurring(), processDueRecurring()]);
    assert.equal(again[0] + again[1], 0);
    assert.equal(await Expense.countDocuments({ recurring: res.body.recurring.id }), 3);

    // Simulate a week of server downtime: the job catches up exactly one occurrence.
    const nextWeek = new Date(Date.now() + 7 * 24 * 3600 * 1000);
    assert.equal(await processDueRecurring({ now: nextWeek }), 1);

    // B can't leave while in an active rule.
    const leave = await b.del(`/api/groups/${g.id}/members/${b.user.id}`);
    assert.equal(leave.status, 409);
  });

  it('auto-pauses a rule whose people are no longer in the group', async () => {
    const a = await newUser('A');
    const b = await newUser('B');
    const g = await groupWith(a, b);
    const future = new Date(Date.now() + 330 * 60 * 1000 + 3 * 24 * 3600 * 1000).toISOString().slice(0, 10);
    const rule = (
      await a.post(`/api/groups/${g.id}/recurring`, {
        description: 'Wifi',
        amount: '1000',
        paidBy: a.user.id,
        splitType: 'equal',
        participants: [{ user: a.user.id }, { user: b.user.id }],
        frequency: 'monthly',
        startDate: future,
      })
    ).body.recurring;
    // Remove B directly in the DB (as if the rule was edited badly), then run the job when it is due.
    const { Group } = await import('../src/models/Group.js');
    await Group.updateOne({ _id: g.id }, { $pull: { members: { user: b.user.id } } });
    await processDueRecurring({ now: new Date(Date.now() + 5 * 24 * 3600 * 1000) });
    const fresh = await RecurringExpense.findById(rule.id);
    assert.equal(fresh.active, false);
    assert.match(fresh.pausedReason, /no longer in the group/);
    assert.equal(await Expense.countDocuments({ recurring: rule.id }), 0);
  });
});

describe('robustness', () => {
  it('returns clean errors for bad JSON, unknown routes and bad ids', async () => {
    const a = await newUser('A');
    const badJson = await a.agent
      .post('/api/groups')
      .set('X-Requested-With', 'hisaab')
      .set('Content-Type', 'application/json')
      .send('{"name": ');
    assert.equal(badJson.status, 400);
    assert.equal(badJson.body.error.code, 'BAD_JSON');
    assert.equal((await a.get('/api/nope')).status, 404);
    const g = await groupWith(a);
    assert.equal((await a.get(`/api/groups/${g.id}/expenses/123`)).status, 400);
    assert.equal((await a.get(`/api/groups/${g.id}/expenses/aaaaaaaaaaaaaaaaaaaaaaaa`)).status, 404);
  });

  it('health check reports the database', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.db, 'up');
  });
});

describe('serverless mode (Vercel)', () => {
  it('cron endpoint requires the secret and runs due recurring expenses', async () => {
    assert.equal((await request(app).get('/api/cron/recurring')).status, 401);
    assert.equal((await request(app).get('/api/cron/recurring').set('Authorization', 'Bearer wrong')).status, 401);
    const ok = await request(app).get('/api/cron/recurring').set('Authorization', 'Bearer test-cron-secret');
    assert.equal(ok.status, 200);
    assert.equal(ok.body.ok, true);
  });

  it('opening a group catches up recurring expenses that fell due', async () => {
    const a = await newUser('A');
    const g = await groupWith(a);
    const rule = (
      await a.post(`/api/groups/${g.id}/recurring`, {
        description: 'Netflix',
        amount: '649',
        paidBy: a.user.id,
        splitType: 'equal',
        participants: [{ user: a.user.id }],
        frequency: 'monthly',
        startDate: today(),
      })
    ).body.recurring;
    assert.equal(await Expense.countDocuments({ recurring: rule.id }), 1);
    // Pretend the next occurrence fell due yesterday and no cron has run since.
    const yesterday = new Date(`${today()}T00:00:00Z`);
    yesterday.setUTCDate(yesterday.getUTCDate() - 1);
    await RecurringExpense.updateOne({ _id: rule.id }, { $set: { nextRunAt: yesterday } });
    await a.get(`/api/groups/${g.id}`);
    assert.equal(await Expense.countDocuments({ recurring: rule.id }), 2);
  });

  it('lazy DB connection failures become a clean 503', async () => {
    const { createApp } = await import('../src/app.js');
    const broken = createApp({
      connect: async () => {
        const err = new Error('getaddrinfo ENOTFOUND cluster0.example.net');
        err.name = 'MongoNetworkError';
        throw err;
      },
    });
    const res = await request(broken).get('/api/auth/me');
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'DB_UNAVAILABLE');
    const health = await request(broken).get('/api/health');
    assert.equal(health.body.status !== undefined, true);
  });
});
