/**
 * Expense dates are calendar dates ("2026-10-26"), not instants. They are stored as
 * UTC midnight of that date, so they never shift by a day across time zones.
 * "Today" is evaluated in the app's home time zone (IST by default).
 */

export const APP_TZ_OFFSET_MINUTES = Number(process.env.APP_TZ_OFFSET_MINUTES ?? 330);

/** "2026-02-30" -> null, "2026-02-28" -> Date(2026-02-28T00:00:00Z) */
export function parseCalendarDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str ?? '');
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  return date;
}

export function toCalendarString(date) {
  return date.toISOString().slice(0, 10);
}

/** Today's calendar date in the app time zone, as UTC midnight. */
export function todayCalendar(now = new Date()) {
  const local = new Date(now.getTime() + APP_TZ_OFFSET_MINUTES * 60 * 1000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function daysInMonth(year, monthIndex) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** Next occurrence. Monthly rules anchored on the 31st land on the last day of shorter months. */
export function nextOccurrence(date, frequency, anchorDay) {
  if (frequency === 'weekly') return addDays(date, 7);
  const y = date.getUTCFullYear();
  const m = date.getUTCMonth() + 1;
  const year = y + Math.floor(m / 12);
  const month = m % 12;
  const day = Math.min(anchorDay ?? date.getUTCDate(), daysInMonth(year, month));
  return new Date(Date.UTC(year, month, day));
}
