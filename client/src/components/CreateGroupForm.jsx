import { useState } from 'react';
import { api } from '../lib/api.js';
import { Button, Field, FormError } from './ui.jsx';

export default function CreateGroupForm({ onCreated, onCancel }) {
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
        <input
          id="g-desc"
          value={description}
          maxLength={200}
          placeholder="e.g. Koramangala flat, since June"
          onChange={(e) => setDescription(e.target.value)}
        />
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
