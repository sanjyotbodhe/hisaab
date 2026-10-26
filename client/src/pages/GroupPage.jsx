import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ExpenseForm from '../components/ExpenseForm.jsx';
import GroupGlance from '../components/group/GroupGlance.jsx';
import ActivityTab from '../components/group/ActivityTab.jsx';
import BalancesTab from '../components/group/BalancesTab.jsx';
import BookingsTab from '../components/group/BookingsTab.jsx';
import TripTab from '../components/group/TripTab.jsx';
import ExpensesTab from '../components/group/ExpensesTab.jsx';
import MembersTab from '../components/group/MembersTab.jsx';
import RecurringTab from '../components/group/RecurringTab.jsx';
import SettleForm from '../components/SettleForm.jsx';
import { Icon } from '../components/icons.jsx';
import { AvatarStack, Button, ErrorState, Loading, Modal, confirmAction } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatINR } from '../lib/format.js';
import { useGroups } from '../lib/groups.jsx';
import { useToast } from '../lib/toast.jsx';
import { useResource } from '../lib/useResource.js';

const TABS = [
  { id: 'expenses', label: 'Expenses', icon: 'receipt' },
  { id: 'balances', label: 'Balances', icon: 'scale' },
  { id: 'trip', label: 'Trip plan', icon: 'map' },
  { id: 'bookings', label: 'Bookings', icon: 'ticket' },
  { id: 'recurring', label: 'Recurring', icon: 'repeat' },
  { id: 'activity', label: 'Activity', icon: 'activity' },
  { id: 'members', label: 'Members', icon: 'users' },
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
  const groups = useGroups();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'expenses';

  const groupRes = useResource(() => api(`/groups/${groupId}`), [groupId]);
  const [version, setVersion] = useState(0); // bump to make tabs reload after a change
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState(null); // expense being edited
  const [settling, setSettling] = useState(null); // null | {} | preset

  // Opened from the dashboard's "Add expense": open the form once, then drop the flag from the URL.
  useEffect(() => {
    if (params.get('add') !== '1') return;
    setAdding(true);
    const next = new URLSearchParams(params);
    next.delete('add');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changed = () => {
    setVersion((v) => v + 1);
    groupRes.reload();
    groups.reload(); // sidebar + header balance
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
  const myBalance = groups.data?.groups.find((g) => g.id === group.id)?.myBalance;

  return (
    <div className="group-page">
      <header className="group-head">
        <div className="group-head-main">
          <Link to="/" className="back">
            <Icon name="back" size={15} /> Overview
          </Link>
          <h1>{group.name}</h1>
          <div className="group-meta">
            <AvatarStack names={group.members.map((m) => m.name)} />
            <span className="muted small">
              {group.members.length} member{group.members.length === 1 ? '' : 's'}
              {group.description ? ` · ${group.description}` : ''}
            </span>
          </div>
        </div>
        <div className="group-head-side">
          {myBalance !== undefined && (
            <div className={`my-position ${myBalance > 0 ? 'pos' : myBalance < 0 ? 'neg' : 'zero'}`}>
              <span className="small">{myBalance > 0 ? 'You get back' : myBalance < 0 ? 'You owe' : 'You are'}</span>
              <span className="hand">{myBalance === 0 ? 'settled up' : formatINR(Math.abs(myBalance))}</span>
            </div>
          )}
          <div className="group-actions">
            <Button className="btn-secondary" onClick={() => setSettling({})} disabled={group.members.length < 2}>
              Settle up
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Icon name="plus" size={16} /> Add expense
            </Button>
          </div>
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
            <Icon name={t.icon} size={16} />
            {t.label}
          </button>
        ))}
      </nav>

      <section className="tab-panel">
        {tab === 'expenses' && (
          <div className="expenses-layout">
            <ExpensesTab {...tabProps} onOpen={openExpense} onAdd={() => setAdding(true)} />
            <GroupGlance group={group} me={user} version={version} />
          </div>
        )}
        {tab === 'balances' && <BalancesTab {...tabProps} onSettle={(preset) => setSettling(preset)} />}
        {tab === 'trip' && <TripTab {...tabProps} />}
        {tab === 'bookings' && <BookingsTab {...tabProps} />}
        {tab === 'recurring' && <RecurringTab {...tabProps} />}
        {tab === 'activity' && <ActivityTab {...tabProps} />}
        {tab === 'members' && (
          <MembersTab
            {...tabProps}
            onLeft={() => {
              groups.reload();
              navigate('/', { replace: true });
            }}
          />
        )}
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
