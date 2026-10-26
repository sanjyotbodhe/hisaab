import { useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Button, Field, FormError } from './ui.jsx';

const UPI_ID = /^[a-zA-Z0-9._-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{1,63}$/;

export default function ProfileForm({ onSaved, onCancel }) {
  const { user, updateUser } = useAuth();
  const [name, setName] = useState(user.name);
  const [upiId, setUpiId] = useState(user.upiId ?? '');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const local = {};
    if (!name.trim()) local.name = 'Enter your name';
    if (upiId.trim() && !UPI_ID.test(upiId.trim())) local.upiId = 'Enter a UPI ID like yourname@okaxis';
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    setError(null);
    try {
      const res = await api('/auth/me', { method: 'PATCH', body: { name: name.trim(), upiId: upiId.trim() } });
      updateUser(res.user);
      onSaved();
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Name" htmlFor="pf-name" error={errors.name}>
        <input id="pf-name" value={name} maxLength={50} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field
        label="UPI ID (optional)"
        htmlFor="pf-upi"
        error={errors.upiId}
        hint="Friends who owe you get a one-tap “Pay via UPI” button with the exact amount"
      >
        <input
          id="pf-upi"
          value={upiId}
          maxLength={100}
          placeholder="yourname@okaxis"
          autoComplete="off"
          onChange={(e) => {
            setUpiId(e.target.value);
            setErrors({});
          }}
        />
      </Field>
      <p className="muted small">Your email: {user.email}</p>
      <FormError error={error} />
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
