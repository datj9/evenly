import type { ReactNode } from 'react';

function Icon({ children, size = 22 }: { children: ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export const HomeIcon = () => (
  <Icon>
    <path d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1v-9.5z" />
  </Icon>
);
export const GroupsIcon = () => (
  <Icon>
    <circle cx="9" cy="8.5" r="3.2" />
    <path d="M3.5 19.5c.6-3 2.8-4.8 5.5-4.8s4.9 1.8 5.5 4.8" />
    <path d="M15.5 5.6a3 3 0 0 1 0 5.8M17.5 14.9c1.6.7 2.7 2.3 3 4.6" />
  </Icon>
);
export const FriendsIcon = () => (
  <Icon>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6" />
  </Icon>
);
export const ActivityIcon = () => (
  <Icon>
    <path d="M3 12h4l2.5-6 5 12 2.5-6h4" />
  </Icon>
);
export const PlusIcon = ({ size = 22 }: { size?: number }) => (
  <Icon size={size}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);
export const LogoutIcon = () => (
  <Icon size={18}>
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4M6 12h10" />
  </Icon>
);
export const ChevronIcon = () => (
  <Icon size={18}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);
export const BackIcon = () => (
  <Icon size={20}>
    <path d="M15 6l-6 6 6 6" />
  </Icon>
);

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="9" fill="var(--color-mint-500)" />
        <path d="M9 12h14M9 20h14" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" />
      </svg>
      {!compact && <span className="text-xl font-extrabold tracking-tight text-ink">evenly</span>}
    </span>
  );
}
