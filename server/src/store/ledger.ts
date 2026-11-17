import type { DB } from '../db.js';
import { forbidden, notFound } from '../http.js';
import type { SplitMode } from '../../../shared/src/splits.js';
import type { Ledger } from '../../../shared/src/balances.js';

export interface ExpenseShare {
  userId: number;
  owedCents: number;
  inputValue: number;
}

export interface Expense {
  id: number;
  groupId: number | null;
  description: string;
  amountCents: number;
  currency: string;
  category: string;
  date: string;
  paidBy: number;
  splitMode: SplitMode;
  shares: ExpenseShare[];
  createdBy: number;
  createdAt: string;
  updatedAt: string;
}

export interface Settlement {
  id: number;
  groupId: number | null;
  fromUserId: number;
  toUserId: number;
  amountCents: number;
  currency: string;
  date: string;
  createdBy: number;
  createdAt: string;
}

export interface Group {
  id: number;
  name: string;
  simplifyDebts: boolean;
  createdBy: number;
  createdAt: string;
  memberIds: number[];
}

interface ExpenseRow {
  id: number;
  group_id: number | null;
  description: string;
  amount_cents: number;
  currency: string;
  category: string;
  date: string;
  paid_by: number;
  split_mode: SplitMode;
  created_by: number;
  created_at: string;
  updated_at: string;
}

interface ShareRow {
  expense_id: number;
  user_id: number;
  owed_cents: number;
  input_value: number;
}

interface SettlementRow {
  id: number;
  group_id: number | null;
  from_user_id: number;
  to_user_id: number;
  amount_cents: number;
  currency: string;
  date: string;
  created_by: number;
  created_at: string;
}

function hydrateExpenses(db: DB, rows: ExpenseRow[]): Expense[] {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);
  const shareRows = db
    .prepare(`SELECT * FROM expense_shares WHERE expense_id IN (${ids.map(() => '?').join(',')}) ORDER BY rowid`)
    .all(...ids) as ShareRow[];
  const byExpense = new Map<number, ExpenseShare[]>();
  for (const s of shareRows) {
    const list = byExpense.get(s.expense_id) ?? [];
    byExpense.set(s.expense_id, [...list, { userId: s.user_id, owedCents: s.owed_cents, inputValue: s.input_value }]);
  }
  return rows.map((r) => ({
    id: r.id,
    groupId: r.group_id,
    description: r.description,
    amountCents: r.amount_cents,
    currency: r.currency,
    category: r.category,
    date: r.date,
    paidBy: r.paid_by,
    splitMode: r.split_mode,
    shares: byExpense.get(r.id) ?? [],
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }));
}

const toSettlement = (r: SettlementRow): Settlement => ({
  id: r.id,
  groupId: r.group_id,
  fromUserId: r.from_user_id,
  toUserId: r.to_user_id,
  amountCents: r.amount_cents,
  currency: r.currency,
  date: r.date,
  createdBy: r.created_by,
  createdAt: r.created_at,
});

const ORDER = 'ORDER BY date DESC, id DESC';

export function getExpense(db: DB, id: number): Expense {
  const row = db.prepare('SELECT * FROM expenses WHERE id = ?').get(id) as ExpenseRow | undefined;
  if (!row) throw notFound('Expense not found');
  return hydrateExpenses(db, [row])[0];
}

export function groupExpenses(db: DB, groupId: number): Expense[] {
  return hydrateExpenses(db, db.prepare(`SELECT * FROM expenses WHERE group_id = ? ${ORDER}`).all(groupId) as ExpenseRow[]);
}

/** Every expense the user paid for or has a share in, across groups and outside groups. */
export function expensesInvolving(db: DB, userId: number): Expense[] {
  const rows = db
    .prepare(
      `SELECT * FROM expenses e
        WHERE e.paid_by = ? OR EXISTS (SELECT 1 FROM expense_shares s WHERE s.expense_id = e.id AND s.user_id = ?)
        ${ORDER}`,
    )
    .all(userId, userId) as ExpenseRow[];
  return hydrateExpenses(db, rows);
}

export function getSettlement(db: DB, id: number): Settlement {
  const row = db.prepare('SELECT * FROM settlements WHERE id = ?').get(id) as SettlementRow | undefined;
  if (!row) throw notFound('Payment not found');
  return toSettlement(row);
}

export function groupSettlements(db: DB, groupId: number): Settlement[] {
  return (db.prepare(`SELECT * FROM settlements WHERE group_id = ? ${ORDER}`).all(groupId) as SettlementRow[]).map(
    toSettlement,
  );
}

export function settlementsInvolving(db: DB, userId: number): Settlement[] {
  return (
    db.prepare(`SELECT * FROM settlements WHERE from_user_id = ? OR to_user_id = ? ${ORDER}`).all(userId, userId) as SettlementRow[]
  ).map(toSettlement);
}

export function toLedger(expenses: readonly Expense[], settlements: readonly Settlement[]): Ledger {
  return { expenses, settlements };
}

/* ---------- groups ---------- */

interface GroupRow {
  id: number;
  name: string;
  simplify_debts: number;
  created_by: number;
  created_at: string;
}

function memberIdsOf(db: DB, groupId: number): number[] {
  return (
    db.prepare('SELECT user_id FROM group_members WHERE group_id = ? ORDER BY added_at, user_id').all(groupId) as {
      user_id: number;
    }[]
  ).map((r) => r.user_id);
}

const toGroup = (db: DB, r: GroupRow): Group => ({
  id: r.id,
  name: r.name,
  simplifyDebts: r.simplify_debts === 1,
  createdBy: r.created_by,
  createdAt: r.created_at,
  memberIds: memberIdsOf(db, r.id),
});

export function getGroup(db: DB, id: number): Group {
  const row = db.prepare('SELECT * FROM groups WHERE id = ?').get(id) as GroupRow | undefined;
  if (!row) throw notFound('Group not found');
  return toGroup(db, row);
}

/** Loads a group and checks that `userId` is a member. Non-members get 404 so ids do not leak. */
export function getGroupForMember(db: DB, id: number, userId: number): Group {
  const group = getGroup(db, id);
  if (!group.memberIds.includes(userId)) throw notFound('Group not found');
  return group;
}

export function groupsForUser(db: DB, userId: number): Group[] {
  const rows = db
    .prepare(
      `SELECT g.* FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = ? ORDER BY g.created_at DESC, g.id DESC`,
    )
    .all(userId) as GroupRow[];
  return rows.map((r) => toGroup(db, r));
}

/** Checks the acting user may view and change an expense or payment. */
export function assertCanTouch(
  db: DB,
  userId: number,
  item: { groupId: number | null; involved: readonly number[] },
): void {
  if (item.groupId !== null) {
    getGroupForMember(db, item.groupId, userId);
    return;
  }
  if (!item.involved.includes(userId)) throw forbidden();
}
