/** All money is integer cents. These helpers never use floating point arithmetic on amounts. */

export const CURRENCIES = ['USD', 'EUR', 'GBP', 'JPY', 'VND', 'AUD', 'CAD', 'SGD'] as const;
export type Currency = (typeof CURRENCIES)[number];

/** Largest single expense we accept: 10,000,000.00 in any currency. Keeps products below 2^53. */
export const MAX_AMOUNT_CENTS = 1_000_000_000;

const SYMBOLS: Record<Currency, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  VND: '₫',
  AUD: 'A$',
  CAD: 'C$',
  SGD: 'S$',
};

export function currencySymbol(currency: string): string {
  return (SYMBOLS as Record<string, string>)[currency] ?? `${currency} `;
}

/** Parse a user-typed decimal string ("12", "12.5", "1,234.56") into cents. Returns null if invalid. */
export function parseCents(input: string): number | null {
  const cleaned = input.trim().replace(/,/g, '');
  const match = /^(\d{1,8})(?:\.(\d{0,2}))?$/.exec(cleaned);
  if (!match) return null;
  const whole = Number(match[1]);
  const fraction = (match[2] ?? '').padEnd(2, '0');
  const cents = whole * 100 + Number(fraction);
  return cents <= MAX_AMOUNT_CENTS ? cents : null;
}

/** Format cents as a plain decimal string without symbol: 1234 -> "12.34", -5 -> "-0.05". */
export function centsToDecimal(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100);
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${whole}.${fraction}`;
}

/** Format cents with currency symbol and thousands separators: 123456, USD -> "$1,234.56". */
export function formatMoney(cents: number, currency: string): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const fraction = String(abs % 100).padStart(2, '0');
  return `${sign}${currencySymbol(currency)}${whole}.${fraction}`;
}

/** Percent input "33.33" -> basis points 3333. Returns null if invalid or above 100%. */
export function parseBasisPoints(input: string): number | null {
  const match = /^(\d{1,3})(?:\.(\d{0,2}))?$/.exec(input.trim());
  if (!match) return null;
  const bp = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return bp <= 10_000 ? bp : null;
}

export function basisPointsToPercent(bp: number): string {
  const whole = Math.floor(bp / 100);
  const fraction = bp % 100;
  return fraction === 0 ? String(whole) : `${whole}.${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

/** A balance in possibly several currencies. Zero entries are always removed. */
export type MultiBalance = Record<string, number>;

export function addTo(balance: MultiBalance, currency: string, cents: number): MultiBalance {
  const next = { ...balance, [currency]: (balance[currency] ?? 0) + cents };
  if (next[currency] === 0) delete next[currency];
  return next;
}

export function isZero(balance: MultiBalance): boolean {
  return Object.values(balance).every((v) => v === 0);
}
