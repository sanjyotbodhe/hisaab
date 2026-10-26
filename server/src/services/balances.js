import { netBalances, pairwiseDebts, simplifyDebts } from '../../../shared/balances.js';
import { Expense } from '../models/Expense.js';
import { Settlement } from '../models/Settlement.js';

/**
 * Builds the list of directed debts for a group straight from the database.
 * The heavy lifting (unwinding splits, summing per pair) happens inside MongoDB
 * aggregations, so this stays fast even with thousands of expenses.
 */
async function loadDebts(groupIds) {
  const match = { group: { $in: groupIds }, deletedAt: null };
  const [owed, paid] = await Promise.all([
    Expense.aggregate([
      { $match: match },
      { $unwind: '$splits' },
      { $match: { $expr: { $ne: ['$splits.user', '$paidBy'] } } },
      {
        $group: {
          _id: { group: '$group', from: '$splits.user', to: '$paidBy' },
          amount: { $sum: '$splits.amount' },
        },
      },
    ]),
    Settlement.aggregate([
      { $match: match },
      { $group: { _id: { group: '$group', from: '$from', to: '$to' }, amount: { $sum: '$amount' } } },
    ]),
  ]);

  const byGroup = new Map(groupIds.map((id) => [String(id), []]));
  for (const row of owed) {
    byGroup.get(String(row._id.group)).push({
      from: String(row._id.from),
      to: String(row._id.to),
      amount: row.amount,
    });
  }
  // A settlement "from paid to" cancels debt from -> to, i.e. it is a debt to -> from.
  for (const row of paid) {
    byGroup.get(String(row._id.group)).push({
      from: String(row._id.to),
      to: String(row._id.from),
      amount: row.amount,
    });
  }
  return byGroup;
}

export async function groupBalances(group) {
  const debts = (await loadDebts([group._id])).get(String(group._id));
  const net = netBalances(debts);
  for (const m of group.members) if (!net.has(String(m.user))) net.set(String(m.user), 0);
  const simplified = simplifyDebts(net);
  const pairwise = pairwiseDebts(debts);
  return {
    net: [...net].map(([user, amount]) => ({ user, amount })).sort((a, b) => b.amount - a.amount),
    simplified,
    pairwise,
    suggested: group.simplifyDebts ? simplified : pairwise,
  };
}

/** Net balance of one user in each of the given groups: Map(groupId -> paise). */
export async function userNetByGroup(groupIds, userId) {
  const byGroup = await loadDebts(groupIds);
  const uid = String(userId);
  const out = new Map();
  for (const [gid, debts] of byGroup) out.set(gid, netBalances(debts).get(uid) || 0);
  return out;
}

export async function userNetInGroup(groupId, userId) {
  return (await userNetByGroup([groupId], userId)).get(String(groupId)) || 0;
}
