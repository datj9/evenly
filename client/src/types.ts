import type { SplitMode } from '../../shared/src/splits';
import type { MultiBalance } from '../../shared/src/money';

export interface User {
  id: number;
  name: string;
  email: string;
  registered: boolean;
}

export type UserMap = Record<number, User>;

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

export interface Debt {
  fromUserId: number;
  toUserId: number;
  currency: string;
  amountCents: number;
}

export interface Group {
  id: number;
  name: string;
  simplifyDebts: boolean;
  createdBy: number;
  createdAt: string;
  memberIds: number[];
}

export interface GroupSummary {
  id: number;
  name: string;
  memberIds: number[];
  simplifyDebts: boolean;
  myBalance: MultiBalance;
  expenseCount: number;
}

export interface PersonBalance {
  userId: number;
  balance: MultiBalance;
}

export type ActivityType =
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'settlement_added'
  | 'settlement_deleted'
  | 'group_created'
  | 'member_added'
  | 'member_removed'
  | 'friend_added';

export interface ActivityItem {
  id: number;
  type: ActivityType;
  actorId: number;
  actorName: string;
  groupId: number | null;
  groupName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface DashboardData {
  net: MultiBalance;
  owe: MultiBalance;
  owed: MultiBalance;
  people: PersonBalance[];
  groups: GroupSummary[];
  activity: ActivityItem[];
  users: UserMap;
}

export interface GroupDetailData {
  group: Group;
  expenses: Expense[];
  settlements: Settlement[];
  balances: PersonBalance[];
  suggestions: Debt[];
  users: UserMap;
}

export interface FriendDetailData {
  friend: User;
  balance: MultiBalance;
  expenses: Expense[];
  settlements: Settlement[];
  sharedGroups: Array<{ id: number; name: string }>;
  users: UserMap;
}

export type FriendWithBalance = User & { balance: MultiBalance };
