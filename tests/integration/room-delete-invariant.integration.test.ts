import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: "" }));
const redirectState = vi.hoisted(() => ({ paths: [] as string[] }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.userId })),
  requirePageUser: vi.fn(async () => ({ id: authState.userId })),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    redirectState.paths.push(path);
  }),
}));

import { DELETE as deleteRoom } from "@/app/api/rooms/[roomId]/route";
import ChatIndexPage from "@/app/chat/page";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const ROOM_DELETE_DELAY_TRIGGER = "delay_concurrent_room_delete";
const ROOM_DELETE_DELAY_FUNCTION = "delay_concurrent_room_delete";

beforeEach(async () => {
  redirectState.paths = [];
  await resetTestDatabase();
});

afterEach(async () => {
  await dropRoomDeleteDelay();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dropRoomDeleteDelay() {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${ROOM_DELETE_DELAY_TRIGGER} ON "Room"`,
  );
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${ROOM_DELETE_DELAY_FUNCTION}()`);
}

function submitDelete(roomId: string, clientIp: string) {
  return deleteRoom(
    new Request(`http://localhost/api/rooms/${roomId}`, {
      method: "DELETE",
      headers: { "x-forwarded-for": clientIp },
    }),
    { params: Promise.resolve({ roomId }) },
  );
}

describe("last-room deletion invariant", () => {
  it("serializes concurrent deletes so /chat retains a default room", async () => {
    const user = await createTestUser();
    authState.userId = user.id;
    const firstRoom = await createTestRoom({ id: "room-delete-first" });
    const secondRoom = await createTestRoom({ id: "room-delete-second" });
    await prisma.roomParticipant.createMany({
      data: [
        { roomId: firstRoom.id, userId: user.id, role: "owner" },
        { roomId: secondRoom.id, userId: user.id, role: "owner" },
      ],
    });

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION ${ROOM_DELETE_DELAY_FUNCTION}() RETURNS trigger AS $$
      BEGIN
        PERFORM pg_sleep(0.5);
        RETURN OLD;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER ${ROOM_DELETE_DELAY_TRIGGER}
      BEFORE DELETE ON "Room"
      FOR EACH ROW EXECUTE FUNCTION ${ROOM_DELETE_DELAY_FUNCTION}()
    `);

    const responses = await Promise.all([
      submitDelete(firstRoom.id, "198.51.100.71"),
      submitDelete(secondRoom.id, "198.51.100.72"),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    const conflict = responses.find((response) => response.status === 409);
    await expect(conflict?.json()).resolves.toEqual({
      error: "Cannot delete the last remaining room. Create another first.",
    });
    await expect(
      prisma.roomParticipant.count({ where: { userId: user.id } }),
    ).resolves.toBe(1);

    const [remainingMembership] = await prisma.roomParticipant.findMany({
      where: { userId: user.id },
      select: { roomId: true },
    });
    expect(remainingMembership).toBeDefined();

    await ChatIndexPage({});
    expect(redirectState.paths).toEqual([`/chat/${remainingMembership.roomId}`]);
  });
});
