import { useState } from 'react';
import { api } from '../lib/api.js';
import { fromPaise } from '../lib/format.js';
import { Icon } from './icons.jsx';
import { Button, Field, FormError } from './ui.jsx';

export const BOOKING_TYPES = [
  { value: 'flight', label: 'Flight', icon: 'travel' },
  { value: 'train', label: 'Train', icon: 'train' },
  { value: 'bus', label: 'Bus', icon: 'bus' },
  { value: 'hotel', label: 'Stay', icon: 'bed' },
  { value: 'activity', label: 'Activity', icon: 'ticket' },
  { value: 'other', label: 'Other', icon: 'other' },
];

const REF_LABEL = {
  flight: 'PNR / booking ref',
  train: 'PNR number',
  bus: 'Ticket number',
  hotel: 'Confirmation number',
};

export default function BookingForm({ group, me, booking, onSaved, onCancel }) {
  const b = booking ?? {};
  const [f, setF] = useState({
    type: b.type ?? 'flight',
    title: b.title ?? '',
    provider: b.provider ?? '',
    reference: b.reference ?? '',
    startDate: b.startDate ?? group.trip?.startDate ?? '',
    startTime: b.startTime ?? '',
    endDate: b.endDate ?? '',
    endTime: b.endTime ?? '',
    location: b.location ?? '',
    cost: b.cost ? fromPaise(b.cost) : '',
    paidBy: b.paidBy?.id ?? me.id,
    notes: b.notes ?? '',
  });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (patch) => {
    setF((s) => ({ ...s, ...patch }));
    setErrors((e) => {
      const n = { ...e };
      Object.keys(patch).forEach((k) => delete n[k]);
      return n;
    });
  };
  const isStay = f.type === 'hotel';

  async function submit(e) {
    e.preventDefault();
    const local = {};
    if (!f.title.trim()) local.title = 'Give the booking a title';
    if (f.cost && !/^\d+(\.\d{1,2})?$/.test(f.cost)) local.cost = 'Enter an amount like 4599 or 4599.50';
    if (f.startDate && f.endDate && f.endDate < f.startDate) local.endDate = 'Must be on or after the start date';
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    setError(null);
    const body = {
      ...f,
      title: f.title.trim(),
      startDate: f.startDate || null,
      endDate: f.endDate || null,
      cost: f.cost || null,
      paidBy: f.paidBy || null,
    };
    try {
      const res = booking
        ? await api(`/groups/${group.id}/bookings/${booking.id}`, { method: 'PUT', body })
        : await api(`/groups/${group.id}/bookings`, { method: 'POST', body });
      onSaved(res.booking);
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <fieldset className="chips-field">
        <legend>Type</legend>
        <div className="chips" role="radiogroup" aria-label="Booking type">
          {BOOKING_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              role="radio"
              aria-checked={f.type === t.value}
              className={`chip chip-plain${f.type === t.value ? ' on' : ''}`}
              onClick={() => set({ type: t.value })}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="row-2">
        <Field label="Title" htmlFor="bk-title" error={errors.title}>
          <input
            id="bk-title"
            value={f.title}
            maxLength={120}
            placeholder={isStay ? 'e.g. Zostel Anjuna, 2 rooms' : 'e.g. BLR → GOI'}
            onChange={(e) => set({ title: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label={REF_LABEL[f.type] ?? 'Reference'} htmlFor="bk-ref">
          <input id="bk-ref" value={f.reference} maxLength={60} onChange={(e) => set({ reference: e.target.value })} />
        </Field>
      </div>
      <div className="row-even">
        <Field label={isStay ? 'Booked on (site / hotel)' : 'Airline / operator'} htmlFor="bk-prov">
          <input id="bk-prov" value={f.provider} maxLength={80} onChange={(e) => set({ provider: e.target.value })} />
        </Field>
        <Field label={isStay ? 'Address' : 'From → to / venue'} htmlFor="bk-loc">
          <input id="bk-loc" value={f.location} maxLength={160} onChange={(e) => set({ location: e.target.value })} />
        </Field>
      </div>
      <div className="row-even">
        <Field label={isStay ? 'Check-in' : 'Departs'} htmlFor="bk-sd" error={errors.startDate}>
          <span className="date-time">
            <input id="bk-sd" type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
            <input
              aria-label="Time"
              type="time"
              value={f.startTime}
              onChange={(e) => set({ startTime: e.target.value })}
            />
          </span>
        </Field>
        <Field label={isStay ? 'Check-out' : 'Arrives'} htmlFor="bk-ed" error={errors.endDate}>
          <span className="date-time">
            <input
              id="bk-ed"
              type="date"
              value={f.endDate}
              min={f.startDate || undefined}
              onChange={(e) => set({ endDate: e.target.value })}
            />
            <input aria-label="Time" type="time" value={f.endTime} onChange={(e) => set({ endTime: e.target.value })} />
          </span>
        </Field>
      </div>
      <div className="row-even">
        <Field label="Total cost (₹, optional)" htmlFor="bk-cost" error={errors.cost}>
          <input
            id="bk-cost"
            className="input-money"
            inputMode="decimal"
            placeholder="0.00"
            value={f.cost}
            onChange={(e) => set({ cost: e.target.value.replace(/[^\d.]/g, '') })}
          />
        </Field>
        <Field label="Paid by" htmlFor="bk-paid">
          <select id="bk-paid" value={f.paidBy} onChange={(e) => set({ paidBy: e.target.value })}>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === me.id ? `${m.name} (you)` : m.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)" htmlFor="bk-notes">
        <textarea
          id="bk-notes"
          rows={2}
          maxLength={500}
          value={f.notes}
          placeholder="Seats, baggage, check-in rules…"
          onChange={(e) => set({ notes: e.target.value })}
        />
      </Field>
      <FormError error={error} />
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={busy}>
          {booking ? 'Save changes' : 'Save booking'}
        </Button>
      </div>
    </form>
  );
}
