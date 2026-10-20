import type { Collection } from '@trek/shared';

/**
 * Whether the user may add to a list: their own, or a shared one where they
 * are an accepted editor or admin. The rule the server applies on the way in,
 * so a dialog never offers a list the write would refuse.
 */
export function canAddToCollection(
  collection: Pick<Collection, 'is_owner' | 'members'>,
  userId: number | null | undefined
): boolean {
  if (collection.is_owner !== false) return true;
  return (collection.members ?? []).some(
    (member) =>
      member.user_id === userId &&
      member.status === 'accepted' &&
      (member.role === 'editor' || member.role === 'admin')
  );
}
