/**
 * Balance math. Conventions:
 * - A positive net balance means the user is owed money; negative means they owe.
 * - An expense credits the payer with the full amount and debits each participant by their share.
 * - A settlement "from -> to" means `from` handed `to` money: it credits `from` and debits `to`.
 * Everything is per currency; currencies are never mixed or converted.
 */

export interface LedgerExpense {
  currency: string;
  amountCents: number;
  paidBy: number;
  shares: ReadonlyArray<{ userId: number; owedCents: number }>;
}

export interface LedgerSettlement {
  currency: string;
  amountCents: number;
  fromUserId: number;
  toUserId: number;
}

export interface Ledger {
  expenses: readonly LedgerExpense[];
  settlements: readonly LedgerSettlement[];
}

/** currency -> userId -> net cents */
export type NetBalances = Map<string, Map<number, number>>;

/** A directed debt: `from` owes `to` `amountCents`. */
export interface Debt {
  fromUserId: number;
  toUserId: number;
  currency: string;
  amountCents: number;
}

function bump(map: NetBalances, currency: string, userId: number, delta: number): void {
  const inner = map.get(currency) ?? new Map<number, number>();
  inner.set(userId, (inner.get(userId) ?? 0) + delta);
  map.set(currency, inner);
}

export function netBalances(ledger: Ledger): NetBalances {
  const result: NetBalances = new Map();
  for (const e of ledger.expenses) {
    bump(result, e.currency, e.paidBy, e.amountCents);
    for (const s of e.shares) bump(result, e.currency, s.userId, -s.owedCents);
  }
  for (const s of ledger.settlements) {
    bump(result, s.currency, s.fromUserId, s.amountCents);
    bump(result, s.currency, s.toUserId, -s.amountCents);
  }
  return result;
}

/** Net balance of one user, per currency, zero currencies dropped. */
export function userNet(nets: NetBalances, userId: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [currency, users] of nets) {
    const v = users.get(userId) ?? 0;
    if (v !== 0) out[currency] = v;
  }
  return out;
}

/**
 * Pairwise debts without simplification: who owes whom based on who paid for whom,
 * netted per pair and currency. Returned with a positive amount, debtor -> creditor.
 */
export function pairwiseDebts(ledger: Ledger): Debt[] {
  // key "currency|low|high" -> cents that `low` owes `high` (negative means high owes low)
  const pairs = new Map<string, number>();
  const add = (currency: string, debtor: number, creditor: number, cents: number): void => {
    if (debtor === creditor || cents === 0) return;
    const [low, high, sign] = debtor < creditor ? [debtor, creditor, 1] : [creditor, debtor, -1];
    const key = `${currency}|${low}|${high}`;
    pairs.set(key, (pairs.get(key) ?? 0) + sign * cents);
  };
  for (const e of ledger.expenses) {
    for (const s of e.shares) add(e.currency, s.userId, e.paidBy, s.owedCents);
  }
  for (const s of ledger.settlements) {
    // paying someone reduces what you owe them (or makes them owe you)
    add(s.currency, s.toUserId, s.fromUserId, s.amountCents);
  }
  const debts: Debt[] = [];
  for (const [key, cents] of pairs) {
    if (cents === 0) continue;
    const [currency, lowStr, highStr] = key.split('|');
    const low = Number(lowStr);
    const high = Number(highStr);
    debts.push(
      cents > 0
        ? { fromUserId: low, toUserId: high, currency, amountCents: cents }
        : { fromUserId: high, toUserId: low, currency, amountCents: -cents },
    );
  }
  return sortDebts(debts);
}

/**
 * Debt simplification: settle everyone's net balance with at most n-1 transfers by repeatedly
 * matching the largest debtor with the largest creditor. Ties break on the lower user id.
 */
export function simplifyDebts(nets: NetBalances): Debt[] {
  const debts: Debt[] = [];
  for (const [currency, users] of nets) {
    const total = [...users.values()].reduce((a, b) => a + b, 0);
    if (total !== 0) throw new Error(`Ledger for ${currency} does not balance (off by ${total})`);
    const creditors = [...users].filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
    const debtors = [...users].filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
    const byLargest = (a: { id: number; v: number }, b: { id: number; v: number }): number => b.v - a.v || a.id - b.id;
    while (creditors.length > 0 && debtors.length > 0) {
      creditors.sort(byLargest);
      debtors.sort(byLargest);
      const c = creditors[0];
      const d = debtors[0];
      const amount = Math.min(c.v, d.v);
      debts.push({ fromUserId: d.id, toUserId: c.id, currency, amountCents: amount });
      c.v -= amount;
      d.v -= amount;
      if (c.v === 0) creditors.shift();
      if (d.v === 0) debtors.shift();
    }
  }
  return sortDebts(debts);
}

function sortDebts(debts: Debt[]): Debt[] {
  return [...debts].sort(
    (a, b) =>
      a.currency.localeCompare(b.currency) ||
      b.amountCents - a.amountCents ||
      a.fromUserId - b.fromUserId ||
      a.toUserId - b.toUserId,
  );
}

/** Balance between `me` and `other` per currency from a list of debts. Positive: other owes me. */
export function balanceWith(debts: readonly Debt[], me: number, other: number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of debts) {
    let delta = 0;
    if (d.fromUserId === other && d.toUserId === me) delta = d.amountCents;
    else if (d.fromUserId === me && d.toUserId === other) delta = -d.amountCents;
    if (delta !== 0) out[d.currency] = (out[d.currency] ?? 0) + delta;
  }
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}
