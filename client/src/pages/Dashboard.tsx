import { useState } from 'react';
import { Link } from 'react-router';
import { useQuery } from '../lib/api';
import { useMe } from '../lib/auth';
import type { DashboardData, User } from '../types';
import { PageHeader, useActions } from '../components/Layout';
import { Amounts, BalanceLine } from '../components/money';
import { ActivityFeed } from '../components/ActivityFeed';
import { Avatar, Button, Empty, ErrorNote, SectionTitle, Spinner } from '../components/ui';
import { ChevronIcon } from '../components/icons';
import { SettleUpForm } from '../features/forms';
import { firstName } from '../lib/format';

function StatCard({ label, children, accent }: { label: string; children: React.ReactNode; accent: string }) {
  return (
    <div className="card relative overflow-hidden px-5 py-4">
      <span className={`absolute inset-y-0 left-0 w-1 ${accent}`} aria-hidden />
      <p className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-mute">{label}</p>
      <div className="mt-1.5 text-2xl font-extrabold">{children}</div>
    </div>
  );
}

export function DashboardPage() {
  const me = useMe();
  const { addExpense } = useActions();
  const { data, error } = useQuery<DashboardData>('/dashboard');
  const [settling, setSettling] = useState(false);

  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  const owe = data.people.filter((p) => Object.values(p.balance).some((v) => v < 0));
  const owed = data.people.filter((p) => Object.values(p.balance).some((v) => v > 0));
  const firstDebt = owe[0];
  const settlePeople: User[] = [me, ...data.people.map((p) => data.users[p.userId]).filter((u): u is User => u !== undefined)];
  const suggestion = firstDebt
    ? (() => {
        const [currency, cents] = Object.entries(firstDebt.balance).find(([, v]) => v < 0)!;
        return { fromUserId: me.id, toUserId: firstDebt.userId, currency, amountCents: -cents };
      })()
    : undefined;

  return (
    <>
      <PageHeader
        title={`Hi, ${firstName(me)}`}
        subtitle="Here is where everything stands."
        actions={
          <>
            <Button variant="coral" onClick={() => setSettling(true)} disabled={data.people.length === 0}>
              Settle up
            </Button>
            <Button onClick={() => addExpense()}>Add an expense</Button>
          </>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total balance" accent="bg-ink/70">
          <Amounts balance={data.net} tone="auto" signed />
        </StatCard>
        <StatCard label="You owe" accent="bg-coral-500">
          <Amounts balance={data.owe} tone="coral" />
        </StatCard>
        <StatCard label="You are owed" accent="bg-mint-500">
          <Amounts balance={data.owed} tone="mint" />
        </StatCard>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-2">
        {[
          { title: 'You owe', list: owe, sign: -1 },
          { title: 'You are owed', list: owed, sign: 1 },
        ].map(({ title, list, sign }) => (
          <section key={title}>
            <SectionTitle>{title}</SectionTitle>
            <div className="card divide-y divide-line">
              {list.length === 0 ? (
                <p className="px-5 py-6 text-center text-sm text-ink-mute">{sign < 0 ? 'You do not owe anyone. Nice.' : 'Nobody owes you right now.'}</p>
              ) : (
                list.map((p) => {
                  const user = data.users[p.userId];
                  const part = Object.fromEntries(Object.entries(p.balance).filter(([, v]) => Math.sign(v) === sign));
                  return (
                    <Link key={p.userId} to={`/friends/${p.userId}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-mint-50/40">
                      <Avatar id={p.userId} name={user?.name ?? '?'} />
                      <span className="flex-1 truncate font-bold">{user?.name}</span>
                      <BalanceLine balance={part} owedLabel="owes you" oweLabel="you owe" />
                    </Link>
                  );
                })
              )}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_1.2fr]">
        <section>
          <SectionTitle>Your groups</SectionTitle>
          {data.groups.length === 0 ? (
            <div className="card">
              <Empty title="No groups yet" body="Create one for a trip, your flat, or a recurring dinner." />
            </div>
          ) : (
            <div className="card divide-y divide-line">
              {data.groups.map((g) => (
                <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center gap-3 px-4 py-3 transition hover:bg-mint-50/40">
                  <span className="flex -space-x-2">
                    {g.memberIds.slice(0, 3).map((id) => (
                      <span key={id} className="rounded-full ring-2 ring-white">
                        <Avatar id={id} name={data.users[id]?.name ?? '?'} size={30} />
                      </span>
                    ))}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-bold">{g.name}</span>
                    <span className="text-xs text-ink-mute">
                      {g.memberIds.length} people · {g.expenseCount} expenses
                    </span>
                  </span>
                  <BalanceLine balance={g.myBalance} />
                  <span className="text-ink-mute">
                    <ChevronIcon />
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>
        <section>
          <SectionTitle action={<Link to="/activity" className="text-sm font-semibold text-mint-600 hover:underline">See all</Link>}>Recent activity</SectionTitle>
          <div className="card">
            <ActivityFeed items={data.activity} compact />
          </div>
        </section>
      </div>

      {settling && <SettleUpForm groupId={null} people={settlePeople} suggestion={suggestion} onClose={() => setSettling(false)} />}
    </>
  );
}
