import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router';
import { useAuth } from '../lib/auth';
import { errorMessage } from '../lib/api';
import { Button, ErrorNote, Field, Input } from '../components/ui';
import { Logo } from '../components/icons';

const DEMO = { email: 'alex@example.com', password: 'evenly-demo' };

export function LoginPage() {
  const { user, login, register } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'login') await login(email, password);
      else await register(name, email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const ready = email.trim() !== '' && password !== '' && (mode === 'login' || name.trim() !== '');

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-24 -top-24 h-96 w-96 rounded-full bg-mint-200/60 blur-3xl" />
        <div className="absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-coral-100/70 blur-3xl" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.35]" aria-hidden>
          <defs>
            <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
              <path d="M32 0H0v32" fill="none" stroke="var(--color-line)" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>
      </div>

      <div className="animate-rise relative grid w-full max-w-4xl overflow-hidden rounded-[28px] bg-white shadow-[var(--shadow-pop)] md:grid-cols-[1.05fr_1fr]">
        <section className="relative hidden flex-col justify-between bg-mint-500 p-10 text-white md:flex">
          <Logo compact />
          <div>
            <h1 className="text-[34px] font-extrabold leading-[1.1] tracking-tight">Shared costs, without the awkward math.</h1>
            <p className="mt-4 max-w-sm text-[15px] text-mint-50/90">Track who paid for what on trips, in shared flats and between friends. Evenly works out the fewest payments to square everyone up.</p>
          </div>
          <ul className="flex flex-col gap-2.5 text-sm font-semibold text-white/95">
            {['Split equally, by exact amounts, percentages or shares', 'Balances per person, per group, per currency', 'Simplify debts into the fewest payments'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/20 text-xs">✓</span>
                {t}
              </li>
            ))}
          </ul>
        </section>

        <section className="p-7 sm:p-10">
          <div className="mb-8 md:hidden">
            <Logo />
          </div>
          <h2 className="text-2xl font-extrabold tracking-tight">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
          <p className="mt-1 text-sm text-ink-mute">{mode === 'login' ? 'Log in to see your balances.' : 'It takes ten seconds.'}</p>

          <form onSubmit={submit} className="mt-7 flex flex-col gap-4">
            {mode === 'signup' && <Field label="Your name">{(id) => <Input id={id} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />}</Field>}
            <Field label="Email address">{(id) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />}</Field>
            <Field label="Password" hint={mode === 'signup' ? 'At least 8 characters' : undefined}>
              {(id) => <Input id={id} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />}
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" disabled={!ready || busy} className="mt-1 w-full">
              {busy ? 'One moment...' : mode === 'login' ? 'Log in' : 'Sign up'}
            </Button>
          </form>

          {mode === 'login' && (
            <button
              type="button"
              onClick={() => {
                setEmail(DEMO.email);
                setPassword(DEMO.password);
              }}
              className="mt-4 w-full rounded-xl border border-dashed border-mint-300 bg-mint-50 px-4 py-3 text-left text-sm transition hover:bg-mint-100"
            >
              <span className="font-bold text-mint-800">Use the demo account</span>
              <span className="block text-ink-soft">
                {DEMO.email} / {DEMO.password}
              </span>
            </button>
          )}

          <p className="mt-6 text-center text-sm text-ink-mute">
            {mode === 'login' ? 'New here? ' : 'Already have an account? '}
            <button
              type="button"
              className="font-bold text-mint-600 hover:underline"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setError(null);
              }}
            >
              {mode === 'login' ? 'Create an account' : 'Log in'}
            </button>
          </p>
        </section>
      </div>
    </div>
  );
}
