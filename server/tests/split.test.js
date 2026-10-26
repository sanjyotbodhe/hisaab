import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { netBalances, pairwiseDebts, simplifyDebts } from '../../shared/balances.js';
import { computeSplits, distribute, formatINR, SplitError, toPaise } from '../../shared/split.js';

const sum = (rows) => rows.reduce((a, r) => a + r.amount, 0);

describe('toPaise', () => {
  it('parses rupee strings exactly, without floating point', () => {
    assert.equal(toPaise('0.1'), 10);
    assert.equal(toPaise('19.99'), 1999);
    assert.equal(toPaise('100'), 10000);
    assert.equal(toPaise(12.5), 1250);
  });
  it('rejects invalid amounts', () => {
    for (const bad of ['', 'abc', '-5', '1.234', '1e3', null, undefined])
      assert.ok(Number.isNaN(toPaise(bad)), String(bad));
  });
});

describe('distribute', () => {
  it('always adds up to the total', () => {
    for (let total = 1; total < 500; total += 7) {
      for (const weights of [
        [1, 1, 1],
        [3, 1],
        [1, 2, 3, 4, 5, 6, 7],
      ]) {
        assert.equal(
          distribute(total, weights).reduce((a, b) => a + b, 0),
          total,
        );
      }
    }
  });
});

describe('computeSplits', () => {
  it('equal split gives the leftover paisa deterministically', () => {
    const rows = computeSplits(10000, 'equal', [{ user: 'a' }, { user: 'b' }, { user: 'c' }]);
    assert.deepEqual(
      rows.map((r) => r.amount),
      [3334, 3333, 3333],
    );
  });
  it('exact split must match the total', () => {
    const rows = computeSplits(10000, 'exact', [
      { user: 'a', value: '60' },
      { user: 'b', value: '40' },
    ]);
    assert.deepEqual(
      rows.map((r) => r.amount),
      [6000, 4000],
    );
    assert.throws(
      () =>
        computeSplits(10000, 'exact', [
          { user: 'a', value: '60' },
          { user: 'b', value: '39.99' },
        ]),
      SplitError,
    );
  });
  it('percent split must add up to 100', () => {
    const rows = computeSplits(99999, 'percent', [
      { user: 'a', value: '50' },
      { user: 'b', value: '25.5' },
      { user: 'c', value: '24.5' },
    ]);
    assert.equal(sum(rows), 99999);
    assert.throws(
      () =>
        computeSplits(1000, 'percent', [
          { user: 'a', value: '50' },
          { user: 'b', value: '49' },
        ]),
      /100%/,
    );
  });
  it('shares split is proportional', () => {
    const rows = computeSplits(90000, 'shares', [
      { user: 'a', value: 2 },
      { user: 'b', value: 1 },
    ]);
    assert.deepEqual(
      rows.map((r) => r.amount),
      [60000, 30000],
    );
  });
  it('rejects duplicates, empty lists and bad amounts', () => {
    assert.throws(() => computeSplits(100, 'equal', []), SplitError);
    assert.throws(() => computeSplits(100, 'equal', [{ user: 'a' }, { user: 'a' }]), SplitError);
    assert.throws(() => computeSplits(0, 'equal', [{ user: 'a' }]), SplitError);
    assert.throws(() => computeSplits(1.5, 'equal', [{ user: 'a' }]), SplitError);
    assert.throws(() => computeSplits(100, 'shares', [{ user: 'a', value: 0 }]), SplitError);
  });
});

describe('debt simplification', () => {
  it('collapses a cycle to nothing and a chain to one payment', () => {
    const cycle = [
      { from: 'a', to: 'b', amount: 500 },
      { from: 'b', to: 'c', amount: 500 },
      { from: 'c', to: 'a', amount: 500 },
    ];
    assert.deepEqual(simplifyDebts(netBalances(cycle)), []);
    const chain = [
      { from: 'a', to: 'b', amount: 300 },
      { from: 'b', to: 'c', amount: 300 },
    ];
    assert.deepEqual(simplifyDebts(netBalances(chain)), [{ from: 'a', to: 'c', amount: 300 }]);
    assert.equal(pairwiseDebts(chain).length, 2);
  });

  it('settles every net balance exactly, with at most n-1 payments', () => {
    // Randomised property check.
    let seed = 42;
    const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let round = 0; round < 200; round++) {
      const people = Array.from({ length: 2 + Math.floor(rand() * 7) }, (_, i) => `p${i}`);
      const debts = Array.from({ length: Math.floor(rand() * 15) }, () => ({
        from: people[Math.floor(rand() * people.length)],
        to: people[Math.floor(rand() * people.length)],
        amount: 1 + Math.floor(rand() * 100000),
      }));
      const net = netBalances(debts);
      const transfers = simplifyDebts(net);
      const after = new Map(net);
      for (const t of transfers) {
        assert.ok(t.amount > 0);
        after.set(t.from, after.get(t.from) + t.amount);
        after.set(t.to, after.get(t.to) - t.amount);
      }
      for (const v of after.values()) assert.equal(v, 0);
      const nonZero = [...net.values()].filter((v) => v !== 0).length;
      assert.ok(transfers.length <= Math.max(0, nonZero - 1));
    }
  });
});

describe('formatINR', () => {
  it('uses Indian digit grouping', () => {
    assert.equal(formatINR(123456789), '₹12,34,567.89');
    assert.equal(formatINR(-5), '-₹0.05');
  });
});
