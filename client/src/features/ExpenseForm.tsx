import { useMemo, useState, type FormEvent } from 'react';
import { CURRENCIES, formatMoney, type Currency } from '../../../shared/src/money';
import { CATEGORIES, type CategoryId } from '../../../shared/src/categories';
import type { SplitMode } from '../../../shared/src/splits';
import { api, errorMessage, useQuery } from '../lib/api';
import { useMe } from '../lib/auth';
import { todayIso } from '../lib/format';
import type { Expense, FriendWithBalance, GroupSummary, User, UserMap } from '../types';
import { Avatar, Button, ErrorNote, Field, Input, Modal, Select, Spinner } from '../components/ui';
import { CategoryIcon } from '../components/CategoryIcon';
import { assignedSummary, checkDraft, draftFromExpense, newDraft, type ExpenseDraft } from './expenseDraft';

const MODES: Array<{ id: SplitMode; label: string; glyph: string }> = [
  { id: 'equal', label: 'Equally', glyph: '=' },
  { id: 'exact', label: 'Exact', glyph: '1.23' },
  { id: 'percent', label: 'Percent', glyph: '%' },
  { id: 'shares', label: 'Shares', glyph: '#' },
];

interface Props {
  existing?: Expense;
  defaultGroupId?: number | null;
  defaultFriendId?: number;
  onClose: () => void;
}

export function ExpenseForm(props: Props) {
  const groups = useQuery<{ groups: GroupSummary[]; users: UserMap }>('/groups');
  const friends = useQuery<{ friends: FriendWithBalance[] }>('/friends');
  const title = props.existing ? 'Edit expense' : 'Add an expense';
  if (!groups.data || !friends.data) {
    return (
      <Modal title={title} onClose={props.onClose} wide>
        {groups.error || friends.error ? <ErrorNote>{groups.error ?? friends.error}</ErrorNote> : <Spinner />}
      </Modal>
    );
  }
  return <ExpenseFormBody {...props} title={title} groups={groups.data.groups} groupUsers={groups.data.users} friends={friends.data.friends} />;
}

