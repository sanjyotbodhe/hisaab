export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** { fieldName: message } for showing errors next to form inputs. */
  fieldErrors() {
    const out = {};
    for (const d of this.details ?? []) {
      if (d?.field && !out[d.field]) out[d.field] = d.message;
    }
    return out;
  }
}

let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

/**
 * Thin fetch wrapper: JSON in/out, the CSRF header, and errors normalised into ApiError
 * so every screen can show the server's message (or a clear network message).
 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  let res;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        'X-Requested-With': 'hisaab',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, 'NETWORK', "Can't reach the server. Check your connection and try again.");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    const e = data?.error;
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(
      res.status,
      e?.code ?? `HTTP_${res.status}`,
      e?.message ?? (res.status >= 500 ? 'The server ran into a problem. Please try again.' : 'Request failed'),
      e?.details,
    );
  }
  return data;
}

/** Unique id per form submission so retries/double-clicks are de-duplicated by the server. */
export function newRequestId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  // RFC 4122 v4 fallback for older browsers
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
