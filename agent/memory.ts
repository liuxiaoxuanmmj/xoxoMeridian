import { prisma } from "@/lib/prisma";

export async function remember(roomId: string, key: string, value: string, source = "agent-runtime") {
  return prisma.memory.upsert({
    where: {
      roomId_key: {
        roomId,
        key
      }
    },
    update: {
      value,
      source
    },
    create: {
      roomId,
      key,
      value,
      source
    }
  });
}

export async function getLongTermMemory(roomId: string) {
  return prisma.memory.findMany({
    where: { roomId },
    orderBy: { updatedAt: "desc" },
    take: 20
  });
}
