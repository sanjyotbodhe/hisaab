import { categoryLabel, formatINR } from '../lib/format.js';
import { CategoryIcon } from './icons.jsx';

const monthName = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });
const monthLong = new Intl.DateTimeFormat('en-IN', { month: 'long', timeZone: 'UTC' });
export const monthLabel = (key, long = false) => (long ? monthLong : monthName).format(new Date(`${key}-01T00:00:00Z`));

/** Compact rupees for chart labels: ₹950, ₹12.4k, ₹3.2L. */
export function shortINR(paise) {
  const r = paise / 100;
  if (r >= 1e5) return `₹${(r / 1e5).toFixed(r >= 1e6 ? 0 : 1)}L`;
  if (r >= 1e3) return `₹${(r / 1e3).toFixed(r >= 1e4 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
}

/** Six chunky month bars; the current month is highlighted. Data: [{ month: '2026-10', amount }]. */
export function MonthBars({ months, size = 'md', label = 'Spending by month' }) {
  const max = Math.max(...months.map((m) => m.amount), 1);
  return (
    <ol className={`month-bars month-bars-${size}`} aria-label={label}>
      {months.map((m, i) => {
        const current = i === months.length - 1;
        const pct = m.amount ? Math.max(6, Math.round((m.amount / max) * 100)) : 0;
        return (
          <li key={m.month} className={current ? 'is-current' : ''}>
            <span className="sr-only">
              {monthLabel(m.month, true)}: {formatINR(m.amount)}
            </span>
            {size !== 'sm' && (
              <span className="bar-value" aria-hidden="true">
                {m.amount ? shortINR(m.amount) : '–'}
              </span>
            )}
            <span className="bar-track" aria-hidden="true">
              <span className="bar" style={{ height: `${pct}%` }} />
            </span>
            <span className="bar-label" aria-hidden="true">
              {monthLabel(m.month)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** One stacked bar plus a legend: where the money went. Data: [{ category, amount, count? }]. */
export function CategorySplit({ items, total, limit = 5 }) {
  const top = items.slice(0, limit);
  const rest = items.slice(limit).reduce((a, c) => a + c.amount, 0);
  const rows = rest ? [...top, { category: 'other', amount: rest, more: true }] : top;
  return (
    <div className="cat-split">
      <div className="cat-stack" aria-hidden="true">
        {rows.map((c, i) => (
          <span
            key={`${c.category}-${i}`}
            className={`cat-seg cat-${c.category}`}
            style={{ flexGrow: c.amount }}
            title={`${categoryLabel(c.category)}: ${formatINR(c.amount)}`}
          />
        ))}
      </div>
      <ul className="cat-legend">
        {rows.map((c, i) => (
          <li key={`${c.category}-${i}`}>
            <CategoryIcon category={c.category} size="sm" />
            <span className="cat-legend-name">{c.more ? 'Everything else' : categoryLabel(c.category)}</span>
            <span className="cat-legend-pct muted small">{total ? Math.round((c.amount / total) * 100) : 0}%</span>
            <strong>{formatINR(c.amount)}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}