function ExpenseFormBody({
  existing,
  defaultGroupId = null,
  defaultFriendId,
  onClose,
  title,
  groups,
  groupUsers,
  friends,
}: Props & { title: string; groups: GroupSummary[]; groupUsers: UserMap; friends: FriendWithBalance[] }) {
  const me = useMe();
  const people: UserMap = useMemo(() => {
    const map: UserMap = { ...groupUsers, [me.id]: me };
    for (const f of friends) map[f.id] = f;
    return map;
  }, [groupUsers, friends, me]);

  const poolFor = (groupId: number | null): number[] => {
    if (groupId !== null) return groups.find((g) => g.id === groupId)?.memberIds ?? [me.id];
    return [me.id, ...friends.map((f) => f.id)];
  };
  const defaultCurrency = (groupId: number | null): Currency => {
    const g = groups.find((x) => x.id === groupId);
    const first = g ? Object.keys(g.myBalance)[0] : undefined;
    return (first && (CURRENCIES as readonly string[]).includes(first) ? first : 'USD') as Currency;
  };

  const [draft, setDraft] = useState<ExpenseDraft>(() => {
    if (existing) return draftFromExpense(existing);
    const participants = defaultFriendId !== undefined ? [me.id, defaultFriendId] : poolFor(defaultGroupId);
    return newDraft({ groupId: defaultGroupId, paidBy: me.id, participants, currency: defaultCurrency(defaultGroupId), date: todayIso() });
  });
  const [serverError, setServerError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const pool = poolFor(draft.groupId);
  const check = checkDraft(draft);
  const shareOf = (id: number): number | undefined => (check.ok ? check.shares.find((s) => s.userId === id)?.owedCents : undefined);
  const update = (patch: Partial<ExpenseDraft>): void => setDraft((d) => ({ ...d, ...patch }));

  const changeGroup = (value: string): void => {
    const groupId = value === '' ? null : Number(value);
    const participants = groupId === null ? [me.id, ...(defaultFriendId ? [defaultFriendId] : [])] : poolFor(groupId);
    update({ groupId, participants, paidBy: me.id, values: {}, currency: defaultCurrency(groupId) });
  };

  const toggle = (id: number): void => {
    const included = draft.participants.includes(id);
    update({ participants: included ? draft.participants.filter((p) => p !== id) : pool.filter((p) => p === id || draft.participants.includes(p)) });
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setTouched(true);
    if (!check.ok) return;
    setSaving(true);
    setServerError(null);
    try {
      if (existing) await api('PUT', `/expenses/${existing.id}`, check.payload);
      else await api('POST', '/expenses', check.payload);
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const remove = async (): Promise<void> => {
    if (!existing || !window.confirm(`Delete "${existing.description}"? Everyone in it will see the change.`)) return;
    setSaving(true);
    try {
      await api('DELETE', `/expenses/${existing.id}`);
      onClose();
    } catch (err) {
      setServerError(errorMessage(err));
      setSaving(false);
    }
  };

  const summary = assignedSummary(draft);

  return (
    <Modal title={title} onClose={onClose} wide>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <Field label="Split with">
          {(id) => (
            <Select id={id} value={draft.groupId ?? ''} onChange={(e) => changeGroup(e.target.value)} disabled={existing !== undefined}>
              <option value="">Friends (no group)</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <div className="grid grid-cols-[auto_1fr] items-end gap-3">
          <CategoryIcon category={draft.category} size={44} />
          <Field label="Description">
            {(id) => <Input id={id} placeholder="Dinner, rent, taxi..." value={draft.description} maxLength={100} onChange={(e) => update({ description: e.target.value })} />}
          </Field>
        </div>

        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Currency">
            {(id) => (
              <Select id={id} value={draft.currency} onChange={(e) => update({ currency: e.target.value as Currency })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Amount">
            {(id) => (
              <Input id={id} inputMode="decimal" placeholder="0.00" className="amount text-lg font-bold" value={draft.amount} onChange={(e) => update({ amount: e.target.value })} />
            )}
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Paid by">
            {(id) => (
              <Select id={id} value={draft.paidBy} onChange={(e) => update({ paidBy: Number(e.target.value) })}>
                {pool.map((uid) => (
                  <option key={uid} value={uid}>
                    {uid === me.id ? 'You' : (people[uid]?.name ?? 'Unknown')}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Date">{(id) => <Input id={id} type="date" value={draft.date} onChange={(e) => update({ date: e.target.value })} />}</Field>
          <Field label="Category">
            {(id) => (
              <Select id={id} value={draft.category} onChange={(e) => update({ category: e.target.value as CategoryId })}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-[13px] font-semibold text-ink-soft">How to split</legend>
          <div role="radiogroup" aria-label="Split mode" className="grid grid-cols-4 gap-1 rounded-2xl bg-canvas p-1">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={draft.mode === m.id}
                onClick={() => update({ mode: m.id, values: {} })}
                className={`flex flex-col items-center rounded-xl py-2 text-xs font-semibold transition ${draft.mode === m.id ? 'bg-white text-mint-700 shadow-[var(--shadow-card)]' : 'text-ink-mute hover:text-ink'}`}
              >
                <span className="amount text-base font-extrabold">{m.glyph}</span>
                {m.label}
              </button>
            ))}
          </div>

          <ul className="divide-y divide-line rounded-2xl border border-line">
            {pool.map((uid) => (
              <ParticipantRow
                key={uid}
                user={people[uid] ?? { id: uid, name: 'Unknown', email: '', registered: false }}
                isMe={uid === me.id}
                mode={draft.mode}
                included={draft.participants.includes(uid)}
                value={draft.values[uid] ?? ''}
                owed={shareOf(uid)}
                currency={draft.currency}
                onToggle={() => toggle(uid)}
                onValue={(v) => update({ values: { ...draft.values, [uid]: v } })}
              />
            ))}
          </ul>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-mute">{summary ?? `${draft.participants.length} people, split evenly`}</span>
            {!check.ok && check.remaining && <span className="amount font-bold text-coral-500">{check.remaining}</span>}
          </div>
        </fieldset>

        {touched && !check.ok && <ErrorNote>{check.error}</ErrorNote>}
        {serverError && <ErrorNote>{serverError}</ErrorNote>}

        <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
          {existing ? (
            <Button variant="danger" onClick={remove} disabled={saving}>
              Delete expense
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="flex-1 sm:flex-none">
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ParticipantRow({
  user,
  isMe,
  mode,
  included,
  value,
  owed,
  currency,
  onToggle,
  onValue,
}: {
  user: User;
  isMe: boolean;
  mode: SplitMode;
  included: boolean;
  value: string;
  owed: number | undefined;
  currency: string;
  onToggle: () => void;
  onValue: (v: string) => void;
}) {
  const suffix = mode === 'percent' ? '%' : mode === 'shares' ? 'sh' : '';
  return (
    <li className={`flex items-center gap-3 px-3 py-2.5 transition ${included ? '' : 'opacity-45'}`}>
      <input type="checkbox" checked={included} onChange={onToggle} aria-label={`Include ${user.name}`} className="h-5 w-5 accent-[var(--color-mint-500)]" />
      <Avatar id={user.id} name={user.name} size={32} />
      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{isMe ? `${user.name} (you)` : user.name}</span>
      {mode !== 'equal' && included && (
        <span className="relative">
          {mode === 'exact' && <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-ink-mute">{currency}</span>}
          <input
            aria-label={`${user.name} ${mode}`}
            inputMode="decimal"
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder="0"
            className={`amount h-9 w-28 rounded-lg border border-line bg-white text-right text-sm font-semibold outline-none focus:border-mint-400 focus:ring-4 focus:ring-mint-100 ${mode === 'exact' ? 'pl-11 pr-2.5' : 'pl-2.5 pr-8'}`}
          />
          {suffix && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-ink-mute">{suffix}</span>}
        </span>
      )}
      <span className="amount w-24 text-right text-sm font-bold text-ink-soft">{included && owed !== undefined ? formatMoney(owed, currency) : ''}</span>
    </li>
  );
}
