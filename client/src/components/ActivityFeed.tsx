import type { ReactNode } from 'react';
import { formatMoney } from '../../../shared/src/money';
import { useMe } from '../lib/auth';
import { relativeTime } from '../lib/format';
import type { ActivityItem } from '../types';
import { CategoryIcon, SettleIcon } from './CategoryIcon';
import { Avatar, Empty } from './ui';

interface ExpenseData {
  description: string;
  amountCents: number;
  currency: string;
  category: string;
  paidBy: number;
  paidByName: string;
  shares: Array<{ userId: number; owedCents: number }>;
  changes?: string[];
}

interface SettlementData {
  fromUserId: number;
  fromName: string;
  toUserId: number;
  toName: string;
  amountCents: number;
  currency: string;
}

const who = (id: number, name: string, me: number): string => (id === me ? 'you' : name);

function expenseImpact(d: ExpenseData, me: number, deleted: boolean): ReactNode {
  const mine = d.shares.find((s) => s.userId === me)?.owedCents ?? 0;
  const delta = d.paidBy === me ? d.amountCents - mine : -mine;
  if (delta === 0) return <span className="text-ink-mute">You are not involved</span>;
  const text = delta > 0 ? `You get back ${formatMoney(delta, d.currency)}` : `You owe ${formatMoney(-delta, d.currency)}`;
  return <span className={`${deleted ? 'text-ink-mute line-through' : delta > 0 ? 'text-mint-600' : 'text-coral-500'} amount font-bold`}>{text}</span>;
}

function describe(a: ActivityItem, me: number): { icon: ReactNode; title: ReactNode; detail?: ReactNode } {
  const actor = <strong>{a.actorId === me ? 'You' : a.actorName}</strong>;
  const inGroup = a.groupName ? (
    <>
      {' '}
      in <strong>{a.groupName}</strong>
    </>
  ) : null;
  switch (a.type) {
    case 'expense_added':
    case 'expense_updated':
    case 'expense_deleted': {
      const d = a.data as unknown as ExpenseData;
      const verb = a.type === 'expense_added' ? 'added' : a.type === 'expense_updated' ? 'updated' : 'deleted';
      return {
        icon: <CategoryIcon category={d.category} size={38} />,
        title: (
          <>
            {actor} {verb} <strong>"{d.description}"</strong>
            {inGroup}
          </>
        ),
        detail: (
          <>
            {expenseImpact(d, me, a.type === 'expense_deleted')}
            {a.type === 'expense_updated' && d.changes && d.changes.length > 0 && <span className="text-ink-mute"> - changed {d.changes.join(', ')}</span>}
          </>
        ),
      };
    }
    case 'settlement_added':
    case 'settlement_deleted': {
      const d = a.data as unknown as SettlementData;
      return {
        icon: <SettleIcon size={38} />,
        title: (
          <>
            {actor} {a.type === 'settlement_added' ? 'recorded' : 'deleted'} a payment{inGroup}
          </>
        ),
        detail: (
          <span className={a.type === 'settlement_deleted' ? 'text-ink-mute line-through' : 'text-ink-soft'}>
            {who(d.fromUserId, d.fromName, me)} paid {who(d.toUserId, d.toName, me)} <span className="amount font-bold">{formatMoney(d.amountCents, d.currency)}</span>
          </span>
        ),
      };
    }
    case 'group_created':
      return { icon: <Avatar id={a.actorId} name={a.actorName} size={38} />, title: <>{actor} created the group <strong>{a.groupName}</strong></> };
    case 'member_added':
    case 'member_removed': {
      const d = a.data as { userId: number; userName: string };
      const verb = a.type === 'member_added' ? 'added' : 'removed';
      const prep = a.type === 'member_added' ? 'to' : 'from';
      return {
        icon: <Avatar id={d.userId} name={d.userName} size={38} />,
        title: (
          <>
            {actor} {verb} <strong>{who(d.userId, d.userName, me)}</strong> {prep} <strong>{a.groupName}</strong>
          </>
        ),
      };
    }
    case 'friend_added': {
      const d = a.data as { friendId: number; friendName: string };
      const other = a.actorId === me ? d.friendName : 'you';
      return { icon: <Avatar id={a.actorId === me ? d.friendId : a.actorId} name={a.actorId === me ? d.friendName : a.actorName} size={38} />, title: <>{actor} added <strong>{other}</strong> as a friend</> };
    }
  }
}

export function ActivityFeed({ items, compact = false }: { items: ActivityItem[]; compact?: boolean }) {
  const me = useMe().id;
  if (items.length === 0) return <Empty title="Nothing here yet" body="Expenses, payments and group changes will show up here." />;
  return (
    <ol className="flex flex-col">
      {items.map((a) => {
        const { icon, title, detail } = describe(a, me);
        return (
          <li key={a.id} className={`flex gap-3 ${compact ? 'px-4 py-3' : 'px-5 py-4'} border-b border-line last:border-b-0`}>
            {icon}
            <div className="min-w-0 flex-1 text-[14px] leading-snug">
              <p className="text-ink-soft [&_strong]:font-bold [&_strong]:text-ink">{title}</p>
              {detail && <p className="mt-0.5 text-[13px]">{detail}</p>}
              <p className="mt-1 text-xs text-ink-mute">{relativeTime(a.createdAt)}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
