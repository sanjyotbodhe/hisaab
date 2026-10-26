import { useState } from 'react';
import { api } from '../../lib/api.js';
import { categoryLabel, formatDate, formatINR } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useResource } from '../../lib/useResource.js';
import ExpenseForm from '../ExpenseForm.jsx';
import { Button, Empty, ErrorState, Loading, Modal, confirmAction } from '../ui.jsx';

export default function RecurringTab({ group, me, version, onChanged }) {
  const toast = useToast();
  const rules = useResource(() => api(`/groups/${group.id}/recurring`), [group.id, version]);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const isAdmin = group.myRole === 'admin';
  const canChange = (r) => isAdmin || r.createdBy.id === me.id || r.paidBy.id === me.id;

  async function setActive(r, active) {
    setBusyId(r.id);
    try {
      await api(`/groups/${group.id}/recurring/${r.id}`, { method: 'PATCH', body: { active } });
      toast.success(active ? 'Resumed' : 'Paused');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r) {
    if (!confirmAction(`Delete “${r.description}”? Expenses it already added will stay.`)) return;
    setBusyId(r.id);
    try {
      await api(`/groups/${group.id}/recurring/${r.id}`, { method: 'DELETE' });
      toast.success('Recurring expense deleted');
      onChanged();
    } catch (err) {
      toast.error(err.message);
      setBusyId(null);
    }
  }

  let body;
  if (rules.loading && !rules.data) body = <Loading text="Loading recurring expenses…" />;
  else if (rules.error && !rules.data) body = <ErrorState error={rules.error} onRetry={rules.reload} />;
  else if (rules.data.items.length === 0) {
    body = (
      <Empty
        title="No recurring expenses"
        action={
          <Button className="btn-secondary" onClick={() => setCreating(true)}>
            Set one up
          </Button>
        }
      >
        Rent, Wi-Fi, a maid or a cook: add it once and Hisaab adds it to the group on schedule.
      </Empty>
    );
  } else {
    body = (
      <ul className="recurring-list">
        {rules.data.items.map((r) => (
          <li key={r.id} className={r.active ? '' : 'paused'}>
            <div className="recurring-main">
              <span className="expense-desc">{r.description}</span>
              <span className="muted small">
                {formatINR(r.amount)} every {r.frequency === 'weekly' ? 'week' : 'month'} ·{' '}
                {r.paidBy.id === me.id ? 'you pay' : `${r.paidBy.name} pays`} · {categoryLabel(r.category)}
              </span>
              <span className="small">
                {r.active ? (
                  <>Next on {formatDate(r.nextRunAt)}</>
                ) : (
                  <span className="neg">Paused{r.pausedReason ? `: ${r.pausedReason}` : ''}</span>
                )}
              </span>
            </div>
            {canChange(r) && (
              <div className="row-actions">
                <Button className="btn-ghost btn-sm" loading={busyId === r.id} onClick={() => setActive(r, !r.active)}>
                  {r.active ? 'Pause' : 'Resume'}
                </Button>
                <button
                  type="button"
                  className="btn btn-danger-ghost btn-sm"
                  disabled={busyId === r.id}
                  onClick={() => remove(r)}
                >
                  Delete
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div>
      <div className="section-head">
        <p className="muted small">
          Added automatically on their date. If the server was asleep, missed ones are caught up.
        </p>
        <Button onClick={() => setCreating(true)}>New recurring expense</Button>
      </div>
      {body}
      <Modal open={creating} onClose={() => setCreating(false)} title="New recurring expense" wide>
        <ExpenseForm
          group={group}
          me={me}
          mode="recurring"
          onCancel={() => setCreating(false)}
          onSaved={(res) => {
            setCreating(false);
            toast.success(
              res.generated > 0
                ? `Recurring expense created, ${res.generated} expense${res.generated > 1 ? 's' : ''} added now`
                : 'Recurring expense created',
            );
            onChanged();
          }}
        />
      </Modal>
    </div>
  );
}
