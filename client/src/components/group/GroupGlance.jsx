import { api } from '../../lib/api.js';
import { formatINR } from '../../lib/format.js';
import { useResource } from '../../lib/useResource.js';
import { CategorySplit, MonthBars } from '../charts.jsx';
import { Avatar } from '../ui.jsx';

/** Side panel next to the expense list: totals, monthly trend, categories and who paid. */
export default function GroupGlance({ group, me, version }) {
  const res = useResource(() => api(`/groups/${group.id}/summary`), [group.id, version]);
  if (!res.data) return <aside className="glance" aria-busy={res.loading} />;
  const s = res.data;
  const maxPaid = Math.max(...s.byPayer.map((p) => p.amount), 1);
  const perHead = group.members.length ? Math.round(s.total / group.members.length) : 0;

  return (
    <aside className="glance" aria-label="Group at a glance">
      <section className="panel glance-total">
        <span className="sticker sticker-mint">at a glance</span>
        <span className="glance-big">{formatINR(s.total)}</span>
        <span className="muted small">spent by the group so far</span>
        <dl className="glance-facts">
          <div>
            <dt>Your share</dt>
            <dd>{formatINR(s.myShare)}</dd>
          </div>
          <div>
            <dt>Per person</dt>
            <dd>{formatINR(perHead)}</dd>
          </div>
        </dl>
      </section>

      {s.total > 0 && (
        <>
          <section className="panel">
            <h3>Last 6 months</h3>
            <MonthBars months={s.byMonth} label="Group spending by month" />
          </section>
          <section className="panel">
            <h3>Where it went</h3>
            <CategorySplit items={s.byCategory} total={s.total} limit={4} />
          </section>
          <section className="panel">
            <h3>Who paid</h3>
            <ul className="payers">
              {s.byPayer.map((p) => (
                <li key={p.user.id}>
                  <Avatar name={p.user.name} size="sm" />
                  <span className="payer-main">
                    <span className="payer-name">
                      {p.user.id === me.id ? 'You' : p.user.name}
                      <strong>{formatINR(p.amount)}</strong>
                    </span>
                    <span className="payer-bar" aria-hidden="true">
                      <span style={{ width: `${Math.max(4, Math.round((p.amount / maxPaid) * 100))}%` }} />
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </aside>
  );
}
