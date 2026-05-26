import type { PrismaClient } from "@prisma/client";

const SIMILARITY_THRESHOLD = 0.5;

export async function deduplicatedMemoryWrite(
  prisma: PrismaClient,
  roomId: string,
  key: string,
  value: string,
  source: string,
  userId?: string | null
): Promise<{ memoryId: string; merged?: string }> {
  const scope = key.split(".")[0];

  const existing = await prisma.memory.findMany({
    where: { roomId, key: { startsWith: `${scope}.` }, NOT: { key } }
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
    where: { roomId_key: { roomId, key } },
    update: {
      value,
      source,
      userId: userId ?? undefined,
      metadata: mergedKey ? { mergedFrom: mergedKey } : undefined
    },
    create: {
      roomId,
      key,
      value,
      source,
      userId,
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
