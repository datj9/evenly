import { Router } from 'express';
import { z } from 'zod';
import type { DB } from './db.js';
import { HttpError, idParam, parse } from './http.js';
import {
  createSession,
  currentUser,
  destroySession,
  hashPassword,
  rateLimit,
  requireAuth,
  SESSION_COOKIE,
  setSessionCookie,
  verifyPassword,
} from './auth.js';
import {
  addFriendSchema,
  addMemberSchema,
  createGroupSchema,
  expenseSchema,
  loginSchema,
  registerSchema,
  settlementSchema,
  updateGroupSchema,
} from './schemas.js';
import { createUser, findUserByEmail, getUser } from './store/users.js';
import { assertCanTouch, getExpense } from './store/ledger.js';
import { addFriend, addMember, createGroup, removeMember, updateGroup } from './services/groups.js';
import { createExpense, createSettlement, deleteExpense, deleteSettlement, updateExpense } from './services/expenses.js';
import { activityFeed, dashboard, friendDetail, friendsList, groupDetail, listGroups } from './services/views.js';

export interface RouteOptions {
  secureCookies: boolean;
}

// A real hash so failed lookups take the same time as a wrong password.
const DUMMY_HASH = 'scrypt$00000000000000000000000000000000$' + '0'.repeat(128);

export function authRoutes(db: DB, opts: RouteOptions): Router {
  const r = Router();
  const limiter = rateLimit(20, 60_000);

  r.post('/register', limiter, async (req, res) => {
    const input = parse(registerSchema, req.body);
    const existing = findUserByEmail(db, input.email);
    if (existing?.registered) throw new HttpError(409, 'An account with this email already exists. Log in instead.');
    const hash = await hashPassword(input.password);
    const user = existing
      ? (db.prepare('UPDATE users SET name = ?, password_hash = ? WHERE id = ?').run(input.name, hash, existing.id), getUser(db, existing.id))
      : createUser(db, input.name, input.email, hash);
    setSessionCookie(res, createSession(db, user.id), opts.secureCookies);
    res.status(201).json({ user });
  });

  r.post('/login', limiter, async (req, res) => {
    const input = parse(loginSchema, req.body);
    const found = findUserByEmail(db, input.email);
    const ok = await verifyPassword(input.password, found?.passwordHash ?? DUMMY_HASH);
    if (!found || !found.passwordHash || !ok) throw new HttpError(401, 'That email and password do not match.');
    setSessionCookie(res, createSession(db, found.id), opts.secureCookies);
    const { passwordHash: _omit, ...user } = found;
    res.json({ user });
  });

  r.post('/logout', (req, res) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    if (token) destroySession(db, token);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
    res.status(204).end();
  });

  // 200 with user: null when signed out, so the client can check without a failed request
  r.get('/me', (req, res) => {
    res.json({ user: req.userId === undefined ? null : getUser(db, req.userId) });
  });

  return r;
}

const limitQuery = z.coerce.number().int().min(1).max(200).default(50);
const groupQuery = z.coerce.number().int().positive().optional();

export function apiRoutes(db: DB): Router {
  const r = Router();
  r.use(requireAuth);

  r.get('/dashboard', (req, res) => {
    res.json(dashboard(db, currentUser(req)));
  });

  r.get('/activity', (req, res) => {
    const limit = parse(limitQuery, req.query.limit);
    const groupId = parse(groupQuery, req.query.groupId);
    res.json(activityFeed(db, currentUser(req), limit, groupId));
  });

  /* friends */
  r.get('/friends', (req, res) => {
    res.json(friendsList(db, currentUser(req)));
  });
  r.post('/friends', (req, res) => {
    const input = parse(addFriendSchema, req.body);
    res.status(201).json({ friend: addFriend(db, currentUser(req), input.name, input.email) });
  });
  r.get('/friends/:id', (req, res) => {
    res.json(friendDetail(db, currentUser(req), idParam(req)));
  });

  /* groups */
  r.get('/groups', (req, res) => {
    res.json(listGroups(db, currentUser(req)));
  });
  r.post('/groups', (req, res) => {
    const input = parse(createGroupSchema, req.body);
    res.status(201).json({ group: createGroup(db, currentUser(req), input.name, input.members) });
  });
  r.get('/groups/:id', (req, res) => {
    res.json(groupDetail(db, currentUser(req), idParam(req)));
  });
  r.patch('/groups/:id', (req, res) => {
    const input = parse(updateGroupSchema, req.body);
    res.json({ group: updateGroup(db, currentUser(req), idParam(req), input) });
  });
  r.post('/groups/:id/members', (req, res) => {
    const input = parse(addMemberSchema, req.body);
    res.status(201).json({ group: addMember(db, currentUser(req), idParam(req), input) });
  });
  r.delete('/groups/:id/members/:userId', (req, res) => {
    res.json({ group: removeMember(db, currentUser(req), idParam(req), idParam(req, 'userId')) });
  });

  /* expenses */
  r.post('/expenses', (req, res) => {
    const input = parse(expenseSchema, req.body);
    res.status(201).json({ expense: createExpense(db, currentUser(req), input) });
  });
  r.get('/expenses/:id', (req, res) => {
    const expense = getExpense(db, idParam(req));
    assertCanTouch(db, currentUser(req), {
      groupId: expense.groupId,
      involved: [expense.paidBy, ...expense.shares.map((s) => s.userId)],
    });
    res.json({ expense });
  });
  r.put('/expenses/:id', (req, res) => {
    const input = parse(expenseSchema, req.body);
    res.json({ expense: updateExpense(db, currentUser(req), idParam(req), input) });
  });
  r.delete('/expenses/:id', (req, res) => {
    deleteExpense(db, currentUser(req), idParam(req));
    res.status(204).end();
  });

  /* settlements */
  r.post('/settlements', (req, res) => {
    const input = parse(settlementSchema, req.body);
    res.status(201).json({ settlement: createSettlement(db, currentUser(req), input) });
  });
  r.delete('/settlements/:id', (req, res) => {
    deleteSettlement(db, currentUser(req), idParam(req));
    res.status(204).end();
  });

  return r;
}
