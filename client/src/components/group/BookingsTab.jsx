import { useState } from 'react';
import { api } from '../../lib/api.js';
import { formatDate, formatINR } from '../../lib/format.js';
import { useToast } from '../../lib/toast.jsx';
import { useResource } from '../../lib/useResource.js';
import BookingForm, { BOOKING_TYPES } from '../BookingForm.jsx';
import { Icon } from '../icons.jsx';
import { Button, Empty, ErrorState, Loading, Modal, confirmAction } from '../ui.jsx';

const typeIcon = (t) => BOOKING_TYPES.find((x) => x.value === t)?.icon ?? 'other';

/** Pre-filled searches on well-known sites. We link out; we don't pretend to book. */
function searchLinks(trip, members) {
  const dest = trip?.destination?.name;
  const links = [];
  if (dest) {
    const when = trip.startDate ? ` on ${trip.startDate}` : '';
    const back = trip.endDate ? ` returning ${trip.endDate}` : '';
    links.push({
      label: 'Find flights',
      icon: 'travel',
      href: `https://www.google.com/travel/flights?q=${encodeURIComponent(`Flights to ${dest}${when}${back}`)}`,
    });
    const hotel = new URLSearchParams({ ss: dest, group_adults: String(Math.max(1, members)) });
    if (trip.startDate) hotel.set('checkin', trip.startDate);
    if (trip.endDate) hotel.set('checkout', trip.endDate);
    links.push({ label: 'Find stays', icon: 'bed', href: `https://www.booking.com/searchresults.html?${hotel}` });
  }
  links.push({ label: 'Trains (IRCTC)', icon: 'train', href: 'https://www.irctc.co.in/nget/train-search' });
  links.push({ label: 'Buses (redBus)', icon: 'bus', href: 'https://www.redbus.in/' });
  return links;
}

function when(date, time) {
  if (!date) return '';
  return `${formatDate(date)}${time ? `, ${time}` : ''}`;
}

export default function BookingsTab({ group, me, version, onChanged }) {
  const toast = useToast();
  const res = useResource(() => api(`/groups/${group.id}/bookings`), [group.id, version]);
  const [form, setForm] = useState(null); // {} for new, { booking } to edit
  const [busy, setBusy] = useState(null);
  const isAdmin = group.myRole === 'admin';

  async function addExpense(b) {
    setBusy(b.id);
    try {
      await api(`/groups/${group.id}/bookings/${b.id}/expense`, { method: 'POST' });
      toast.success(`${formatINR(b.cost)} added as an expense, split equally`);
      onChanged();
    } catch (err) {
      toast.error(err.message);
      if (err.code === 'ALREADY_EXPENSED') onChanged();
    } finally {
      setBusy(null);
    }
  }

  async function remove(b) {
    const extra = b.expenseId ? ' The expense it created will stay.' : '';
    if (!confirmAction(`Remove the booking “${b.title}”?${extra}`)) return;
    try {
      await api(`/groups/${group.id}/bookings/${b.id}`, { method: 'DELETE' });
      toast.success('Booking removed');
      onChanged();
    } catch (err) {
      toast.error(err.message);
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copied');
    } catch {
      toast.info(text);
    }
  }

  let body;
  if (res.loading && !res.data) body = <Loading text="Loading bookings…" />;
  else if (res.error && !res.data) body = <ErrorState error={res.error} onRetry={res.reload} />;
  else if (res.data.items.length === 0) {
    body = (
      <Empty
        title="No bookings saved yet"
        action={
          <Button onClick={() => setForm({})}>
            <Icon name="plus" size={15} /> Save a booking
          </Button>
        }
      >
        Keep every PNR, ticket and hotel confirmation here, so nobody has to scroll WhatsApp at the airport.
      </Empty>
    );
  } else {
    body = (
      <ul className="bookings">
        {res.data.items.map((b) => (
          <li key={b.id} className={`booking booking-${b.type}`}>
            <span className="booking-icon" aria-hidden="true">
              <Icon name={typeIcon(b.type)} size={20} />
            </span>
            <div className="booking-main">
              <div className="booking-title">
                <strong>{b.title}</strong>
                {b.provider && <span className="muted small">{b.provider}</span>}
              </div>
              <div className="booking-times small">
                {b.startDate && (
                  <span>
                    <Icon name="calendar" size={13} /> {when(b.startDate, b.startTime)}
                    {b.endDate && ` → ${when(b.endDate, b.endTime)}`}
                  </span>
                )}
                {b.location && (
                  <span>
                    <Icon name="pin" size={13} /> {b.location}
                  </span>
                )}
              </div>
              {b.notes && <p className="booking-notes small">{b.notes}</p>}
            </div>
            <div className="booking-side">
              {b.reference && (
                <button type="button" className="ref" onClick={() => copy(b.reference)} title="Copy">
                  <span className="small muted">Ref</span>
                  <span className="ref-code">{b.reference}</span>
                  <Icon name="copy" size={13} />
                </button>
              )}
              {b.cost > 0 && (
                <span className="small">
                  <span className="hand booking-cost">{formatINR(b.cost)}</span>
                  {b.paidBy && <span className="muted"> paid by {b.paidBy.id === me.id ? 'you' : b.paidBy.name}</span>}
                </span>
              )}
              <div className="row-actions">
                {b.cost > 0 &&
                  (b.expenseId ? (
                    <span className="tag tag-pos">
                      <Icon name="check" size={11} /> in expenses
                    </span>
                  ) : (
                    <Button className="btn-secondary btn-sm" loading={busy === b.id} onClick={() => addExpense(b)}>
                      Add as expense
                    </Button>
                  ))}
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Edit ${b.title}`}
                  onClick={() => setForm({ booking: b })}
                >
                  <Icon name="edit" size={16} />
                </button>
                {(isAdmin || b.createdBy.id === me.id) && (
                  <button type="button" className="icon-btn" aria-label={`Remove ${b.title}`} onClick={() => remove(b)}>
                    <Icon name="trash" size={16} />
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="bookings-tab">
      <section className="search-out">
        <div>
          <h2>Find and book</h2>
          <p className="muted small">
            Opens trusted booking sites
            {group.trip?.destination ? ` with ${group.trip.destination.name} and your dates filled in` : ''}. Save the
            confirmation here once you book.
          </p>
        </div>
        <div className="search-links">
          {searchLinks(group.trip, group.members.length).map((l) => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
              <Icon name={l.icon} size={15} /> {l.label} <Icon name="external" size={12} />
            </a>
          ))}
        </div>
      </section>

      <div className="section-head">
        <h2>Saved bookings</h2>
        {res.data?.items.length > 0 && (
          <Button onClick={() => setForm({})}>
            <Icon name="plus" size={15} /> Save a booking
          </Button>
        )}
      </div>
      {body}

      <Modal
        open={Boolean(form)}
        onClose={() => setForm(null)}
        title={form?.booking ? 'Edit booking' : 'Save a booking'}
        wide
      >
        {form && (
          <BookingForm
            group={group}
            me={me}
            booking={form.booking}
            onCancel={() => setForm(null)}
            onSaved={() => {
              setForm(null);
              toast.success('Booking saved');
              onChanged();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
