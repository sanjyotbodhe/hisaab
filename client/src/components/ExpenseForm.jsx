import { useMemo, useRef, useState } from 'react';
import { computeSplits, distribute, SplitError } from '@shared/split.js';
import { api, newRequestId } from '../lib/api.js';
import { CATEGORIES, formatINR, fromPaise, toPaise, todayYMD } from '../lib/format.js';
import { CategoryIcon } from './icons.jsx';
import { Button, Field, FormError } from './ui.jsx';

const SPLIT_LABELS = {
  equal: 'Equally',
  exact: 'Exact amounts',
  percent: 'Percentages',
  shares: 'Shares',
};

/** Value inputs that already form a valid split, used when switching split type. */
function prefillValues(type, ids, amountPaise) {
  const out = {};
  if (type === 'shares') ids.forEach((id) => (out[id] = '1'));
  if (type === 'percent' && ids.length) {
    distribute(
      10000,
      ids.map(() => 1),
    ).forEach((bp, i) => (out[ids[i]] = fromPaise(bp).replace(/\.00$/, '')));
  }
  if (type === 'exact' && ids.length && amountPaise > 0) {
    distribute(
      amountPaise,
      ids.map(() => 1),
    ).forEach((p, i) => (out[ids[i]] = fromPaise(p)));
  }
  return out;
}

function initialState(source, group, me, mode) {
  if (source) {
    const people = source.splits ?? source.participants;
    const values = {};
    for (const p of people) values[p.user.id] = p.value == null ? '' : String(p.value);
    return {
      description: source.description,
      amount: fromPaise(source.amount),
      date: source.date ?? todayYMD(),
      category: source.category,
      paidBy: source.paidBy.id,
      splitType: source.splitType,
      selected: new Set(people.map((p) => p.user.id)),
      values,
      notes: source.notes ?? '',
      frequency: source.frequency ?? 'monthly',
      startDate: todayYMD(),
    };
  }
  return {
    description: '',
    amount: '',
    date: todayYMD(),
    category: mode === 'recurring' ? 'rent' : 'food',
    paidBy: me.id,
    splitType: 'equal',
    selected: new Set(group.members.map((m) => m.id)),
    values: {},
    notes: '',
    frequency: 'monthly',
    startDate: todayYMD(),
  };
}

/**
 * mode: "expense" (add / edit) or "recurring" (create a recurring rule).
 * `expense` is passed when editing.
 */
