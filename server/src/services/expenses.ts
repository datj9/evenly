import type { DB } from '../db.js';
import { badRequest } from '../http.js';
import type { ExpenseInput, SettlementInput } from '../schemas.js';
import { computeSplit, type Share } from '../../../shared/src/splits.js';
import { areFriends, getUsers } from '../store/users.js';
import { recordActivity } from '../store/activity.js';
import {
  assertCanTouch,
  getExpense,
  getGroup,
  getGroupForMember,
  getSettlement,
  type Expense,
  type Settlement,
} from '../store/ledger.js';

/** Checks every involved person belongs to the group, or (outside groups) is the actor or their friend. */
function assertParticipantsAllowed(db: DB, actorId: number, groupId: number | null, involved: readonly number[]): void {
  if (groupId !== null) {
    const group = getGroupForMember(db, groupId, actorId);
    const outsider = involved.find((u) => !group.memberIds.includes(u));
    if (outsider !== undefined) throw badRequest('Everyone on an expense must be a member of the group.');
    return;
  }
  if (!involved.includes(actorId)) throw badRequest('You must be part of an expense outside a group.');
  const stranger = involved.find((u) => u !== actorId && !areFriends(db, actorId, u));
  if (stranger !== undefined) throw badRequest('You can only split with your friends. Add them first.');
}

function resolveShares(input: ExpenseInput): Share[] {
  const result = computeSplit(input.splitMode, input.amountCents, input.splits);
  if (!result.ok) throw badRequest(result.error);
  return result.shares;
}

function writeShares(db: DB, expenseId: number, input: ExpenseInput, shares: readonly Share[]): void {
  db.prepare('DELETE FROM expense_shares WHERE expense_id = ?').run(expenseId);
  const stmt = db.prepare('INSERT INTO expense_shares (expense_id, user_id, input_value, owed_cents) VALUES (?, ?, ?, ?)');
  for (const s of shares) {
    const raw = input.splits.find((p) => p.userId === s.userId)?.value ?? 0;
    stmt.run(expenseId, s.userId, input.splitMode === 'equal' ? 1 : raw, s.owedCents);
  }
}

function involvedIn(e: Pick<Expense, 'paidBy' | 'shares'>): number[] {
  return [...new Set([e.paidBy, ...e.shares.map((s) => s.userId)])];
}

function audience(db: DB, groupId: number | null, involved: readonly number[]): number[] {
  return groupId === null ? [...involved] : getGroup(db, groupId).memberIds;
}

function snapshot(db: DB, e: Expense): Record<string, unknown> {
  const users = getUsers(db, involvedIn(e));
  return {
    expenseId: e.id,
    description: e.description,
    amountCents: e.amountCents,
    currency: e.currency,
    category: e.category,
    paidBy: e.paidBy,
    paidByName: users.get(e.paidBy)?.name ?? 'Someone',
    shares: e.shares.map((s) => ({ userId: s.userId, owedCents: s.owedCents })),
    groupName: e.groupId === null ? null : getGroup(db, e.groupId).name,
  };
}

function describeChanges(before: Expense, after: Expense): string[] {
  const changes: string[] = [];
  if (before.description !== after.description) changes.push(`description to "${after.description}"`);
  if (before.amountCents !== after.amountCents || before.currency !== after.currency) changes.push('the amount');
  if (before.paidBy !== after.paidBy) changes.push('who paid');
  if (before.date !== after.date) changes.push('the date');
  if (before.category !== after.category) changes.push('the category');
  const shareKey = (e: Expense): string => e.shares.map((s) => `${s.userId}:${s.owedCents}`).sort().join(',');
  if (before.splitMode !== after.splitMode || shareKey(before) !== shareKey(after)) changes.push('the split');
  return changes;
}

