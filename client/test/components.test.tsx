import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Amounts, BalanceLine } from '../src/components/money';
import { Avatar } from '../src/components/ui';
import { initials, relativeTime } from '../src/lib/format';

afterEach(cleanup);

describe('money components', () => {
  it('shows direction and amount per currency', () => {
    render(<BalanceLine balance={{ USD: 1250, EUR: -300 }} />);
    expect(screen.getByText('$12.50')).toBeTruthy();
    expect(screen.getByText('€3.00')).toBeTruthy();
    expect(screen.getByText('you are owed')).toBeTruthy();
    expect(screen.getByText('you owe')).toBeTruthy();
  });

  it('says settled up when there is no balance', () => {
    render(<BalanceLine balance={{}} />);
    expect(screen.getByText('settled up')).toBeTruthy();
  });

  it('renders signed totals', () => {
    render(<Amounts balance={{ USD: -5 }} tone="auto" signed />);
    expect(screen.getByText('-$0.05')).toBeTruthy();
  });
});

describe('format helpers', () => {
  it('builds initials for avatars', () => {
    expect(initials('Alex Rivera')).toBe('AR');
    expect(initials('Sam')).toBe('S');
    expect(initials('Mary Jane Watson')).toBe('MW');
    render(<Avatar id={1} name="Jordan Patel" />);
    expect(screen.getByText('JP')).toBeTruthy();
  });

  it('formats relative times', () => {
    const now = new Date('2026-11-17T12:00:00Z');
    expect(relativeTime('2026-11-17T11:59:30Z', now)).toBe('just now');
    expect(relativeTime('2026-11-17T11:00:00Z', now)).toBe('1 h ago');
    expect(relativeTime('2026-11-14T12:00:00Z', now)).toBe('3 d ago');
    expect(relativeTime('2026-10-01T12:00:00Z', now)).toBe('Oct 1');
  });
});
