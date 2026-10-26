import { Router } from 'express';
import { z } from 'zod';
import { objectId, validate } from '../middleware/validate.js';
import { Settlement } from '../models/Settlement.js';
import { logActivity } from '../services/activity.js';
import { amountField, calendarDateField, nameMap } from '../services/expenses.js';
import { addDays, todayCalendar } from '../utils/dates.js';
import { AppError, conflict, forbidden, notFound } from '../utils/errors.js';

// Mounted at /api/groups/:groupId/settlements after loadGroupMember.
const router = Router({ mergeParams: true });

const createSchema = z.object({
  from: objectId,
  to: objectId,
  amount: amountField,
  note: z.string().trim().max(200, 'Note is too long').optional().default(''),
  date: calendarDateField.optional(),
  clientRequestId: z.uuid('Invalid request id').optional(),
});

function serialize(s, names) {
  const name = (id) => names.get(String(id)) ?? 'Former member';
  return {
    id: String(s._id),
    from: { id: String(s.from), name: name(s.from) },
    to: { id: String(s.to), name: name(s.to) },
    amount: s.amount,
    note: s.note,
    date: s.date.toISOString().slice(0, 10),
    createdBy: { id: String(s.createdBy), name: name(s.createdBy) },
    createdAt: s.createdAt,
  };
}

const userIds = (s) => [s.from, s.to, s.createdBy];

router.get('/', async (req, res) => {
  const items = await Settlement.find({ group: req.group._id, deletedAt: null })
    .sort({ date: -1, createdAt: -1 })
    .limit(100)
    .lean();
  const names = await nameMap(items.flatMap(userIds));
  res.json({ items: items.map((s) => serialize(s, names)) });
});

router.post('/', validate({ body: createSchema }), async (req, res) => {
  const body = req.valid.body;
  const me = String(req.user._id);
  if (body.from === body.to) throw new AppError(400, 'SAME_PERSON', 'Payer and receiver must be different people');
  const memberIds = new Set(req.group.members.map((m) => String(m.user)));
  if (!memberIds.has(body.from) || !memberIds.has(body.to)) {
    throw new AppError(400, 'NOT_A_MEMBER', 'Both people must be members of this group');
  }
  // You can record payments you made or received. Admins can record any payment.
  if (req.membership.role !== 'admin' && body.from !== me && body.to !== me) {
    throw forbidden('You can only record payments you made or received');
  }
  const date = body.date ?? todayCalendar();
  if (date > addDays(todayCalendar(), 1)) throw new AppError(400, 'BAD_DATE', 'Payment date cannot be in the future');

  if (body.clientRequestId) {
    const existing = await Settlement.findOne({ group: req.group._id, clientRequestId: body.clientRequestId }).lean();
    if (existing) {
      return res.status(200).json({ settlement: serialize(existing, await nameMap(userIds(existing))), duplicate: true });
    }
  }
  let settlement;
  try {
    settlement = await Settlement.create({
      group: req.group._id,
      from: body.from,
      to: body.to,
      amount: body.amount,
      note: body.note,
      date,
      createdBy: req.user._id,
      clientRequestId: body.clientRequestId,
    });
  } catch (err) {
    if (err?.code === 11000 && body.clientRequestId) {
      const existing = await Settlement.findOne({ group: req.group._id, clientRequestId: body.clientRequestId }).lean();
      return res.status(200).json({ settlement: serialize(existing, await nameMap(userIds(existing))), duplicate: true });
    }
    throw err;
  }
  const names = await nameMap(userIds(settlement));
  await logActivity(req.group, req.user, 'settlement.created', {
    settlementId: String(settlement._id),
    from: names.get(body.from),
    to: names.get(body.to),
    amount: settlement.amount,
  });
  res.status(201).json({ settlement: serialize(settlement, names), duplicate: false });
});

router.delete(
  '/:settlementId',
  validate({ params: z.object({ groupId: objectId, settlementId: objectId }) }),
  async (req, res) => {
    const { settlementId } = req.valid.params;
    const s = await Settlement.findOne({ _id: settlementId, group: req.group._id }).lean();
    if (!s) throw notFound('Payment');
    if (s.deletedAt) throw conflict('This payment was already removed', 'ALREADY_DELETED');
    if (req.membership.role !== 'admin' && String(s.createdBy) !== String(req.user._id)) {
      throw forbidden('Only the person who recorded this payment, or a group admin, can remove it');
    }
    const done = await Settlement.findOneAndUpdate(
      { _id: settlementId, deletedAt: null },
      { $set: { deletedAt: new Date(), deletedBy: req.user._id } },
    );
    if (!done) throw conflict('This payment was already removed', 'ALREADY_DELETED');
    const names = await nameMap(userIds(s));
    await logActivity(req.group, req.user, 'settlement.deleted', {
      settlementId,
      from: names.get(String(s.from)),
      to: names.get(String(s.to)),
      amount: s.amount,
    });
    res.json({ ok: true });
  },
);

export default router;
