import { useState } from 'react';
import { api } from '../lib/api.js';
import { formatDate } from '../lib/format.js';
import { Icon } from './icons.jsx';
import PlaceSearch from './PlaceSearch.jsx';
import { Button, Field, FormError } from './ui.jsx';

export const PLAN_KINDS = [
  { value: 'place', label: 'Sightseeing', icon: 'pin' },
  { value: 'activity', label: 'Activity', icon: 'sparkle' },
  { value: 'food', label: 'Food', icon: 'food' },
  { value: 'transport', label: 'Getting around', icon: 'travel' },
  { value: 'stay', label: 'Stay', icon: 'bed' },
  { value: 'note', label: 'Note', icon: 'edit' },
];

/** Every calendar day of the trip, as "YYYY-MM-DD". */
export function tripDays(trip) {
  if (!trip?.startDate || !trip?.endDate) return [];
  const out = [];
  const d = new Date(`${trip.startDate}T00:00:00Z`);
  const end = new Date(`${trip.endDate}T00:00:00Z`);
  while (d <= end && out.length < 60) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

export default function PlanItemForm({ group, item, preset, onSaved, onCancel }) {
  const days = tripDays(group.trip);
  const start = item ?? preset ?? {};
  const [title, setTitle] = useState(start.title ?? '');
  const [kind, setKind] = useState(start.kind ?? 'place');
  const [day, setDay] = useState(start.day ?? '');
  const [time, setTime] = useState(start.time ?? '');
  const [notes, setNotes] = useState(start.notes ?? '');
  const [place, setPlace] = useState(start.place ?? null);
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!title.trim()) return setErrors({ title: 'Give it a title' });
    setBusy(true);
    setErrors({});
    setError(null);
    const body = { title: title.trim(), kind, day: day || null, time: day ? time : '', notes, place };
    try {
      const res = item
        ? await api(`/groups/${group.id}/plan/${item.id}`, { method: 'PATCH', body })
        : await api(`/groups/${group.id}/plan`, { method: 'POST', body });
      onSaved(res.item);
    } catch (err) {
      setErrors(err.fieldErrors?.() ?? {});
      setError(err);
      setBusy(false);
    }
  }

  return (
    <form className="form" onSubmit={submit} noValidate>
      <Field label="What" htmlFor="plan-title" error={errors.title}>
        <input
          id="plan-title"
          value={title}
          maxLength={120}
          placeholder="e.g. Sunset at Chapora Fort"
          onChange={(e) => {
            setTitle(e.target.value);
            setErrors({});
          }}
          autoFocus
        />
      </Field>

      <fieldset className="chips-field">
        <legend>Type</legend>
        <div className="chips" role="radiogroup" aria-label="Type">
          {PLAN_KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              role="radio"
              aria-checked={kind === k.value}
              className={`chip chip-plain${kind === k.value ? ' on' : ''}`}
              onClick={() => setKind(k.value)}
            >
              <Icon name={k.icon} size={15} />
              {k.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="row-even">
        <Field
          label="When"
          htmlFor="plan-day"
          error={errors.day}
          hint={days.length ? undefined : 'Set trip dates to pick a day'}
        >
          {days.length ? (
            <select id="plan-day" value={day} onChange={(e) => setDay(e.target.value)}>
              <option value="">Not decided (idea for the group to vote on)</option>
              {days.map((d, i) => (
                <option key={d} value={d}>
                  Day {i + 1} · {formatDate(d)}
                </option>
              ))}
            </select>
          ) : (
            <input id="plan-day" type="date" value={day} onChange={(e) => setDay(e.target.value)} />
          )}
        </Field>
        <Field label="Time (optional)" htmlFor="plan-time" error={errors.time}>
          <input id="plan-time" type="time" value={time} disabled={!day} onChange={(e) => setTime(e.target.value)} />
        </Field>
      </div>

      <Field label="Place on the map (optional)" htmlFor="plan-place">
        {place ? (
          <div className="picked-place">
            <Icon name="pin" size={18} />
            <span>{place.name}</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPlace(null)}>
              Remove
            </button>
          </div>
        ) : (
          <PlaceSearch
            id="plan-place"
            placeholder="Search a place to pin it on the map"
            onPick={(p) => {
              setPlace({ name: p.name, address: p.address, lat: p.lat, lng: p.lng });
              if (!title.trim()) setTitle(p.name);
            }}
          />
        )}
      </Field>

      <Field label="Notes (optional)" htmlFor="plan-notes">
        <textarea
          id="plan-notes"
          rows={2}
          maxLength={500}
          value={notes}
          placeholder="Tickets, timings, what to carry…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <FormError error={error} />
      <div className="form-actions">
        <span className="spacer" />
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
        <Button type="submit" loading={busy}>
          {item ? 'Save changes' : day ? 'Add to itinerary' : 'Add idea'}
        </Button>
      </div>
    </form>
  );
}
