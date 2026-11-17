import { describe, expect, it } from 'vitest';
import {
  balanceWith,
  netBalances,
  pairwiseDebts,
  simplifyDebts,
  userNet,
  type Ledger,
  type LedgerExpense,
} from '../../shared/src/balances.js';

const A = 1;
const B = 2;
const C = 3;
const D = 4;

const exp = (paidBy: number, amountCents: number, shares: Array<[number, number]>, currency = 'USD'): LedgerExpense => ({
  paidBy,
  amountCents,
  currency,
  shares: shares.map(([userId, owedCents]) => ({ userId, owedCents })),
});

describe('netBalances', () => {
  it('credits the payer and debits participants', () => {
    const nets = netBalances({ expenses: [exp(A, 3000, [[A, 1000], [B, 1000], [C, 1000]])], settlements: [] });
    expect(userNet(nets, A)).toEqual({ USD: 2000 });
    expect(userNet(nets, B)).toEqual({ USD: -1000 });
    expect(userNet(nets, C)).toEqual({ USD: -1000 });
  });

  it('applies settlements in the right direction', () => {
    const ledger: Ledger = {
      expenses: [exp(A, 2000, [[A, 1000], [B, 1000]])],
      settlements: [{ fromUserId: B, toUserId: A, amountCents: 1000, currency: 'USD' }],
    };
    const nets = netBalances(ledger);
    expect(userNet(nets, A)).toEqual({});
    expect(userNet(nets, B)).toEqual({});
  });

  it('keeps currencies apart', () => {
    const nets = netBalances({
      expenses: [exp(A, 1000, [[B, 1000]], 'USD'), exp(B, 500, [[A, 500]], 'EUR')],
      settlements: [],
    });
    expect(userNet(nets, A)).toEqual({ USD: 1000, EUR: -500 });
  });

  it('always sums to zero per currency', () => {
    const ledger: Ledger = {
      expenses: [exp(A, 999, [[A, 333], [B, 333], [C, 333]]), exp(C, 1001, [[B, 1001]]), exp(B, 50, [[A, 25], [D, 25]])],
      settlements: [{ fromUserId: B, toUserId: C, amountCents: 77, currency: 'USD' }],
    };
    const total = [...netBalances(ledger).get('USD')!.values()].reduce((a, b) => a + b, 0);
    expect(total).toBe(0);
  });
});

describe('pairwiseDebts', () => {
  it('nets debts between each pair', () => {
    const debts = pairwiseDebts({
      expenses: [exp(A, 1000, [[B, 1000]]), exp(B, 400, [[A, 400]])],
      settlements: [],
    });
    expect(debts).toEqual([{ fromUserId: B, toUserId: A, currency: 'USD', amountCents: 600 }]);
  });

  it('flips direction when a settlement overpays', () => {
    const debts = pairwiseDebts({
      expenses: [exp(A, 1000, [[B, 1000]])],
      settlements: [{ fromUserId: B, toUserId: A, amountCents: 1500, currency: 'USD' }],
    });
    expect(debts).toEqual([{ fromUserId: A, toUserId: B, currency: 'USD', amountCents: 500 }]);
    expect(balanceWith(debts, A, B)).toEqual({ USD: -500 });
    expect(balanceWith(debts, B, A)).toEqual({ USD: 500 });
  });

  it('removes pairs that are settled exactly', () => {
    expect(
      pairwiseDebts({
        expenses: [exp(A, 1000, [[B, 1000]])],
        settlements: [{ fromUserId: B, toUserId: A, amountCents: 1000, currency: 'USD' }],
      }),
    ).toEqual([]);
  });
});

describe('simplifyDebts', () => {
  it('collapses a chain A->B->C into a single payment', () => {
    // B owes A 10, C owes B 10  => C pays A 10
    const ledger: Ledger = { expenses: [exp(A, 1000, [[B, 1000]]), exp(B, 1000, [[C, 1000]])], settlements: [] };
    expect(pairwiseDebts(ledger)).toHaveLength(2);
    expect(simplifyDebts(netBalances(ledger))).toEqual([{ fromUserId: C, toUserId: A, currency: 'USD', amountCents: 1000 }]);
  });

  it('uses at most n-1 payments and settles everyone exactly', () => {
    const ledger: Ledger = {
      expenses: [
        exp(A, 12000, [[A, 3000], [B, 3000], [C, 3000], [D, 3000]]),
        exp(B, 4000, [[C, 2000], [D, 2000]]),
        exp(C, 999, [[A, 333], [B, 333], [D, 333]]),
        exp(D, 101, [[A, 101]]),
      ],
      settlements: [{ fromUserId: D, toUserId: A, amountCents: 1234, currency: 'USD' }],
    };
    const nets = netBalances(ledger);
    const plan = simplifyDebts(nets);
    expect(plan.length).toBeLessThanOrEqual(3);
    // applying the plan as settlements zeroes every balance
    const after = netBalances({
      expenses: ledger.expenses,
      settlements: [...ledger.settlements, ...plan.map((d) => ({ ...d }))],
    });
    for (const id of [A, B, C, D]) expect(userNet(after, id)).toEqual({});
  });

  it('handles each currency separately', () => {
    const plan = simplifyDebts(
      netBalances({ expenses: [exp(A, 100, [[B, 100]], 'USD'), exp(B, 200, [[A, 200]], 'EUR')], settlements: [] }),
    );
    expect(plan).toEqual([
      { fromUserId: A, toUserId: B, currency: 'EUR', amountCents: 200 },
      { fromUserId: B, toUserId: A, currency: 'USD', amountCents: 100 },
    ]);
  });

  it('returns nothing when everyone is even', () => {
    expect(simplifyDebts(netBalances({ expenses: [exp(A, 100, [[A, 100]])], settlements: [] }))).toEqual([]);
  });

  it('refuses an unbalanced ledger', () => {
    const broken = new Map([['USD', new Map([[A, 5]])]]);
    expect(() => simplifyDebts(broken)).toThrow(/does not balance/);
  });
});
