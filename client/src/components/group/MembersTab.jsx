import { useState } from 'react';
import { api } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { Avatar, Button, Field, FormError, confirmAction } from '../ui.jsx';

function GroupSettings({ group, onChanged }) {
  const toast = useToast();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const dirty = name !== group.name || description !== group.description;

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api(`/groups/${group.id}`, { method: 'PATCH', body: { name, description } });
      toast.success('Group details saved');
      onChanged();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={save} noValidate>
      <div className="row-2">
        <Field label="Group name" htmlFor="gs-name">
          <input id="gs-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Description" htmlFor="gs-desc">
          <input id="gs-desc" value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} />
        </Field>
      </div>
      <FormError error={error} />
      <div className="form-actions">
        <span className="spacer" />
        <Button type="submit" loading={busy} disabled={!dirty || !name.trim()}>
          Save details
        </Button>
      </div>
    </form>
  );
}

export default function MembersTab({ group, me, onChanged, onLeft }) {
  const toast = useToast();
  const isAdmin = group.myRole === 'admin';
  const [busy, setBusy] = useState(null);
  const inviteUrl = group.inviteCode ? `${window.location.origin}/join/${group.inviteCode}` : null;

  async function run(key, fn, success) {
    setBusy(key);
    try {
      const res = await fn();
      if (success) toast.success(success);
      return res;
    } catch (err) {
      toast.error(err.message);
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success('Invite link copied');
    } catch {
      toast.info('Copy the link from the box above');
    }
  }

  async function regenerate() {
    if (!confirmAction('Reset the invite link? The old link will stop working for anyone who has not joined yet.'))
      return;
    const res = await run(
      'regen',
      () => api(`/groups/${group.id}/invite/regenerate`, { method: 'POST' }),
      'New invite link created',
    );
    if (res) onChanged();
  }

  async function setRole(m, role) {
    const res = await run(
      `role-${m.id}`,
      () => api(`/groups/${group.id}/members/${m.id}`, { method: 'PATCH', body: { role } }),
      `${m.name} is now ${role === 'admin' ? 'an admin' : 'a member'}`,
    );
    if (res) onChanged();
  }

  async function remove(m) {
    const self = m.id === me.id;
    const question = self ? `Leave “${group.name}”?` : `Remove ${m.name} from “${group.name}”?`;
    if (!confirmAction(question)) return;
    const res = await run(
      `rm-${m.id}`,
      () => api(`/groups/${group.id}/members/${m.id}`, { method: 'DELETE' }),
      self ? 'You left the group' : `${m.name} was removed`,
    );
    if (!res) return;
    if (self) onLeft();
    else onChanged();
  }

  return (
    <div className="members">
      {isAdmin && (
        <section className="invite">
          <h2>Invite people</h2>
          <p className="muted small">Anyone with this link can join the group after logging in.</p>
          <div className="inline-form">
            <input readOnly value={inviteUrl} aria-label="Invite link" onFocus={(e) => e.target.select()} />
            <button type="button" className="btn btn-primary" onClick={copyInvite}>
              Copy link
            </button>
          </div>
          <Button className="btn-ghost btn-sm" loading={busy === 'regen'} onClick={regenerate}>
            Reset link
          </Button>
        </section>
      )}

      <section>
        <h2>Members ({group.members.length})</h2>
        <ul className="member-list">
          {group.members.map((m) => (
            <li key={m.id}>
              <Avatar name={m.name} />
              <span className="member-main">
                <span>
                  {m.name}
                  {m.id === me.id && <span className="muted"> (you)</span>}
                </span>
                <span className="muted small">{m.email}</span>
              </span>
              {m.role === 'admin' && <span className="tag">admin</span>}
              <span className="row-actions">
                {isAdmin && m.id !== me.id && (
                  <Button
                    className="btn-ghost btn-sm"
                    loading={busy === `role-${m.id}`}
                    onClick={() => setRole(m, m.role === 'admin' ? 'member' : 'admin')}
                  >
                    {m.role === 'admin' ? 'Remove admin' : 'Make admin'}
                  </Button>
                )}
                {(m.id === me.id || isAdmin) && (
                  <Button className="btn-danger-ghost btn-sm" loading={busy === `rm-${m.id}`} onClick={() => remove(m)}>
                    {m.id === me.id ? 'Leave group' : 'Remove'}
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
        <p className="muted small">People can only leave or be removed once their balance in this group is settled.</p>
      </section>

      {isAdmin && (
        <section>
          <h2>Group details</h2>
          <GroupSettings key={`${group.name}|${group.description}`} group={group} onChanged={onChanged} />
        </section>
      )}
    </div>
  );
}
