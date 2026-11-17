import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useQuery } from '../lib/api';
import { useMe } from '../lib/auth';
import { balanceEntries } from '../lib/format';
import type { FriendDetailData, FriendWithBalance } from '../types';
import { PageHeader, useActions } from '../components/Layout';
import { BalanceLine } from '../components/money';
import { LedgerList } from '../components/Ledger';
import { Avatar, Button, Empty, ErrorNote, SectionTitle, Spinner } from '../components/ui';
import { BackIcon, ChevronIcon } from '../components/icons';
import { SettleUpForm } from '../features/forms';

export function FriendsPage() {
  const { addFriend } = useActions();
  const { data, error } = useQuery<{ friends: FriendWithBalance[] }>('/friends');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;
  return (
    <>
      <PageHeader title="Friends" subtitle={`${data.friends.length} friend${data.friends.length === 1 ? '' : 's'}`} actions={<Button onClick={addFriend}>Add a friend</Button>} />
      {data.friends.length === 0 ? (
        <div className="card">
          <Empty title="No friends yet" body="Add someone by email to start splitting." action={<Button onClick={addFriend}>Add a friend</Button>} />
        </div>
      ) : (
        <ul className="card divide-y divide-line">
          {data.friends.map((f) => (
            <li key={f.id}>
              <Link to={`/friends/${f.id}`} className="flex items-center gap-3 px-4 py-3.5 transition hover:bg-mint-50/40">
                <Avatar id={f.id} name={f.name} size={44} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-bold">{f.name}</span>
                  <span className="block truncate text-xs text-ink-mute">
                    {f.email}
                    {!f.registered && ' · invited'}
                  </span>
                </span>
                <BalanceLine balance={f.balance} owedLabel="owes you" />
                <span className="text-ink-mute">
                  <ChevronIcon />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

export function FriendDetailPage() {
  const id = Number(useParams().id);
  const me = useMe();
  const { addExpense } = useActions();
  const { data, error } = useQuery<FriendDetailData>(`/friends/${id}`);
  const [settling, setSettling] = useState(false);
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  const { friend } = data;
  const firstDebt = balanceEntries(data.balance)[0];
  const suggestion = firstDebt
    ? {
        fromUserId: firstDebt[1] < 0 ? me.id : friend.id,
        toUserId: firstDebt[1] < 0 ? friend.id : me.id,
        currency: firstDebt[0],
        amountCents: Math.abs(firstDebt[1]),
      }
    : undefined;

  return (
    <>
      <Link to="/friends" className="mb-3 inline-flex items-center gap-1 text-sm font-semibold text-ink-mute hover:text-ink">
        <BackIcon /> Friends
      </Link>
      <PageHeader
        title={friend.name}
        subtitle={friend.email}
        leading={<Avatar id={friend.id} name={friend.name} size={56} />}
        actions={
          <>
            <Button variant="coral" onClick={() => setSettling(true)}>
              Settle up
            </Button>
            <Button onClick={() => addExpense({ friendId: friend.id })}>Add an expense</Button>
          </>
        }
      />
      <div className="grid gap-8 lg:grid-cols-[1fr_18rem]">
        <LedgerList expenses={data.expenses} settlements={data.settlements} users={data.users} />
        <aside className="flex flex-col gap-6">
          <section>
            <SectionTitle>Balance</SectionTitle>
            <div className="card flex items-center justify-between px-5 py-4">
              <span className="text-sm text-ink-soft">Across all groups</span>
              <BalanceLine balance={data.balance} owedLabel={`${friend.name.split(' ')[0]} owes you`} oweLabel="you owe" size="lg" />
            </div>
          </section>
          <section>
            <SectionTitle>Shared groups</SectionTitle>
            <div className="card divide-y divide-line">
              {data.sharedGroups.length === 0 ? (
                <p className="px-4 py-4 text-sm text-ink-mute">No shared groups.</p>
              ) : (
                data.sharedGroups.map((g) => (
                  <Link key={g.id} to={`/groups/${g.id}`} className="flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-mint-50/40">
                    {g.name}
                    <ChevronIcon />
                  </Link>
                ))
              )}
            </div>
          </section>
        </aside>
      </div>
      {settling && <SettleUpForm groupId={null} people={[me, friend]} suggestion={suggestion} onClose={() => setSettling(false)} />}
    </>
  );
}
