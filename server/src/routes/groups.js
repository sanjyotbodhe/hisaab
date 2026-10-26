import { Router } from 'express';
import { z } from 'zod';
import { loadGroupMember, requireGroupAdmin } from '../middleware/group.js';
import { objectId, validate } from '../middleware/validate.js';
import { Group, generateInviteCode } from '../models/Group.js';
import { User } from '../models/User.js';
import { logActivity } from '../services/activity.js';
import { groupBalances, userNetByGroup, userNetInGroup } from '../services/balances.js';
import { nameMap } from '../services/expenses.js';
import { Activity } from '../models/Activity.js';
import { RecurringExpense } from '../models/RecurringExpense.js';
import { processDueRecurring } from '../services/recurring.js';
import { conflict, forbidden, notFound } from '../utils/errors.js';
import { formatINR } from '../../../shared/split.js';

const router = Router();

const groupBody = z.object({
  name: z.string().trim().min(1, 'Group name is required').max(60, 'Group name is too long'),
  description: z.string().trim().max(200, 'Description is too long').optional().default(''),
});

const groupPatch = z
  .object({
    name: z.string().trim().min(1, 'Group name is required').max(60).optional(),
    description: z.string().trim().max(200).optional(),
    simplifyDebts: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** Group as seen by a member: members with names, plus the caller's role. */
async function serializeGroup(group, userId) {
  const users = await User.find({ _id: { $in: group.members.map((m) => m.user) } }).lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const me = group.memberOf(userId);
  return {
    id: String(group._id),
    name: group.name,
    description: group.description,
    simplifyDebts: group.simplifyDebts,
    createdAt: group.createdAt,
    myRole: me?.role,
    // Only admins see the invite code; it is the key to the group.
    inviteCode: me?.role === 'admin' ? group.inviteCode : undefined,
    members: group.members.map((m) => {
      const u = byId.get(String(m.user));
      return {
        id: String(m.user),
        name: u?.name ?? 'Unknown user',
        email: u?.email ?? '',
        role: m.role,
        joinedAt: m.joinedAt,
      };
    }),
  };
}

// List my groups with my balance in each.
router.get('/', async (req, res) => {
  const groups = await Group.find({ 'members.user': req.user._id }).sort({ updatedAt: -1 });
  const nets = await userNetByGroup(
    groups.map((g) => g._id),
    req.user._id,
  );
  res.json({
    groups: groups.map((g) => ({
      id: String(g._id),
      name: g.name,
      description: g.description,
      memberCount: g.members.length,
      myRole: g.memberOf(req.user._id)?.role,
      myBalance: nets.get(String(g._id)) || 0,
      updatedAt: g.updatedAt,
    })),
  });
});

router.post('/', validate({ body: groupBody }), async (req, res) => {
  const group = await Group.create({
    ...req.valid.body,
    createdBy: req.user._id,
    members: [{ user: req.user._id, role: 'admin' }],
  });
  await logActivity(group, req.user, 'group.created', { name: group.name });
  res.status(201).json({ group: await serializeGroup(group, req.user._id) });
});

router.get('/:groupId', loadGroupMember, async (req, res) => {
  // Catch up on recurring expenses that fell due since the last scheduled run.
  try {
    await processDueRecurring({ groupId: req.group._id });
  } catch (err) {
    console.error('[recurring] catch-up on open failed:', err.message);
  }
  res.json({ group: await serializeGroup(req.group, req.user._id) });
});

router.patch('/:groupId', loadGroupMember, requireGroupAdmin, validate({ body: groupPatch }), async (req, res) => {
  const before = { name: req.group.name, simplifyDebts: req.group.simplifyDebts };
  Object.assign(req.group, req.valid.body);
  await req.group.save();
  await logActivity(req.group, req.user, 'group.updated', { before, changes: req.valid.body });
  res.json({ group: await serializeGroup(req.group, req.user._id) });
});

router.get('/:groupId/balances', loadGroupMember, async (req, res) => {
  const balances = await groupBalances(req.group);
  const ids = [...balances.net.map((n) => n.user), ...balances.pairwise.flatMap((d) => [d.from, d.to])];
  const names = await nameMap(ids);
  const person = (id) => ({ id, name: names.get(id) ?? 'Former member' });
  const debt = (d) => ({ from: person(d.from), to: person(d.to), amount: d.amount });
  res.json({
    simplifyDebts: req.group.simplifyDebts,
    net: balances.net.map((n) => ({ user: person(n.user), amount: n.amount })),
    simplified: balances.simplified.map(debt),
    pairwise: balances.pairwise.map(debt),
    suggested: balances.suggested.map(debt),
  });
});

router.get(
  '/:groupId/activity',
  loadGroupMember,
  validate({
    query: z.object({
      before: z.iso.datetime({ offset: true }).optional(),
      limit: z.coerce.number().int().min(1).max(50).optional().default(30),
    }),
  }),
  async (req, res) => {
    const { before, limit } = req.valid.query;
    const filter = { group: req.group._id, ...(before && { createdAt: { $lt: new Date(before) } }) };
    // Fetch one extra row to know whether there is another page.
    const rows = await Activity.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .lean();
    const page = rows.slice(0, limit);
    const names = await nameMap(page.filter((a) => a.actor).map((a) => a.actor));
    res.json({
      items: page.map((a) => ({
        id: String(a._id),
        type: a.type,
        actor: a.actor ? { id: String(a.actor), name: names.get(String(a.actor)) ?? 'Former member' } : null,
        meta: a.meta,
        createdAt: a.createdAt,
      })),
      nextBefore: rows.length > limit ? page[page.length - 1].createdAt.toISOString() : null,
    });
  },
);

router.post('/:groupId/invite/regenerate', loadGroupMember, requireGroupAdmin, async (req, res) => {
  req.group.inviteCode = generateInviteCode();
  await req.group.save();
  await logActivity(req.group, req.user, 'invite.regenerated');
  res.json({ inviteCode: req.group.inviteCode });
});

router.patch(
  '/:groupId/members/:userId',
  loadGroupMember,
  requireGroupAdmin,
  validate({
    params: z.object({ groupId: objectId, userId: objectId }),
    body: z.object({ role: z.enum(['admin', 'member']) }),
  }),
  async (req, res) => {
    const { userId } = req.valid.params;
    const { role } = req.valid.body;
    const target = req.group.memberOf(userId);
    if (!target) throw notFound('Member');
    if (target.role === role) return res.json({ group: await serializeGroup(req.group, req.user._id) });
    if (role === 'member' && req.group.members.filter((m) => m.role === 'admin').length === 1) {
      throw conflict('A group needs at least one admin. Make someone else admin first.', 'LAST_ADMIN');
    }
    // Atomic, conditional update so two admins acting at once can't race.
    const updated = await Group.findOneAndUpdate(
      { _id: req.group._id, 'members.user': userId },
      { $set: { 'members.$.role': role } },
      { new: true },
    );
    const user = await User.findById(userId).lean();
    await logActivity(req.group, req.user, 'member.role_changed', { userId, name: user?.name, role });
    res.json({ group: await serializeGroup(updated, req.user._id) });
  },
);

/**
 * Leave the group (userId = me) or remove someone (admins only).
 * Blocked while the person has an unsettled balance, otherwise money would vanish.
 */
router.delete(
  '/:groupId/members/:userId',
  loadGroupMember,
  validate({ params: z.object({ groupId: objectId, userId: objectId }) }),
  async (req, res) => {
    const { userId } = req.valid.params;
    const isSelf = String(req.user._id) === userId;
    if (!isSelf && req.membership.role !== 'admin') throw forbidden('Only group admins can remove members');
    const target = req.group.memberOf(userId);
    if (!target) throw notFound('Member');

    const balance = await userNetInGroup(req.group._id, userId);
    if (balance !== 0) {
      const who = isSelf ? 'You have' : 'This member has';
      throw conflict(
        `${who} an unsettled balance of ${formatINR(Math.abs(balance))}. Settle up before leaving the group.`,
        'UNSETTLED_BALANCE',
        { balance },
      );
    }
    const active = await RecurringExpense.exists({
      group: req.group._id,
      active: true,
      $or: [{ paidBy: userId }, { 'participants.user': userId }],
    });
    if (active) {
      throw conflict('This person is part of an active recurring expense. Pause or edit it first.', 'IN_RECURRING');
    }

    const remaining = req.group.members.filter((m) => String(m.user) !== userId);
    if (remaining.length === 0) {
      // Last person out: the group has no balances and no one to see it.
      await Group.deleteOne({ _id: req.group._id });
      return res.json({ ok: true, groupDeleted: true });
    }
    // Never leave a group without an admin: promote the longest-standing member.
    if (!remaining.some((m) => m.role === 'admin')) {
      remaining.sort((a, b) => a.joinedAt - b.joinedAt)[0].role = 'admin';
    }
    req.group.members = remaining;
    await req.group.save();
    const user = await User.findById(userId).lean();
    await logActivity(req.group, req.user, isSelf ? 'member.left' : 'member.removed', {
      userId,
      name: user?.name,
    });
    res.json({ ok: true, groupDeleted: false });
  },
);

export default router;
