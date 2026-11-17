import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  general: <path d="M6 7h12M6 12h12M6 17h7" />,
  food: (
    <>
      <path d="M7 3v8a2 2 0 0 0 2 2v8M11 3v6M7 7h4" />
      <path d="M17 21V3c-2 1.5-3 4-3 7h3" />
    </>
  ),
  groceries: (
    <>
      <path d="M4 5h2l2.2 10.5h9.6L20 8H7" />
      <circle cx="10" cy="19.5" r="1.3" />
      <circle cx="17" cy="19.5" r="1.3" />
    </>
  ),
  transport: (
    <>
      <rect x="5" y="4" width="14" height="13" rx="3" />
      <path d="M5 11h14M8 20l1.5-3M16 20l-1.5-3" />
      <circle cx="9" cy="14" r=".6" />
      <circle cx="15" cy="14" r=".6" />
    </>
  ),
  lodging: (
    <>
      <path d="M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5" />
      <circle cx="7" cy="11" r="1.6" />
    </>
  ),
  rent: (
    <>
      <path d="M4 11l8-6 8 6M6 9.5V20h12V9.5" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  utilities: <path d="M13 3L6 13h5l-1 8 7-10h-5l1-8z" />,
  entertainment: (
    <>
      <path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 0 0-4V5H4v3z" transform="translate(0 1.5)" />
      <path d="M14 6.5v13" strokeDasharray="1.5 2" />
    </>
  ),
  shopping: (
    <>
      <path d="M5 8h14l-1 12H6L5 8z" />
      <path d="M9 10V7a3 3 0 0 1 6 0v3" />
    </>
  ),
  travel: (
    <path d="M10.5 13.5L4 11l1.5-1.5 7 1 4-4c1-1 2.6-1.2 3.2-.6.6.6.4 2.2-.6 3.2l-4 4 1 7L14.6 21l-2.5-6.5-3 3V20L7.5 21.5 6 18l-3.5-1.5L4 15h2.5l3-3" />
  ),
};

const TINTS: Record<string, string> = {
  general: 'bg-slate-100 text-slate-600',
  food: 'bg-amber-100 text-amber-700',
  groceries: 'bg-lime-100 text-lime-700',
  transport: 'bg-sky-100 text-sky-700',
  lodging: 'bg-indigo-100 text-indigo-700',
  rent: 'bg-violet-100 text-violet-700',
  utilities: 'bg-yellow-100 text-yellow-700',
  entertainment: 'bg-pink-100 text-pink-700',
  shopping: 'bg-orange-100 text-orange-700',
  travel: 'bg-cyan-100 text-cyan-700',
};

export function CategoryIcon({ category, size = 40 }: { category: string; size?: number }) {
  return (
    <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ${TINTS[category] ?? TINTS.general}`} style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        {PATHS[category] ?? PATHS.general}
      </svg>
    </span>
  );
}

export function SettleIcon({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-mint-100 text-mint-700" style={{ width: size, height: size }} aria-hidden>
      <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="6" width="18" height="12" rx="2.5" />
        <circle cx="12" cy="12" r="2.5" />
        <path d="M6.5 9.5v5M17.5 9.5v5" />
      </svg>
    </span>
  );
}
