import { formatMoney, type MultiBalance } from '../../../shared/src/money';
import { balanceEntries } from '../lib/format';

/** "you are owed $12.00" / "you owe €3.40" / "settled up", colored by direction. */
export function BalanceLine({
  balance,
  owedLabel = 'you are owed',
  oweLabel = 'you owe',
  size = 'sm',
}: {
  balance: MultiBalance;
  owedLabel?: string;
  oweLabel?: string;
  size?: 'sm' | 'lg';
}) {
  const entries = balanceEntries(balance);
  if (entries.length === 0) return <span className="text-sm font-medium text-ink-mute">settled up</span>;
  return (
    <span className="flex flex-col items-end gap-0.5">
      {entries.map(([currency, cents]) => (
        <span key={currency} className={`flex flex-col items-end leading-tight ${cents > 0 ? 'text-mint-600' : 'text-coral-500'}`}>
          <span className="text-[11px] font-semibold uppercase tracking-wide opacity-80">{cents > 0 ? owedLabel : oweLabel}</span>
          <span className={`amount font-extrabold ${size === 'lg' ? 'text-xl' : 'text-[15px]'}`}>{formatMoney(Math.abs(cents), currency)}</span>
        </span>
      ))}
    </span>
  );
}

/** Lines of amounts, one per currency, in a fixed tone. */
export function Amounts({ balance, tone, empty = '$0.00', signed = false }: { balance: MultiBalance; tone: 'mint' | 'coral' | 'auto'; empty?: string; signed?: boolean }) {
  const entries = balanceEntries(balance);
  if (entries.length === 0) return <span className="amount text-ink-mute">{empty}</span>;
  return (
    <span className="flex flex-col">
      {entries.map(([currency, cents]) => {
        const color = tone === 'mint' ? 'text-mint-600' : tone === 'coral' ? 'text-coral-500' : cents >= 0 ? 'text-mint-600' : 'text-coral-500';
        const text = signed ? `${cents > 0 ? '+' : ''}${formatMoney(cents, currency)}` : formatMoney(Math.abs(cents), currency);
        return (
          <span key={currency} className={`amount ${color}`}>
            {text}
          </span>
        );
      })}
    </span>
  );
}
