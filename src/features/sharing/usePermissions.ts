import { useMembers } from '../../lib/api';
import type { Member, Role } from '../../lib/types';
import { useAuth } from '../auth/AuthProvider';

const RANK: Record<Role, number> = { viewer: 0, editor: 1, owner: 2 };

/** Rollen und Mitglieder aus Sicht der angemeldeten Person. */
export function usePermissions() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const { data: members = [] } = useMembers();

  const membersOf = (listId: string): Member[] => members.filter((m) => m.list_id === listId);
  const roleOf = (listId: string): Role | undefined =>
    members.find((m) => m.list_id === listId && m.user_id === userId)?.role;
  const atLeast = (listId: string, min: Role) => {
    const role = roleOf(listId);
    return role !== undefined && RANK[role] >= RANK[min];
  };

  return {
    userId,
    members,
    membersOf,
    roleOf,
    canEdit: (listId: string) => atLeast(listId, 'editor'),
    isOwner: (listId: string) => atLeast(listId, 'owner'),
    isShared: (listId: string) => membersOf(listId).length > 1,
    nameOf: (listId: string, uid: string | null) =>
      uid
        ? (membersOf(listId).find((m) => m.user_id === uid)?.profiles?.name ?? 'Unbekannt')
        : null,
  };
}
