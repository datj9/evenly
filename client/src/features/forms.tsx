import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { CURRENCIES, centsToDecimal, formatMoney, parseCents, type Currency } from '../../../shared/src/money';
import { api, errorMessage } from '../lib/api';
import { useMe } from '../lib/auth';
import { todayIso } from '../lib/format';
import type { Debt, Group, User } from '../types';
import { Avatar, Button, ErrorNote, Field, Input, Modal, Select } from '../components/ui';
import { SettleIcon } from '../components/CategoryIcon';

function useSubmit(action: () => Promise<void>): { busy: boolean; error: string | null; run: (e: FormEvent) => Promise<void>; setError: (m: string | null) => void } {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, run, setError };
}

function FormActions({ busy, label, onCancel }: { busy: boolean; label: string; onCancel: () => void }) {
  return (
    <div className="flex justify-end gap-2 pt-2">
      <Button variant="secondary" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving...' : label}
      </Button>
    </div>
  );
}

export function AddFriendForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit(async () => {
    const { friend } = await api<{ friend: User }>('POST', '/friends', { name, email });
    onClose();
    navigate(`/friends/${friend.id}`);
  });
  return (
    <Modal title="Add a friend" onClose={onClose}>
      <form onSubmit={run} className="flex flex-col gap-4">
        <p className="text-sm text-ink-soft">If they do not have an account yet, they are added as an invited friend and can sign up with the same email later.</p>
        <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />}</Field>
        <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <FormActions busy={busy} label="Add friend" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function NewGroupForm({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [members, setMembers] = useState<Array<{ name: string; email: string }>>([{ name: '', email: '' }]);
  const navigate = useNavigate();
  const { busy, error, run } = useSubmit(async () => {
    const filled = members.filter((m) => m.name.trim() || m.email.trim());
    const { group } = await api<{ group: Group }>('POST', '/groups', { name, members: filled });
    onClose();
    navigate(`/groups/${group.id}`);
  });
  const setMember = (i: number, patch: Partial<{ name: string; email: string }>): void =>
    setMembers((ms) => ms.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  return (
    <Modal title="Start a new group" onClose={onClose}>
      <form onSubmit={run} className="flex flex-col gap-4">
        <Field label="Group name">{(id) => <Input id={id} value={name} placeholder="Weekend in the mountains" onChange={(e) => setName(e.target.value)} required maxLength={60} />}</Field>
        <div className="flex flex-col gap-2">
          <span className="text-[13px] font-semibold text-ink-soft">Members (you are added automatically)</span>
          {members.map((m, i) => (
            <div key={i} className="grid grid-cols-2 gap-2">
              <Input aria-label={`Member ${i + 1} name`} placeholder="Name" value={m.name} onChange={(e) => setMember(i, { name: e.target.value })} />
              <Input aria-label={`Member ${i + 1} email`} placeholder="Email" type="email" value={m.email} onChange={(e) => setMember(i, { email: e.target.value })} />
            </div>
          ))}
          <button type="button" className="self-start text-sm font-semibold text-mint-600 hover:underline" onClick={() => setMembers((ms) => [...ms, { name: '', email: '' }])}>
            + Add another person
          </button>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <FormActions busy={busy} label="Create group" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function AddMemberForm({ groupId, candidates, onClose }: { groupId: number; candidates: User[]; onClose: () => void }) {
  const [choice, setChoice] = useState<string>(candidates[0] ? String(candidates[0].id) : 'new');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const { busy, error, run } = useSubmit(async () => {
    const body = choice === 'new' ? { name, email } : { userId: Number(choice) };
    await api('POST', `/groups/${groupId}/members`, body);
    onClose();
  });
  return (
    <Modal title="Add someone to the group" onClose={onClose}>
      <form onSubmit={run} className="flex flex-col gap-4">
        <Field label="Who">
          {(id) => (
            <Select id={id} value={choice} onChange={(e) => setChoice(e.target.value)}>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
              <option value="new">Someone new...</option>
            </Select>
          )}
        </Field>
        {choice === 'new' && (
          <>
            <Field label="Name">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} required />}</Field>
            <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
          </>
        )}
        {error && <ErrorNote>{error}</ErrorNote>}
        <FormActions busy={busy} label="Add to group" onCancel={onClose} />
      </form>
    </Modal>
  );
}

export function SettleUpForm({
  groupId,
  people,
  suggestion,
  onClose,
}: {
  groupId: number | null;
  people: User[];
  suggestion?: Debt;
  onClose: () => void;
}) {
  const me = useMe();
  const other = people.find((p) => p.id !== me.id);
  const [from, setFrom] = useState<number>(suggestion?.fromUserId ?? me.id);
  const [to, setTo] = useState<number>(suggestion?.toUserId ?? other?.id ?? me.id);
  const [amount, setAmount] = useState(suggestion ? centsToDecimal(suggestion.amountCents) : '');
  const [currency, setCurrency] = useState<Currency>((suggestion?.currency as Currency) ?? 'USD');
  const [date, setDate] = useState(todayIso());
  const { busy, error, run, setError } = useSubmit(async () => {
    const cents = parseCents(amount);
    if (cents === null || cents === 0) throw new Error('Enter an amount like 25.00.');
    if (from === to) throw new Error('Choose two different people.');
    await api('POST', '/settlements', { groupId, fromUserId: from, toUserId: to, amountCents: cents, currency, date });
    onClose();
  });
  const nameOf = (id: number): string => (id === me.id ? 'You' : (people.find((p) => p.id === id)?.name ?? 'Unknown'));
  const cents = parseCents(amount);

  return (
    <Modal title="Settle up" onClose={onClose}>
      <form onSubmit={run} className="flex flex-col gap-4">
        <div className="flex items-center justify-center gap-4 py-2">
          <Avatar id={from} name={nameOf(from)} size={52} />
          <SettleIcon size={36} />
          <Avatar id={to} name={nameOf(to)} size={52} />
        </div>
        <p className="text-center text-sm text-ink-soft">
          <strong className="text-ink">{nameOf(from)}</strong> paid <strong className="text-ink">{nameOf(to)}</strong>{' '}
          {cents ? <strong className="amount text-mint-600">{formatMoney(cents, currency)}</strong> : null}
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Payer">
            {(id) => (
              <Select id={id} value={from} onChange={(e) => { setFrom(Number(e.target.value)); setError(null); }}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nameOf(p.id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Recipient">
            {(id) => (
              <Select id={id} value={to} onChange={(e) => { setTo(Number(e.target.value)); setError(null); }}>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {nameOf(p.id)}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <div className="grid grid-cols-[7rem_1fr] gap-3">
          <Field label="Currency">
            {(id) => (
              <Select id={id} value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Amount">{(id) => <Input id={id} inputMode="decimal" className="amount text-lg font-bold" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />}</Field>
        </div>
        <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
        <p className="text-xs text-ink-mute">This records a payment made outside the app (cash, bank transfer). No money moves.</p>
        {error && <ErrorNote>{error}</ErrorNote>}
        <FormActions busy={busy} label="Record payment" onCancel={onClose} />
      </form>
    </Modal>
  );
}
