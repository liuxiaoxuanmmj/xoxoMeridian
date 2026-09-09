import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export type DeleteRoomResult =
  | { status: "deleted" }
  | { status: "last-room" };

async function lockRoomUser(tx: Prisma.TransactionClient, userId: string) {
  const users = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}
    FOR UPDATE
  `;

  if (users.length !== 1) {
    throw new Error("Cannot delete a room for a missing user.");
  }
}

export async function deleteRoomPreservingUserMembership(
  roomId: string,
  userId: string,
): Promise<DeleteRoomResult> {
  return prisma.$transaction(async (tx) => {
    // The User row is the stable lock shared by every room deletion for this
    // caller. Count and delete must both remain inside this critical section.
    await lockRoomUser(tx, userId);

    const membership = await tx.roomParticipant.findUnique({
      where: {
        roomId_userId: { roomId, userId },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new Response("Forbidden", { status: 403 });
    }

    const membershipCount = await tx.roomParticipant.count({
      where: { userId },
    });
    if (membershipCount <= 1) {
      return { status: "last-room" };
    }

    await tx.room.delete({ where: { id: roomId } });
    return { status: "deleted" };
  });
}
