import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useEffect, useRef } from 'react';

/**
 * OpenStreetMap via Leaflet. No API key, no billing.
 *
 * markers: [{ id, lat, lng, label, variant: 'plan' | 'idea' | 'attraction', number? }]
 * Labels are set as text (never HTML) because they can come from user input.
 */
export default function TripMap({ center, markers, onSelect, selectedId, height = 360 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const framed = useRef('');

  // Create the map once.
  useEffect(() => {
    const m = L.map(el.current, { zoomControl: true, scrollWheelZoom: false, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.setView(center ? [center.lat, center.lng] : [20.59, 78.96], center ? 12 : 4, { animate: false }); // India by default
    layer.current = L.layerGroup().addTo(m);
    map.current = m;
    // The map is often created inside a container that is still being laid out.
    const t = setTimeout(() => m.invalidateSize(), 50);
    return () => {
      clearTimeout(t);
      // Stop any pan/zoom animation first: removing a map mid-animation makes Leaflet throw.
      m.stop();
      m.off();
      m.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw markers whenever they change, and frame them.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    layer.current.clearLayers();
    const points = [];
    for (const mk of markers) {
      const pin = document.createElement('span');
      pin.className = `map-pin map-pin-${mk.variant}${mk.id === selectedId ? ' is-selected' : ''}`;
      pin.textContent = mk.number != null ? String(mk.number) : '';
      const marker = L.marker([mk.lat, mk.lng], {
        icon: L.divIcon({ html: pin, className: 'map-pin-wrap', iconSize: [28, 28], iconAnchor: [14, 14] }),
        keyboard: true,
        title: mk.label,
        alt: mk.label,
      });
      const tip = document.createElement('span');
      tip.textContent = mk.label;
      marker.bindTooltip(tip, { direction: 'top', offset: [0, -12] });
      if (onSelect) marker.on('click', () => onSelect(mk.id));
      marker.addTo(layer.current);
      points.push([mk.lat, mk.lng]);
    }
    if (center) points.push([center.lat, center.lng]);
    // Only re-frame when the set of places changes, not when the user is panning around.
    const key = points.map((p) => p.join(',')).join('|');
    if (key !== framed.current) {
      framed.current = key;
      // No animation: programmatic framing should be instant and can't race an unmount.
      if (points.length > 1) m.fitBounds(L.latLngBounds(points).pad(0.15), { maxZoom: 14, animate: false });
      else if (points.length === 1) m.setView(points[0], 13, { animate: false });
    }
  }, [markers, center, onSelect, selectedId]);

  return <div ref={el} className="trip-map" style={{ height }} role="region" aria-label="Map of trip places" />;
}
