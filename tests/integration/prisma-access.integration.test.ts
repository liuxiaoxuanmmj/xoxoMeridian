import { Prisma } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { assertRoomAccess } from "@/lib/access";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Prisma room persistence", () => {
  it("enforces unique room membership in PostgreSQL", async () => {
    const user = await createTestUser();
    const room = await createTestRoom();
    const membership = { roomId: room.id, userId: user.id };

    await prisma.roomParticipant.create({ data: membership });

    await expect(prisma.roomParticipant.create({ data: membership })).rejects.toMatchObject({
      code: "P2002",
    } satisfies Partial<Prisma.PrismaClientKnownRequestError>);
  });

  it("uses persisted membership for access control", async () => {
    const member = await createTestUser();
    const outsider = await createTestUser();
    const room = await createTestRoom();
    await prisma.roomParticipant.create({
      data: { roomId: room.id, userId: member.id },
    });

    await expect(assertRoomAccess(room.id, member.id)).resolves.toMatchObject({
      roomId: room.id,
      userId: member.id,
    });

    try {
      await assertRoomAccess(room.id, outsider.id);
      throw new Error("Expected assertRoomAccess to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      expect((error as Response).status).toBe(403);
    }
  });

  it("cascades room deletion to participants and messages", async () => {
    const user = await createTestUser();
    const room = await createTestRoom();
    await prisma.roomParticipant.create({
      data: { roomId: room.id, userId: user.id },
    });
    await prisma.message.create({
      data: {
        roomId: room.id,
        senderId: user.id,
        senderType: "human",
        content: "integration test message",
      },
    });

    await prisma.room.delete({ where: { id: room.id } });

    await expect(prisma.roomParticipant.count({ where: { roomId: room.id } })).resolves.toBe(0);
    await expect(prisma.message.count({ where: { roomId: room.id } })).resolves.toBe(0);
  });
});