export function createExpense(db: DB, actorId: number, input: ExpenseInput): Expense {
  const shares = resolveShares(input);
  assertParticipantsAllowed(db, actorId, input.groupId, [input.paidBy, ...input.splits.map((s) => s.userId)]);
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO expenses (group_id, description, amount_cents, currency, category, date, paid_by, split_mode, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.groupId, input.description, input.amountCents, input.currency, input.category, input.date, input.paidBy, input.splitMode, actorId);
    const id = Number(info.lastInsertRowid);
    writeShares(db, id, input, shares);
    const expense = getExpense(db, id);
    recordActivity(db, 'expense_added', actorId, expense.groupId, snapshot(db, expense), audience(db, expense.groupId, involvedIn(expense)));
    return expense;
  })();
}

export function updateExpense(db: DB, actorId: number, id: number, input: ExpenseInput): Expense {
  const before = getExpense(db, id);
  assertCanTouch(db, actorId, { groupId: before.groupId, involved: involvedIn(before) });
  if (input.groupId !== before.groupId) throw badRequest('An expense cannot be moved to a different group.');
  const shares = resolveShares(input);
  assertParticipantsAllowed(db, actorId, input.groupId, [input.paidBy, ...input.splits.map((s) => s.userId)]);
  return db.transaction(() => {
    db.prepare(
      `UPDATE expenses SET description = ?, amount_cents = ?, currency = ?, category = ?, date = ?, paid_by = ?, split_mode = ?,
              updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
        WHERE id = ?`,
    ).run(input.description, input.amountCents, input.currency, input.category, input.date, input.paidBy, input.splitMode, id);
    writeShares(db, id, input, shares);
    const after = getExpense(db, id);
    const people = [...new Set([...involvedIn(before), ...involvedIn(after)])];
    recordActivity(
      db,
      'expense_updated',
      actorId,
      after.groupId,
      { ...snapshot(db, after), changes: describeChanges(before, after) },
      audience(db, after.groupId, people),
    );
    return after;
  })();
}

export function deleteExpense(db: DB, actorId: number, id: number): void {
  const expense = getExpense(db, id);
  assertCanTouch(db, actorId, { groupId: expense.groupId, involved: involvedIn(expense) });
  db.transaction(() => {
    const data = snapshot(db, expense);
    db.prepare('DELETE FROM expenses WHERE id = ?').run(id);
    recordActivity(db, 'expense_deleted', actorId, expense.groupId, data, audience(db, expense.groupId, involvedIn(expense)));
  })();
}

/* ---------- settlements ---------- */

function settlementSnapshot(db: DB, s: Settlement): Record<string, unknown> {
  const users = getUsers(db, [s.fromUserId, s.toUserId]);
  return {
    settlementId: s.id,
    fromUserId: s.fromUserId,
    fromName: users.get(s.fromUserId)?.name ?? 'Someone',
    toUserId: s.toUserId,
    toName: users.get(s.toUserId)?.name ?? 'Someone',
    amountCents: s.amountCents,
    currency: s.currency,
    groupName: s.groupId === null ? null : getGroup(db, s.groupId).name,
  };
}

export function createSettlement(db: DB, actorId: number, input: SettlementInput): Settlement {
  const involved = [input.fromUserId, input.toUserId];
  if (input.groupId === null && !involved.includes(actorId)) {
    throw badRequest('Outside a group you can only record payments you made or received.');
  }
  assertParticipantsAllowed(db, actorId, input.groupId, input.groupId === null ? involved : [...involved, actorId]);
  return db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount_cents, currency, date, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(input.groupId, input.fromUserId, input.toUserId, input.amountCents, input.currency, input.date, actorId);
    const settlement = getSettlement(db, Number(info.lastInsertRowid));
    recordActivity(db, 'settlement_added', actorId, settlement.groupId, settlementSnapshot(db, settlement), audience(db, settlement.groupId, involved));
    return settlement;
  })();
}

export function deleteSettlement(db: DB, actorId: number, id: number): void {
  const s = getSettlement(db, id);
  const involved = [s.fromUserId, s.toUserId];
  assertCanTouch(db, actorId, { groupId: s.groupId, involved });
  db.transaction(() => {
    const data = settlementSnapshot(db, s);
    db.prepare('DELETE FROM settlements WHERE id = ?').run(id);
    recordActivity(db, 'settlement_deleted', actorId, s.groupId, data, audience(db, s.groupId, involved));
  })();
}
