export function resolveParticipantPair<T>(
  participants: readonly T[],
  currentUserId: string | null | undefined,
  getUserId: (participant: T) => string
): { self: T | null; partner: T | null } {
  if (!currentUserId) {
    return { self: null, partner: null };
  }

  const self = participants.find(
    (participant) => getUserId(participant) === currentUserId
  ) ?? null;
  if (!self) {
    return { self: null, partner: null };
  }

  const partner = participants.find(
    (participant) => getUserId(participant) !== currentUserId
  ) ?? null;
  return { self, partner };
}
