import { describe, expect, it } from 'vitest';
import { allocateByWeights, computeSplit, type SplitInput } from '../../shared/src/splits.js';
import { centsToDecimal, formatMoney, parseBasisPoints, parseCents } from '../../shared/src/money.js';

const people = (...values: number[]): SplitInput[] => values.map((value, i) => ({ userId: i + 1, value }));
const owed = (r: ReturnType<typeof computeSplit>): number[] => (r.ok ? r.shares.map((s) => s.owedCents) : []);
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

describe('money parsing and formatting', () => {
  it('parses decimal strings to integer cents', () => {
    expect(parseCents('12')).toBe(1200);
    expect(parseCents('12.5')).toBe(1250);
    expect(parseCents('0.07')).toBe(7);
    expect(parseCents('1,234.56')).toBe(123456);
    expect(parseCents('0.1')).toBe(10);
  });
  it('rejects invalid money input', () => {
    for (const bad of ['', 'abc', '1.234', '-5', '1e3', '12.3.4']) expect(parseCents(bad)).toBeNull();
    expect(parseCents('99999999.99')).toBeNull(); // above the cap
  });
  it('formats cents without floating point drift', () => {
    expect(centsToDecimal(1)).toBe('0.01');
    expect(centsToDecimal(-1005)).toBe('-10.05');
    expect(formatMoney(123456789, 'USD')).toBe('$1,234,567.89');
    expect(formatMoney(-30, 'EUR')).toBe('-€0.30');
  });
  it('parses percentages into basis points', () => {
    expect(parseBasisPoints('33.33')).toBe(3333);
    expect(parseBasisPoints('100')).toBe(10000);
    expect(parseBasisPoints('100.01')).toBeNull();
    expect(parseBasisPoints('12.345')).toBeNull();
  });
});

describe('allocateByWeights', () => {
  it('always sums to the total and gives leftovers to the largest remainders', () => {
    expect(allocateByWeights(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(allocateByWeights(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(allocateByWeights(1000, [1, 2])).toEqual([333, 667]);
  });
  it('is exact for many random cases', () => {
    let seed = 42;
    const rand = (n: number): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed % n;
    };
    for (let i = 0; i < 2000; i += 1) {
      const total = 1 + rand(10_000_000);
      const weights = Array.from({ length: 1 + rand(12) }, () => 1 + rand(1000));
      const out = allocateByWeights(total, weights);
      expect(sum(out)).toBe(total);
      expect(out.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
    }
  });
});

describe('computeSplit', () => {
  it('splits equally and hands the odd cent to the first people', () => {
    expect(owed(computeSplit('equal', 1000, people(1, 1, 1)))).toEqual([334, 333, 333]);
    expect(owed(computeSplit('equal', 64500, people(1, 1, 1)))).toEqual([21500, 21500, 21500]);
  });

  it('accepts exact amounts only when they add up to the total', () => {
    expect(owed(computeSplit('exact', 18740, people(6820, 5900, 6020)))).toEqual([6820, 5900, 6020]);
    const off = computeSplit('exact', 18740, people(6820, 5900, 6019));
    expect(off.ok).toBe(false);
    if (!off.ok) expect(off.error).toMatch(/18739/);
  });

  it('splits by percentages and requires exactly 100%', () => {
    expect(owed(computeSplit('percent', 23700, people(4000, 3000, 3000)))).toEqual([9480, 7110, 7110]);
    expect(owed(computeSplit('percent', 100, people(3333, 3333, 3334)))).toEqual([33, 33, 34]);
    expect(computeSplit('percent', 100, people(3333, 3333, 3333)).ok).toBe(false);
    expect(computeSplit('percent', 100, people(5000, 5001)).ok).toBe(false);
  });

  it('splits by shares', () => {
    expect(owed(computeSplit('shares', 6235, people(2, 1, 1)))).toEqual([3117, 1559, 1559]);
    expect(owed(computeSplit('shares', 21677, people(3, 2)))).toEqual([13006, 8671]);
    expect(computeSplit('shares', 100, people(0, 0)).ok).toBe(false);
  });

  it('drops people whose share is zero', () => {
    const r = computeSplit('shares', 900, people(1, 0, 2));
    expect(r.ok && r.shares.map((s) => s.userId)).toEqual([1, 3]);
  });

  it('rejects bad input', () => {
    expect(computeSplit('equal', 0, people(1)).ok).toBe(false);
    expect(computeSplit('equal', 10.5, people(1)).ok).toBe(false);
    expect(computeSplit('equal', 100, []).ok).toBe(false);
    expect(computeSplit('equal', 100, [{ userId: 1, value: 1 }, { userId: 1, value: 1 }]).ok).toBe(false);
    expect(computeSplit('exact', 100, people(150, -50)).ok).toBe(false);
  });

  it('always produces shares that sum to the total', () => {
    for (const total of [1, 2, 3, 99, 100, 101, 999_999, 1_000_000_000]) {
      for (const mode of ['equal', 'shares'] as const) {
        const r = computeSplit(mode, total, people(1, 2, 3, 4, 5, 6, 7));
        expect(r.ok && sum(owed(r))).toBe(total);
      }
      const p = computeSplit('percent', total, people(1429, 1429, 1428, 1428, 1429, 1429, 1428));
      expect(p.ok && sum(owed(p))).toBe(total);
    }
  });
});
