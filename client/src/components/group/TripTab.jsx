import { useCallback, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { categoryLabel, formatDate, formatINR, todayYMD } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useResource } from '../../lib/useResource.js';
import { CategoryIcon, Icon } from '../icons.jsx';
import PlanItemForm, { PLAN_KINDS, tripDays } from '../PlanItemForm.jsx';
import TripMap from '../TripMap.jsx';
import TripSettingsForm from '../TripSettingsForm.jsx';
import { Button, Empty, ErrorState, Loading, Modal, Spinner, confirmAction } from '../ui.jsx';

const kindIcon = (k) => PLAN_KINDS.find((p) => p.value === k)?.icon ?? 'pin';
const directionsUrl = (p) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${p.lat},${p.lng}`)}`;
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

function countdown(trip) {
  if (!trip.startDate) return null;
  const today = todayYMD();
  const toStart = daysBetween(today, trip.startDate);
  if (toStart > 1) return `Starts in ${toStart} days`;
  if (toStart === 1) return 'Starts tomorrow';
  const toEnd = daysBetween(today, trip.endDate);
  if (toEnd >= 0)
    return `Day ${daysBetween(trip.startDate, today) + 1} of ${daysBetween(trip.startDate, trip.endDate) + 1}`;
  return 'Trip completed';
}

