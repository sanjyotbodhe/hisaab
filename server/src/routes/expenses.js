import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { objectId, validate } from '../middleware/validate.js';
import { CATEGORIES, Expense } from '../models/Expense.js';
import { logActivity } from '../services/activity.js';
import {
  buildSplits,
  canModify,
  checkExpenseRules,
  createExpenseSchema,
  expenseUserIds,
  nameMap,
  serializeExpense,
  updateExpenseSchema,
} from '../services/expenses.js';
import { parseCalendarDate } from '../utils/dates.js';
import { AppError, badRequest, conflict, forbidden, notFound } from '../utils/errors.js';
import { fromPaise } from '../../../shared/split.js';

// Mounted at /api/groups/:groupId/expenses after loadGroupMember (req.group, req.membership).
const router = Router({ mergeParams: true });

const idParams = z.object({ groupId: objectId, expenseId: objectId });

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(CATEGORIES).optional(),
  member: objectId.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10000).optional().default(1),
  limit: z.coerce.number().int().min(1).max(50).optional().default(20),
});

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function listFilter(group, query) {
  const filter = { group: group._id, deletedAt: null };
  if (query.q) {
    const rx = new RegExp(escapeRegex(query.q), 'i');
    filter.$or = [{ description: rx }, { notes: rx }];
  }
  if (query.category) filter.category = query.category;
  if (query.member) {
    // Explicit ObjectId: this filter is also used in an aggregation, which does not auto-cast.
    const member = new mongoose.Types.ObjectId(query.member);
    filter.$and = [{ $or: [{ paidBy: member }, { 'splits.user': member }] }];
  }
  const from = query.from ? parseCalendarDate(query.from) : null;
  const to = query.to ? parseCalendarDate(query.to) : null;
  if (query.from && !from) throw badRequest('Invalid "from" date');
  if (query.to && !to) throw badRequest('Invalid "to" date');
  if (from && to && from > to) throw badRequest('"From" date must be before "to" date');
  if (from || to) filter.date = { ...(from && { $gte: from }), ...(to && { $lte: to }) };
  return filter;
}

router.get('/', validate({ query: listQuery }), async (req, res) => {
  const query = req.valid.query;
  const filter = listFilter(req.group, query);
  const [items, total, totals] = await Promise.all([
    Expense.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Expense.countDocuments(filter),
    Expense.aggregate([{ $match: filter }, { $group: { _id: null, sum: { $sum: '$amount' } } }]),
  ]);
  const names = await nameMap(items.flatMap(expenseUserIds));
  res.json({
    items: items.map((e) => serializeExpense(e, names)),
    page: query.page,
    limit: query.limit,
    total,
    totalAmount: totals[0]?.sum ?? 0,
    hasMore: query.page * query.limit < total,
  });
});

// CSV export of every (non-deleted) expense, one column per member's share.
router.get('/export.csv', async (req, res) => {
  const expenses = await Expense.find({ group: req.group._id, deletedAt: null }).sort({ date: 1, createdAt: 1 }).lean();
  const memberIds = [...new Set([...req.group.members.map((m) => String(m.user)), ...expenses.flatMap((e) => e.splits.map((s) => String(s.user)))])];
  const names = await nameMap([...memberIds, ...expenses.map((e) => e.paidBy)]);

  // Quote every cell and neutralise spreadsheet formula injection (=, +, -, @).
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ['Date', 'Description', 'Category', 'Amount (INR)', 'Paid by', 'Split type', ...memberIds.map((id) => `${names.get(id) ?? 'Former member'} share`)];
  const rows = expenses.map((e) => {
    const shares = new Map(e.splits.map((s) => [String(s.user), s.amount]));
    return [
      e.date.toISOString().slice(0, 10),
      e.description,
      e.category,
      fromPaise(e.amount),
      names.get(String(e.paidBy)) ?? 'Former member',
      e.splitType,
      ...memberIds.map((id) => (shares.has(id) ? fromPaise(shares.get(id)) : '')),
    ];
  });
  const csv = [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n');
  const safeName = req.group.name.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'group';
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}-expenses.csv"`);
  res.send(`﻿${csv}`); // BOM so Excel reads ₹ and names correctly
});

