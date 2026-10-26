import { Router } from 'express';
import { z } from 'zod';
import { objectId, validate } from '../middleware/validate.js';
import { PLAN_KINDS, PlanItem } from '../models/PlanItem.js';
import { logActivity } from '../services/activity.js';
import { calendarDateField, nameMap } from '../services/expenses.js';
import { AppError, forbidden, notFound } from '../utils/errors.js';

// Mounted at /api/groups/:groupId/plan after loadGroupMember. Any member can plan.
const router = Router({ mergeParams: true });

const time = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use a time like 09:30')
  .or(z.literal(''));

const place = z.object({
  name: z.string().trim().min(1).max(160),
  address: z.string().trim().max(300).optional().default(''),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  thumbnail: z.string().url().max(500).optional().or(z.literal('')).default(''),
  url: z.string().url().max(500).optional().or(z.literal('')).default(''),
});

const fields = {
  title: z.string().trim().min(1, 'Give it a title').max(120, 'Title is too long'),
  kind: z.enum(PLAN_KINDS).optional().default('place'),
  day: calendarDateField.nullable().optional().default(null),
  time: time.optional().default(''),
  place: place.nullable().optional().default(null),
  notes: z.string().trim().max(500, 'Notes are too long').optional().default(''),
};
const createSchema = z.object(fields);
const patchSchema = z
  .object({
    title: fields.title.optional(),
    kind: z.enum(PLAN_KINDS).optional(),
    day: calendarDateField.nullable().optional(),
    time: time.optional(),
    place: place.nullable().optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');
const idParams = z.object({ groupId: objectId, itemId: objectId });

/** A scheduled day must fall inside the trip dates, when the group has set them. */
function checkDay(group, day) {
  if (!day) return;
  const { startDate, endDate } = group.trip ?? {};
  if (startDate && endDate && (day < startDate || day > endDate)) {
    throw new AppError(400, 'OUTSIDE_TRIP', 'That day is outside the trip dates');
  }
}

function serialize(item, names, meId) {
  return {
    id: String(item._id),
    title: item.title,
    kind: item.kind,
    day: item.day ? item.day.toISOString().slice(0, 10) : null,
    time: item.time,
    place: item.place?.name ? item.place : null,
    notes: item.notes,
    votes: item.votes.length,
    votedByMe: item.votes.some((v) => String(v) === String(meId)),
    createdBy: { id: String(item.createdBy), name: names.get(String(item.createdBy)) ?? 'Former member' },
    createdAt: item.createdAt,
  };
}

router.get('/', async (req, res) => {
  const items = await PlanItem.find({ group: req.group._id }).lean();
  const names = await nameMap(items.map((i) => i.createdBy));
  const out = items.map((i) => serialize(i, names, req.user._id));
  // Itinerary in day/time order; ideas by popularity, then oldest first.
  const scheduled = out
    .filter((i) => i.day)
    .sort((a, b) => a.day.localeCompare(b.day) || (a.time || '99').localeCompare(b.time || '99'));
  const ideas = out
    .filter((i) => !i.day)
    .sort((a, b) => b.votes - a.votes || new Date(a.createdAt) - new Date(b.createdAt));
  res.json({ scheduled, ideas });
});

router.post('/', validate({ body: createSchema }), async (req, res) => {
  const body = req.valid.body;
  checkDay(req.group, body.day);
  const count = await PlanItem.countDocuments({ group: req.group._id });
  if (count >= 300) throw new AppError(409, 'PLAN_FULL', 'This trip plan already has 300 items');
  const item = await PlanItem.create({ ...body, group: req.group._id, createdBy: req.user._id });
  await logActivity(req.group, req.user, 'plan.added', {
    itemId: String(item._id),
    title: item.title,
    day: body.day ? body.day.toISOString().slice(0, 10) : null,
  });
  const names = await nameMap([item.createdBy]);
  res.status(201).json({ item: serialize(item, names, req.user._id) });
});

router.patch('/:itemId', validate({ params: idParams, body: patchSchema }), async (req, res) => {
  const body = req.valid.body;
  if (body.day !== undefined) checkDay(req.group, body.day);
  const before = await PlanItem.findOne({ _id: req.valid.params.itemId, group: req.group._id }).lean();
  if (!before) throw notFound('Plan item');
  const item = await PlanItem.findOneAndUpdate(
    { _id: before._id, group: req.group._id },
    { $set: { ...body, updatedBy: req.user._id } },
    { new: true, runValidators: true },
  ).lean();
  if (!item) throw notFound('Plan item');
  if (body.day !== undefined && String(before.day) !== String(item.day) && item.day) {
    await logActivity(req.group, req.user, 'plan.scheduled', {
      itemId: String(item._id),
      title: item.title,
      day: item.day.toISOString().slice(0, 10),
    });
  }
  const names = await nameMap([item.createdBy]);
  res.json({ item: serialize(item, names, req.user._id) });
});

// Voting is a single atomic update, so simultaneous votes are never lost or doubled.
router.post('/:itemId/vote', validate({ params: idParams, body: z.object({ up: z.boolean() }) }), async (req, res) => {
  const update = req.valid.body.up ? { $addToSet: { votes: req.user._id } } : { $pull: { votes: req.user._id } };
  const item = await PlanItem.findOneAndUpdate({ _id: req.valid.params.itemId, group: req.group._id }, update, {
    new: true,
  }).lean();
  if (!item) throw notFound('Plan item');
  const names = await nameMap([item.createdBy]);
  res.json({ item: serialize(item, names, req.user._id) });
});

router.delete('/:itemId', validate({ params: idParams }), async (req, res) => {
  const item = await PlanItem.findOne({ _id: req.valid.params.itemId, group: req.group._id });
  if (!item) throw notFound('Plan item');
  if (req.membership.role !== 'admin' && String(item.createdBy) !== String(req.user._id)) {
    throw forbidden('Only the person who added this, or a group admin, can remove it');
  }
  await PlanItem.deleteOne({ _id: item._id });
  await logActivity(req.group, req.user, 'plan.removed', { itemId: String(item._id), title: item.title });
  res.json({ ok: true });
});

export default router;
