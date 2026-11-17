import { describe, expect, it } from 'vitest';
import { assignedSummary, checkDraft, draftFromExpense, newDraft, type ExpenseDraft } from '../src/features/expenseDraft';
import type { Expense } from '../src/types';

const base = (patch: Partial<ExpenseDraft> = {}): ExpenseDraft => ({
  ...newDraft({ groupId: 7, paidBy: 1, participants: [1, 2, 3], currency: 'USD', date: '2026-11-17' }),
  description: 'Dinner',
  amount: '100.00',
  ...patch,
});

describe('checkDraft', () => {
  it('builds an equal split payload in cents', () => {
    const r = checkDraft(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.payload).toMatchObject({ amountCents: 10000, splitMode: 'equal', groupId: 7 });
    expect(r.shares.map((s) => s.owedCents)).toEqual([3334, 3333, 3333]);
  });

  it('reports what is left to assign in exact mode', () => {
    const r = checkDraft(base({ mode: 'exact', values: { 1: '50', 2: '25', 3: '20' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.remaining).toBe('5.00 left');
    const over = checkDraft(base({ mode: 'exact', values: { 1: '50', 2: '30', 3: '25' } }));
    if (!over.ok) expect(over.remaining).toBe('-5.00 over');
    const ok = checkDraft(base({ mode: 'exact', values: { 1: '50', 2: '25', 3: '25' } }));
    expect(ok.ok && ok.payload.splits).toEqual([
      { userId: 1, value: 5000 },
      { userId: 2, value: 2500 },
      { userId: 3, value: 2500 },
    ]);
  });

  it('requires percentages to reach exactly 100', () => {
    const r = checkDraft(base({ mode: 'percent', values: { 1: '33.33', 2: '33.33', 3: '33.33' } }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.remaining).toBe('0.01% left');
    const ok = checkDraft(base({ mode: 'percent', values: { 1: '33.34', 2: '33.33', 3: '33.33' } }));
    expect(ok.ok && ok.shares.map((s) => s.owedCents)).toEqual([3334, 3333, 3333]);
  });

  it('splits by shares and validates numbers', () => {
    const ok = checkDraft(base({ mode: 'shares', values: { 1: '2', 2: '1', 3: '1' } }));
    expect(ok.ok && ok.shares.map((s) => s.owedCents)).toEqual([5000, 2500, 2500]);
    expect(checkDraft(base({ mode: 'shares', values: { 1: '1.5' } })).ok).toBe(false);
  });

  it('rejects missing description, bad amounts, and empty participant lists', () => {
    expect(checkDraft(base({ description: ' ' })).ok).toBe(false);
    expect(checkDraft(base({ amount: '12.345' })).ok).toBe(false);
    expect(checkDraft(base({ amount: '0' })).ok).toBe(false);
    expect(checkDraft(base({ participants: [] })).ok).toBe(false);
  });
});

describe('draftFromExpense', () => {
  it('round-trips an existing percent expense', () => {
    const expense: Expense = {
      id: 1,
      groupId: 7,
      description: 'Tour',
      amountCents: 23700,
      currency: 'EUR',
      category: 'entertainment',
      date: '2026-10-12',
      paidBy: 1,
      splitMode: 'percent',
      shares: [
        { userId: 1, owedCents: 9480, inputValue: 4000 },
        { userId: 2, owedCents: 7110, inputValue: 3000 },
        { userId: 3, owedCents: 7110, inputValue: 3000 },
      ],
      createdBy: 1,
      createdAt: '',
      updatedAt: '',
    };
    const draft = draftFromExpense(expense);
    expect(draft.amount).toBe('237.00');
    expect(draft.values).toEqual({ 1: '40', 2: '30', 3: '30' });
    const r = checkDraft(draft);
    expect(r.ok && r.shares.map((s) => s.owedCents)).toEqual([9480, 7110, 7110]);
    expect(assignedSummary(draft)).toBe('100% of 100%');
  });
});
