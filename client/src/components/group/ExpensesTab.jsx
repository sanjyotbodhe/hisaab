import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { CATEGORIES, categoryLabel, formatDate, formatINR } from '../../lib/format.js';
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

/** What this expense means for me, in one line. */
function myLine(e, meId) {
  const mine = e.splits.find((s) => s.user.id === meId)?.amount ?? 0;
  if (e.paidBy.id === meId) {
    const lent = e.amount - mine;
    return lent > 0 ? { text: `you lent ${formatINR(lent)}`, tone: 'pos' } : { text: 'just you', tone: '' };
  }
  return mine > 0 ? { text: `you owe ${formatINR(mine)}`, tone: 'neg' } : { text: 'not involved', tone: 'muted' };
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
        <input
          type="search"
          className="filter-search"
          placeholder="Search expenses"
          aria-label="Search expenses"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
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
          Export CSV
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
        <ul className={`expense-list${loading ? ' is-stale' : ''}`}>
          {items.map((e) => {
            const line = myLine(e, me.id);
            return (
              <li key={e.id}>
                <button type="button" className="expense-row" onClick={() => onOpen(e.id)}>
                  <span className="expense-date">{formatDate(e.date, true)}</span>
                  <span className="expense-main">
                    <span className="expense-desc">
                      {e.description}
                      {e.recurring && <span className="tag">recurring</span>}
                    </span>
                    <span className="muted small">
                      {e.paidBy.id === me.id ? 'You' : e.paidBy.name} paid · {categoryLabel(e.category)}
                    </span>
                  </span>
                  <span className="expense-amt">
                    <span className="hand">{formatINR(e.amount)}</span>
                    <span className={`small ${line.tone}`}>{line.text}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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
