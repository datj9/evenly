import type { DB } from '../db.js';
import { notFound } from '../http.js';
import { areFriends, friendIds, getUser, getUsers, type PublicUser } from '../store/users.js';
import { listActivity, type ActivityItem } from '../store/activity.js';
import {
  expensesInvolving,
  getGroupForMember,
  groupExpenses,
  groupSettlements,
  groupsForUser,
  settlementsInvolving,
  toLedger,
  type Expense,
  type Group,
  type Settlement,
} from '../store/ledger.js';
import {
  balanceWith,
  netBalances,
  pairwiseDebts,
  simplifyDebts,
  userNet,
  type Debt,
} from '../../../shared/src/balances.js';
import type { MultiBalance } from '../../../shared/src/money.js';

type UserMap = Record<number, PublicUser>;

function userMap(db: DB, ids: readonly number[]): UserMap {
  return Object.fromEntries(getUsers(db, ids));
}

function idsIn(expenses: readonly Expense[], settlements: readonly Settlement[]): number[] {
  return [
    ...expenses.flatMap((e) => [e.paidBy, ...e.shares.map((s) => s.userId)]),
    ...settlements.flatMap((s) => [s.fromUserId, s.toUserId]),
  ];
}

function splitSigns(balances: readonly MultiBalance[]): { owe: MultiBalance; owed: MultiBalance } {
  const owe: MultiBalance = {};
  const owed: MultiBalance = {};
  for (const b of balances) {
    for (const [currency, cents] of Object.entries(b)) {
      if (cents < 0) owe[currency] = (owe[currency] ?? 0) - cents;
      if (cents > 0) owed[currency] = (owed[currency] ?? 0) + cents;
    }
  }
  return { owe, owed };
}

interface PersonBalance {
  userId: number;
  balance: MultiBalance;
}

/** My balance with every other person, across all groups and non-group expenses. */
function personBalances(db: DB, me: number): { people: PersonBalance[]; net: MultiBalance; debts: Debt[] } {
  const ledger = toLedger(expensesInvolving(db, me), settlementsInvolving(db, me));
  const debts = pairwiseDebts(ledger);
  const others = new Set<number>();
  for (const d of debts) {
    if (d.fromUserId === me) others.add(d.toUserId);
    if (d.toUserId === me) others.add(d.fromUserId);
  }
  const people = [...others]
    .map((userId) => ({ userId, balance: balanceWith(debts, me, userId) }))
    .filter((p) => Object.keys(p.balance).length > 0);
  return { people, net: userNet(netBalances(ledger), me), debts };
}

export interface GroupSummary {
  id: number;
  name: string;
  memberIds: number[];
  simplifyDebts: boolean;
  myBalance: MultiBalance;
  expenseCount: number;
}

function groupSummary(db: DB, me: number, group: Group): GroupSummary {
  const expenses = groupExpenses(db, group.id);
  const nets = netBalances(toLedger(expenses, groupSettlements(db, group.id)));
  return {
    id: group.id,
    name: group.name,
    memberIds: group.memberIds,
    simplifyDebts: group.simplifyDebts,
    myBalance: userNet(nets, me),
    expenseCount: expenses.length,
  };
}

export function listGroups(db: DB, me: number): { groups: GroupSummary[]; users: UserMap } {
  const groups = groupsForUser(db, me).map((g) => groupSummary(db, me, g));
  return { groups, users: userMap(db, groups.flatMap((g) => g.memberIds)) };
}

export function dashboard(db: DB, me: number): {
  net: MultiBalance;
  owe: MultiBalance;
  owed: MultiBalance;
  people: PersonBalance[];
  groups: GroupSummary[];
  activity: ActivityItem[];
  users: UserMap;
} {
  const { people, net } = personBalances(db, me);
  const groups = groupsForUser(db, me).map((g) => groupSummary(db, me, g));
  const { owe, owed } = splitSigns(people.map((p) => p.balance));
  return {
    net,
    owe,
    owed,
    people,
    groups,
    activity: listActivity(db, me, 8),
    users: userMap(db, [me, ...people.map((p) => p.userId), ...groups.flatMap((g) => g.memberIds)]),
  };
}

export function friendsList(db: DB, me: number): { friends: Array<PublicUser & { balance: MultiBalance }> } {
  const { people } = personBalances(db, me);
  const ids = friendIds(db, me);
  const users = getUsers(db, ids);
  const friends = ids
    .map((id) => users.get(id))
    .filter((u): u is PublicUser => u !== undefined)
    .map((u) => ({ ...u, balance: people.find((p) => p.userId === u.id)?.balance ?? {} }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { friends };
}

export function friendDetail(db: DB, me: number, friendId: number): {
  friend: PublicUser;
  balance: MultiBalance;
  expenses: Expense[];
  settlements: Settlement[];
  sharedGroups: Array<{ id: number; name: string }>;
  users: UserMap;
} {
  if (!areFriends(db, me, friendId)) throw notFound('Friend not found');
  const { debts } = personBalances(db, me);
  const both = (ids: number[]): boolean => ids.includes(me) && ids.includes(friendId);
  const expenses = expensesInvolving(db, me).filter((e) => both([e.paidBy, ...e.shares.map((s) => s.userId)]));
  const settlements = settlementsInvolving(db, me).filter((s) => both([s.fromUserId, s.toUserId]));
  const sharedGroups = groupsForUser(db, me)
    .filter((g) => g.memberIds.includes(friendId))
    .map((g) => ({ id: g.id, name: g.name }));
  return {
    friend: getUser(db, friendId),
    balance: balanceWith(debts, me, friendId),
    expenses,
    settlements,
    sharedGroups,
    users: userMap(db, [me, friendId, ...idsIn(expenses, settlements)]),
  };
}

export function groupDetail(db: DB, me: number, groupId: number): {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  balances: PersonBalance[];
  suggestions: Debt[];
  users: UserMap;
} {
  const group = getGroupForMember(db, groupId, me);
  const expenses = groupExpenses(db, groupId);
  const settlements = groupSettlements(db, groupId);
  const ledger = toLedger(expenses, settlements);
  const nets = netBalances(ledger);
  const memberIds = [...new Set([...group.memberIds, ...idsIn(expenses, settlements)])];
  return {
    group,
    expenses,
    settlements,
    balances: memberIds.map((userId) => ({ userId, balance: userNet(nets, userId) })),
    suggestions: group.simplifyDebts ? simplifyDebts(nets) : pairwiseDebts(ledger),
    users: userMap(db, memberIds),
  };
}

export function activityFeed(db: DB, me: number, limit: number, groupId?: number): { activity: ActivityItem[] } {
  if (groupId !== undefined) getGroupForMember(db, groupId, me);
  return { activity: listActivity(db, me, limit, groupId) };
}
