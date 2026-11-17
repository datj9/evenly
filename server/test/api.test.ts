import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { Express } from 'express';
import { openDatabase, type DB } from '../src/db.js';
import { createApp } from '../src/app.js';
import { DEMO_PASSWORD, seed } from '../src/seed.js';

type Agent = ReturnType<typeof request.agent>;

let db: DB;
let app: Express;

async function login(email: string, password = DEMO_PASSWORD): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post('/api/auth/login').set('X-Requested-With', 'evenly').send({ email, password }).expect(200);
  return agent;
}

const H = { 'X-Requested-With': 'evenly' };

beforeEach(async () => {
  db = openDatabase(':memory:');
  await seed(db);
  app = createApp(db);
});

describe('auth', () => {
  it('logs in with the demo account, reads /me and logs out', async () => {
    const agent = await login('alex@example.com');
    const me = await agent.get('/api/auth/me').expect(200);
    expect(me.body.user).toMatchObject({ name: 'Alex Rivera', email: 'alex@example.com' });
    expect(me.body.user.passwordHash).toBeUndefined();
    await agent.post('/api/auth/logout').set(H).expect(204);
    expect((await agent.get('/api/auth/me').expect(200)).body.user).toBeNull();
    await agent.get('/api/dashboard').expect(401);
  });

  it('rejects a wrong password with a generic message', async () => {
    const res = await request(app).post('/api/auth/login').set(H).send({ email: 'alex@example.com', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/do not match/);
  });

  it('stores scrypt hashes, never plain passwords', () => {
    const row = db.prepare('SELECT password_hash FROM users WHERE email = ?').get('alex@example.com') as { password_hash: string };
    expect(row.password_hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
  });

  it('registers a new account and blocks duplicates', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/register').set(H).send({ name: 'Riley', email: 'riley@example.com', password: 'longenough' }).expect(201);
    await agent.get('/api/auth/me').expect(200);
    await request(app).post('/api/auth/register').set(H).send({ name: 'X', email: 'RILEY@example.com', password: 'longenough' }).expect(409);
  });

  it('requires the CSRF header on mutations and a session on data routes', async () => {
    await request(app).post('/api/auth/login').send({ email: 'alex@example.com', password: DEMO_PASSWORD }).expect(403);
    await request(app).get('/api/dashboard').expect(401);
  });
});

describe('seeded balances', () => {
  it('shows exact per-currency totals on the dashboard', async () => {
    const agent = await login('alex@example.com');
    const { body } = await agent.get('/api/dashboard').expect(200);
    // Lisbon (EUR): Alex paid 645 + 237, owes shares; Sam paid him back 100.
    // Alex net EUR = (64500 + 23700) - (21500 + 1500 + 6820 + 9480 + 334 + 3117) - 10000 settlement received
    expect(body.net.EUR).toBe(88200 - 42751 - 10000);
    // USD: apartment + non-group, minus Sam's 500 payment
    const usdPaid = 280000 + 21677 + 3456 + 2400;
    const usdShares = 154000 + 7194 + 13006 + 44950 + 1728 + 9000 + 1200;
    expect(body.net.USD).toBe(usdPaid - usdShares - 50000);
    // net equals owed minus owe, per currency
    for (const cur of ['USD', 'EUR']) {
      expect(body.net[cur]).toBe((body.owed[cur] ?? 0) - (body.owe[cur] ?? 0));
    }
    expect(body.groups).toHaveLength(2);
    expect(body.activity.length).toBeGreaterThan(0);
  });

  it('balances in every group sum to zero and suggestions settle them', async () => {
    const agent = await login('sam@example.com');
    const groups = (await agent.get('/api/groups').expect(200)).body.groups as Array<{ id: number }>;
    for (const g of groups) {
      const detail = (await agent.get(`/api/groups/${g.id}`).expect(200)).body;
      const totals: Record<string, number> = {};
      for (const b of detail.balances) for (const [c, v] of Object.entries(b.balance as Record<string, number>)) totals[c] = (totals[c] ?? 0) + v;
      for (const v of Object.values(totals)) expect(v).toBe(0);
      expect(detail.suggestions.length).toBeGreaterThan(0);
    }
  });
});

describe('expenses', () => {
  async function lisbon(agent: Agent): Promise<{ id: number; memberIds: number[] }> {
    const groups = (await agent.get('/api/groups')).body.groups as Array<{ id: number; name: string; memberIds: number[] }>;
    return groups.find((g) => g.name === 'Lisbon trip')!;
  }

  it('creates, edits and deletes an expense and logs each step', async () => {
    const agent = await login('alex@example.com');
    const group = await lisbon(agent);
    const [a, s, j] = group.memberIds;
    const base = {
      groupId: group.id,
      description: 'Taxi to airport',
      amountCents: 3001,
      currency: 'EUR',
      category: 'transport',
      date: '2026-10-14',
      paidBy: a,
      splitMode: 'equal',
      splits: [{ userId: a, value: 1 }, { userId: s, value: 1 }, { userId: j, value: 1 }],
    };
    const created = (await agent.post('/api/expenses').set(H).send(base).expect(201)).body.expense;
    expect(created.shares.map((x: { owedCents: number }) => x.owedCents)).toEqual([1001, 1000, 1000]);

    const edited = (
      await agent
        .put(`/api/expenses/${created.id}`)
        .set(H)
        .send({ ...base, splitMode: 'percent', splits: [{ userId: a, value: 5000 }, { userId: s, value: 5000 }] })
        .expect(200)
    ).body.expense;
    expect(edited.shares).toEqual([
      { userId: a, owedCents: 1501, inputValue: 5000 },
      { userId: s, owedCents: 1500, inputValue: 5000 },
    ]);

    await agent.delete(`/api/expenses/${created.id}`).set(H).expect(204);
    await agent.get(`/api/expenses/${created.id}`).expect(404);

    const types = (await agent.get('/api/activity?limit=3')).body.activity.map((x: { type: string }) => x.type);
    expect(types).toEqual(['expense_deleted', 'expense_updated', 'expense_added']);
  });

  it('rejects splits that do not add up', async () => {
    const agent = await login('alex@example.com');
    const group = await lisbon(agent);
    const [a, s] = group.memberIds;
    const res = await agent.post('/api/expenses').set(H).send({
      groupId: group.id,
      description: 'Bad',
      amountCents: 1000,
      currency: 'EUR',
      category: 'food',
      date: '2026-10-14',
      paidBy: a,
      splitMode: 'exact',
      splits: [{ userId: a, value: 500 }, { userId: s, value: 499 }],
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/add up/);
  });

  it('rejects invalid input with zod messages', async () => {
    const agent = await login('alex@example.com');
    const res = await agent.post('/api/expenses').set(H).send({ description: '', amountCents: 10.5 });
    expect(res.status).toBe(400);
    expect(typeof res.body.error).toBe('string');
  });

  it('rejects participants outside the group and hides groups from non-members', async () => {
    const jordan = await login('jordan@example.com');
    const groups = (await jordan.get('/api/groups')).body.groups as Array<{ name: string }>;
    expect(groups.map((g) => g.name)).toEqual(['Lisbon trip']);
    const alex = await login('alex@example.com');
    const apt = ((await alex.get('/api/groups')).body.groups as Array<{ id: number; name: string; memberIds: number[] }>).find(
      (g) => g.name === 'Apartment 4B',
    )!;
    await jordan.get(`/api/groups/${apt.id}`).expect(404);
    const jordanId = (await jordan.get('/api/auth/me')).body.user.id;
    const res = await alex.post('/api/expenses').set(H).send({
      groupId: apt.id,
      description: 'Sneaky',
      amountCents: 100,
      currency: 'USD',
      category: 'general',
      date: '2026-11-11',
      paidBy: apt.memberIds[0],
      splitMode: 'equal',
      splits: [{ userId: jordanId, value: 1 }],
    });
    expect(res.status).toBe(400);
  });
});

describe('settle up and groups', () => {
  it('records a payment that zeroes a friend balance', async () => {
    const alex = await login('alex@example.com');
    const friends = (await alex.get('/api/friends').expect(200)).body.friends as Array<{ id: number; name: string; balance: Record<string, number> }>;
    const jordan = friends.find((f) => f.name === 'Jordan Patel')!;
    const me = (await alex.get('/api/auth/me')).body.user.id as number;
    for (const [currency, cents] of Object.entries(jordan.balance)) {
      const [from, to] = cents > 0 ? [jordan.id, me] : [me, jordan.id];
      await alex
        .post('/api/settlements')
        .set(H)
        .send({ groupId: null, fromUserId: from, toUserId: to, amountCents: Math.abs(cents), currency, date: '2026-11-15' })
        .expect(201);
    }
    const after = (await alex.get(`/api/friends/${jordan.id}`).expect(200)).body;
    expect(after.balance).toEqual({});
  });

  it('creates a group, adds and removes a member, and blocks removal with a balance', async () => {
    const alex = await login('alex@example.com');
    const group = (await alex.post('/api/groups').set(H).send({ name: 'Ski weekend', members: [] }).expect(201)).body.group;
    const withNew = (
      await alex.post(`/api/groups/${group.id}/members`).set(H).send({ name: 'Casey', email: 'casey@example.com' }).expect(201)
    ).body.group;
    const casey = withNew.memberIds.find((id: number) => id !== group.memberIds[0]);
    const me = group.memberIds[0];

    await alex.post('/api/expenses').set(H).send({
      groupId: group.id,
      description: 'Lift passes',
      amountCents: 20000,
      currency: 'USD',
      category: 'entertainment',
      date: '2026-11-16',
      paidBy: me,
      splitMode: 'equal',
      splits: [{ userId: me, value: 1 }, { userId: casey, value: 1 }],
    }).expect(201);

    const blocked = await alex.delete(`/api/groups/${group.id}/members/${casey}`).set(H);
    expect(blocked.status).toBe(400);

    await alex
      .post('/api/settlements')
      .set(H)
      .send({ groupId: group.id, fromUserId: casey, toUserId: me, amountCents: 10000, currency: 'USD', date: '2026-11-16' })
      .expect(201);
    const removed = (await alex.delete(`/api/groups/${group.id}/members/${casey}`).set(H).expect(200)).body.group;
    expect(removed.memberIds).toEqual([me]);

    const types = (await alex.get(`/api/activity?groupId=${group.id}`)).body.activity.map((x: { type: string }) => x.type);
    expect(types).toEqual(['member_removed', 'settlement_added', 'expense_added', 'member_added', 'group_created']);
  });

  it('toggles simplify debts', async () => {
    const alex = await login('alex@example.com');
    const groups = (await alex.get('/api/groups')).body.groups as Array<{ id: number; name: string }>;
    const lisbon = groups.find((g) => g.name === 'Lisbon trip')!;
    const on = (await alex.get(`/api/groups/${lisbon.id}`)).body.suggestions;
    await alex.patch(`/api/groups/${lisbon.id}`).set(H).send({ simplifyDebts: false }).expect(200);
    const off = (await alex.get(`/api/groups/${lisbon.id}`)).body.suggestions;
    expect(on.length).toBeLessThanOrEqual(off.length);
  });

  it('adds a friend by email', async () => {
    const alex = await login('alex@example.com');
    const res = await alex.post('/api/friends').set(H).send({ name: 'Morgan', email: 'morgan@example.com' }).expect(201);
    expect(res.body.friend).toMatchObject({ name: 'Morgan', registered: false });
    const list = (await alex.get('/api/friends')).body.friends as Array<{ name: string }>;
    expect(list.map((f) => f.name)).toContain('Morgan');
    await alex.post('/api/friends').set(H).send({ name: 'Me', email: 'alex@example.com' }).expect(400);
  });
});
