import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { avatarHue, initials } from '../lib/format';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'coral';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-mint-500 text-white hover:bg-mint-600 shadow-[0_6px_16px_-6px_rgb(19_179_138/0.7)]',
  coral: 'bg-coral-500 text-white hover:bg-coral-600 shadow-[0_6px_16px_-6px_rgb(228_87_46/0.6)]',
  secondary: 'bg-white text-ink border border-line hover:border-mint-300 hover:bg-mint-50',
  ghost: 'text-ink-soft hover:bg-black/5',
  danger: 'bg-white text-coral-600 border border-coral-100 hover:bg-coral-50',
};

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  const sizing = size === 'sm' ? 'h-9 px-3.5 text-sm' : 'h-11 px-5 text-[15px]';
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background,box-shadow,transform,border-color] active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${sizing} ${VARIANTS[variant]} ${className}`}
    />
  );
}

export function Avatar({ id, name, size = 40 }: { id: number; name: string; size?: number }) {
  const hue = avatarHue(id);
  return (
    <span
      aria-hidden
      className="inline-flex shrink-0 select-none items-center justify-center rounded-full font-bold"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        background: `hsl(${hue} 70% 92%)`,
        color: `hsl(${hue} 55% 30%)`,
        boxShadow: `inset 0 0 0 1.5px hsl(${hue} 60% 82%)`,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-semibold text-ink-soft">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-[13px] font-medium text-coral-600">{error}</p> : hint ? <p className="text-[13px] text-ink-mute">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  'h-11 w-full rounded-xl border border-line bg-white px-3.5 text-[15px] text-ink outline-none transition placeholder:text-ink-mute/70 focus:border-mint-400 focus:ring-4 focus:ring-mint-100';

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} appearance-none bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9 ${props.className ?? ''}`} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20' fill='%2384939a'%3E%3Cpath d='M5.5 7.5 10 12l4.5-4.5'/%3E%3C/svg%3E\")" }} />;
}

export function Modal({ title, onClose, children, wide = false }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('input, select, button:not([data-close])')?.focus();
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      previous?.focus();
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6" role="presentation">
      <div className="animate-fade absolute inset-0 bg-ink/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`animate-rise relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-pop)] sm:rounded-3xl ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <header className="flex items-center justify-between border-b border-line bg-mint-500 px-5 py-4 text-white">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" data-close onClick={onClose} aria-label="Close" className="rounded-full p-1.5 hover:bg-white/15">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M5 5l10 10M15 5L5 15" />
            </svg>
          </button>
        </header>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-xl border border-coral-100 bg-coral-50 px-3.5 py-2.5 text-sm font-medium text-coral-700">
      {children}
    </p>
  );
}

export function Empty({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-mint-50 text-mint-500">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M5 9h14M5 15h14" />
        </svg>
      </div>
      <p className="font-bold">{title}</p>
      <p className="max-w-xs text-sm text-ink-mute">{body}</p>
      {action}
    </div>
  );
}

export function Spinner() {
  return (
    <div className="flex justify-center py-16" aria-label="Loading">
      <span className="h-7 w-7 animate-spin rounded-full border-[3px] border-mint-100 border-t-mint-500" />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-bold uppercase tracking-[0.08em] text-ink-mute">{children}</h2>
      {action}
    </div>
  );
}
