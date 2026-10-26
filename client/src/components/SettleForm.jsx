import { useRef, useState } from 'react';
import { api, newRequestId } from '../lib/api.js';
import { formatINR, fromPaise, toPaise, todayYMD } from '../lib/format.js';
import { Button, Field, FormError } from './ui.jsx';

/** Record a real payment between two members ("Rahul paid Asha ₹500"). */
export default function SettleForm({ group, me, preset, onSaved, onCancel }) {
  const isAdmin = group.myRole === 'admin';
  const [from, setFrom] = useState(preset?.from ?? me.id);
  const [to, setTo] = useState(preset?.to ?? group.members.find((m) => m.id !== me.id)?.id ?? '');
  const [amount, setAmount] = useState(preset?.amount ? fromPaise(preset.amount) : '');
  const [date, setDate] = useState(todayYMD());
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(newRequestId());

  const clear = (...keys) =>
    setErrors((e) => {
      const next = { ...e };
      keys.forEach((k) => delete next[k]);
      return next;
    });
  const name = (id) => group.members.find((m) => m.id === id)?.name ?? '';

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const local = {};
    if (from === to) local.to = 'Pick two different people';
    const paise = toPaise(amount);
    if (Number.isNaN(paise) || paise <= 0) local.amount = 'Enter an amount greater than 0';
    if (!isAdmin && from !== me.id && to !== me.id) local.from = 'You can only record payments you made or received';
    if (Object.keys(local).length) return setErrors(local);

    setSaving(true);
    try {
      const result = await api(`/groups/${group.id}/settlements`, {
        method: 'POST',
        body: { from, to, amount: amount.trim(), date, note, clientRequestId: requestId.current },
      });
      onSaved(result);
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setFormError(err);
    } finally {
      setSaving(false);
    }
  }

  const options = group.members.map((m) => (
    <option key={m.id} value={m.id}>
      {m.id === me.id ? `${m.name} (you)` : m.name}
    </option>
  ));
  const paise = toPaise(amount);

  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="row-2">
        <Field label="Who paid" htmlFor="st-from" error={errors.from}>
          <select
            id="st-from"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              clear('from', 'to');
            }}
          >
            {options}
          </select>
        </Field>
        <Field label="Who received" htmlFor="st-to" error={errors.to}>
          <select
            id="st-to"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              clear('from', 'to');
            }}
          >
            {options}
          </select>
        </Field>
      </div>
      <div className="row-2">
        <Field label="Amount (₹)" htmlFor="st-amt" error={errors.amount}>
          <input
            id="st-amt"
            className="input-money"
            inputMode="decimal"
            value={amount}
            placeholder="0.00"
            onChange={(e) => {
              setAmount(e.target.value.replace(/[^\d.]/g, ''));
              clear('amount');
            }}
            autoFocus
          />
        </Field>
        <Field label="Date" htmlFor="st-date" error={errors.date}>
          <input
            id="st-date"
            type="date"
            value={date}
            max={todayYMD()}
            onChange={(e) => {
              setDate(e.target.value);
              clear('date');
            }}
          />
        </Field>
      </div>
      <Field label="Note (optional)" htmlFor="st-note" hint="e.g. UPI ref or “cash at the airport”">
        <input id="st-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </Field>
      {from !== to && !Number.isNaN(paise) && paise > 0 && (
        <p className="ledger-line hand">
          {name(from)} paid {name(to)} {formatINR(paise)}
        </p>
      )}
      <FormError error={formError} />
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={saving}>
          Record payment
        </Button>
      </div>
    </form>
  );
}
