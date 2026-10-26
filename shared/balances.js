/**
 * Balance math shared by server and client.
 *
 * Input is a list of directed debts: { from, to, amount } meaning "from owes to `amount` paise".
 * Settlements are fed in as negative debts (from paid `to`, so from owes less).
 */

/** Net position per user: positive = gets money back, negative = owes money. */
export function netBalances(debts) {
  const net = new Map();
  for (const { from, to, amount } of debts) {
    if (from === to || amount === 0) continue;
    net.set(from, (net.get(from) || 0) - amount);
    net.set(to, (net.get(to) || 0) + amount);
  }
  return net;
}

/**
 * Who owes whom WITHOUT simplification: debts between each pair are netted
 * against each other, but money never flows through a third person.
 */
export function pairwiseDebts(debts) {
  const pair = new Map(); // key "a|b" with a < b, value: positive => a owes b
  for (const { from, to, amount } of debts) {
    if (from === to || amount === 0) continue;
    const [a, b, sign] = from < to ? [from, to, 1] : [to, from, -1];
    const key = `${a}|${b}`;
    pair.set(key, (pair.get(key) || 0) + sign * amount);
  }
  const out = [];
  for (const [key, value] of pair) {
    if (value === 0) continue;
    const [a, b] = key.split('|');
    out.push(value > 0 ? { from: a, to: b, amount: value } : { from: b, to: a, amount: -value });
  }
  return out.sort((x, y) => y.amount - x.amount || x.from.localeCompare(y.from));
}

/**
 * Debt simplification: settle everyone's NET balance with as few transfers as
 * possible using a greedy match of the largest debtor with the largest creditor.
 *
 * Guarantees: total money moved per person equals their net balance, and the number of
 * transfers is at most (people with non-zero balance - 1). Finding the true minimum is
 * NP-hard (it reduces to subset-sum), so greedy is the standard practical choice.
 */
export function simplifyDebts(net) {
  const creditors = [];
  const debtors = [];
  for (const [user, amount] of net) {
    if (amount > 0) creditors.push({ user, amount });
    else if (amount < 0) debtors.push({ user, amount: -amount });
  }
  const byAmountThenId = (a, b) => b.amount - a.amount || a.user.localeCompare(b.user);
  const transfers = [];
  while (creditors.length && debtors.length) {
    creditors.sort(byAmountThenId);
    debtors.sort(byAmountThenId);
    const c = creditors[0];
    const d = debtors[0];
    const amount = Math.min(c.amount, d.amount);
    transfers.push({ from: d.user, to: c.user, amount });
    c.amount -= amount;
    d.amount -= amount;
    if (c.amount === 0) creditors.shift();
    if (d.amount === 0) debtors.shift();
  }
  return transfers;
}
