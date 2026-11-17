/**
 * Split computation. Every function works in integer cents and returns shares that sum to the
 * total exactly, or an error explaining why the input cannot be balanced.
 */

export const SPLIT_MODES = ['equal', 'exact', 'percent', 'shares'] as const;
export type SplitMode = (typeof SPLIT_MODES)[number];

/**
 * One participant's raw input.
 * - equal:   value ignored (send 1)
 * - exact:   value = cents owed
 * - percent: value = basis points (1% = 100, 100% = 10000)
 * - shares:  value = integer number of shares
 */
export interface SplitInput {
  userId: number;
  value: number;
}

export interface Share {
  userId: number;
  owedCents: number;
}

export type SplitResult = { ok: true; shares: Share[] } | { ok: false; error: string };

const fail = (error: string): SplitResult => ({ ok: false, error });

/**
 * Distribute `total` cents across weights using the largest-remainder method.
 * Ties go to the earlier entry so the result is deterministic.
 */
export function allocateByWeights(total: number, weights: readonly number[]): number[] {
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) throw new Error('weights must sum to a positive number');
  const floors = weights.map((w) => Math.floor((total * w) / weightSum));
  const remainders = weights.map((w, i) => ({ i, r: (total * w) % weightSum }));
  let leftover = total - floors.reduce((a, b) => a + b, 0);
  const order = [...remainders].sort((a, b) => b.r - a.r || a.i - b.i);
  const result = [...floors];
  for (const { i } of order) {
    if (leftover === 0) break;
    result[i] += 1;
    leftover -= 1;
  }
  return result;
}

function checkParticipants(inputs: readonly SplitInput[]): string | null {
  if (inputs.length === 0) return 'Choose at least one person to split with.';
  const ids = new Set(inputs.map((p) => p.userId));
  if (ids.size !== inputs.length) return 'Each person can only appear once in a split.';
  for (const p of inputs) {
    if (!Number.isSafeInteger(p.value) || p.value < 0) return 'Split values must be whole, non-negative numbers.';
  }
  return null;
}

export function computeSplit(mode: SplitMode, totalCents: number, inputs: readonly SplitInput[]): SplitResult {
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) return fail('Amount must be greater than zero.');
  const problem = checkParticipants(inputs);
  if (problem) return fail(problem);

  switch (mode) {
    case 'equal': {
      const amounts = allocateByWeights(totalCents, inputs.map(() => 1));
      return { ok: true, shares: inputs.map((p, i) => ({ userId: p.userId, owedCents: amounts[i] })) };
    }
    case 'exact': {
      const sum = inputs.reduce((a, p) => a + p.value, 0);
      if (sum !== totalCents) {
        return fail(`Exact amounts add up to ${sum} cents but the total is ${totalCents} cents.`);
      }
      return withoutZeroes(inputs.map((p) => ({ userId: p.userId, owedCents: p.value })));
    }
    case 'percent': {
      const sum = inputs.reduce((a, p) => a + p.value, 0);
      if (sum !== 10_000) return fail(`Percentages add up to ${sum / 100}% instead of 100%.`);
      const amounts = allocateByWeights(totalCents, inputs.map((p) => p.value));
      return withoutZeroes(inputs.map((p, i) => ({ userId: p.userId, owedCents: amounts[i] })));
    }
    case 'shares': {
      const sum = inputs.reduce((a, p) => a + p.value, 0);
      if (sum <= 0) return fail('Give at least one person a share.');
      const amounts = allocateByWeights(totalCents, inputs.map((p) => p.value));
      return withoutZeroes(inputs.map((p, i) => ({ userId: p.userId, owedCents: amounts[i] })));
    }
  }
}

function withoutZeroes(shares: Share[]): SplitResult {
  const kept = shares.filter((s) => s.owedCents > 0);
  if (kept.length === 0) return fail('At least one person must owe something.');
  return { ok: true, shares: kept };
}
