import { Router } from 'express';
import { z } from 'zod';
import { objectId, validate } from '../middleware/validate.js';
import { CATEGORIES } from '../models/Expense.js';
import { FREQUENCIES, RecurringExpense } from '../models/RecurringExpense.js';
import { logActivity } from '../services/activity.js';
import {
  amountField,
  buildSplits,
  calendarDateField,
  canModify,
  checkExpenseRules,
  nameMap,
  participantsField,
} from '../services/expenses.js';
import { processDueRecurring } from '../services/recurring.js';
import { addDays, nextOccurrence, todayCalendar } from '../utils/dates.js';
import { AppError, forbidden, notFound } from '../utils/errors.js';
import { SPLIT_TYPES } from '../shared/split.js';

// Mounted at /api/groups/:groupId/recurring after loadGroupMember.
const router = Router({ mergeParams: true });

const createSchema = z.object({
  description: z.string().trim().min(1, 'Description is required').max(100),
  amount: amountField,
  paidBy: objectId,
  splitType: z.enum(SPLIT_TYPES),
  participants: participantsField,
  category: z.enum(CATEGORIES).optional().default('other'),
  frequency: z.enum(FREQUENCIES),
  startDate: calendarDateField,
});

const idParams = z.object({ groupId: objectId, recurringId: objectId });

function serialize(r, names) {
  const name = (id) => names.get(String(id)) ?? 'Former member';
  return {
    id: String(r._id),
    description: r.description,
    amount: r.amount,
    paidBy: { id: String(r.paidBy), name: name(r.paidBy) },
    splitType: r.splitType,
    participants: r.participants.map((p) => ({ user: { id: String(p.user), name: name(p.user) }, value: p.value })),
    category: r.category,
    frequency: r.frequency,
    nextRunAt: r.nextRunAt.toISOString().slice(0, 10),
    lastRunAt: r.lastRunAt ?? null,
    active: r.active,
    pausedReason: r.pausedReason,
    createdBy: { id: String(r.createdBy), name: name(r.createdBy) },
  };
}
const ids = (r) => [r.paidBy, r.createdBy, ...r.participants.map((p) => p.user)];

router.get('/', async (req, res) => {
  const rules = await RecurringExpense.find({ group: req.group._id }).sort({ active: -1, nextRunAt: 1 }).lean();
  const names = await nameMap(rules.flatMap(ids));
  res.json({ items: rules.map((r) => serialize(r, names)) });
});

router.post('/', validate({ body: createSchema }), async (req, res) => {
  const body = req.valid.body;
  checkExpenseRules(req.group, { paidBy: body.paidBy, participants: body.participants });
  buildSplits(body.amount, body.splitType, body.participants); // validate the split up front

  const today = todayCalendar();
  if (body.startDate < addDays(today, -31)) {
    throw new AppError(400, 'BAD_DATE', 'Start date can be at most 31 days in the past');
  }
  if (body.startDate > addDays(today, 366)) {
    throw new AppError(400, 'BAD_DATE', 'Start date can be at most a year ahead');
  }

  const rule = await RecurringExpense.create({
    group: req.group._id,
    description: body.description,
    amount: body.amount,
    paidBy: body.paidBy,
    splitType: body.splitType,
    participants: body.participants.map((p) => ({ user: p.user, value: p.value ?? null })),
    category: body.category,
    frequency: body.frequency,
    anchorDay: body.startDate.getUTCDate(),
    nextRunAt: body.startDate,
    createdBy: req.user._id,
  });
  await logActivity(req.group, req.user, 'recurring.created', {
    recurringId: String(rule._id),
    description: rule.description,
    amount: rule.amount,
    frequency: rule.frequency,
  });
  // If it starts today (or earlier), generate those expenses right away.
  const generated = await processDueRecurring({ ruleId: rule._id });
  const fresh = await RecurringExpense.findById(rule._id).lean();
  res.status(201).json({ recurring: serialize(fresh, await nameMap(ids(fresh))), generated });
});

router.patch(
  '/:recurringId',
  validate({ params: idParams, body: z.object({ active: z.boolean() }) }),
  async (req, res) => {
    const { recurringId } = req.valid.params;
    const { active } = req.valid.body;
    const rule = await RecurringExpense.findOne({ _id: recurringId, group: req.group._id });
    if (!rule) throw notFound('Recurring expense');
    if (!canModify(rule, req.user, req.membership)) {
      throw forbidden('Only the person who set this up, the payer, or a group admin can change it');
    }
    if (active && !rule.active) {
      // Resuming: re-check members, and skip any occurrences that were missed while paused.
      checkExpenseRules(req.group, {
        paidBy: String(rule.paidBy),
        participants: rule.participants.map((p) => ({ user: String(p.user) })),
      });
      const today = todayCalendar();
      let next = rule.nextRunAt;
      while (next < today) next = nextOccurrence(next, rule.frequency, rule.anchorDay);
      rule.nextRunAt = next;
      rule.pausedReason = '';
    }
    rule.active = active;
    await rule.save();
    await logActivity(req.group, req.user, active ? 'recurring.resumed' : 'recurring.paused', {
      recurringId,
      description: rule.description,
    });
    if (active) await processDueRecurring({ ruleId: rule._id });
    const fresh = await RecurringExpense.findById(rule._id).lean();
    res.json({ recurring: serialize(fresh, await nameMap(ids(fresh))) });
  },
);

router.delete('/:recurringId', validate({ params: idParams }), async (req, res) => {
  const { recurringId } = req.valid.params;
  const rule = await RecurringExpense.findOne({ _id: recurringId, group: req.group._id });
  if (!rule) throw notFound('Recurring expense');
  if (!canModify(rule, req.user, req.membership)) {
    throw forbidden('Only the person who set this up, the payer, or a group admin can delete it');
  }
  await RecurringExpense.deleteOne({ _id: rule._id });
  // Expenses it already generated stay: they are real, shared history.
  await logActivity(req.group, req.user, 'recurring.deleted', { recurringId, description: rule.description });
  res.json({ ok: true });
});

export default router;
