export { formatINR, fromPaise, toPaise } from '@shared/split.js';

const dateFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const shortFmt = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });

/** "2026-10-26" -> "26 Oct 2026". Calendar dates are stored as UTC midnight, so format in UTC. */
export function formatDate(ymd, short = false) {
  if (!ymd) return '';
  const d = new Date(`${ymd}T00:00:00Z`);
  return (short ? shortFmt : dateFmt).format(d);
}

/** Today's date in the user's own time zone, as "YYYY-MM-DD". */
export function todayYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function timeAgo(iso) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const days = Math.round(h / 24);
  if (days < 7) return `${days} day${days > 1 ? 's' : ''} ago`;
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(new Date(iso));
}

export const CATEGORIES = [
  { value: 'food', label: 'Food & drinks' },
  { value: 'groceries', label: 'Groceries' },
  { value: 'travel', label: 'Travel' },
  { value: 'stay', label: 'Stay' },
  { value: 'rent', label: 'Rent' },
  { value: 'utilities', label: 'Bills & utilities' },
  { value: 'entertainment', label: 'Entertainment' },
  { value: 'shopping', label: 'Shopping' },
  { value: 'other', label: 'Other' },
];
export const categoryLabel = (v) => CATEGORIES.find((c) => c.value === v)?.label ?? 'Other';

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join('') || '?';
