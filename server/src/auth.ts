import { createHash, randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from 'node:crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { DB } from './db.js';
import { HttpError } from './http.js';

const KEY_LEN = 64;
const SCRYPT_OPTS: ScryptOptions = { N: 16384, r: 8, p: 1 };
export const SESSION_COOKIE = 'evenly_sid';
const SESSION_DAYS = 30;

function scryptAsync(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Format: scrypt$<salt hex>$<key hex> */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function createSession(db: DB, userId: number): string {
  const token = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, expires);
  return token;
}

export function destroySession(db: DB, token: string): void {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
}

export function sessionUserId(db: DB, token: string | undefined): number | null {
  if (!token) return null;
  const row = db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(hashToken(token)) as { user_id: number; expires_at: string } | undefined;
  if (!row) return null;
  if (row.expires_at < new Date().toISOString()) {
    destroySession(db, token);
    return null;
  }
  return row.user_id;
}

export function setSessionCookie(res: Response, token: string, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    maxAge: SESSION_DAYS * 86_400_000,
    path: '/',
  });
}

declare module 'express-serve-static-core' {
  interface Request {
    userId?: number;
  }
}

export function currentUser(req: Request): number {
  if (req.userId === undefined) throw new HttpError(401, 'Please log in.');
  return req.userId;
}

export function loadSession(db: DB): RequestHandler {
  return (req, _res, next) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const userId = sessionUserId(db, token);
    if (userId !== null) req.userId = userId;
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  if (req.userId === undefined) {
    next(new HttpError(401, 'Please log in.'));
    return;
  }
  next();
};

/**
 * CSRF defence: the session cookie is SameSite=Lax, and every state-changing request must carry
 * a custom header, which a cross-site form post cannot set.
 */
export const requireCsrfHeader: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (req.get('x-requested-with') !== 'evenly') {
    next(new HttpError(403, 'Missing X-Requested-With header.'));
    return;
  }
  next();
};

/** Small fixed-window limiter for auth endpoints, keyed by client IP. */
export function rateLimit(maxPerWindow: number, windowMs: number): RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    const key = req.ip ?? 'unknown';
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }
    if (entry.count >= maxPerWindow) {
      res.setHeader('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
      next(new HttpError(429, 'Too many attempts. Wait a minute and try again.'));
      return;
    }
    hits.set(key, { ...entry, count: entry.count + 1 });
    next();
  };
}
