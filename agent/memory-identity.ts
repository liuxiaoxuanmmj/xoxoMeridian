import { resolveParticipantPair } from "@/lib/participant-resolution";

export const SHARED_MEMORY_OWNER_KEY = "scope:shared";
export const SYSTEM_MEMORY_OWNER_KEY = "scope:system";

const PERSONAL_STORAGE_PREFIX = "person.";

type MemoryParticipant = {
  userId: string;
};

export type MemoryIdentity = {
  ownerKey: string;
  userId: string | null;
  storageKey: string;
  relativeScope: "shared" | "me" | "her";
};

export type StoredMemoryView = {
  ownerKey: string;
  userId: string | null;
  key: string;
  value: string;
};

export class MemoryIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MemoryIdentityError";
  }
}

export function memoryUserOwnerKey(userId: string): string {
  return `user:${userId}`;
}

export function sharedMemoryIdentity(key: string): MemoryIdentity {
  if (!key.startsWith("shared.") || key.length <= "shared.".length) {
    throw new MemoryIdentityError("Shared Memory key must include a topic.");
  }
  return {
    ownerKey: SHARED_MEMORY_OWNER_KEY,
    userId: null,
    storageKey: key,
    relativeScope: "shared"
  };
}

export function resolveMemoryIdentity(
  relativeKey: string,
  requestedById: string | null,
  participants: readonly MemoryParticipant[]
): MemoryIdentity {
  const separator = relativeKey.indexOf(".");
  const scope = separator === -1 ? relativeKey : relativeKey.slice(0, separator);
  const suffix = separator === -1 ? "" : relativeKey.slice(separator + 1);
  if (!suffix) {
    throw new MemoryIdentityError("Memory key must include a topic after its scope.");
  }

  if (scope === "shared") {
    return sharedMemoryIdentity(relativeKey);
  }

  if (scope !== "me" && scope !== "her") {
    throw new MemoryIdentityError("Memory key must start with 'shared.', 'me.', or 'her.'.");
  }

  const { self, partner } = resolveParticipantPair(
    participants,
    requestedById,
    (participant) => participant.userId
  );
  const owner = scope === "me" ? self : partner;
  if (!owner) {
    throw new MemoryIdentityError(
      scope === "me"
        ? "A room requester is required for 'me.' Memory."
        : "A room requester and partner are required for 'her.' Memory."
    );
  }

  return {
    ownerKey: memoryUserOwnerKey(owner.userId),
    userId: owner.userId,
    storageKey: `${PERSONAL_STORAGE_PREFIX}${suffix}`,
    relativeScope: scope
  };
}

export function visibleMemoryOwnerKeys(
  requestedById: string | null,
  participants: readonly MemoryParticipant[]
): string[] {
  const { self, partner } = resolveParticipantPair(
    participants,
    requestedById,
    (participant) => participant.userId
  );

  return [
    SHARED_MEMORY_OWNER_KEY,
    ...(self ? [memoryUserOwnerKey(self.userId)] : []),
    ...(partner ? [memoryUserOwnerKey(partner.userId)] : [])
  ];
}

export function projectMemoryForRequester(
  memory: StoredMemoryView,
  requestedById: string | null,
  participants: readonly MemoryParticipant[]
): { key: string; value: string } | null {
  if (memory.ownerKey === SHARED_MEMORY_OWNER_KEY) {
    return memory.key.startsWith("shared.")
      ? { key: memory.key, value: memory.value }
      : null;
  }

  if (!memory.key.startsWith(PERSONAL_STORAGE_PREFIX) || !memory.userId) {
    return null;
  }

  const { self, partner } = resolveParticipantPair(
    participants,
    requestedById,
    (participant) => participant.userId
  );
  const suffix = memory.key.slice(PERSONAL_STORAGE_PREFIX.length);
  if (!suffix) return null;

  if (self?.userId === memory.userId) {
    return { key: `me.${suffix}`, value: memory.value };
  }
  if (partner?.userId === memory.userId) {
    return { key: `her.${suffix}`, value: memory.value };
  }
  return null;
}

export function resolveMemoryRecallFilter(
  prefix: string | undefined,
  requestedById: string | null,
  participants: readonly MemoryParticipant[]
): { ownerKeys: string[]; storagePrefix?: string } {
  if (!prefix) {
    return {
      ownerKeys: visibleMemoryOwnerKeys(requestedById, participants)
    };
  }

  const separator = prefix.indexOf(".");
  const scope = separator === -1 ? prefix : prefix.slice(0, separator);
  const suffix = separator === -1 ? "" : prefix.slice(separator + 1);
  if (scope === "shared") {
    return {
      ownerKeys: [SHARED_MEMORY_OWNER_KEY],
      storagePrefix: `shared.${suffix}`
    };
  }

  if (scope !== "me" && scope !== "her") {
    return { ownerKeys: [] };
  }

  const { self, partner } = resolveParticipantPair(
    participants,
    requestedById,
    (participant) => participant.userId
  );
  const owner = scope === "me" ? self : partner;
  return owner
    ? {
        ownerKeys: [memoryUserOwnerKey(owner.userId)],
        storagePrefix: `${PERSONAL_STORAGE_PREFIX}${suffix}`
      }
    : { ownerKeys: [] };
}

export function projectMergedMemoryKey(
  storageKey: string,
  scope: MemoryIdentity["relativeScope"]
): string {
  if (scope === "shared") return storageKey;
  return storageKey.startsWith(PERSONAL_STORAGE_PREFIX)
    ? `${scope}.${storageKey.slice(PERSONAL_STORAGE_PREFIX.length)}`
    : storageKey;
}
