import { useState } from 'react';
import { formatMoney } from '../../../shared/src/money';
import { categoryLabel } from '../../../shared/src/categories';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { dateParts, displayName, monthHeading, shortName } from '../lib/format';
import type { Expense, Settlement, UserMap } from '../types';
import { CategoryIcon, SettleIcon } from './CategoryIcon';
import { Avatar, Button, Empty } from './ui';
import { useActions } from './Layout';

type Entry = { kind: 'expense'; item: Expense } | { kind: 'settlement'; item: Settlement };

const MODE_LABEL: Record<string, string> = { equal: 'split equally', exact: 'exact amounts', percent: 'by percentage', shares: 'by shares' };

function DateChip({ iso }: { iso: string }) {
  const { month, day } = dateParts(iso);
  return (
    <span className="flex w-9 shrink-0 flex-col items-center leading-none text-ink-mute">
      <span className="text-[10px] font-bold uppercase tracking-wide">{month}</span>
      <span className="amount mt-0.5 text-lg font-bold text-ink-soft">{day}</span>
    </span>
  );
}

/** What the expense means for me: "you lent $X", "you borrowed $X", or "not involved". */
function MyPart({ e, me }: { e: Expense; me: number }) {
  const mine = e.shares.find((s) => s.userId === me)?.owedCents ?? 0;
  if (e.paidBy === me) {
    const lent = e.amountCents - mine;
    if (lent === 0) return <span className="text-xs font-semibold text-ink-mute">no balance</span>;
    return (
      <span className="flex flex-col items-end text-mint-600">
        <span className="text-[11px] font-semibold">you lent</span>
        <span className="amount text-[15px] font-extrabold">{formatMoney(lent, e.currency)}</span>
      </span>
    );
  }
  if (mine === 0) return <span className="text-xs font-semibold text-ink-mute">not involved</span>;
  return (
    <span className="flex flex-col items-end text-coral-500">
      <span className="text-[11px] font-semibold">you borrowed</span>
      <span className="amount text-[15px] font-extrabold">{formatMoney(mine, e.currency)}</span>
    </span>
  );
}

function ExpenseRow({ e, users }: { e: Expense; users: UserMap }) {
  const me = useMe().id;
  const { editExpense } = useActions();
  const [open, setOpen] = useState(false);
  return (
    <li className="group">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-mint-50/40">
        <DateChip iso={e.date} />
        <CategoryIcon category={e.category} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{e.description}</span>
          <span className="block truncate text-[13px] text-ink-mute">
            {displayName(users, e.paidBy, me)} paid <span className="amount font-semibold text-ink-soft">{formatMoney(e.amountCents, e.currency)}</span>
          </span>
        </span>
        <MyPart e={e} me={me} />
      </button>
      {open && (
        <div className="animate-fade mx-4 mb-4 rounded-2xl bg-canvas p-4">
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-mute">
            <span className="rounded-full bg-white px-2.5 py-1 font-semibold text-ink-soft">{categoryLabel(e.category)}</span>
            <span>{MODE_LABEL[e.splitMode]}</span>
            <span>added by {shortName(users, e.createdBy, me)}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {e.shares.map((s) => (
              <li key={s.userId} className="flex items-center gap-2.5 text-sm">
                <Avatar id={s.userId} name={users[s.userId]?.name ?? '?'} size={26} />
                <span className="flex-1">
                  <strong>{displayName(users, s.userId, me)}</strong> {s.userId === me ? 'owe' : 'owes'}
                  {e.splitMode === 'percent' && <span className="text-ink-mute"> ({s.inputValue / 100}%)</span>}
                  {e.splitMode === 'shares' && <span className="text-ink-mute"> ({s.inputValue} sh)</span>}
                </span>
                <span className="amount font-bold">{formatMoney(s.owedCents, e.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex justify-end">
            <Button size="sm" variant="secondary" onClick={() => editExpense(e)}>
              Edit or delete
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

function SettlementRow({ s, users }: { s: Settlement; users: UserMap }) {
  const me = useMe().id;
  const [busy, setBusy] = useState(false);
  const remove = async (): Promise<void> => {
    if (!window.confirm('Delete this payment? Balances will go back to what they were.')) return;
    setBusy(true);
    try {
      await api('DELETE', `/settlements/${s.id}`);
    } catch (err) {
      window.alert(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <DateChip iso={s.date} />
      <SettleIcon />
      <span className="min-w-0 flex-1 text-[15px]">
        <strong>{displayName(users, s.fromUserId, me)}</strong> paid <strong>{displayName(users, s.toUserId, me)}</strong>
        <span className="amount ml-1.5 font-bold text-mint-600">{formatMoney(s.amountCents, s.currency)}</span>
      </span>
      <button type="button" onClick={remove} disabled={busy} className="rounded-lg px-2 py-1 text-xs font-semibold text-ink-mute hover:bg-coral-50 hover:text-coral-600">
        Delete
      </button>
    </li>
  );
}

export function LedgerList({ expenses, settlements, users, emptyAction }: { expenses: Expense[]; settlements: Settlement[]; users: UserMap; emptyAction?: React.ReactNode }) {
  const entries: Entry[] = [
    ...expenses.map((item) => ({ kind: 'expense' as const, item })),
    ...settlements.map((item) => ({ kind: 'settlement' as const, item })),
  ].sort((a, b) => b.item.date.localeCompare(a.item.date) || b.item.createdAt.localeCompare(a.item.createdAt));

  if (entries.length === 0) {
    return (
      <div className="card">
        <Empty title="No expenses yet" body="Add the first one and Evenly keeps the running balance for everyone." action={emptyAction} />
      </div>
    );
  }

  const months: Array<{ heading: string; items: Entry[] }> = [];
  for (const entry of entries) {
    const heading = monthHeading(entry.item.date);
    const last = months[months.length - 1];
    if (last?.heading === heading) last.items.push(entry);
    else months.push({ heading, items: [entry] });
  }

  return (
    <div className="flex flex-col gap-5">
      {months.map((m) => (
        <section key={m.heading}>
          <h3 className="mb-2 px-1 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-mute">{m.heading}</h3>
          <ul className="card divide-y divide-line overflow-hidden">
            {m.items.map((entry) =>
              entry.kind === 'expense' ? <ExpenseRow key={`e${entry.item.id}`} e={entry.item} users={users} /> : <SettlementRow key={`s${entry.item.id}`} s={entry.item} users={users} />,
            )}
          </ul>
        </section>
      ))}
    </div>
  );
}
