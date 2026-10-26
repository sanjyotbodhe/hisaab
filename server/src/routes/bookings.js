import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { objectId, validate } from '../middleware/validate.js';
import { BOOKING_TYPES, Booking } from '../models/Booking.js';
import { Expense } from '../models/Expense.js';
import { logActivity } from '../services/activity.js';
import { amountField, calendarDateField, nameMap } from '../services/expenses.js';
import { computeSplits } from '../shared/split.js';
import { todayCalendar } from '../utils/dates.js';
import { AppError, conflict, forbidden, notFound } from '../utils/errors.js';

// Mounted at /api/groups/:groupId/bookings after loadGroupMember.
const router = Router({ mergeParams: true });

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30')
  .or(z.literal(''));

const bookingSchema = z.object({
  type: z.enum(BOOKING_TYPES),
  title: z.string().trim().min(1, 'Give the booking a title').max(120, 'Title is too long'),
  provider: z.string().trim().max(80).optional().default(''),
  reference: z.string().trim().max(60).optional().default(''),
  startDate: calendarDateField.nullable().optional().default(null),
  startTime: time.optional().default(''),
  endDate: calendarDateField.nullable().optional().default(null),
  endTime: time.optional().default(''),
  location: z.string().trim().max(160).optional().default(''),
  cost: z
    .union([amountField, z.literal(''), z.null()])
    .optional()
    .default(''),
  paidBy: objectId.nullable().optional().default(null),
  notes: z.string().trim().max(500).optional().default(''),
});
const idParams = z.object({ groupId: objectId, bookingId: objectId });

/** Which expense category a booking becomes. */
const CATEGORY = {
  flight: 'travel',
  train: 'travel',
  bus: 'travel',
  hotel: 'stay',
  activity: 'entertainment',
  other: 'other',
};

function checkBooking(group, b) {
  if (b.endDate && b.startDate && b.endDate < b.startDate) {
    throw new AppError(400, 'BAD_DATE', 'The end date must be after the start date');
  }
  if (b.paidBy && !group.memberOf(b.paidBy)) {
    throw new AppError(400, 'NOT_A_MEMBER', 'The person who paid must be a member of this group');
  }
}

function serialize(b, names) {
  const ymd = (d) => (d ? d.toISOString().slice(0, 10) : null);
  return {
    id: String(b._id),
    type: b.type,
    title: b.title,
    provider: b.provider,
    reference: b.reference,
    startDate: ymd(b.startDate),
    startTime: b.startTime,
    endDate: ymd(b.endDate),
    endTime: b.endTime,
    location: b.location,
    cost: b.cost,
    paidBy: b.paidBy ? { id: String(b.paidBy), name: names.get(String(b.paidBy)) ?? 'Former member' } : null,
    notes: b.notes,
    expenseId: b.expense ? String(b.expense) : null,
    createdBy: { id: String(b.createdBy), name: names.get(String(b.createdBy)) ?? 'Former member' },
  };
}
const ids = (b) => [b.createdBy, b.paidBy].filter(Boolean);

router.get('/', async (req, res) => {
  const items = await Booking.find({ group: req.group._id }).sort({ startDate: 1, startTime: 1, createdAt: 1 }).lean();
  // A linked expense that was deleted no longer counts, so the booking can be added again.
  const linked = items.filter((b) => b.expense).map((b) => b.expense);
  const live = new Set(
    (await Expense.find({ _id: { $in: linked }, deletedAt: null }, { _id: 1 }).lean()).map((e) => String(e._id)),
  );
  for (const b of items) if (b.expense && !live.has(String(b.expense))) b.expense = null;
  const names = await nameMap(items.flatMap(ids));
  res.json({ items: items.map((b) => serialize(b, names)) });
});

router.post('/', validate({ body: bookingSchema }), async (req, res) => {
  const body = { ...req.valid.body, cost: req.valid.body.cost || 0 };
  checkBooking(req.group, body);
  const booking = await Booking.create({ ...body, group: req.group._id, createdBy: req.user._id });
  await logActivity(req.group, req.user, 'booking.added', {
    bookingId: String(booking._id),
    title: booking.title,
    type: booking.type,
  });
  res.status(201).json({ booking: serialize(booking, await nameMap(ids(booking))) });
});

