import type { DB } from './db.js';
import { hashPassword } from './auth.js';
import { createUser } from './store/users.js';
import { addFriend, createGroup, updateGroup } from './services/groups.js';
import { createExpense, createSettlement, updateExpense } from './services/expenses.js';
import type { ExpenseInput } from './schemas.js';
import type { SplitMode } from '../../shared/src/splits.js';

export const DEMO_PASSWORD = 'evenly-demo';
export const DEMO_USERS = [
  { name: 'Alex Rivera', email: 'alex@example.com' },
  { name: 'Sam Chen', email: 'sam@example.com' },
  { name: 'Jordan Patel', email: 'jordan@example.com' },
] as const;

/** Backdates the most recent activity entry so the seeded feed reads like real history. */
function backdate(db: DB, timestamp: string): void {
  db.prepare('UPDATE activities SET created_at = ? WHERE id = (SELECT MAX(id) FROM activities)').run(timestamp);
}

export function isEmpty(db: DB): boolean {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n === 0;
}

export async function seed(db: DB): Promise<void> {
  const hash = await hashPassword(DEMO_PASSWORD);
  const [alex, sam, jordan] = DEMO_USERS.map((u) => createUser(db, u.name, u.email, hash).id);

  addFriend(db, alex, 'Sam Chen', 'sam@example.com');
  backdate(db, '2026-10-01T09:00:00.000Z');
  addFriend(db, alex, 'Jordan Patel', 'jordan@example.com');
  backdate(db, '2026-10-01T09:05:00.000Z');

  const lisbon = createGroup(db, alex, 'Lisbon trip', [
    { name: 'Sam Chen', email: 'sam@example.com' },
    { name: 'Jordan Patel', email: 'jordan@example.com' },
  ]).id;
  db.prepare("UPDATE activities SET created_at = '2026-10-02T10:00:00.000Z' WHERE group_id = ?").run(lisbon);
  const apartment = createGroup(db, sam, 'Apartment 4B', [{ name: 'Alex Rivera', email: 'alex@example.com' }]).id;
  db.prepare("UPDATE activities SET created_at = '2026-10-03T18:00:00.000Z' WHERE group_id = ?").run(apartment);
  updateGroup(db, sam, apartment, { simplifyDebts: false });

  const expense = (
    actor: number,
    groupId: number | null,
    description: string,
    amountCents: number,
    currency: ExpenseInput['currency'],
    category: ExpenseInput['category'],
    date: string,
    splitMode: SplitMode,
    splits: Array<[number, number]>,
  ): number => {
    const id = createExpense(db, actor, {
      groupId,
      description,
      amountCents,
      currency,
      category,
      date,
      paidBy: actor,
      splitMode,
      splits: splits.map(([userId, value]) => ({ userId, value })),
    }).id;
    backdate(db, `${date}T19:30:00.000Z`);
    return id;
  };

  // Lisbon trip, in euros
  expense(alex, lisbon, 'Apartment in Alfama, 3 nights', 64500, 'EUR', 'lodging', '2026-10-10', 'equal', [[alex, 1], [sam, 1], [jordan, 1]]);
  expense(jordan, lisbon, 'Tram 28 and metro passes', 4500, 'EUR', 'transport', '2026-10-10', 'equal', [[alex, 1], [sam, 1], [jordan, 1]]);
  expense(sam, lisbon, 'Seafood dinner in Cais do Sodre', 18740, 'EUR', 'food', '2026-10-11', 'exact', [[alex, 6820], [sam, 5900], [jordan, 6020]]);
  expense(alex, lisbon, 'Sintra day tour', 23700, 'EUR', 'entertainment', '2026-10-12', 'percent', [[alex, 4000], [sam, 3000], [jordan, 3000]]);
  expense(jordan, lisbon, 'Custard tarts for everyone', 1000, 'EUR', 'food', '2026-10-12', 'equal', [[alex, 1], [sam, 1], [jordan, 1]]);
  expense(sam, lisbon, 'Groceries for the flat', 6235, 'EUR', 'groceries', '2026-10-12', 'shares', [[alex, 2], [sam, 1], [jordan, 1]]);
  expense(jordan, lisbon, 'Fado night tickets', 9000, 'EUR', 'entertainment', '2026-10-13', 'equal', [[sam, 1], [jordan, 1]]);

  // Apartment 4B, in dollars
  expense(alex, apartment, 'November rent', 280000, 'USD', 'rent', '2026-11-01', 'percent', [[alex, 5500], [sam, 4500]]);
  expense(sam, apartment, 'Electricity and internet', 14388, 'USD', 'utilities', '2026-11-03', 'equal', [[alex, 1], [sam, 1]]);
  expense(alex, apartment, 'Warehouse club run', 21677, 'USD', 'groceries', '2026-11-05', 'shares', [[alex, 3], [sam, 2]]);
  expense(sam, apartment, 'New living room couch', 89900, 'USD', 'shopping', '2026-11-07', 'exact', [[alex, 44950], [sam, 44950]]);
  const cleaning = expense(alex, apartment, 'Cleaning supplies', 3200, 'USD', 'general', '2026-11-09', 'equal', [[alex, 1], [sam, 1]]);

  // Between friends, no group
  expense(jordan, null, 'Concert tickets', 18000, 'USD', 'entertainment', '2026-11-08', 'equal', [[alex, 1], [jordan, 1]]);
  expense(alex, null, 'Coffee beans subscription', 2400, 'USD', 'groceries', '2026-11-10', 'exact', [[alex, 1200], [jordan, 1200]]);

  // An edit, so the feed shows one
  updateExpense(db, alex, cleaning, {
    groupId: apartment,
    description: 'Cleaning supplies',
    amountCents: 3456,
    currency: 'USD',
    category: 'general',
    date: '2026-11-09',
    paidBy: alex,
    splitMode: 'equal',
    splits: [{ userId: alex, value: 1 }, { userId: sam, value: 1 }],
  });
  backdate(db, '2026-11-09T21:10:00.000Z');

  // Settlements
  createSettlement(db, sam, { groupId: lisbon, fromUserId: sam, toUserId: alex, amountCents: 10000, currency: 'EUR', date: '2026-10-15' });
  backdate(db, '2026-10-15T12:00:00.000Z');
  createSettlement(db, sam, { groupId: apartment, fromUserId: sam, toUserId: alex, amountCents: 50000, currency: 'USD', date: '2026-11-12' });
  backdate(db, '2026-11-12T08:45:00.000Z');
}
