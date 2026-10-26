import { Link } from 'react-router-dom';
import { describeActivity } from '../../lib/activityText.js';
import { formatINR, timeAgo } from '../../lib/format.js';
import { CategorySplit, MonthBars, monthLabel } from '../charts.jsx';
import { Icon } from '../icons.jsx';
import { Avatar } from '../ui.jsx';

const dayNum = (ymd) => Number(ymd.slice(8, 10));
const mon = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

/** Six-month bars of the user's own share, plus this month by category. */
export function SpendingPanel({ overview }) {
  const { months, thisMonth } = overview;
  const active = months.filter((m) => m.amount > 0);
  const avg = active.length ? Math.round(active.reduce((a, m) => a + m.amount, 0) / active.length) : 0;
  return (
    <section className="panel spend-panel">
      <div className="panel-head">
        <div>
          <h2>Your spending</h2>
          <p className="muted small">Your share only, not what you happened to pay. Last 6 months.</p>
        </div>
        {avg > 0 && (
          <span className="sticker sticker-lemon">
            avg <strong>{formatINR(avg)}</strong>/month
          </span>
        )}
      </div>
      <div className="spend-body">
        <MonthBars months={months} />
        <div className="spend-cats">
          <h3>{monthLabel(thisMonth.month, true)} by category</h3>
          {thisMonth.byCategory.length ? (
            <CategorySplit items={thisMonth.byCategory} total={thisMonth.myShare} />
          ) : (
            <p className="muted small">Nothing yet this month. Add an expense and it shows up here.</p>
          )}
        </div>
      </div>
    </section>
  );
}

/** Trips and recurring bills in the next weeks, soonest first. */
export function ComingUp({ items }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Coming up</h2>
        <Icon name="calendar" size={18} />
      </div>
      {items.length === 0 ? (
        <p className="muted small panel-empty">
          No trips or recurring bills in the next 45 days. Set a trip&apos;s dates in a group&apos;s Trip plan, or add
          rent under Recurring.
        </p>
      ) : (
        <ul className="upcoming">
          {items.map((u) => (
            <li key={`${u.kind}-${u.group.id}-${u.title}-${u.date}`}>
              <Link
                to={`/groups/${u.group.id}?tab=${u.kind === 'trip' ? 'trip' : 'recurring'}`}
                className="upcoming-row"
              >
                <span className={`date-block ${u.kind === 'trip' ? 'is-trip' : ''}`} aria-hidden="true">
                  <span>{mon.format(new Date(`${u.date}T00:00:00Z`))}</span>
                  <strong>{dayNum(u.date)}</strong>
                </span>
                <span className="upcoming-main">
                  <span className="upcoming-title">{u.title}</span>
                  <span className="muted small">
                    {u.kind === 'trip'
                      ? `Trip · ${u.group.name}`
                      : `${formatINR(u.amount)} ${u.frequency === 'weekly' ? 'weekly' : 'monthly'} · ${u.group.name}`}
                  </span>
                </span>
                <span className="when">
                  {u.ongoing ? 'now' : u.inDays === 0 ? 'today' : u.inDays === 1 ? 'tmrw' : `${u.inDays}d`}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The latest things that happened across all the user's groups. */
export function RecentActivity({ items, meId }) {
  return (
    <section className="panel">
      <div className="panel-head">
        <h2>Latest activity</h2>
        <Icon name="activity" size={18} />
      </div>
      {items.length === 0 ? (
        <p className="muted small panel-empty">Nothing yet. What your groups do shows up here.</p>
      ) : (
        <ul className="feed">
          {items.map((a) => (
            <li key={a.id}>
              <Avatar name={a.actor?.name ?? 'Hisaab'} size="sm" />
              <span className="feed-main">
                <span className="feed-text">{describeActivity(a, meId)}</span>
                <span className="muted small">
                  <Link to={`/groups/${a.group.id}?tab=activity`} className="feed-group">
                    {a.group.name}
                  </Link>{' '}
                  · {timeAgo(a.createdAt)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Small "this month" card for the sidebar. */
export function SideMonthCard({ overview }) {
  const { thisMonth, lastMonth, months } = overview;
  const diff = thisMonth.myShare - lastMonth.myShare;
  return (
    <div className="side-card">
      <span className="side-card-kicker">{monthLabel(thisMonth.month, true)} so far</span>
      <strong className="side-card-value">{formatINR(thisMonth.myShare)}</strong>
      <MonthBars months={months} size="sm" label="Your share, last 6 months" />
      <span className="side-card-note">
        {lastMonth.myShare === 0
          ? 'your share this month'
          : diff === 0
            ? `same as ${monthLabel(lastMonth.month)}`
            : `${formatINR(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} than ${monthLabel(lastMonth.month)}`}
      </span>
    </div>
  );
}