router.put('/:bookingId', validate({ params: idParams, body: bookingSchema }), async (req, res) => {
  const body = { ...req.valid.body, cost: req.valid.body.cost || 0 };
  checkBooking(req.group, body);
  const existing = await Booking.findOne({ _id: req.valid.params.bookingId, group: req.group._id });
  if (!existing) throw notFound('Booking');
  const costChanged = body.cost !== existing.cost || String(body.paidBy) !== String(existing.paidBy);
  if (costChanged && existing.expense && (await Expense.exists({ _id: existing.expense, deletedAt: null }))) {
    throw conflict(
      'This booking is already an expense. Edit the expense to change the cost or who paid.',
      'ALREADY_EXPENSED',
    );
  }
  Object.assign(existing, body);
  await existing.save();
  res.json({ booking: serialize(existing, await nameMap(ids(existing))) });
});

router.delete('/:bookingId', validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findOne({ _id: req.valid.params.bookingId, group: req.group._id });
  if (!b) throw notFound('Booking');
  if (req.membership.role !== 'admin' && String(b.createdBy) !== String(req.user._id)) {
    throw forbidden('Only the person who added this booking, or a group admin, can remove it');
  }
  await Booking.deleteOne({ _id: b._id });
  // An expense created from it stays: it is real shared spending.
  await logActivity(req.group, req.user, 'booking.removed', { bookingId: String(b._id), title: b.title });
  res.json({ ok: true });
});

/**
 * Turn a booking into a shared expense, split equally between all current members.
 * Exactly once: the booking is claimed with a conditional update before the expense
 * is written, so double-clicks and concurrent requests can't create two expenses.
 */
router.post('/:bookingId/expense', validate({ params: idParams }), async (req, res) => {
  const b = await Booking.findOne({ _id: req.valid.params.bookingId, group: req.group._id });
  if (!b) throw notFound('Booking');
  if (!b.cost) throw new AppError(400, 'NO_COST', 'Add the cost to this booking first');
  if (!b.paidBy || !req.group.memberOf(b.paidBy)) {
    throw new AppError(400, 'NO_PAYER', 'Set who paid for this booking (they must still be in the group)');
  }

  if (b.expense && !(await Expense.exists({ _id: b.expense, deletedAt: null }))) {
    // The earlier expense was deleted: release the link (conditionally, in case of a race).
    await Booking.updateOne({ _id: b._id, expense: b.expense }, { $set: { expense: null } });
  }
  const expenseId = new mongoose.Types.ObjectId();
  const claimed = await Booking.findOneAndUpdate({ _id: b._id, expense: null }, { $set: { expense: expenseId } });
  if (!claimed) {
    throw conflict('This booking was already added as an expense', 'ALREADY_EXPENSED', {
      expenseId: String((await Booking.findById(b._id).lean())?.expense ?? ''),
    });
  }
  try {
    const participants = req.group.members.map((m) => ({ user: String(m.user) }));
    const expense = await Expense.create({
      _id: expenseId,
      group: req.group._id,
      description: `${b.title}${b.reference ? ` (${b.reference})` : ''}`.slice(0, 100),
      notes: `From booking${b.provider ? ` with ${b.provider}` : ''}`,
      amount: b.cost,
      paidBy: b.paidBy,
      splitType: 'equal',
      splits: computeSplits(b.cost, 'equal', participants),
      category: CATEGORY[b.type],
      date: todayCalendar(),
      createdBy: req.user._id,
    });
    await logActivity(req.group, req.user, 'booking.expensed', {
      bookingId: String(b._id),
      title: b.title,
      amount: b.cost,
      expenseId: String(expense._id),
    });
    res.status(201).json({ expenseId: String(expense._id) });
  } catch (err) {
    // Release the claim so the user can try again.
    await Booking.updateOne({ _id: b._id, expense: expenseId }, { $set: { expense: null } });
    throw err;
  }
});

export default router;
