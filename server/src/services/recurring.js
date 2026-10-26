import { computeSplits, SplitError } from '../../../shared/split.js';
import { Expense } from '../models/Expense.js';
import { Group } from '../models/Group.js';
import { RecurringExpense } from '../models/RecurringExpense.js';
import { nextOccurrence, todayCalendar, toCalendarString } from '../utils/dates.js';
import { logActivity } from './activity.js';

const MAX_CATCH_UP = 60; // never generate more than this many missed occurrences in one go

async function autoPause(rule, reason) {
  const paused = await RecurringExpense.findOneAndUpdate(
    { _id: rule._id, active: true },
    { $set: { active: false, pausedReason: reason } },
  );
  if (paused) {
    await logActivity(rule.group, null, 'recurring.auto_paused', {
      recurringId: String(rule._id),
      description: rule.description,
      reason,
    });
  }
}

/**
 * Generates every due occurrence of one rule, catching up on any that were missed
 * (e.g. the server was asleep). Safe to run concurrently / repeatedly:
 *  - each occurrence has a unique (recurring, occurrenceKey) index, so it is created at most once
 *  - nextRunAt only advances via compare-and-set, so two workers can't skip or double-advance
 */
async function processRule(rule, today) {
  let created = 0;
  for (let i = 0; i < MAX_CATCH_UP && rule && rule.active && rule.nextRunAt <= today; i++) {
    const group = await Group.findById(rule.group);
    if (!group) {
      await RecurringExpense.deleteOne({ _id: rule._id });
      return created;
    }
    const memberIds = new Set(group.members.map((m) => String(m.user)));
    const people = [String(rule.paidBy), ...rule.participants.map((p) => String(p.user))];
    if (people.some((id) => !memberIds.has(id))) {
      await autoPause(rule, 'Someone in this recurring expense is no longer in the group');
      return created;
    }
    let splits;
    try {
      splits = computeSplits(rule.amount, rule.splitType, rule.participants.map((p) => ({ user: String(p.user), value: p.value })));
    } catch (err) {
      if (err instanceof SplitError) {
        await autoPause(rule, `Split is no longer valid: ${err.message}`);
        return created;
      }
      throw err;
    }

    const occurrenceKey = toCalendarString(rule.nextRunAt);
    try {
      const expense = await Expense.create({
        group: rule.group,
        description: rule.description,
        amount: rule.amount,
        paidBy: rule.paidBy,
        splitType: rule.splitType,
        splits,
        category: rule.category,
        date: rule.nextRunAt,
        createdBy: rule.createdBy,
        recurring: rule._id,
        occurrenceKey,
      });
      created++;
      await logActivity(rule.group, null, 'expense.created', {
        expenseId: String(expense._id),
        description: expense.description,
        amount: expense.amount,
        recurring: true,
      });
    } catch (err) {
      if (err?.code !== 11000) throw err; // 11000 = this occurrence already exists, just advance
    }

    rule = await RecurringExpense.findOneAndUpdate(
      { _id: rule._id, nextRunAt: rule.nextRunAt, active: true },
      { $set: { nextRunAt: nextOccurrence(rule.nextRunAt, rule.frequency, rule.anchorDay), lastRunAt: new Date() } },
      { new: true },
    );
  }
  return created;
}

/** Runs all due rules (or just one, right after it is created). Returns expenses created. */
export async function processDueRecurring({ now = new Date(), ruleId } = {}) {
  const today = todayCalendar(now);
  const filter = { active: true, nextRunAt: { $lte: today }, ...(ruleId && { _id: ruleId }) };
  const rules = await RecurringExpense.find(filter).sort({ nextRunAt: 1 }).limit(500);
  let created = 0;
  for (const rule of rules) {
    try {
      created += await processRule(rule, today);
    } catch (err) {
      console.error('[recurring] rule', String(rule._id), 'failed:', err.message);
    }
  }
  return created;
}

let timer = null;
let running = false;

/** Background job: runs once on boot (to catch up after downtime), then on an interval. */
export function startRecurringScheduler(intervalMinutes) {
  const tick = async () => {
    if (running) return; // don't overlap with a slow previous run
    running = true;
    try {
      const n = await processDueRecurring();
      if (n) console.log(`[recurring] created ${n} expense(s)`);
    } catch (err) {
      console.error('[recurring] run failed:', err.message);
    } finally {
      running = false;
    }
  };
  tick();
  timer = setInterval(tick, intervalMinutes * 60 * 1000);
  timer.unref();
}

export function stopRecurringScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
