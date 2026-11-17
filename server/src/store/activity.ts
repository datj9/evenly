import type { DB } from '../db.js';

export const ACTIVITY_TYPES = [
  'expense_added',
  'expense_updated',
  'expense_deleted',
  'settlement_added',
  'settlement_deleted',
  'group_created',
  'member_added',
  'member_removed',
  'friend_added',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityItem {
  id: number;
  type: ActivityType;
  actorId: number;
  actorName: string;
  groupId: number | null;
  groupName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export function recordActivity(
  db: DB,
  type: ActivityType,
  actorId: number,
  groupId: number | null,
  data: Record<string, unknown>,
  visibleTo: readonly number[],
): number {
  const info = db
    .prepare('INSERT INTO activities (type, actor_id, group_id, data) VALUES (?, ?, ?, ?)')
    .run(type, actorId, groupId, JSON.stringify(data));
  const id = Number(info.lastInsertRowid);
  const stmt = db.prepare('INSERT OR IGNORE INTO activity_users (activity_id, user_id) VALUES (?, ?)');
  for (const userId of new Set([actorId, ...visibleTo])) stmt.run(id, userId);
  return id;
}

interface ActivityRow {
  id: number;
  type: ActivityType;
  actor_id: number;
  actor_name: string;
  group_id: number | null;
  group_name: string | null;
  data: string;
  created_at: string;
}

export function listActivity(db: DB, userId: number, limit: number, groupId?: number): ActivityItem[] {
  const rows = db
    .prepare(
      `SELECT a.*, u.name AS actor_name, g.name AS group_name
         FROM activities a
         JOIN activity_users au ON au.activity_id = a.id AND au.user_id = ?
         JOIN users u ON u.id = a.actor_id
         LEFT JOIN groups g ON g.id = a.group_id
        WHERE (? IS NULL OR a.group_id = ?)
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT ?`,
    )
    .all(userId, groupId ?? null, groupId ?? null, limit) as ActivityRow[];
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    actorId: r.actor_id,
    actorName: r.actor_name,
    groupId: r.group_id,
    groupName: r.group_name ?? ((JSON.parse(r.data) as { groupName?: string }).groupName ?? null),
    data: JSON.parse(r.data) as Record<string, unknown>,
    createdAt: r.created_at,
  }));
}
