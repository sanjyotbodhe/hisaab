import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { formatINR, timeAgo } from '../../lib/format.js';
import { Button, Empty, ErrorState, Loading } from '../ui.jsx';

function describe(a, meId) {
  const who = a.actor ? (a.actor.id === meId ? 'You' : a.actor.name) : 'Hisaab';
  const m = a.meta ?? {};
  const amt = (v) => (typeof v === 'number' ? formatINR(v) : '');
  switch (a.type) {
    case 'group.created':
      return `${who} created the group`;
    case 'group.updated':
      if (m.changes?.simplifyDebts !== undefined)
        return `${who} turned ${m.changes.simplifyDebts ? 'on' : 'off'} simplified debts`;
      return `${who} updated the group details`;
    case 'member.joined':
      return `${who} joined the group`;
    case 'member.left':
      return `${who} left the group`;
    case 'member.removed':
      return `${who} removed ${m.name ?? 'a member'}`;
    case 'member.role_changed':
      return `${who} made ${m.name ?? 'a member'} ${m.role === 'admin' ? 'an admin' : 'a regular member'}`;
    case 'invite.regenerated':
      return `${who} reset the invite link`;
    case 'expense.created':
      return m.recurring
        ? `Recurring expense “${m.description}” added (${amt(m.amount)})`
        : `${who} added “${m.description}” (${amt(m.amount)})`;
    case 'expense.updated':
      return m.previousAmount !== undefined && m.previousAmount !== m.amount
        ? `${who} changed “${m.description}” from ${amt(m.previousAmount)} to ${amt(m.amount)}`
        : `${who} edited “${m.description}”`;
    case 'expense.deleted':
      return `${who} deleted “${m.description}” (${amt(m.amount)})`;
    case 'settlement.created':
      return `${who} recorded: ${m.from} paid ${m.to} ${amt(m.amount)}`;
    case 'settlement.deleted':
      return `${who} removed the payment from ${m.from} to ${m.to} (${amt(m.amount)})`;
    case 'recurring.created':
      return `${who} set up “${m.description}” every ${m.frequency === 'weekly' ? 'week' : 'month'} (${amt(m.amount)})`;
    case 'recurring.paused':
      return `${who} paused “${m.description}”`;
    case 'recurring.resumed':
      return `${who} resumed “${m.description}”`;
    case 'recurring.deleted':
      return `${who} deleted the recurring expense “${m.description}”`;
    case 'trip.updated':
      return m.destination
        ? `${who} updated the trip to ${m.destination}${m.startDate ? ` (${m.startDate} to ${m.endDate})` : ''}`
        : `${who} updated the trip details`;
    case 'plan.added':
      return m.day ? `${who} planned “${m.title}” for ${m.day}` : `${who} suggested “${m.title}”`;
    case 'plan.scheduled':
      return `${who} scheduled “${m.title}” for ${m.day}`;
    case 'plan.removed':
      return `${who} removed “${m.title}” from the plan`;
    case 'booking.added':
      return `${who} saved the ${m.type === 'hotel' ? 'stay' : m.type} booking “${m.title}”`;
    case 'booking.removed':
      return `${who} removed the booking “${m.title}”`;
    case 'booking.expensed':
      return `${who} added the booking “${m.title}” as an expense (${amt(m.amount)})`;
    case 'recurring.auto_paused':
      return `“${m.description}” was paused automatically: ${m.reason}`;
    default:
      return `${who} made a change`;
  }
}

export default function ActivityTab({ group, me, version }) {
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState(null);

  async function load(before) {
    before ? setMore(true) : setLoading(true);
    setError(null);
    try {
      const qs = before ? `?before=${encodeURIComponent(before)}` : '';
      const res = await api(`/groups/${group.id}/activity${qs}`);
      setItems((prev) => (before ? [...prev, ...res.items] : res.items));
      setNext(res.nextBefore);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
      setMore(false);
    }
  }

  useEffect(() => {
    load(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, version]);

  if (loading && items.length === 0) return <Loading text="Loading activity…" />;
  if (error && items.length === 0) return <ErrorState error={error} onRetry={() => load(null)} />;
  if (items.length === 0) return <Empty title="Nothing has happened yet" />;

  return (
    <div>
      <ul className="activity-list">
        {items.map((a) => (
          <li key={a.id}>
            <span>{describe(a, me.id)}</span>
            <time className="muted small" dateTime={a.createdAt} title={new Date(a.createdAt).toLocaleString('en-IN')}>
              {timeAgo(a.createdAt)}
            </time>
          </li>
        ))}
      </ul>
      {error && <ErrorState error={error} onRetry={() => load(next)} />}
      {next && (
        <div className="center">
          <Button className="btn-secondary" loading={more} onClick={() => load(next)}>
            Show older activity
          </Button>
        </div>
      )}
    </div>
  );
}
