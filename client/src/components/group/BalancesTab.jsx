import { useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDate, formatINR } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useResource } from '../../lib/useResource.js';
import { Avatar, Empty, ErrorState, Loading, confirmAction } from '../ui.jsx';

export default function BalancesTab({ group, me, version, onChanged, onSettle }) {
  const toast = useToast();
  const isAdmin = group.myRole === 'admin';
  const data = useResource(
    () =>
      Promise.all([api(`/groups/${group.id}/balances`), api(`/groups/${group.id}/settlements`)]).then(
        ([balances, settlements]) => ({ balances, settlements: settlements.items }),
      ),
    [group.id, version, group.simplifyDebts],
  );
  const [toggling, setToggling] = useState(false);

  if (data.loading && !data.data) return <Loading text="Working out balances…" />;
  if (data.error && !data.data) return <ErrorState error={data.error} onRetry={data.reload} />;
  const { balances, settlements } = data.data;
  const you = (p) => (p.id === me.id ? 'You' : p.name);
  const allSquare = balances.net.every((n) => n.amount === 0);
  const savedPayments = balances.pairwise.length - balances.simplified.length;

  async function toggleSimplify() {
    setToggling(true);
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: { simplifyDebts: !group.simplifyDebts } });
      toast.success(group.simplifyDebts ? 'Showing direct debts only' : 'Simplified debts turned on');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setToggling(false);
    }
  }

  async function removeSettlement(s) {
    if (!confirmAction(`Remove the payment of ${formatINR(s.amount)} from ${s.from.name} to ${s.to.name}?`)) return;
    try {
      await api(`/groups/${group.id}/settlements/${s.id}`, { method: 'DELETE' });
      toast.success('Payment removed');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const canRecord = (d) => isAdmin || d.from.id === me.id || d.to.id === me.id;

  return (
    <div className="balances">
      <section className="ledger">
        <h2>How to settle up</h2>
        {allSquare ? (
          <p className="hand ledger-line pos">Everyone is settled up.</p>
        ) : (
          <>
            <ul className="settle-list">
              {balances.suggested.map((d) => (
                <li key={`${d.from.id}-${d.to.id}`} className="ledger-line">
                  <span className="hand">
                    {you(d.from)} {d.from.id === me.id ? 'pay' : 'pays'} {d.to.id === me.id ? 'you' : d.to.name}{' '}
                    <strong className="neg">{formatINR(d.amount)}</strong>
                  </span>
                  {canRecord(d) && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => onSettle({ from: d.from.id, to: d.to.id, amount: d.amount })}
                    >
                      Record payment
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <p className="muted small simplify-note">
              {group.simplifyDebts
                ? savedPayments > 0
                  ? `Simplified: ${balances.simplified.length} payment${balances.simplified.length === 1 ? '' : 's'} instead of ${balances.pairwise.length}. Money may pass through someone you didn't share an expense with, but everyone ends up exactly even.`
                  : 'Simplified debts are on. This group is already as simple as it gets.'
                : `Showing direct debts between people who shared expenses. Simplifying would need ${balances.simplified.length} payment${balances.simplified.length === 1 ? '' : 's'} instead of ${balances.pairwise.length}.`}
            </p>
          </>
        )}
        {isAdmin && (
          <label className="switch">
            <input type="checkbox" checked={group.simplifyDebts} disabled={toggling} onChange={toggleSimplify} />
            <span>Simplify debts</span>
          </label>
        )}
      </section>

      <section>
        <h2>Balances</h2>
        <ul className="net-list">
          {balances.net.map((n) => (
            <li key={n.user.id}>
              <Avatar name={n.user.name} size="sm" />
              <span className="net-name">{you(n.user)}</span>
              <span className={`net-amt ${n.amount > 0 ? 'pos' : n.amount < 0 ? 'neg' : 'muted'}`}>
                {n.amount === 0 ? 'settled up' : `${n.amount > 0 ? 'gets back' : 'owes'} ${formatINR(Math.abs(n.amount))}`}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2>Payments</h2>
        {settlements.length === 0 ? (
          <Empty title="No payments recorded yet">When someone pays back, record it here so balances stay accurate.</Empty>
        ) : (
          <ul className="payment-list">
            {settlements.map((s) => (
              <li key={s.id}>
                <span className="expense-date">{formatDate(s.date, true)}</span>
                <span className="expense-main">
                  <span>
                    {you(s.from)} paid {s.to.id === me.id ? 'you' : s.to.name}
                  </span>
                  {s.note && <span className="muted small">{s.note}</span>}
                </span>
                <span className="hand">{formatINR(s.amount)}</span>
                {(isAdmin || s.createdBy.id === me.id) && (
                  <button type="button" className="icon-btn" aria-label="Remove payment" onClick={() => removeSettlement(s)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
