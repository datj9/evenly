import { centsToDecimal, parseBasisPoints, parseCents, type Currency } from '../../../shared/src/money';
import { computeSplit, type Share, type SplitInput, type SplitMode } from '../../../shared/src/splits';
import type { CategoryId } from '../../../shared/src/categories';
import type { Expense } from '../types';

export interface ExpenseDraft {
  groupId: number | null;
  description: string;
  amount: string;
  currency: Currency;
  category: CategoryId;
  date: string;
  paidBy: number;
  mode: SplitMode;
  /** Ordered list of people included in the split. */
  participants: number[];
  /** Raw text per person for the current mode (dollars, percent, or shares). */
  values: Record<number, string>;
}

export interface ExpensePayload {
  groupId: number | null;
  description: string;
  amountCents: number;
  currency: Currency;
  category: CategoryId;
  date: string;
  paidBy: number;
  splitMode: SplitMode;
  splits: SplitInput[];
}

export type DraftCheck =
  | { ok: true; payload: ExpensePayload; shares: Share[] }
  | { ok: false; error: string; remaining?: string };

export function newDraft(opts: { groupId: number | null; paidBy: number; participants: number[]; currency: Currency; date: string }): ExpenseDraft {
  return {
    groupId: opts.groupId,
    description: '',
    amount: '',
    currency: opts.currency,
    category: 'general',
    date: opts.date,
    paidBy: opts.paidBy,
    mode: 'equal',
    participants: opts.participants,
    values: {},
  };
}

export function draftFromExpense(e: Expense): ExpenseDraft {
  const values: Record<number, string> = {};
  for (const s of e.shares) {
    if (e.splitMode === 'exact') values[s.userId] = centsToDecimal(s.inputValue);
    if (e.splitMode === 'percent') values[s.userId] = String(s.inputValue / 100);
    if (e.splitMode === 'shares') values[s.userId] = String(s.inputValue);
  }
  return {
    groupId: e.groupId,
    description: e.description,
    amount: centsToDecimal(e.amountCents),
    currency: e.currency as Currency,
    category: e.category as CategoryId,
    date: e.date,
    paidBy: e.paidBy,
    mode: e.splitMode,
    participants: e.shares.map((s) => s.userId),
    values,
  };
}

function parseValue(mode: SplitMode, raw: string | undefined): number | null {
  const text = (raw ?? '').trim();
  if (mode === 'equal') return 1;
  if (text === '') return 0;
  if (mode === 'exact') return parseCents(text);
  if (mode === 'percent') return parseBasisPoints(text);
  return /^\d{1,4}$/.test(text) ? Number(text) : null;
}

/** Validates the draft exactly like the server will, and returns the payload and preview shares. */
export function checkDraft(d: ExpenseDraft): DraftCheck {
  if (d.description.trim() === '') return { ok: false, error: 'Add a description.' };
  const total = parseCents(d.amount);
  if (total === null || total === 0) return { ok: false, error: 'Enter an amount like 12.50.' };
  if (d.participants.length === 0) return { ok: false, error: 'Choose at least one person to split with.' };

  const splits: SplitInput[] = [];
  for (const userId of d.participants) {
    const value = parseValue(d.mode, d.values[userId]);
    if (value === null) return { ok: false, error: 'One of the split values is not a valid number.' };
    splits.push({ userId, value });
  }

  if (d.mode === 'exact') {
    const diff = total - splits.reduce((a, s) => a + s.value, 0);
    if (diff !== 0) {
      return { ok: false, error: 'Exact amounts must add up to the total.', remaining: `${centsToDecimal(diff)} ${diff > 0 ? 'left' : 'over'}` };
    }
  }
  if (d.mode === 'percent') {
    const diff = 10_000 - splits.reduce((a, s) => a + s.value, 0);
    if (diff !== 0) {
      return { ok: false, error: 'Percentages must add up to 100%.', remaining: `${Math.abs(diff) / 100}% ${diff > 0 ? 'left' : 'over'}` };
    }
  }

  const result = computeSplit(d.mode, total, splits);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    shares: result.shares,
    payload: {
      groupId: d.groupId,
      description: d.description.trim(),
      amountCents: total,
      currency: d.currency,
      category: d.category,
      date: d.date,
      paidBy: d.paidBy,
      splitMode: d.mode,
      splits,
    },
  };
}

/** Running total of what has been assigned in exact/percent modes, for the live hint. */
export function assignedSummary(d: ExpenseDraft): string | null {
  if (d.mode === 'exact') {
    const total = parseCents(d.amount) ?? 0;
    const sum = d.participants.reduce((a, id) => a + (parseValue('exact', d.values[id]) ?? 0), 0);
    return `${centsToDecimal(sum)} of ${centsToDecimal(total)}`;
  }
  if (d.mode === 'percent') {
    const sum = d.participants.reduce((a, id) => a + (parseValue('percent', d.values[id]) ?? 0), 0);
    return `${sum / 100}% of 100%`;
  }
  if (d.mode === 'shares') {
    const sum = d.participants.reduce((a, id) => a + (parseValue('shares', d.values[id]) ?? 0), 0);
    return `${sum} share${sum === 1 ? '' : 's'} total`;
  }
  return null;
}
