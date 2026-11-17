import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { formatMoney } from '../../../shared/src/money';
import { api, errorMessage, useQuery } from '../lib/api';
import { useMe } from '../lib/auth';
import { displayName } from '../lib/format';
import type { Debt, FriendWithBalance, GroupDetailData, User } from '../types';
import { PageHeader, useActions } from '../components/Layout';
import { LedgerList } from '../components/Ledger';
import { ActivityFeed } from '../components/ActivityFeed';
import { Avatar, Button, ErrorNote, SectionTitle, Spinner } from '../components/ui';
import { BackIcon } from '../components/icons';
import { AddMemberForm, SettleUpForm } from '../features/forms';
import type { ActivityItem } from '../types';

export function GroupDetailPage() {
  const id = Number(useParams().id);
  const me = useMe();
  const { addExpense } = useActions();
  const { data, error } = useQuery<GroupDetailData>(`/groups/${id}`);
  const friends = useQuery<{ friends: FriendWithBalance[] }>('/friends');
  const activity = useQuery<{ activity: ActivityItem[] }>(`/activity?groupId=${id}&limit=20`);
  const [settle, setSettle] = useState<{ suggestion?: Debt } | null>(null);
  const [adding, setAdding] = useState(false);
  const [tab, setTab] = useState<'expenses' | 'activity'>('expenses');
  const [memberError, setMemberError] = useState<string | null>(null);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  const { group, users } = data;
  const members: User[] = group.memberIds.map((uid) => users[uid]).filter((u): u is User => u !== undefined);
  const candidates = (friends.data?.friends ?? []).filter((f) => !group.memberIds.includes(f.id));

  const toggleSimplify = async (): Promise<void> => {
    await api('PATCH', `/groups/${id}`, { simplifyDebts: !group.simplifyDebts });
  };
  const removeMember = async (userId: number): Promise<void> => {
    if (!window.confirm(`Remove ${users[userId]?.name} from ${group.name}?`)) return;
    setMemberError(null);
    try {
      await api('DELETE', `/groups/${id}/members/${userId}`);
    } catch (err) {
      setMemberError(errorMessage(err));
    }
  };

  return (
    <>
      <Link to="/groups" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-mute hover:text-ink">
        <BackIcon /> Groups
      </Link>
      <PageHeader
        title={group.name}
        subtitle={`${members.length} members · ${data.expenses.length} expenses`}
        leading={
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mint-400 to-mint-600 text-2xl font-extrabold text-white shadow-[var(--shadow-card)]">
            {group.name.slice(0, 1).toUpperCase()}
          </span>
        }
        actions={
          <>
            <Button variant="coral" onClick={() => setSettle({ suggestion: data.suggestions.find((d) => d.fromUserId === me.id) ?? data.suggestions[0] })}>
              Settle up
            </Button>
            <Button onClick={() => addExpense({ groupId: id })}>Add an expense</Button>
          </>
        }
      />

      <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div>
          <div role="tablist" className="mb-4 inline-flex rounded-xl bg-white p-1 shadow-[var(--shadow-card)]">
            {(['expenses', 'activity'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                type="button"
                aria-selected={tab === t}
                onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-1.5 text-sm font-semibold capitalize transition ${tab === t ? 'bg-mint-500 text-white' : 'text-ink-mute hover:text-ink'}`}
              >
                {t}
              </button>
            ))}
          </div>
          {tab === 'expenses' ? (
            <LedgerList expenses={data.expenses} settlements={data.settlements} users={users} emptyAction={<Button onClick={() => addExpense({ groupId: id })}>Add an expense</Button>} />
          ) : (
            <div className="card">{activity.data ? <ActivityFeed items={activity.data.activity} /> : <Spinner />}</div>
          )}
        </div>

        <aside className="flex flex-col gap-6">
          <section>
            <SectionTitle>Group balances</SectionTitle>
            <ul className="card divide-y divide-line">
              {data.balances.map((b) => {
                const entries = Object.entries(b.balance);
                return (
                  <li key={b.userId} className="flex items-center gap-3 px-4 py-3">
                    <Avatar id={b.userId} name={users[b.userId]?.name ?? '?'} size={34} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{displayName(users, b.userId, me.id)}</span>
                      {entries.length === 0 ? (
                        <span className="text-xs text-ink-mute">settled up</span>
                      ) : (
                        entries.map(([cur, v]) => (
                          <span key={cur} className={`amount block text-xs font-bold ${v > 0 ? 'text-mint-600' : 'text-coral-500'}`}>
                            {v > 0 ? 'gets back' : 'owes'} {formatMoney(Math.abs(v), cur)}
                          </span>
                        ))
                      )}
                    </span>
                    {group.memberIds.includes(b.userId) && b.userId !== me.id && (
                      <button type="button" onClick={() => void removeMember(b.userId)} className="rounded-md px-1.5 py-0.5 text-xs font-semibold text-ink-mute hover:bg-coral-50 hover:text-coral-600" aria-label={`Remove ${users[b.userId]?.name}`}>
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
            {memberError && <div className="mt-2"><ErrorNote>{memberError}</ErrorNote></div>}
            <Button variant="secondary" size="sm" className="mt-3 w-full" onClick={() => setAdding(true)}>
              + Add someone
            </Button>
          </section>

          <section>
            <SectionTitle
              action={
                <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-ink-soft">
                  Simplify
                  <button
                    type="button"
                    role="switch"
                    aria-checked={group.simplifyDebts}
                    aria-label="Simplify debts"
                    onClick={() => void toggleSimplify()}
                    className={`relative h-6 w-10 rounded-full transition ${group.simplifyDebts ? 'bg-mint-500' : 'bg-line'}`}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${group.simplifyDebts ? 'left-[18px]' : 'left-0.5'}`} />
                  </button>
                </label>
              }
            >
              Suggested payments
            </SectionTitle>
            <div className="card divide-y divide-line">
              {data.suggestions.length === 0 ? (
                <p className="px-4 py-5 text-center text-sm text-ink-mute">Everyone is settled up.</p>
              ) : (
                data.suggestions.map((d) => (
                  <div key={`${d.fromUserId}-${d.toUserId}-${d.currency}`} className="flex items-center gap-2 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <strong>{displayName(users, d.fromUserId, me.id)}</strong> <span className="text-ink-mute">pays</span> <strong>{displayName(users, d.toUserId, me.id)}</strong>
                      <span className="amount block font-extrabold text-ink">{formatMoney(d.amountCents, d.currency)}</span>
                    </span>
                    <Button size="sm" variant="secondary" onClick={() => setSettle({ suggestion: d })}>
                      Record
                    </Button>
                  </div>
                ))
              )}
            </div>
            <p className="mt-2 px-1 text-xs text-ink-mute">
              {group.simplifyDebts ? 'Debts are combined so the group needs the fewest payments.' : 'Showing who owes whom directly, without combining debts.'}
            </p>
          </section>
        </aside>
      </div>

      {settle && <SettleUpForm groupId={id} people={members} suggestion={settle.suggestion} onClose={() => setSettle(null)} />}
      {adding && <AddMemberForm groupId={id} candidates={candidates} onClose={() => setAdding(false)} />}
    </>
  );
}
