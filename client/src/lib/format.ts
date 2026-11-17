import { formatMoney, type MultiBalance } from '../../../shared/src/money';
import type { User, UserMap } from '../types';

export function firstName(user: Pick<User, 'name'> | undefined): string {
  return user?.name.split(' ')[0] ?? 'Someone';
}

export function displayName(users: UserMap, id: number, meId: number): string {
  if (id === meId) return 'You';
  return users[id]?.name ?? 'Unknown';
}

export function shortName(users: UserMap, id: number, meId: number): string {
  if (id === meId) return 'you';
  return firstName(users[id]);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '')).toUpperCase() || '?';
}

/** Currencies sorted so USD-like lines are stable across renders. */
export function balanceEntries(balance: MultiBalance): Array<[string, number]> {
  return Object.entries(balance)
    .filter(([, v]) => v !== 0)
    .sort(([a], [b]) => a.localeCompare(b));
}

export function moneyList(balance: MultiBalance, absolute = true): string {
  const entries = balanceEntries(balance);
  if (entries.length === 0) return formatMoney(0, 'USD');
  return entries.map(([c, v]) => formatMoney(absolute ? Math.abs(v) : v, c)).join(' + ');
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-05" -> { month: "Nov", day: "05" } without timezone shifts. */
export function dateParts(iso: string): { month: string; day: string; year: string } {
  const [y, m, d] = iso.slice(0, 10).split('-');
  return { month: MONTHS[Number(m) - 1] ?? '', day: d ?? '', year: y ?? '' };
}

export function monthHeading(iso: string): string {
  const { month, year } = dateParts(iso);
  const full = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  return `${full[MONTHS.indexOf(month)]} ${year}`;
}

export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} d ago`;
  const { month, day, year } = dateParts(then.toISOString());
  return `${month} ${Number(day)}${year === String(now.getFullYear()) ? '' : `, ${year}`}`;
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Stable hue per user id for avatar backgrounds. */
export function avatarHue(id: number): number {
  return (id * 137) % 360;
}
