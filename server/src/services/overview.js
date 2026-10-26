import { Activity } from '../models/Activity.js';
import { Expense } from '../models/Expense.js';
import { Group } from '../models/Group.js';
import { RecurringExpense } from '../models/RecurringExpense.js';
import { addDays, todayCalendar, toCalendarString } from '../utils/dates.js';
import { nameMap } from './expenses.js';

const MONTHS = 6;
const UPCOMING_DAYS = 45;
const DAY = 24 * 60 * 60 * 1000;

/** "2026-10" for a calendar date stored as UTC midnight. */
const monthKey = (d) => d.toISOString().slice(0, 7);

/** First day of the month `back` months before the month containing `date`. */
function monthStart(date, back = 0) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - back, 1));
}

/** The last `count` month keys, oldest first, ending with the month of `today`. */
export function lastMonthKeys(today, count = MONTHS) {
  return Array.from({ length: count }, (_, i) => monthKey(monthStart(today, count - 1 - i)));
}

/**
 * Totals per month for a set of expenses: `field` is either the whole amount (group view)
 * or the caller's own share (personal view). Months with no spending are returned as 0.
 */
export async function monthlyTotals({ match, userId = null, today = todayCalendar() }) {
  const keys = lastMonthKeys(today);
  const since = monthStart(today, MONTHS - 1);
  const pipeline = [{ $match: { ...match, deletedAt: null, date: { $gte: since } } }];
  if (userId) pipeline.push({ $unwind: '$splits' }, { $match: { 'splits.user': userId } });
  pipeline.push({
    $group: {
      _id: { $dateToString: { format: '%Y-%m', date: '$date' } },
      amount: { $sum: userId ? '$splits.amount' : '$amount' },
      count: { $sum: 1 },
    },
  });
  const rows = new Map((await Expense.aggregate(pipeline)).map((r) => [r._id, r]));
  return keys.map((month) => ({ month, amount: rows.get(month)?.amount ?? 0, count: rows.get(month)?.count ?? 0 }));
}

/**
 * Everything the dashboard shows about the signed-in user across all their groups:
 * their own share of spending (not what they happened to pay), what's coming up, and recent activity.
 */
export async function userOverview(user, now = new Date()) {
  const today = todayCalendar(now);
  const groups = await Group.find({ 'members.user': user._id }, { name: 1, trip: 1, members: 1 }).lean();
  const groupIds = groups.map((g) => g._id);
  const groupName = new Map(groups.map((g) => [String(g._id), g.name]));
  const thisMonth = monthStart(today);
  const lastMonth = monthStart(today, 1);
  const mineThisMonth = {
    group: { $in: groupIds },
    deletedAt: null,
    date: { $gte: thisMonth },
    'splits.user': user._id,
  };

  const [months, byCategory, biggest, recurring, activity] = await Promise.all([
    monthlyTotals({ match: { group: { $in: groupIds } }, userId: user._id, today }),
    Expense.aggregate([
      { $match: mineThisMonth },
      { $unwind: '$splits' },
      { $match: { 'splits.user': user._id } },
      { $group: { _id: '$category', amount: { $sum: '$splits.amount' }, count: { $sum: 1 } } },
      { $sort: { amount: -1 } },
    ]),
    Expense.findOne(mineThisMonth).sort({ amount: -1, date: -1 }).lean(),
    RecurringExpense.find({
      group: { $in: groupIds },
      active: true,
      'participants.user': user._id,
      nextRunAt: { $lte: addDays(today, UPCOMING_DAYS) },
    })
      .sort({ nextRunAt: 1 })
      .limit(10)
      .lean(),
    Activity.find({ group: { $in: groupIds } })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
  ]);

  const names = await nameMap(activity.filter((a) => a.actor).map((a) => a.actor));
  const inDays = (date) => Math.max(0, Math.round((date.getTime() - today.getTime()) / DAY));
  const ref = (id) => ({ id: String(id), name: groupName.get(String(id)) ?? 'A group' });

  const trips = groups
    .filter((g) => g.trip?.startDate && g.trip?.endDate && g.trip.endDate >= today)
    .map((g) => ({
      kind: 'trip',
      group: ref(g._id),
      title: g.trip.destination?.name || g.name,
      date: toCalendarString(g.trip.startDate),
      endDate: toCalendarString(g.trip.endDate),
      inDays: inDays(g.trip.startDate),
      ongoing: g.trip.startDate <= today,
    }));
  const bills = recurring.map((r) => ({
    kind: 'recurring',
    group: ref(r.group),
    title: r.description,
    amount: r.amount,
    frequency: r.frequency,
    date: toCalendarString(r.nextRunAt),
    inDays: inDays(r.nextRunAt),
  }));

  const people = new Set(groups.flatMap((g) => g.members.map((m) => String(m.user))));
  people.delete(String(user._id));
  const current = months[months.length - 1];
  const previous = months.find((m) => m.month === monthKey(lastMonth));

  return {
    months,
    thisMonth: {
      month: current.month,
      myShare: current.amount,
      count: current.count,
      byCategory: byCategory.map((c) => ({ category: c._id, amount: c.amount, count: c.count })),
      biggest: biggest
        ? {
            id: String(biggest._id),
            description: biggest.description,
            amount: biggest.amount,
            myShare: biggest.splits.find((s) => String(s.user) === String(user._id))?.amount ?? 0,
            category: biggest.category,
            date: toCalendarString(biggest.date),
            group: ref(biggest.group),
          }
        : null,
    },
    lastMonth: { month: previous.month, myShare: previous.amount },
    upcoming: [...trips, ...bills].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6),
    activity: activity.map((a) => ({
      id: String(a._id),
      type: a.type,
      actor: a.actor ? { id: String(a.actor), name: names.get(String(a.actor)) ?? 'Former member' } : null,
      meta: a.meta,
      createdAt: a.createdAt,
      group: ref(a.group),
    })),
    circle: { groups: groups.length, people: people.size },
  };
}
