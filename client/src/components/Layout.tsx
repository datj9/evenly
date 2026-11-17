import { createContext, useContext, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router';
import { useAuth, useMe } from '../lib/auth';
import { useQuery } from '../lib/api';
import type { Expense, FriendWithBalance, GroupSummary, UserMap } from '../types';
import { ActivityIcon, FriendsIcon, GroupsIcon, HomeIcon, Logo, LogoutIcon, PlusIcon } from './icons';
import { Avatar } from './ui';
import { ExpenseForm } from '../features/ExpenseForm';
import { AddFriendForm, NewGroupForm } from '../features/forms';
import { balanceEntries } from '../lib/format';

type Dialog =
  | { kind: 'expense'; groupId?: number | null; friendId?: number; existing?: Expense }
  | { kind: 'friend' }
  | { kind: 'group' }
  | null;

interface Actions {
  addExpense: (opts?: { groupId?: number | null; friendId?: number }) => void;
  editExpense: (expense: Expense) => void;
  addFriend: () => void;
  newGroup: () => void;
}

const ActionsContext = createContext<Actions | null>(null);

export function useActions(): Actions {
  const ctx = useContext(ActionsContext);
  if (!ctx) throw new Error('useActions must be used inside Layout');
  return ctx;
}

const NAV = [
  { to: '/', label: 'Dashboard', icon: HomeIcon, end: true },
  { to: '/groups', label: 'Groups', icon: GroupsIcon, end: false },
  { to: '/friends', label: 'Friends', icon: FriendsIcon, end: false },
  { to: '/activity', label: 'Activity', icon: ActivityIcon, end: false },
];

function dot(balance: Record<string, number>): ReactNode {
  const entries = balanceEntries(balance);
  if (entries.length === 0) return null;
  const positive = entries.every(([, v]) => v > 0);
  const negative = entries.every(([, v]) => v < 0);
  const color = positive ? 'bg-mint-500' : negative ? 'bg-coral-500' : 'bg-amber-400';
  return <span className={`h-2 w-2 shrink-0 rounded-full ${color}`} aria-hidden />;
}

function Sidebar({ onAction }: { onAction: Actions }) {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const groups = useQuery<{ groups: GroupSummary[]; users: UserMap }>('/groups');
  const friends = useQuery<{ friends: FriendWithBalance[] }>('/friends');
  const sub = ({ isActive }: { isActive: boolean }): string =>
    `flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition ${isActive ? 'bg-mint-50 font-semibold text-mint-800' : 'text-ink-soft hover:bg-black/[0.03] hover:text-ink'}`;

  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-line bg-white/80 px-4 py-5 backdrop-blur lg:flex">
      <div className="px-2">
        <Logo />
      </div>
      <nav className="mt-7 flex flex-col gap-1" aria-label="Main">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-semibold transition ${isActive ? 'bg-mint-500 text-white shadow-[0_6px_16px_-8px_rgb(19_179_138/0.8)]' : 'text-ink-soft hover:bg-black/[0.04] hover:text-ink'}`
            }
          >
            <Icon />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-7 min-h-0 flex-1 overflow-y-auto">
        <div className="mb-1 flex items-center justify-between px-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">Groups</span>
          <button type="button" onClick={onAction.newGroup} className="rounded-md p-1 text-mint-600 hover:bg-mint-50" aria-label="New group">
            <PlusIcon size={16} />
          </button>
        </div>
        <div className="flex flex-col">
          {groups.data?.groups.map((g) => (
            <NavLink key={g.id} to={`/groups/${g.id}`} className={sub}>
              <span className="truncate">{g.name}</span>
              <span className="ml-auto">{dot(g.myBalance)}</span>
            </NavLink>
          ))}
        </div>
        <div className="mb-1 mt-5 flex items-center justify-between px-3">
          <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-mute">Friends</span>
          <button type="button" onClick={onAction.addFriend} className="rounded-md p-1 text-mint-600 hover:bg-mint-50" aria-label="Add friend">
            <PlusIcon size={16} />
          </button>
        </div>
        <div className="flex flex-col">
          {friends.data?.friends.map((f) => (
            <NavLink key={f.id} to={`/friends/${f.id}`} className={sub}>
              <Avatar id={f.id} name={f.name} size={22} />
              <span className="truncate">{f.name}</span>
              <span className="ml-auto">{dot(f.balance)}</span>
            </NavLink>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-white p-2.5">
        <Avatar id={me.id} name={me.name} size={36} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{me.name}</p>
          <p className="truncate text-xs text-ink-mute">{me.email}</p>
        </div>
        <button
          type="button"
          aria-label="Log out"
          title="Log out"
          className="rounded-lg p-2 text-ink-mute hover:bg-coral-50 hover:text-coral-600"
          onClick={() => void logout().then(() => navigate('/login'))}
        >
          <LogoutIcon />
        </button>
      </div>
    </aside>
  );
}

function MobileTopBar() {
  const me = useMe();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
      <Logo />
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)} aria-label="Account menu" aria-expanded={open} className="rounded-full">
          <Avatar id={me.id} name={me.name} size={34} />
        </button>
        {open && (
          <div className="animate-rise absolute right-0 top-12 w-56 rounded-2xl border border-line bg-white p-2 shadow-[var(--shadow-pop)]">
            <p className="truncate px-3 pt-1 text-sm font-bold">{me.name}</p>
            <p className="truncate px-3 pb-2 text-xs text-ink-mute">{me.email}</p>
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-coral-600 hover:bg-coral-50"
              onClick={() => void logout().then(() => navigate('/login'))}
            >
              <LogoutIcon /> Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function BottomNav({ onAdd }: { onAdd: () => void }) {
  const item = ({ isActive }: { isActive: boolean }): string =>
    `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition ${isActive ? 'text-mint-600' : 'text-ink-mute'}`;
  const [home, groups, friends, activity] = NAV;
  const link = (n: (typeof NAV)[number]): ReactNode => (
    <NavLink to={n.to} end={n.end} className={item}>
      <n.icon />
      {n.label === 'Dashboard' ? 'Home' : n.label}
    </NavLink>
  );
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 flex items-end border-t border-line bg-white/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      {link(home)}
      {link(groups)}
      <div className="flex flex-1 justify-center">
        <button
          type="button"
          onClick={onAdd}
          aria-label="Add an expense"
          className="-mt-6 mb-1.5 flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-500 text-white shadow-[0_10px_24px_-8px_rgb(19_179_138/0.9)] transition active:scale-95"
        >
          <PlusIcon size={26} />
        </button>
      </div>
      {link(friends)}
      {link(activity)}
    </nav>
  );
}

export function Layout() {
  const [dialog, setDialog] = useState<Dialog>(null);
  const close = (): void => setDialog(null);
  const actions: Actions = {
    addExpense: (opts) => setDialog({ kind: 'expense', ...opts }),
    editExpense: (existing) => setDialog({ kind: 'expense', existing }),
    addFriend: () => setDialog({ kind: 'friend' }),
    newGroup: () => setDialog({ kind: 'group' }),
  };

  return (
    <ActionsContext.Provider value={actions}>
      <div className="flex min-h-dvh">
        <Sidebar onAction={actions} />
        <div className="flex min-w-0 flex-1 flex-col">
          <MobileTopBar />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:px-10 lg:pb-12 lg:pt-8">
            <Outlet />
          </main>
        </div>
      </div>
      <BottomNav onAdd={() => actions.addExpense()} />
      {dialog?.kind === 'expense' && (
        <ExpenseForm existing={dialog.existing} defaultGroupId={dialog.groupId ?? null} defaultFriendId={dialog.friendId} onClose={close} />
      )}
      {dialog?.kind === 'friend' && <AddFriendForm onClose={close} />}
      {dialog?.kind === 'group' && <NewGroupForm onClose={close} />}
    </ActionsContext.Provider>
  );
}

/** Title row used by every page: heading, optional subtitle, and right-aligned actions. */
export function PageHeader({ title, subtitle, actions, leading }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; leading?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-center gap-3.5">
        {leading}
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-extrabold leading-tight tracking-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-ink-mute">{subtitle}</div>}
        </div>
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
