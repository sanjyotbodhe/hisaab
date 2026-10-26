import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Empty, ErrorState, Field, FormError, Loading, Modal, Money } from '../components/ui.jsx';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { formatINR, timeAgo } from '../lib/format.js';
import { useToast } from '../lib/toast.jsx';
import { useResource } from '../lib/useResource.js';

function CreateGroupForm({ onCreated, onCancel }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return setErrors({ name: 'Give the group a name' });
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const { group } = await api('/groups', { method: 'POST', body: { name, description } });
      onCreated(group);
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Group name" htmlFor="g-name" error={errors.name}>
        <input
          id="g-name"
          value={name}
          maxLength={60}
          placeholder="e.g. Flat 302, Goa trip"
          onChange={(e) => {
            setName(e.target.value);
            setErrors({});
          }}
          autoFocus
        />
      </Field>
      <Field label="Description (optional)" htmlFor="g-desc" error={errors.description}>
        <input id="g-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <FormError error={error} />
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={busy}>
          Create group
        </Button>
      </div>
    </form>
  );
}

/** Accepts a bare code or a full invite link pasted from chat. */
function parseInvite(input) {
  const s = input.trim();
  const m = /\/join\/([A-Za-z0-9]+)/.exec(s);
  return (m ? m[1] : s).toUpperCase();
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const groups = useResource(() => api('/groups'), []);
  const [creating, setCreating] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState('');

  if (groups.loading && !groups.data) return <Loading text="Loading your groups…" />;
  if (groups.error && !groups.data) return <ErrorState error={groups.error} onRetry={groups.reload} />;

  const list = groups.data.groups;
  const owed = list.filter((g) => g.myBalance > 0).reduce((a, g) => a + g.myBalance, 0);
  const owe = list.filter((g) => g.myBalance < 0).reduce((a, g) => a - g.myBalance, 0);

  function joinByCode(e) {
    e.preventDefault();
    const c = parseInvite(code);
    if (!/^[A-Z0-9]{6,20}$/.test(c)) return setCodeError('Paste an invite link or code');
    navigate(`/join/${c}`);
  }

  return (
    <div className="dashboard">
      <section className="summary">
        <h1>Hi, {user.name.split(' ')[0]}</h1>
        <div className="summary-lines">
          <p className="ledger-line">
            <span>You are owed</span>
            <Money paise={owed} className={owed ? 'pos hand big' : 'hand big'} />
          </p>
          <p className="ledger-line">
            <span>You owe</span>
            <Money paise={owe} className={owe ? 'neg hand big' : 'hand big'} />
          </p>
        </div>
      </section>

      <section>
        <div className="section-head">
          <h2>Your groups</h2>
          <Button onClick={() => setCreating(true)}>New group</Button>
        </div>
        {list.length === 0 ? (
          <Empty
            title="No groups yet"
            action={
              <Button onClick={() => setCreating(true)} className="btn-secondary">
                Create your first group
              </Button>
            }
          >
            Make a group for your flat, a trip or a dinner club, then share the invite link with everyone in it.
          </Empty>
        ) : (
          <ul className="group-list">
            {list.map((g) => (
              <li key={g.id}>
                <Link to={`/groups/${g.id}`} className="group-row">
                  <span className="group-row-main">
                    <span className="group-row-name">{g.name}</span>
                    <span className="muted small">
                      {g.memberCount} member{g.memberCount === 1 ? '' : 's'} · updated {timeAgo(g.updatedAt)}
                    </span>
                  </span>
                  <span className={`group-row-bal ${g.myBalance > 0 ? 'pos' : g.myBalance < 0 ? 'neg' : ''}`}>
                    {g.myBalance === 0 ? (
                      <span className="muted">settled up</span>
                    ) : (
                      <>
                        <span className="small">{g.myBalance > 0 ? 'you get back' : 'you owe'}</span>
                        <span className="hand">{formatINR(Math.abs(g.myBalance))}</span>
                      </>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="join-box">
        <h2>Got an invite?</h2>
        <form onSubmit={joinByCode} className="inline-form" noValidate>
          <input
            aria-label="Invite link or code"
            placeholder="Paste invite link or code"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setCodeError('');
            }}
          />
          <button className="btn btn-secondary" type="submit">
            Open invite
          </button>
        </form>
        {codeError && <p className="field-error">{codeError}</p>}
      </section>

      <Modal open={creating} onClose={() => setCreating(false)} title="New group">
        <CreateGroupForm
          onCancel={() => setCreating(false)}
          onCreated={(g) => {
            setCreating(false);
            toast.success('Group created. Share the invite link from the Members tab.');
            navigate(`/groups/${g.id}`);
          }}
        />
      </Modal>
    </div>
  );
}
