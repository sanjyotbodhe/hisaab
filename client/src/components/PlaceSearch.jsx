import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { Icon } from './icons.jsx';
import { Spinner } from './ui.jsx';

/** Search OpenStreetMap for a place and pick one. Debounced; stale answers are ignored. */
export default function PlaceSearch({ id, placeholder = 'Search a city, area or place', onPick, autoFocus }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const req = useRef(0);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      setError('');
      return undefined;
    }
    const t = setTimeout(async () => {
      const mine = ++req.current;
      setLoading(true);
      setError('');
      try {
        const res = await api(`/places/search?q=${encodeURIComponent(query)}`);
        if (mine === req.current) {
          setResults(res.results);
          if (res.results.length === 0) setError('No places found. Try a different spelling or a nearby city.');
        }
      } catch (err) {
        if (mine === req.current) setError(err.message);
      } finally {
        if (mine === req.current) setLoading(false);
      }
    }, 450);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="place-search">
      <div className="filter-search-wrap">
        <Icon name="search" size={16} />
        <input
          id={id}
          type="search"
          className="filter-search"
          placeholder={placeholder}
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="off"
        />
        {loading && <Spinner label="Searching" />}
      </div>
      {error && <p className="field-hint">{error}</p>}
      {results.length > 0 && (
        <ul className="place-results" role="listbox" aria-label="Places found">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`}>
              <button
                type="button"
                role="option"
                aria-selected="false"
                onClick={() => {
                  onPick(r);
                  setQ('');
                  setResults([]);
                }}
              >
                <Icon name="pin" size={16} />
                <span className="place-result-text">
                  <span className="place-result-name">{r.name}</span>
                  <span className="muted small">{r.address}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