export default function ExpenseForm({ group, me, expense, mode = 'expense', onSaved, onCancel, onDelete }) {
  const [f, setF] = useState(() => initialState(expense, group, me, mode));
  const [version, setVersion] = useState(expense?.version ?? 0);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [conflict, setConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const requestId = useRef(newRequestId());
  const isEdit = Boolean(expense) && mode === 'expense';

  // Everyone who can appear in the split: current members, plus former members on old expenses.
  const people = useMemo(() => {
    const list = group.members.map((m) => ({ id: m.id, name: m.name, former: false }));
    for (const s of expense?.splits ?? []) {
      if (!list.some((p) => p.id === s.user.id)) list.push({ id: s.user.id, name: s.user.name, former: true });
    }
    return list;
  }, [group.members, expense]);

  const set = (patch) => {
    setF((s) => ({ ...s, ...patch }));
    // Clear errors for the fields being edited, so stale messages don't linger.
    setErrors((e) => {
      const next = { ...e };
      for (const key of Object.keys(patch)) delete next[key];
      if ('values' in patch || 'selected' in patch || 'splitType' in patch) delete next.participants;
      return next;
    });
  };
  const amountPaise = toPaise(f.amount);
  const selectedIds = people.filter((p) => f.selected.has(p.id)).map((p) => p.id);
  const participants = selectedIds.map((id) => ({
    user: id,
    value: f.splitType === 'equal' ? null : (f.values[id] ?? ''),
  }));

  // Live preview using the exact same code the server uses to validate and store the split.
  const preview = useMemo(() => {
    if (Number.isNaN(amountPaise) || amountPaise <= 0) return { error: null, shares: null };
    try {
      const rows = computeSplits(amountPaise, f.splitType, participants);
      return { error: null, shares: new Map(rows.map((r) => [r.user, r.amount])) };
    } catch (err) {
      if (err instanceof SplitError) return { error: err.message, shares: null };
      throw err;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amountPaise, f.splitType, JSON.stringify(participants)]);

  const enteredTotal = (() => {
    if (f.splitType === 'exact') return participants.reduce((a, p) => a + (toPaise(p.value) || 0), 0);
    if (f.splitType === 'percent') return participants.reduce((a, p) => a + (toPaise(p.value) || 0), 0);
    return null;
  })();

  function toggle(id) {
    const selected = new Set(f.selected);
    if (selected.has(id)) selected.delete(id);
    else selected.add(id);
    const ids = people.filter((p) => selected.has(p.id)).map((p) => p.id);
    set({ selected, values: f.splitType === 'equal' ? f.values : prefillValues(f.splitType, ids, amountPaise) });
  }

  function changeType(type) {
    set({ splitType: type, values: prefillValues(type, selectedIds, amountPaise) });
  }

  function loadLatest() {
    setF(initialState(conflict, group, me, mode));
    setVersion(conflict.version);
    setConflict(null);
    setFormError(null);
  }

  async function submit(e) {
    e.preventDefault();
    setErrors({});
    setFormError(null);
    const local = {};
    if (!f.description.trim()) local.description = 'Description is required';
    if (Number.isNaN(amountPaise) || amountPaise <= 0)
      local.amount = 'Enter an amount greater than 0, like 450 or 99.50';
    if (selectedIds.length === 0) local.participants = 'Pick at least one person';
    else if (preview.error) local.participants = preview.error;
    if (Object.keys(local).length) {
      setErrors(local);
      return;
    }

    const body = {
      description: f.description.trim(),
      amount: f.amount.trim(),
      paidBy: f.paidBy,
      splitType: f.splitType,
      participants,
      category: f.category,
    };
    setSaving(true);
    try {
      let result;
      if (mode === 'recurring') {
        result = await api(`/groups/${group.id}/recurring`, {
          method: 'POST',
          body: { ...body, frequency: f.frequency, startDate: f.startDate },
        });
      } else if (isEdit) {
        result = await api(`/groups/${group.id}/expenses/${expense.id}`, {
          method: 'PUT',
          body: { ...body, date: f.date, notes: f.notes, version },
        });
      } else {
        result = await api(`/groups/${group.id}/expenses`, {
          method: 'POST',
          body: { ...body, date: f.date, notes: f.notes, clientRequestId: requestId.current },
        });
      }
      onSaved(result);
    } catch (err) {
      if (err.code === 'EDIT_CONFLICT') {
        setConflict(err.details?.latest ?? null);
        setFormError(err);
      } else {
        setErrors(err.fieldErrors?.() ?? {});
        setFormError(err);
      }
    } finally {
      setSaving(false);
    }
  }

  const unit = { exact: '₹', percent: '%', shares: 'shares' }[f.splitType];

  return (
    <form className="form expense-form" onSubmit={submit} noValidate>
      <div className="row-2">
        <Field label="Description" htmlFor="ex-desc" error={errors.description}>
          <input
            id="ex-desc"
            value={f.description}
            maxLength={100}
            placeholder={mode === 'recurring' ? 'e.g. Flat rent' : 'e.g. Dinner at Truffles'}
            onChange={(e) => set({ description: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="Amount (₹)" htmlFor="ex-amt" error={errors.amount}>
          <input
            id="ex-amt"
            inputMode="decimal"
            value={f.amount}
            placeholder="0.00"
            className="input-money"
            onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '') })}
          />
        </Field>
      </div>

      <div className={mode === 'recurring' ? 'row-3' : 'row-even'}>
        <Field label="Paid by" htmlFor="ex-paid" error={errors.paidBy}>
          <select id="ex-paid" value={f.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id === me.id ? `${p.name} (you)` : p.name}
                {p.former ? ' (left group)' : ''}
              </option>
            ))}
          </select>
        </Field>
        {mode === 'recurring' ? (
          <>
            <Field label="Repeats" htmlFor="ex-freq">
              <select id="ex-freq" value={f.frequency} onChange={(e) => set({ frequency: e.target.value })}>
                <option value="monthly">Every month</option>
                <option value="weekly">Every week</option>
              </select>
            </Field>
            <Field label="First on" htmlFor="ex-start" error={errors.startDate}>
              <input
                id="ex-start"
                type="date"
                value={f.startDate}
                onChange={(e) => set({ startDate: e.target.value })}
              />
            </Field>
          </>
        ) : (
          <Field label="Date" htmlFor="ex-date" error={errors.date}>
            <input
              id="ex-date"
              type="date"
              value={f.date}
              max={todayYMD()}
              onChange={(e) => set({ date: e.target.value })}
            />
          </Field>
        )}
      </div>

      <fieldset className="chips-field">
        <legend>Category</legend>
        <div className="chips" role="radiogroup" aria-label="Category">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              role="radio"
              aria-checked={f.category === c.value}
              className={`chip${f.category === c.value ? ' on' : ''}`}
              onClick={() => set({ category: c.value })}
            >
              <CategoryIcon category={c.value} size="sm" />
              {c.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="split">
        <legend>Split</legend>
        <div className="segmented" role="radiogroup" aria-label="How to split">
          {Object.entries(SPLIT_LABELS).map(([type, label]) => (
            <button
              key={type}
              type="button"
              role="radio"
              aria-checked={f.splitType === type}
              className={f.splitType === type ? 'on' : ''}
              onClick={() => changeType(type)}
            >
              {label}
            </button>
          ))}
        </div>

        <ul className="split-list">
          {people.map((p) => {
            const checked = f.selected.has(p.id);
            const share = preview.shares?.get(p.id);
            return (
              <li key={p.id} className={checked ? '' : 'off'}>
                <label className="check">
                  <input type="checkbox" checked={checked} onChange={() => toggle(p.id)} />
                  <span>
                    {p.name}
                    {p.id === me.id && <span className="muted"> (you)</span>}
                    {p.former && <span className="muted"> (left group)</span>}
                  </span>
                </label>
                {checked && f.splitType !== 'equal' && (
                  <span className="split-input">
                    <input
                      inputMode="decimal"
                      aria-label={`${SPLIT_LABELS[f.splitType]} for ${p.name}`}
                      value={f.values[p.id] ?? ''}
                      onChange={(e) => set({ values: { ...f.values, [p.id]: e.target.value.replace(/[^\d.]/g, '') } })}
                    />
                    <span className="unit">{unit}</span>
                  </span>
                )}
                <span className="split-share">{checked && share != null ? formatINR(share) : ''}</span>
              </li>
            );
          })}
        </ul>
        {f.splitType === 'exact' && !Number.isNaN(amountPaise) && amountPaise > 0 && (
          <p className={`split-sum ${enteredTotal === amountPaise ? 'ok' : ''}`}>
            {enteredTotal === amountPaise
              ? 'Amounts add up.'
              : enteredTotal < amountPaise
                ? `${formatINR(amountPaise - enteredTotal)} left to assign`
                : `${formatINR(enteredTotal - amountPaise)} over the total`}
          </p>
        )}
        {f.splitType === 'percent' && (
          <p className={`split-sum ${enteredTotal === 10000 ? 'ok' : ''}`}>
            {enteredTotal === 10000
              ? 'Adds up to 100%.'
              : `${fromPaise(enteredTotal).replace(/\.00$/, '')}% of 100% assigned`}
          </p>
        )}
        {errors.participants && (
          <p className="field-error" role="alert">
            {errors.participants}
          </p>
        )}
      </fieldset>

      {mode === 'expense' && (
        <Field label="Notes (optional)" htmlFor="ex-notes" error={errors.notes}>
          <textarea
            id="ex-notes"
            rows={2}
            maxLength={500}
            value={f.notes}
            onChange={(e) => set({ notes: e.target.value })}
          />
        </Field>
      )}

      <FormError error={formError} />
      {conflict && (
        <button type="button" className="btn btn-secondary" onClick={loadLatest}>
          Load the latest version
        </button>
      )}

      <div className="form-actions">
        {isEdit && onDelete && (
          <button type="button" className="btn btn-danger-ghost" onClick={onDelete}>
            Delete expense
          </button>
        )}
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={saving}>
          {mode === 'recurring' ? 'Create recurring expense' : isEdit ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  );
}
