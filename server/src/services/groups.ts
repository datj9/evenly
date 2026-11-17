import type { DB } from '../db.js';
import { badRequest } from '../http.js';
import { recordActivity } from '../store/activity.js';
import { befriend, findOrInviteUser, getUser, type PublicUser } from '../store/users.js';
import { getGroup, getGroupForMember, groupExpenses, groupSettlements, toLedger, type Group } from '../store/ledger.js';
import { netBalances, userNet } from '../../../shared/src/balances.js';

export function addFriend(db: DB, actorId: number, name: string, email: string): PublicUser {
  const friend = findOrInviteUser(db, name, email);
  if (friend.id === actorId) throw badRequest('You cannot add yourself as a friend.');
  db.transaction(() => {
    if (befriend(db, actorId, friend.id)) {
      recordActivity(db, 'friend_added', actorId, null, { friendId: friend.id, friendName: friend.name }, [friend.id]);
    }
  })();
  return friend;
}

function insertMember(db: DB, group: Group, actorId: number, user: PublicUser): void {
  db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(group.id, user.id);
  for (const other of group.memberIds) befriend(db, other, user.id);
  recordActivity(
    db,
    'member_added',
    actorId,
    group.id,
    { userId: user.id, userName: user.name, groupName: group.name },
    [...group.memberIds, user.id],
  );
}

export function createGroup(db: DB, actorId: number, name: string, members: ReadonlyArray<{ name: string; email: string }>): Group {
  return db.transaction(() => {
    const info = db.prepare('INSERT INTO groups (name, created_by) VALUES (?, ?)').run(name, actorId);
    const id = Number(info.lastInsertRowid);
    db.prepare('INSERT INTO group_members (group_id, user_id) VALUES (?, ?)').run(id, actorId);
    recordActivity(db, 'group_created', actorId, id, { groupName: name }, [actorId]);
    for (const m of members) {
      const user = findOrInviteUser(db, m.name, m.email);
      const group = getGroup(db, id);
      if (!group.memberIds.includes(user.id)) insertMember(db, group, actorId, user);
    }
    return getGroup(db, id);
  })();
}

export function addMember(db: DB, actorId: number, groupId: number, who: { userId: number } | { name: string; email: string }): Group {
  const group = getGroupForMember(db, groupId, actorId);
  const user = 'userId' in who ? getUser(db, who.userId) : findOrInviteUser(db, who.name, who.email);
  if (group.memberIds.includes(user.id)) throw badRequest(`${user.name} is already in this group.`);
  db.transaction(() => insertMember(db, group, actorId, user))();
  return getGroup(db, groupId);
}

export function removeMember(db: DB, actorId: number, groupId: number, userId: number): Group {
  const group = getGroupForMember(db, groupId, actorId);
  if (!group.memberIds.includes(userId)) throw badRequest('That person is not in this group.');
  if (group.memberIds.length === 1) throw badRequest('A group needs at least one member.');
  const nets = netBalances(toLedger(groupExpenses(db, groupId), groupSettlements(db, groupId)));
  if (Object.keys(userNet(nets, userId)).length > 0) {
    throw badRequest('This person still has an unsettled balance in the group. Settle up first.');
  }
  const user = getUser(db, userId);
  db.transaction(() => {
    db.prepare('DELETE FROM group_members WHERE group_id = ? AND user_id = ?').run(groupId, userId);
    recordActivity(db, 'member_removed', actorId, groupId, { userId, userName: user.name, groupName: group.name }, group.memberIds);
  })();
  return getGroup(db, groupId);
}

export function updateGroup(db: DB, actorId: number, groupId: number, patch: { name?: string; simplifyDebts?: boolean }): Group {
  getGroupForMember(db, groupId, actorId);
  if (patch.name !== undefined) db.prepare('UPDATE groups SET name = ? WHERE id = ?').run(patch.name, groupId);
  if (patch.simplifyDebts !== undefined) {
    db.prepare('UPDATE groups SET simplify_debts = ? WHERE id = ?').run(patch.simplifyDebts ? 1 : 0, groupId);
  }
  return getGroup(db, groupId);
}
