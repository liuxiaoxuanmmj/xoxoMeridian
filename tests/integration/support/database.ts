import { Prisma, type Room, type User } from "@prisma/client";

import { prisma } from "@/lib/prisma";

let sequence = 0;

export async function resetTestDatabase() {
  const tableNames = Prisma.dmmf.datamodel.models.map((model) => model.dbName ?? model.name);
  const quotedTables = tableNames.map((name) => `"${name.replaceAll('"', '""')}"`).join(", ");

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedTables} RESTART IDENTITY CASCADE`);
  sequence = 0;
}

export async function createTestUser(overrides: Partial<User> = {}) {
  sequence += 1;
  return prisma.user.create({
    data: {
      id: overrides.id,
      email: overrides.email ?? `user-${sequence}@example.com`,
      displayName: overrides.displayName ?? `User ${sequence}`,
      avatarLabel: overrides.avatarLabel ?? String(sequence),
      passwordHash: overrides.passwordHash ?? "integration-test-password-hash",
      sessionVersion: overrides.sessionVersion,
    },
  });
}

export async function createTestRoom(overrides: Partial<Room> = {}) {
  sequence += 1;
  return prisma.room.create({
    data: {
      id: overrides.id,
      slug: overrides.slug ?? `room-${sequence}`,
      name: overrides.name ?? `Room ${sequence}`,
      description: overrides.description,
      maxHumanUsers: overrides.maxHumanUsers,
    },
  });
}
