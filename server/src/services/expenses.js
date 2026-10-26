import { z } from 'zod';
import { CATEGORIES } from '../models/Expense.js';
import { User } from '../models/User.js';
import { SPLIT_TYPES, computeSplits, toPaise, MAX_AMOUNT_PAISE } from '../../../shared/split.js';
import { objectId } from '../middleware/validate.js';
import { addDays, parseCalendarDate, todayCalendar } from '../utils/dates.js';
import { AppError } from '../utils/errors.js';

export const amountField = z
  .union([z.string(), z.number()])
  .transform((v, ctx) => {
    const paise = toPaise(v);
    if (Number.isNaN(paise) || paise <= 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter an amount greater than 0 with up to 2 decimals' });
      return z.NEVER;
    }
    if (paise > MAX_AMOUNT_PAISE) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Amount is too large (max ₹1,00,00,000)' });
      return z.NEVER;
    }
    return paise;
  });

export const calendarDateField = z.string().transform((v, ctx) => {
  const d = parseCalendarDate(v);
  if (!d) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Enter a valid date (YYYY-MM-DD)' });
    return z.NEVER;
  }
  return d;
});

export const participantsField = z
  .array(
    z.object({
      user: objectId,
      value: z.union([z.string().trim().max(20), z.number()]).nullable().optional(),
    }),
  )
  .min(1, 'Pick at least one person to split with')
  .max(50, 'Too many people in one split');

const expenseFields = {
  description: z.string().trim().min(1, 'Description is required').max(100, 'Description is too long'),
  notes: z.string().trim().max(500, 'Notes are too long').optional().default(''),
  amount: amountField,
  paidBy: objectId,
  splitType: z.enum(SPLIT_TYPES),
  participants: participantsField,
  category: z.enum(CATEGORIES).optional().default('other'),
  date: calendarDateField,
};

export const createExpenseSchema = z.object({
  ...expenseFields,
  clientRequestId: z.string().uuid('Invalid request id').optional(),
});

export const updateExpenseSchema = z.object({
  ...expenseFields,
  version: z.number().int().min(0),
});

/** Business rules that need the group: people must be members, date must be sensible. */
export function checkExpenseRules(group, { paidBy, participants, date }) {
  const memberIds = new Set(group.members.map((m) => String(m.user)));
  if (!memberIds.has(paidBy)) {
    throw new AppError(400, 'NOT_A_MEMBER', 'The person who paid is not a member of this group');
  }
  const outsider = participants.find((p) => !memberIds.has(p.user));
  if (outsider) {
    throw new AppError(400, 'NOT_A_MEMBER', 'Everyone in the split must be a member of this group');
  }
  if (date) {
    const today = todayCalendar();
    if (date > addDays(today, 1)) throw new AppError(400, 'BAD_DATE', 'Expense date cannot be in the future');
    if (date < new Date(Date.UTC(2000, 0, 1))) throw new AppError(400, 'BAD_DATE', 'Expense date is too far in the past');
  }
}

/** Validates the split and returns what is stored on the expense. */
export function buildSplits(amount, splitType, participants) {
  return computeSplits(amount, splitType, participants);
}

export function canModify(expenseLike, user, membership) {
  const uid = String(user._id);
  return (
    membership.role === 'admin' || String(expenseLike.createdBy) === uid || String(expenseLike.paidBy) === uid
  );
}

/** Resolve user ids to names, including people who have since left the group. */
export async function nameMap(ids) {
  const unique = [...new Set(ids.map(String))];
  const users = await User.find({ _id: { $in: unique } }, { name: 1 }).lean();
  return new Map(users.map((u) => [String(u._id), u.name]));
}

export function serializeExpense(e, names) {
  const name = (id) => names.get(String(id)) ?? 'Former member';
  return {
    id: String(e._id),
    description: e.description,
    notes: e.notes,
    amount: e.amount,
    paidBy: { id: String(e.paidBy), name: name(e.paidBy) },
    splitType: e.splitType,
    splits: e.splits.map((s) => ({ user: { id: String(s.user), name: name(s.user) }, amount: s.amount, value: s.value })),
    category: e.category,
    date: e.date.toISOString().slice(0, 10),
    createdBy: { id: String(e.createdBy), name: name(e.createdBy) },
    recurring: e.recurring ? String(e.recurring) : null,
    version: e.__v,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export const expenseUserIds = (e) => [e.paidBy, e.createdBy, ...e.splits.map((s) => s.user)];
