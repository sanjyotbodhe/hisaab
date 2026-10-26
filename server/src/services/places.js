import { ExternalCache } from '../models/ExternalCache.js';
import { AppError } from '../utils/errors.js';

/**
 * Place search (OpenStreetMap Nominatim) and nearby attractions (Wikipedia geosearch).
 * Both are free, need no API key, and ask clients to identify themselves, cache results
 * and keep request rates low, so every lookup goes through a shared cache and a throttle.
 */

const USER_AGENT = 'Hisaab/1.0 (student project; https://github.com/sanjyotbodhe/hisaab)';
const TIMEOUT_MS = 7000;
const DAY = 24 * 60 * 60 * 1000;

const memory = new Map(); // per-instance hot cache in front of MongoDB

async function cached(key, ttlMs, load) {
  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const stored = await ExternalCache.findOne({ key, expiresAt: { $gt: new Date() } }).lean();
  if (stored) {
    memory.set(key, { value: stored.value, expiresAt: stored.expiresAt.getTime() });
    return stored.value;
  }
  const value = await load();
  const expiresAt = new Date(Date.now() + ttlMs);
  memory.set(key, { value, expiresAt: expiresAt.getTime() });
  if (memory.size > 500) memory.delete(memory.keys().next().value);
  await ExternalCache.updateOne({ key }, { $set: { value, expiresAt } }, { upsert: true });
  return value;
}

// Nominatim allows at most 1 request per second: serialise our calls to it.
let nominatimQueue = Promise.resolve();
let lastNominatim = 0;
function throttledNominatim(fn) {
  const run = nominatimQueue.then(async () => {
    const wait = lastNominatim + 1100 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim = Date.now();
    return fn();
  });
  nominatimQueue = run.catch(() => {});
  return run;
}

async function getJson(url) {
  let res;
  try {
    res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    console.error('[places] request failed:', url.host, err.message);
    throw new AppError(502, 'UPSTREAM_FAILED', "Couldn't reach the map service. Try again in a moment.");
  }
  if (!res.ok) {
    console.error('[places] upstream status', url.host, res.status);
    throw new AppError(502, 'UPSTREAM_FAILED', 'The map service is busy right now. Try again in a moment.');
  }
  return res.json();
}

const round = (n) => Math.round(n * 1000) / 1000; // ~100 m, so nearby lookups share cache entries

/** Search for a city, area or place by name. */
export async function searchPlaces(query) {
  const q = query.trim().toLowerCase();
  return cached(`search:${q}`, DAY, () =>
    throttledNominatim(async () => {
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.search = new URLSearchParams({
        q,
        format: 'jsonv2',
        limit: '8',
        addressdetails: '0',
        'accept-language': 'en',
      });
      const rows = await getJson(url);
      return (Array.isArray(rows) ? rows : []).map((r) => ({
        name: r.name || String(r.display_name).split(',')[0],
        address: r.display_name ?? '',
        lat: Number(r.lat),
        lng: Number(r.lon),
        kind: r.type ?? '',
      }));
    }),
  );
}

/** Well-known places near a point: Wikipedia articles with coordinates, photos first. */
export async function nearbyAttractions(lat, lng) {
  const key = `attractions:${round(lat)},${round(lng)}`;
  return cached(key, 7 * DAY, async () => {
    const url = new URL('https://en.wikipedia.org/w/api.php');
    url.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      generator: 'geosearch',
      ggscoord: `${lat}|${lng}`,
      ggsradius: '10000',
      ggslimit: '50',
      prop: 'coordinates|pageimages|description|info',
      piprop: 'thumbnail',
      pithumbsize: '320',
      inprop: 'url',
    });
    const data = await getJson(url);
    const pages = data?.query?.pages ?? [];
    return pages
      .filter((p) => p.coordinates?.[0])
      .map((p) => ({
        name: p.title,
        description: p.description ?? '',
        lat: p.coordinates[0].lat,
        lng: p.coordinates[0].lon,
        thumbnail: p.thumbnail?.source ?? '',
        url: p.fullurl ?? `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title)}`,
        rank: p.index ?? 999,
      }))
      .sort((a, b) => Number(Boolean(b.thumbnail)) - Number(Boolean(a.thumbnail)) || a.rank - b.rank)
      .slice(0, 24)
      .map(({ rank, ...rest }) => rest);
  });
}

export function clearPlacesMemoryCache() {
  memory.clear();
}