function BudgetCard({ summary }) {
  const { total, budget, byCategory, myShare } = summary;
  const pct = budget ? Math.round((total / budget) * 100) : null;
  return (
    <section className="budget-card">
      <div className="budget-top">
        <div>
          <span className="small muted">Spent so far</span>
          <span className="hand budget-total">{formatINR(total)}</span>
        </div>
        <div className="budget-right">
          {budget ? (
            <>
              <span className="small muted">of {formatINR(budget)} budget</span>
              <span className={`budget-left ${total > budget ? 'neg' : 'pos'}`}>
                {total > budget ? `${formatINR(total - budget)} over` : `${formatINR(budget - total)} left`}
              </span>
            </>
          ) : (
            <span className="small muted">Your share {formatINR(myShare)}</span>
          )}
        </div>
      </div>
      {budget > 0 && (
        <div
          className="budget-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)}
          aria-label="Budget used"
        >
          <span
            className={total > budget ? 'over' : pct > 80 ? 'warn' : ''}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}
      {byCategory.length > 0 && (
        <ul className="budget-cats">
          {byCategory.slice(0, 5).map((c) => (
            <li key={c.category}>
              <CategoryIcon category={c.category} size="sm" />
              <span>{categoryLabel(c.category)}</span>
              <span className="budget-cat-bar" aria-hidden="true">
                <span style={{ width: `${Math.max(4, (c.amount / byCategory[0].amount) * 100)}%` }} />
              </span>
              <span className="budget-cat-amt">{formatINR(c.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function PlanCard({ item, number, selected, canDelete, onVote, onEdit, onDelete, onSelect }) {
  return (
    <li className={`plan-card${selected ? ' is-selected' : ''}`} onClick={() => item.place && onSelect(item.id)}>
      <span className={`plan-marker${item.day ? '' : ' idea'}`} aria-hidden="true">
        {item.place && number != null ? number : <Icon name={kindIcon(item.kind)} size={15} />}
      </span>
      <span className="plan-body">
        <span className="plan-title">
          {item.time && <span className="plan-time">{item.time}</span>}
          {item.title}
        </span>
        {item.place && item.place.name !== item.title && <span className="muted small">{item.place.name}</span>}
        {item.notes && <span className="plan-notes small">{item.notes}</span>}
        <span className="plan-links">
          {item.place && (
            <a
              href={directionsUrl(item.place)}
              target="_blank"
              rel="noopener noreferrer"
              className="small"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="external" size={13} /> Directions
            </a>
          )}
          {item.place?.url && (
            <a
              href={item.place.url}
              target="_blank"
              rel="noopener noreferrer"
              className="small"
              onClick={(e) => e.stopPropagation()}
            >
              <Icon name="external" size={13} /> About
            </a>
          )}
          <span className="muted small">added by {item.createdBy.name}</span>
        </span>
      </span>
      <span className="plan-actions" onClick={(e) => e.stopPropagation()}>
        {!item.day && (
          <button
            type="button"
            className={`vote${item.votedByMe ? ' on' : ''}`}
            aria-pressed={item.votedByMe}
            aria-label={`${item.votedByMe ? 'Remove your vote' : 'Vote'} for ${item.title}, ${item.votes} votes`}
            onClick={() => onVote(item)}
          >
            <Icon name="thumbUp" size={15} /> {item.votes}
          </button>
        )}
        <button
          type="button"
          className="icon-btn"
          aria-label={`Edit ${item.title}`}
          title={item.day ? 'Edit' : 'Schedule or edit'}
          onClick={() => onEdit(item)}
        >
          <Icon name={item.day ? 'edit' : 'calendar'} size={16} />
        </button>
        {canDelete && (
          <button
            type="button"
            className="icon-btn"
            aria-label={`Remove ${item.title}`}
            title="Remove"
            onClick={() => onDelete(item)}
          >
            <Icon name="trash" size={16} />
          </button>
        )}
      </span>
    </li>
  );
}

function Attractions({ res, destination, plannedNames, onAdd }) {
  const [adding, setAdding] = useState(null);
  if (res.loading && !res.data) return <Loading text="Finding famous places nearby…" />;
  if (res.error && !res.data) return <ErrorState error={res.error} onRetry={res.reload} />;
  const list = res.data.results;
  if (list.length === 0) return <p className="muted small">No well-known places found near {destination.name}.</p>;
  return (
    <ul className="attractions">
      {list.map((a) => {
        const added = plannedNames.has(a.name.toLowerCase());
        return (
          <li key={a.name} className="attraction">
            {a.thumbnail ? (
              <img src={a.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
            ) : (
              <span className="attraction-noimg" aria-hidden="true">
                <Icon name="pin" size={20} />
              </span>
            )}
            <span className="attraction-body">
              <span className="attraction-name">{a.name}</span>
              {a.description && <span className="muted small">{a.description}</span>}
              <span className="attraction-actions">
                <button
                  type="button"
                  className={`btn btn-sm ${added ? 'btn-ghost' : 'btn-secondary'}`}
                  disabled={added || adding === a.name}
                  onClick={async () => {
                    setAdding(a.name);
                    await onAdd(a);
                    setAdding(null);
                  }}
                >
                  {adding === a.name ? <Spinner label="Adding" /> : <Icon name={added ? 'check' : 'plus'} size={14} />}
                  {added ? 'In plan' : 'Add idea'}
                </button>
                <a href={a.url} target="_blank" rel="noopener noreferrer" className="small">
                  Wikipedia <Icon name="external" size={12} />
                </a>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function TripTab({ group, me, version, onChanged }) {
  const toast = useToast();
  const trip = group.trip ?? {};
  const plan = useResource(() => api(`/groups/${group.id}/plan`), [group.id, version]);
  const summary = useResource(() => api(`/groups/${group.id}/summary`), [group.id, version]);
  const [editingTrip, setEditingTrip] = useState(false);
  const [form, setForm] = useState(null); // { item?, preset? }
  const [selected, setSelected] = useState(null);
  const [showFamous, setShowFamous] = useState(true);
  const isAdmin = group.myRole === 'admin';
  const days = tripDays(trip);

  const planData = plan.data ?? { scheduled: [], ideas: [] };
  // Number the pinned itinerary stops in order, so the map and the list match.
  const numbers = useMemo(() => {
    const m = new Map();
    let n = 0;
    for (const i of planData.scheduled) if (i.place) m.set(i.id, ++n);
    return m;
  }, [planData.scheduled]);

  // One request feeds both the map markers and the list below it.
  const attractionsRes = useResource(
    () =>
      trip.destination
        ? api(`/places/attractions?lat=${trip.destination.lat}&lng=${trip.destination.lng}`)
        : Promise.resolve({ results: [] }),
    [trip.destination?.lat, trip.destination?.lng],
  );

  const markers = useMemo(() => {
    const out = [];
    for (const i of planData.scheduled) {
      if (i.place)
        out.push({
          id: i.id,
          lat: i.place.lat,
          lng: i.place.lng,
          label: i.title,
          variant: 'plan',
          number: numbers.get(i.id),
        });
    }
    for (const i of planData.ideas) {
      if (i.place)
        out.push({ id: i.id, lat: i.place.lat, lng: i.place.lng, label: `Idea: ${i.title}`, variant: 'idea' });
    }
    if (showFamous) {
      const planned = new Set([...planData.scheduled, ...planData.ideas].map((i) => i.place?.name?.toLowerCase()));
      for (const a of attractionsRes.data?.results ?? []) {
        if (!planned.has(a.name.toLowerCase())) {
          out.push({ id: `a:${a.name}`, lat: a.lat, lng: a.lng, label: a.name, variant: 'attraction' });
        }
      }
    }
    return out;
  }, [planData, numbers, attractionsRes.data, showFamous]);

  const plannedNames = useMemo(
    () =>
      new Set(
        [...planData.scheduled, ...planData.ideas]
          .flatMap((i) => [i.title.toLowerCase(), i.place?.name?.toLowerCase()])
          .filter(Boolean),
      ),
    [planData],
  );

  const onSelect = useCallback((id) => setSelected(id), []);

  async function vote(item) {
    // Optimistic: flip immediately, roll back if the server says no.
    plan.setData((d) => ({
      ...d,
      ideas: d.ideas.map((i) =>
        i.id === item.id ? { ...i, votedByMe: !i.votedByMe, votes: i.votes + (i.votedByMe ? -1 : 1) } : i,
      ),
    }));
    try {
      await api(`/groups/${group.id}/plan/${item.id}/vote`, { method: 'POST', body: { up: !item.votedByMe } });
      plan.reload();
    } catch (err) {
      toast.error(err.message);
      plan.reload();
    }
  }

  async function remove(item) {
    if (!confirmAction(`Remove “${item.title}” from the plan?`)) return;
    try {
      await api(`/groups/${group.id}/plan/${item.id}`, { method: 'DELETE' });
      toast.success('Removed from the plan');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function addAttraction(a) {
    try {
      await api(`/groups/${group.id}/plan`, {
        method: 'POST',
        body: {
          title: a.name,
          kind: 'place',
          place: { name: a.name, lat: a.lat, lng: a.lng, thumbnail: a.thumbnail, url: a.url, address: '' },
          notes: a.description,
        },
      });
      toast.success(`${a.name} added to ideas. Vote on it with the group.`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  const cardProps = (item) => ({
    item,
    number: numbers.get(item.id),
    selected: selected === item.id,
    canDelete: isAdmin || item.createdBy.id === me.id,
    onVote: vote,
    onEdit: (i) => setForm({ item: i }),
    onDelete: remove,
    onSelect,
  });

  const hasTrip = trip.destination || trip.startDate;
  const byDay = new Map();
  for (const i of planData.scheduled) {
    if (!byDay.has(i.day)) byDay.set(i.day, []);
    byDay.get(i.day).push(i);
  }
  const dayList = days.length ? days : [...byDay.keys()];

  return (
    <div className="trip">
      <section className="trip-hero">
        <div className="trip-hero-main">
          <span className="trip-hero-icon" aria-hidden="true">
            <Icon name="map" size={22} />
          </span>
          <div>
            <h2>{trip.destination?.name ?? (hasTrip ? 'Trip' : 'Plan a trip together')}</h2>
            <p className="muted small">
              {trip.startDate
                ? `${formatDate(trip.startDate)} – ${formatDate(trip.endDate)} · ${days.length} day${days.length === 1 ? '' : 's'}`
                : 'Pick a destination and dates. Everyone in the group can add places, vote and plan days.'}
              {countdown(trip) && <strong className="trip-countdown"> · {countdown(trip)}</strong>}
            </p>
          </div>
        </div>
        <Button className={hasTrip ? 'btn-ghost' : 'btn-primary'} onClick={() => setEditingTrip(true)}>
          <Icon name={hasTrip ? 'edit' : 'plus'} size={15} /> {hasTrip ? 'Edit trip' : 'Set up trip'}
        </Button>
      </section>

      {summary.data && <BudgetCard summary={summary.data} />}

      <div className="trip-grid">
        <div className="trip-main">
          <div className="section-head">
            <h2>Itinerary</h2>
            <Button onClick={() => setForm({ preset: {} })}>
              <Icon name="plus" size={15} /> Add to plan
            </Button>
          </div>
          {plan.loading && !plan.data && <Loading text="Loading the plan…" />}
          {plan.error && !plan.data && <ErrorState error={plan.error} onRetry={plan.reload} />}
          {plan.data && dayList.length === 0 && (
            <Empty title="Nothing scheduled yet">
              {days.length
                ? 'Add places to a day, or turn the group’s top-voted ideas into plans.'
                : 'Set trip dates to plan day by day. Until then, collect ideas below.'}
            </Empty>
          )}
          {plan.data &&
            dayList.map((d, idx) => (
              <section key={d} className="day">
                <h3 className="day-label">
                  <span className="day-num">Day {days.length ? idx + 1 : ''}</span>
                  <span className="muted">{formatDate(d)}</span>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm day-add"
                    onClick={() => setForm({ preset: { day: d } })}
                    aria-label={`Add to ${formatDate(d)}`}
                  >
                    <Icon name="plus" size={14} /> Add
                  </button>
                </h3>
                {byDay.get(d)?.length ? (
                  <ul className="plan-list">
                    {byDay.get(d).map((i) => (
                      <PlanCard key={i.id} {...cardProps(i)} />
                    ))}
                  </ul>
                ) : (
                  <p className="day-empty muted small">Free day. Add something, or leave it for the beach.</p>
                )}
              </section>
            ))}

          <div className="section-head ideas-head">
            <h2>
              Ideas <span className="muted small">vote for what the group should do</span>
            </h2>
          </div>
          {plan.data && planData.ideas.length === 0 && (
            <p className="muted small">No ideas yet. Add one, or pick from famous places nearby.</p>
          )}
          {planData.ideas.length > 0 && (
            <ul className="plan-list">
              {planData.ideas.map((i) => (
                <PlanCard key={i.id} {...cardProps(i)} />
              ))}
            </ul>
          )}
        </div>

        <aside className="trip-side">
          <div className="map-card">
            <TripMap center={trip.destination} markers={markers} onSelect={onSelect} selectedId={selected} />
            <div className="map-legend small">
              <span>
                <span className="map-pin map-pin-plan legend-pin" /> Itinerary
              </span>
              <span>
                <span className="map-pin map-pin-idea legend-pin" /> Ideas
              </span>
              {trip.destination && (
                <label className="legend-toggle">
                  <input type="checkbox" checked={showFamous} onChange={(e) => setShowFamous(e.target.checked)} />{' '}
                  Famous places
                </label>
              )}
            </div>
          </div>
          {trip.destination ? (
            <section>
              <h2>Famous places near {trip.destination.name}</h2>
              <Attractions
                res={attractionsRes}
                destination={trip.destination}
                plannedNames={plannedNames}
                onAdd={addAttraction}
              />
              <p className="muted small attribution">
                Places and photos from Wikipedia. Map © OpenStreetMap contributors.
              </p>
            </section>
          ) : (
            <p className="muted small">Set a destination to see famous places nearby.</p>
          )}
        </aside>
      </div>

      <Modal open={editingTrip} onClose={() => setEditingTrip(false)} title={hasTrip ? 'Edit trip' : 'Set up trip'}>
        <TripSettingsForm
          group={group}
          onCancel={() => setEditingTrip(false)}
          onSaved={() => {
            setEditingTrip(false);
            toast.success('Trip saved');
            onChanged();
          }}
        />
      </Modal>
      <Modal open={Boolean(form)} onClose={() => setForm(null)} title={form?.item ? 'Edit plan' : 'Add to plan'}>
        {form && (
          <PlanItemForm
            group={group}
            item={form.item}
            preset={form.preset}
            onCancel={() => setForm(null)}
            onSaved={(item) => {
              setForm(null);
              toast.success(item.day ? `Planned for ${formatDate(item.day)}` : 'Idea added. The group can vote on it.');
              onChanged();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
