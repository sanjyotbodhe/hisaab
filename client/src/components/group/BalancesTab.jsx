import { useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDate, formatINR } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useResource } from '../../lib/useResource.js';
import { Icon } from '../icons.jsx';
import RazorpayPay from '../RazorpayPay.jsx';
import UpiPay from '../UpiPay.jsx';
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
  const payments = useResource(() => api(`/groups/${group.id}/payments/config`), [group.id]);
  const onlineEnabled = payments.data?.enabled === true;

  if (data.loading && !data.data) return <Loading text="Working out balances…" />;
  if (data.error && !data.data) return <ErrorState error={data.error} onRetry={data.reload} />;
  const { balances, settlements } = data.data;
  const you = (p) => (p.id === me.id ? 'You' : p.name);
  const allSquare = balances.net.every((n) => n.amount === 0);
  const savedPayments = balances.pairwise.length - balances.simplified.length;
  const maxAbs = Math.max(1, ...balances.net.map((n) => Math.abs(n.amount)));

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
  const upiOf = (id) => group.members.find((m) => m.id === id)?.upiId;

  return (
    <div className="balances">
      <section className="ledger settle-card">
        <div className="settle-head">
          <h2>How to settle up</h2>
          {isAdmin && (
            <label className="switch">
              <input type="checkbox" checked={group.simplifyDebts} disabled={toggling} onChange={toggleSimplify} />
              <span className="switch-track" aria-hidden="true" />
              <span>Simplify debts</span>
            </label>
          )}
        </div>
        {allSquare ? (
          <p className="all-square hand">
            <Icon name="check" size={20} /> Everyone is settled up.
          </p>
        ) : (
          <>
            <ul className="transfers">
              {balances.suggested.map((d) => (
                <li key={`${d.from.id}-${d.to.id}`} className="transfer">
                  <span className="transfer-people">
                    <span className="transfer-person">
                      <Avatar name={d.from.name} size="sm" />
                      <span>{you(d.from)}</span>
                    </span>
                    <span className="transfer-arrow">
                      <span className="sr-only">pays</span>
                      <span className="hand neg">{formatINR(d.amount)}</span>
                      <Icon name="arrowRight" size={18} />
                    </span>
                    <span className="transfer-person">
                      <Avatar name={d.to.name} size="sm" />
                      <span>{you(d.to)}</span>
                    </span>
                  </span>
                  <span className="transfer-actions">
                    {d.from.id === me.id && onlineEnabled && (
                      <RazorpayPay group={group} to={d.to} amount={d.amount} onPaid={onChanged} />
                    )}
                    {d.from.id === me.id && upiOf(d.to.id) && (
                      <UpiPay
                        payee={{ name: d.to.name, upiId: upiOf(d.to.id) }}
                        amount={d.amount}
                        note={`Hisaab ${group.name}`}
                      />
                    )}
                    {d.from.id === me.id && !upiOf(d.to.id) && (
                      <span className="muted small upi-hint">{d.to.name} hasn’t added a UPI ID</span>
                    )}
                    {canRecord(d) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => onSettle({ from: d.from.id, to: d.to.id, amount: d.amount })}
                      >
                        Record payment
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
            <p className="muted small simplify-note">
              {group.simplifyDebts
                ? savedPayments > 0
                  ? `Simplified: ${balances.simplified.length} payment${balances.simplified.length === 1 ? '' : 's'} instead of ${balances.pairwise.length}. Everyone still ends up exactly even.`
                  : 'Simplified debts are on. This group is already as simple as it gets.'
                : `Showing direct debts only. Simplifying would need ${balances.simplified.length} payment${balances.simplified.length === 1 ? '' : 's'} instead of ${balances.pairwise.length}.`}
            </p>
          </>
        )}
      </section>

      <section>
        <h2>Who’s up, who’s down</h2>
        <ul className="net-bars">
          {balances.net.map((n) => {
            const width = `${(Math.abs(n.amount) / maxAbs) * 50}%`;
            const tone = n.amount > 0 ? 'pos' : n.amount < 0 ? 'neg' : 'zero';
            return (
              <li key={n.user.id} className="net-row">
                <span className="net-who">
                  <Avatar name={n.user.name} size="sm" />
                  <span className="net-name">{you(n.user)}</span>
                </span>
                <span className="net-track" aria-hidden="true">
                  <span className="net-axis" />
                  {n.amount !== 0 && (
                    <span
                      className={`net-bar ${tone}`}
                      style={n.amount > 0 ? { left: '50%', width } : { right: '50%', width }}
                    />
                  )}
                </span>
                <span className={`net-amt ${tone}`}>
                  {n.amount === 0
                    ? 'settled up'
                    : `${n.amount > 0 ? 'gets back' : 'owes'} ${formatINR(Math.abs(n.amount))}`}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2>Payments</h2>
        {settlements.length === 0 ? (
          <Empty title="No payments recorded yet">
            When someone pays back by UPI or cash, record it here so balances stay accurate.
          </Empty>
        ) : (
          <ul className="payment-list">
            {settlements.map((s) => (
              <li key={s.id}>
                <span className="payment-icon" aria-hidden="true">
                  <Icon name="check" size={16} />
                </span>
                <span className="expense-main">
                  <span>
                    <strong>{you(s.from)}</strong> paid <strong>{s.to.id === me.id ? 'you' : s.to.name}</strong>
                  </span>
                  <span className="muted small">
                    {formatDate(s.date)}
                    {s.note ? ` · ${s.note}` : ''}
                  </span>
                </span>
                <span className="hand pos">{formatINR(s.amount)}</span>
                {s.method === 'razorpay' && (
                  <span className="tag tag-pos" title="Verified by Razorpay">
                    <Icon name="check" size={11} /> online
                  </span>
                )}
                {s.method !== 'razorpay' && (isAdmin || s.createdBy.id === me.id) && (
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label="Remove payment"
                    title="Remove payment"
                    onClick={() => removeSettlement(s)}
                  >
                    <Icon name="close" size={16} />
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
