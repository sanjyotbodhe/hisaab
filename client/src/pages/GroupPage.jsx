import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ExpenseForm from '../components/ExpenseForm.jsx';
import ActivityTab from '../components/group/ActivityTab.jsx';
import BalancesTab from '../components/group/BalancesTab.jsx';
import ExpensesTab from '../components/group/ExpensesTab.jsx';
import MembersTab from '../components/group/MembersTab.jsx';
import RecurringTab from '../components/group/RecurringTab.jsx';
import SettleForm from '../components/SettleForm.jsx';
import { Button, ErrorState, Loading, Modal, confirmAction } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatINR } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useResource } from '../lib/useResource.js';

const TABS = [
  { id: 'expenses', label: 'Expenses' },
  { id: 'balances', label: 'Balances' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'activity', label: 'Activity' },
  { id: 'members', label: 'Members' },
];

/**
 * Keyed by group id so switching directly between groups (URL edit, back/forward)
 * starts from a clean slate instead of briefly showing the previous group's data.
 */
export default function GroupPageRoute() {
  const { groupId } = useParams();
  return <GroupPage key={groupId} groupId={groupId} />;
}

function GroupPage({ groupId }) {
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'expenses';

  const groupRes = useResource(() => api(`/groups/${groupId}`), [groupId]);
  const [version, setVersion] = useState(0); // bump to make tabs reload after a change
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // expense being edited
  const [settling, setSettling] = useState(null); // null | {} | preset

  const changed = () => {
    setVersion((v) => v + 1);
    groupRes.reload();
  };

  if (groupRes.loading && !groupRes.data) return <Loading text="Opening group…" />;
  if (groupRes.error && !groupRes.data) {
    return (
      <div className="narrow">
        <ErrorState error={groupRes.error} onRetry={groupRes.error.status === 0 ? groupRes.reload : undefined} />
        <p className="center">
          <Link to="/">Back to your groups</Link>
        </p>
      </div>
    );
  }
  const group = groupRes.data.group;

  async function openExpense(id) {
    try {
      const { expense, canEdit } = await api(`/groups/${group.id}/expenses/${id}`);
      if (!canEdit) {
        toast.info('Only the person who added or paid for this expense, or an admin, can edit it.');
        return;
      }
      setEditing(expense);
    } catch (err) {
      toast.error(err.message);
      if (err.status === 404) changed();
    }
  }

  async function deleteExpense(expense) {
    if (
      !confirmAction(`Delete “${expense.description}” (${formatINR(expense.amount)})? Balances will be recalculated.`)
    )
      return;
    try {
      await api(`/groups/${group.id}/expenses/${expense.id}`, { method: 'DELETE' });
      setEditing(null);
      toast.success('Expense deleted');
      changed();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const tabProps = { group, me: user, version, onChanged: changed };

  return (
    <div className="group-page">
      <header className="group-head">
        <div>
          <Link to="/" className="back">
            Your groups
          </Link>
          <h1>{group.name}</h1>
          {group.description && <p className="muted">{group.description}</p>}
        </div>
        <div className="group-actions">
          <Button className="btn-secondary" onClick={() => setSettling({})} disabled={group.members.length < 2}>
            Settle up
          </Button>
          <Button onClick={() => setAdding(true)}>Add expense</Button>
        </div>
      </header>

      <nav className="tabs" aria-label="Group sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? 'on' : ''}
            aria-current={tab === t.id ? 'page' : undefined}
            onClick={() => setParams(t.id === 'expenses' ? {} : { tab: t.id }, { replace: true })}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <section className="tab-panel">
        {tab === 'expenses' && <ExpensesTab {...tabProps} onOpen={openExpense} onAdd={() => setAdding(true)} />}
        {tab === 'balances' && <BalancesTab {...tabProps} onSettle={(preset) => setSettling(preset)} />}
        {tab === 'recurring' && <RecurringTab {...tabProps} />}
        {tab === 'activity' && <ActivityTab {...tabProps} />}
        {tab === 'members' && <MembersTab {...tabProps} onLeft={() => navigate('/', { replace: true })} />}
      </section>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add expense" wide>
        <ExpenseForm
          group={group}
          me={user}
          onCancel={() => setAdding(false)}
          onSaved={(res) => {
            setAdding(false);
            toast.success(res.duplicate ? 'That expense was already saved' : 'Expense added');
            changed();
          }}
        />
      </Modal>

      <Modal open={Boolean(editing)} onClose={() => setEditing(null)} title="Edit expense" wide>
        {editing && (
          <ExpenseForm
            key={editing.id}
            group={group}
            me={user}
            expense={editing}
            onCancel={() => setEditing(null)}
            onDelete={() => deleteExpense(editing)}
            onSaved={() => {
              setEditing(null);
              toast.success('Changes saved');
              changed();
            }}
          />
        )}
      </Modal>

      <Modal open={Boolean(settling)} onClose={() => setSettling(null)} title="Record a payment">
        {settling && (
          <SettleForm
            group={group}
            me={user}
            preset={settling}
            onCancel={() => setSettling(null)}
            onSaved={(res) => {
              setSettling(null);
              toast.success(res.duplicate ? 'That payment was already recorded' : 'Payment recorded');
              changed();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
