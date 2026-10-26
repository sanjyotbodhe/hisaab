/**
 * Split engine shared by the server (source of truth) and the client (live preview).
 *
 * All money is handled as INTEGER PAISE. Floating point rupees are never stored or
 * summed, so ₹100 split three ways is exactly 3334 + 3333 + 3333 paise, never 33.333...
 */

export const SPLIT_TYPES = ['equal', 'exact', 'percent', 'shares'];
export const MAX_AMOUNT_PAISE = 1_00_00_000_00; // ₹1 crore per expense

export class SplitError extends Error {
  constructor(message, field) {
    super(message);
    this.name = 'SplitError';
    this.field = field;
  }
}

/** "123.45" | 123.45 -> 12345. Returns NaN for anything that is not a valid amount. */
export function toPaise(rupees) {
  if (typeof rupees === 'number') rupees = String(rupees);
  if (typeof rupees !== 'string') return NaN;
  const s = rupees.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return NaN;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

/** 12345 -> "123.45" */
export function fromPaise(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

/** 12345 -> "₹123.45" with Indian digit grouping. */
export function formatINR(paise) {
  const sign = paise < 0 ? '-' : '';
  const abs = Math.abs(paise);
  const rupees = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');
  return `${sign}₹${rupees.toLocaleString('en-IN')}.${p}`;
}

/**
 * Divide `total` into integer parts proportional to integer `weights`, so that
 * the parts always add up to exactly `total` (largest remainder method).
 * Ties are broken by position, which makes the result deterministic.
 */
export function distribute(total, weights) {
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) throw new SplitError('Weights must add up to more than zero');
  const parts = weights.map((w) => Math.floor((total * w) / sumW));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  const order = weights
    .map((w, i) => ({ i, frac: (total * w) % sumW }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0; k++, remainder--) parts[order[k].i] += 1;
  return parts;
}

/** Percent with up to 2 decimals -> basis points (12.5% -> 1250). NaN if invalid. */
function toBasisPoints(value) {
  const bp = toPaise(value); // same "up to 2 decimals" rule
  return bp;
}

/**
 * Compute each participant's share.
 *
 * @param {number} amount    total in paise (positive integer)
 * @param {string} splitType one of SPLIT_TYPES
 * @param {{user: string, value?: number|string}[]} participants
 *   value meaning by type: equal -> ignored, exact -> rupees, percent -> %, shares -> weight
 * @returns {{user: string, amount: number, value: number|null}[]}
 */
export function computeSplits(amount, splitType, participants) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new SplitError('Amount must be greater than zero', 'amount');
  }
  if (amount > MAX_AMOUNT_PAISE) throw new SplitError('Amount is too large', 'amount');
  if (!SPLIT_TYPES.includes(splitType)) throw new SplitError('Unknown split type', 'splitType');
  if (!Array.isArray(participants) || participants.length === 0) {
    throw new SplitError('Pick at least one person to split with', 'participants');
  }
  const users = participants.map((p) => String(p.user));
  if (new Set(users).size !== users.length) {
    throw new SplitError('A person appears twice in the split', 'participants');
  }

  if (splitType === 'equal') {
    const parts = distribute(amount, users.map(() => 1));
    return users.map((user, i) => ({ user, amount: parts[i], value: null }));
  }

  if (splitType === 'exact') {
    const parts = participants.map((p) => toPaise(p.value));
    if (parts.some((x) => Number.isNaN(x) || x <= 0)) {
      throw new SplitError('Each exact amount must be a positive number with up to 2 decimals', 'participants');
    }
    const sum = parts.reduce((a, b) => a + b, 0);
    if (sum !== amount) {
      throw new SplitError(
        `Exact amounts add up to ${formatINR(sum)} but the expense is ${formatINR(amount)}`,
        'participants',
      );
    }
    return users.map((user, i) => ({ user, amount: parts[i], value: parts[i] / 100 }));
  }

  if (splitType === 'percent') {
    const bps = participants.map((p) => toBasisPoints(p.value));
    if (bps.some((x) => Number.isNaN(x) || x <= 0)) {
      throw new SplitError('Each percentage must be a positive number with up to 2 decimals', 'participants');
    }
    const sum = bps.reduce((a, b) => a + b, 0);
    if (sum !== 10000) {
      throw new SplitError(`Percentages add up to ${sum / 100}%, they must add up to 100%`, 'participants');
    }
    const parts = distribute(amount, bps);
    return users.map((user, i) => ({ user, amount: parts[i], value: bps[i] / 100 }));
  }

  // shares
  const weights = participants.map((p) => toBasisPoints(p.value));
  if (weights.some((x) => Number.isNaN(x) || x <= 0)) {
    throw new SplitError('Each share must be a positive number', 'participants');
  }
  if (weights.some((w) => w > 100_000)) {
    throw new SplitError('Shares must be 1000 or less', 'participants');
  }
  const parts = distribute(amount, weights);
  return users.map((user, i) => ({ user, amount: parts[i], value: weights[i] / 100 }));
}
