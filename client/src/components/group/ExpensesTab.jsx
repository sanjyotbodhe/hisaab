import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { CATEGORIES, categoryLabel, formatINR } from '../../lib/format.js';
import { CategoryIcon, Icon } from '../icons.jsx';
import { Button, Empty, ErrorState, Loading } from '../ui.jsx';

const PAGE_SIZE = 20;

function useDebounced(value, ms) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** What this expense means for me: label + amount + tone. */
function myLine(e, meId) {
  const mine = e.splits.find((s) => s.user.id === meId)?.amount ?? 0;
  if (e.paidBy.id === meId) {
    const lent = e.amount - mine;
    return lent > 0 ? { label: 'you lent', amount: lent, tone: 'pos' } : { label: 'only you', amount: null, tone: '' };
  }
  return mine > 0
    ? { label: 'you owe', amount: mine, tone: 'neg' }
    : { label: 'not involved', amount: null, tone: 'muted' };
}

const monthFmt = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const monShort = new Intl.DateTimeFormat('en-IN', { month: 'short', timeZone: 'UTC' });

/** [{ month: 'October 2026', items: [...] }] keeping the server's date order. */
function byMonth(items) {
  const out = [];
  for (const e of items) {
    const label = monthFmt.format(new Date(`${e.date}T00:00:00Z`));
    if (out.at(-1)?.month !== label) out.push({ month: label, items: [] });
    out.at(-1).items.push(e);
  }
  return out;
}

export default function ExpensesTab({ group, me, version, onOpen, onAdd }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [member, setMember] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const query = useDebounced(q, 300);

  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({ total: 0, totalAmount: 0, hasMore: false, page: 1 });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const reqId = useRef(0);

  const filtersActive = Boolean(query || category || member || from || to);

  function buildQs(page) {
    const p = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
    if (query) p.set('q', query);
    if (category) p.set('category', category);
    if (member) p.set('member', member);
    if (from) p.set('from', from);
    if (to) p.set('to', to);
    return p.toString();
  }

  async function load(page) {
    const id = ++reqId.current;
    page === 1 ? setLoading(true) : setLoadingMore(true);
    setError(null);
    try {
      const res = await api(`/groups/${group.id}/expenses?${buildQs(page)}`);
      if (id !== reqId.current) return; // a newer filter change superseded this request
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      setMeta({ total: res.total, totalAmount: res.totalAmount, hasMore: res.hasMore, page: res.page });
    } catch (err) {
      if (id === reqId.current) setError(err);
    } finally {
      if (id === reqId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id, version, query, category, member, from, to]);

  function clearFilters() {
    setQ('');
    setCategory('');
    setMember('');
    setFrom('');
    setTo('');
  }

  return (
    <div>
      <div className="filters">
        <span className="filter-search-wrap">
          <Icon name="search" size={16} />
          <input
            type="search"
            className="filter-search"
            placeholder="Search expenses"
            aria-label="Search expenses"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </span>
        <select aria-label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <select aria-label="Person" value={member} onChange={(e) => setMember(e.target.value)}>
          <option value="">Everyone</option>
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === me.id ? 'You' : m.name}
            </option>
          ))}
        </select>
        <label className="date-filter">
          <span>From</span>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="date-filter">
          <span>To</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {filtersActive && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={clearFilters}>
            Clear filters
          </button>
        )}
      </div>

      <div className="list-meta">
        <span className="muted small">
          {loading
            ? 'Loading…'
            : `${meta.total} expense${meta.total === 1 ? '' : 's'} · ${formatINR(meta.totalAmount)} total`}
        </span>
        <a className="btn btn-ghost btn-sm" href={`/api/groups/${group.id}/expenses/export.csv`} download>
          <Icon name="download" size={15} /> Export CSV
        </a>
      </div>

      {error && <ErrorState error={error} onRetry={() => load(1)} />}
      {!error && loading && items.length === 0 && <Loading text="Loading expenses…" />}
      {!error &&
        !loading &&
        items.length === 0 &&
        (filtersActive ? (
          <Empty
            title="No expenses match these filters"
            action={
              <button className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            }
          />
        ) : (
          <Empty title="No expenses yet" action={<Button onClick={onAdd}>Add the first expense</Button>}>
            Add what someone paid for and who it was for. Hisaab works out who owes whom.
          </Empty>
        ))}

      {items.length > 0 && (
        <div className={`expense-months${loading ? ' is-stale' : ''}`}>
          {byMonth(items).map(({ month, items: monthItems }) => (
            <section key={month} className="month">
              <h3 className="month-label">{month}</h3>
              <ul className="expense-list">
                {monthItems.map((e) => {
                  const line = myLine(e, me.id);
                  const d = new Date(`${e.date}T00:00:00Z`);
                  return (
                    <li key={e.id}>
                      <button type="button" className="expense-row" onClick={() => onOpen(e.id)}>
                        <span className="date-chip" aria-label={e.date}>
                          <span className="date-mon">{monShort.format(d)}</span>
                          <span className="date-day">{d.getUTCDate()}</span>
                        </span>
                        <CategoryIcon category={e.category} />
                        <span className="expense-main">
                          <span className="expense-desc">
                            {e.description}
                            {e.recurring && (
                              <span className="tag" title="Added by a recurring rule">
                                <Icon name="repeat" size={11} /> recurring
                              </span>
                            )}
                          </span>
                          <span className="muted small">
                            {e.paidBy.id === me.id ? 'You' : e.paidBy.name} paid {formatINR(e.amount)} ·{' '}
                            {categoryLabel(e.category)}
                          </span>
                        </span>
                        <span className={`expense-mine ${line.tone}`}>
                          <span className="small">{line.label}</span>
                          {line.amount !== null && <span className="hand">{formatINR(line.amount)}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      {meta.hasMore && !loading && (
        <div className="center">
          <Button className="btn-secondary" loading={loadingMore} onClick={() => load(meta.page + 1)}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
