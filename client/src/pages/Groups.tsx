import { Link } from 'react-router';
import { useQuery } from '../lib/api';
import type { GroupSummary, UserMap } from '../types';
import { PageHeader, useActions } from '../components/Layout';
import { BalanceLine } from '../components/money';
import { Avatar, Button, Empty, ErrorNote, Spinner } from '../components/ui';

export function GroupsPage() {
  const { newGroup } = useActions();
  const { data, error } = useQuery<{ groups: GroupSummary[]; users: UserMap }>('/groups');
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <Spinner />;

  return (
    <>
      <PageHeader title="Groups" subtitle={`${data.groups.length} group${data.groups.length === 1 ? '' : 's'}`} actions={<Button onClick={newGroup}>Start a new group</Button>} />
      {data.groups.length === 0 ? (
        <div className="card">
          <Empty title="No groups yet" body="Groups keep shared costs for a trip, a flat or a club in one place." action={<Button onClick={newGroup}>Start a group</Button>} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.groups.map((g) => (
            <Link key={g.id} to={`/groups/${g.id}`} className="card group flex flex-col gap-4 p-5 transition hover:-translate-y-0.5 hover:shadow-[var(--shadow-pop)]">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-extrabold">{g.name}</h2>
                  <p className="text-sm text-ink-mute">
                    {g.expenseCount} expenses · simplify debts {g.simplifyDebts ? 'on' : 'off'}
                  </p>
                </div>
                <BalanceLine balance={g.myBalance} />
              </div>
              <div className="flex items-center gap-2">
                <span className="flex -space-x-2">
                  {g.memberIds.slice(0, 5).map((id) => (
                    <span key={id} className="rounded-full ring-2 ring-white">
                      <Avatar id={id} name={data.users[id]?.name ?? '?'} size={30} />
                    </span>
                  ))}
                </span>
                <span className="text-xs text-ink-mute">{g.memberIds.map((id) => data.users[id]?.name.split(' ')[0]).join(', ')}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