router.post('/', validate({ body: createExpenseSchema }), async (req, res) => {
  const body = req.valid.body;
  checkExpenseRules(req.group, body);
  const splits = buildSplits(body.amount, body.splitType, body.participants);

  // Idempotency: the same form submission returns the expense it already created.
  if (body.clientRequestId) {
    const existing = await Expense.findOne({ group: req.group._id, clientRequestId: body.clientRequestId }).lean();
    if (existing) {
      const names = await nameMap(expenseUserIds(existing));
      return res.status(200).json({ expense: serializeExpense(existing, names), duplicate: true });
    }
  }

  let expense;
  try {
    expense = await Expense.create({
      group: req.group._id,
      description: body.description,
      notes: body.notes,
      amount: body.amount,
      paidBy: body.paidBy,
      splitType: body.splitType,
      splits,
      category: body.category,
      date: body.date,
      createdBy: req.user._id,
      clientRequestId: body.clientRequestId,
    });
  } catch (err) {
    // Two identical requests raced past the findOne above: the unique index caught it.
    if (err?.code === 11000 && body.clientRequestId) {
      const existing = await Expense.findOne({ group: req.group._id, clientRequestId: body.clientRequestId }).lean();
      const names = await nameMap(expenseUserIds(existing));
      return res.status(200).json({ expense: serializeExpense(existing, names), duplicate: true });
    }
    throw err;
  }
  await logActivity(req.group, req.user, 'expense.created', {
    expenseId: String(expense._id),
    description: expense.description,
    amount: expense.amount,
  });
  const names = await nameMap(expenseUserIds(expense));
  res.status(201).json({ expense: serializeExpense(expense.toObject(), names), duplicate: false });
});

router.get('/:expenseId', validate({ params: idParams }), async (req, res) => {
  const e = await Expense.findOne({ _id: req.valid.params.expenseId, group: req.group._id, deletedAt: null }).lean();
  if (!e) throw notFound('Expense');
  const names = await nameMap(expenseUserIds(e));
  res.json({ expense: serializeExpense(e, names), canEdit: canModify(e, req.user, req.membership) });
});

router.put('/:expenseId', validate({ params: idParams, body: updateExpenseSchema }), async (req, res) => {
  const { expenseId } = req.valid.params;
  const body = req.valid.body;
  const current = await Expense.findOne({ _id: expenseId, group: req.group._id, deletedAt: null }).lean();
  if (!current) throw notFound('Expense');
  if (!canModify(current, req.user, req.membership)) {
    throw forbidden('Only the person who added or paid for this expense, or a group admin, can edit it');
  }
  checkExpenseRules(req.group, body);
  const splits = buildSplits(body.amount, body.splitType, body.participants);

  // Optimistic concurrency: only apply the edit if nobody changed the expense since
  // this user opened it. Otherwise their edit would silently overwrite someone else's.
  const updated = await Expense.findOneAndUpdate(
    { _id: expenseId, group: req.group._id, deletedAt: null, __v: body.version },
    {
      $set: {
        description: body.description,
        notes: body.notes,
        amount: body.amount,
        paidBy: body.paidBy,
        splitType: body.splitType,
        splits,
        category: body.category,
        date: body.date,
        updatedBy: req.user._id,
      },
      $inc: { __v: 1 },
    },
    { new: true, runValidators: true },
  ).lean();

  if (!updated) {
    const latest = await Expense.findOne({ _id: expenseId, group: req.group._id }).lean();
    if (!latest || latest.deletedAt) throw notFound('Expense');
    const names = await nameMap(expenseUserIds(latest));
    throw new AppError(
      409,
      'EDIT_CONFLICT',
      'Someone else changed this expense while you were editing. Review the latest version and try again.',
      { latest: serializeExpense(latest, names) },
    );
  }
  await logActivity(req.group, req.user, 'expense.updated', {
    expenseId,
    description: updated.description,
    amount: updated.amount,
    previousAmount: current.amount,
  });
  const names = await nameMap(expenseUserIds(updated));
  res.json({ expense: serializeExpense(updated, names) });
});

router.delete('/:expenseId', validate({ params: idParams }), async (req, res) => {
  const { expenseId } = req.valid.params;
  const current = await Expense.findOne({ _id: expenseId, group: req.group._id }).lean();
  if (!current) throw notFound('Expense');
  if (current.deletedAt) throw conflict('This expense was already deleted', 'ALREADY_DELETED');
  if (!canModify(current, req.user, req.membership)) {
    throw forbidden('Only the person who added or paid for this expense, or a group admin, can delete it');
  }
  const deleted = await Expense.findOneAndUpdate(
    { _id: expenseId, deletedAt: null },
    { $set: { deletedAt: new Date(), deletedBy: req.user._id }, $inc: { __v: 1 } },
    { new: true },
  );
  if (!deleted) throw conflict('This expense was already deleted', 'ALREADY_DELETED');
  await logActivity(req.group, req.user, 'expense.deleted', {
    expenseId,
    description: current.description,
    amount: current.amount,
  });
  res.json({ ok: true });
});

export default router;
