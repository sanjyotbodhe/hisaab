import { useState } from 'react';
import { api } from '../lib/api.js';
import { fromPaise } from '../lib/format.js';
import { Icon } from './icons.jsx';
import PlaceSearch from './PlaceSearch.jsx';
import { Button, Field, FormError } from './ui.jsx';

export default function TripSettingsForm({ group, onSaved, onCancel }) {
  const trip = group.trip ?? {};
  const [destination, setDestination] = useState(trip.destination ?? null);
  const [startDate, setStartDate] = useState(trip.startDate ?? '');
  const [endDate, setEndDate] = useState(trip.endDate ?? '');
  const [budget, setBudget] = useState(trip.budget ? fromPaise(trip.budget).replace(/\.00$/, '') : '');
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    const local = {};
    if (Boolean(startDate) !== Boolean(endDate)) local.endDate = 'Set both dates, or neither';
    if (startDate && endDate && endDate < startDate) local.endDate = 'The trip must end after it starts';
    if (budget && !/^\d+(\.\d{1,2})?$/.test(budget)) local.budget = 'Enter an amount like 40000';
    if (Object.keys(local).length) return setErrors(local);
    setBusy(true);
    setErrors({});
    setError(null);
    try {
      const res = await api(`/groups/${group.id}/trip`, {
        method: 'PUT',
        body: {
          destination: destination ? { name: destination.name, lat: destination.lat, lng: destination.lng } : null,
          startDate: startDate || null,
          endDate: endDate || null,
          budget: budget || null,
        },
      });
      onSaved(res.group);
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="Destination" htmlFor="trip-dest">
        {destination ? (
          <div className="picked-place">
            <Icon name="pin" size={18} />
            <span>{destination.name}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDestination(null)}>
              Change
            </button>
          </div>
        ) : (
          <PlaceSearch
            id="trip-dest"
            placeholder="Where are you going? e.g. Goa, Manali, Jaipur"
            onPick={setDestination}
            autoFocus
          />
        )}
      </Field>
      <div className="row-even">
        <Field label="From" htmlFor="trip-start" error={errors.startDate}>
          <input id="trip-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>
        <Field label="To" htmlFor="trip-end" error={errors.endDate}>
          <input
            id="trip-end"
            type="date"
            value={endDate}
            min={startDate || undefined}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Field>
      </div>
      <Field
        label="Group budget (₹, optional)"
        htmlFor="trip-budget"
        error={errors.budget}
        hint="We'll track spending against it"
      >
        <input
          id="trip-budget"
          className="input-money"
          inputMode="decimal"
          placeholder="e.g. 40000"
          value={budget}
          onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ''))}
        />
      </Field>
      <FormError error={error} />
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={busy}>
          Save trip
        </Button>
      </div>
    </form>
  );
}
