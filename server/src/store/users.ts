import type { DB } from '../db.js';
import { notFound } from '../http.js';

export interface PublicUser {
  id: number;
  name: string;
  email: string;
  registered: boolean;
}

interface UserRow {
  id: number;
  name: string;
  email: string;
  password_hash: string | null;
}

const toPublic = (r: UserRow): PublicUser => ({ id: r.id, name: r.name, email: r.email, registered: r.password_hash !== null });

export function findUserByEmail(db: DB, email: string): (PublicUser & { passwordHash: string | null }) | null {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ? { ...toPublic(row), passwordHash: row.password_hash } : null;
}

export function getUser(db: DB, id: number): PublicUser {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  if (!row) throw notFound('User not found');
  return toPublic(row);
}

export function getUsers(db: DB, ids: readonly number[]): Map<number, PublicUser> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map();
  const rows = db
    .prepare(`SELECT * FROM users WHERE id IN (${unique.map(() => '?').join(',')})`)
    .all(...unique) as UserRow[];
  return new Map(rows.map((r) => [r.id, toPublic(r)]));
}

export function createUser(db: DB, name: string, email: string, passwordHash: string | null): PublicUser {
  const info = db.prepare('INSERT INTO users (name, email, password_hash) VALUES (?, ?, ?)').run(name, email, passwordHash);
  return getUser(db, Number(info.lastInsertRowid));
}

/** Returns the existing account for this email, or creates an invited (not yet registered) person. */
export function findOrInviteUser(db: DB, name: string, email: string): PublicUser {
  const existing = findUserByEmail(db, email);
  if (existing) {
    const { passwordHash: _ignored, ...user } = existing;
    return user;
  }
  return createUser(db, name, email, null);
}

export function areFriends(db: DB, a: number, b: number): boolean {
  return db.prepare('SELECT 1 FROM friendships WHERE user_id = ? AND friend_id = ?').get(a, b) !== undefined;
}

/** Creates the friendship in both directions. Returns true if it is new. */
export function befriend(db: DB, a: number, b: number): boolean {
  if (a === b) return false;
  const stmt = db.prepare('INSERT OR IGNORE INTO friendships (user_id, friend_id) VALUES (?, ?)');
  const first = stmt.run(a, b).changes;
  stmt.run(b, a);
  return first > 0;
}

export function friendIds(db: DB, userId: number): number[] {
  return (db.prepare('SELECT friend_id FROM friendships WHERE user_id = ?').all(userId) as { friend_id: number }[]).map(
    (r) => r.friend_id,
  );
}
