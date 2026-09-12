import type { Prisma } from "@prisma/client";

import type { MemoryIdentity } from "@/agent/memory-identity";

const SIMILARITY_THRESHOLD = 0.5;

export async function deduplicatedMemoryWrite(
  prisma: Prisma.TransactionClient,
  roomId: string,
  identity: MemoryIdentity,
  value: string,
  source: string
): Promise<{ memoryId: string; merged?: string }> {
  const storageScope = identity.storageKey.split(".")[0];

  const existing = await prisma.memory.findMany({
    where: {
      roomId,
      ownerKey: identity.ownerKey,
      key: { startsWith: `${storageScope}.` },
      NOT: { key: identity.storageKey }
    }
  });

  let mergedKey: string | undefined;

  for (const mem of existing) {
    if (valueSimilarity(mem.value, value) > SIMILARITY_THRESHOLD) {
      mergedKey = mem.key;
      await prisma.memory.delete({ where: { id: mem.id } });
      break;
    }
  }

  const memory = await prisma.memory.upsert({
    where: {
      roomId_ownerKey_key: {
        roomId,
        ownerKey: identity.ownerKey,
        key: identity.storageKey
      }
    },
    update: {
      value,
      source,
      userId: identity.userId,
      metadata: mergedKey ? { mergedFrom: mergedKey } : undefined
    },
    create: {
      roomId,
      ownerKey: identity.ownerKey,
      key: identity.storageKey,
      value,
      source,
      userId: identity.userId,
      metadata: mergedKey ? { mergedFrom: mergedKey } : undefined
    }
  });

  return { memoryId: memory.id, ...(mergedKey && { merged: mergedKey }) };
}

function toBigrams(text: string): string[] {
  const chars = [...text.replace(/\s+/g, "")];
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
}

export function valueSimilarity(a: string, b: string): number {
  const bigramsA = new Set(toBigrams(a));
  const bigramsB = new Set(toBigrams(b));
  if (bigramsA.size === 0 && bigramsB.size === 0) return 1;
  if (bigramsA.size === 0 || bigramsB.size === 0) return 0;
  const intersection = [...bigramsA].filter((bg) => bigramsB.has(bg)).length;
  return (2 * intersection) / (bigramsA.size + bigramsB.size);
}
