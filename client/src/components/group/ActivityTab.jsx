import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { describeActivity as describe } from '../../lib/activityText.js';
import { timeAgo } from '../../lib/format.js';
import { Button, Empty, ErrorState, Loading } from '../ui.jsx';

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
