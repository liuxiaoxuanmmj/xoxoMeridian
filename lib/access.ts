import type { RoomKind, User } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export function assertPrivateRoomMembers(room: {
  kind: RoomKind;
  privateOwnerId: string | null;
  participants: Array<{ userId: string }>;
}) {
  if (room.kind === "agent_private" && (
    !room.privateOwnerId || room.participants.length !== 1 ||
    room.participants[0].userId !== room.privateOwnerId
  )) {
    throw new Response("Forbidden", { status: 403 });
  }
}

export async function assertRoomAccess(roomId: string, userId: string) {
  const participant = await prisma.roomParticipant.findUnique({
    where: {
      roomId_userId: {
        roomId,
        userId
      }
    },
    include: {
      room: {
        select: {
          kind: true,
          privateOwnerId: true,
          participants: { select: { userId: true } },
        },
      },
    },
  });

  if (!participant) {
    throw new Response("Forbidden", { status: 403 });
  }

  assertPrivateRoomMembers(participant.room);
  if (participant.room.kind === "agent_private" && participant.room.privateOwnerId !== userId) {
    throw new Response("Forbidden", { status: 403 });
  }

  return participant;
}

export async function assertSharedRoomAccess(roomId: string, userId: string) {
  const participant = await assertRoomAccess(roomId, userId);
  if (participant.room.kind !== "shared") {
    throw new Response("Forbidden", { status: 403 });
  }
  return participant;
}

export async function getDefaultRoomForUser(user: Pick<User, "id">) {
  const participant = await prisma.roomParticipant.findFirst({
    where: { userId: user.id, room: { kind: "shared" } },
    include: { room: true },
    orderBy: { joinedAt: "asc" }
  });

  if (!participant) {
    throw new Error("The current user does not belong to a room.");
  }

  return participant.room;
}

export async function assertRoomCapacity(roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { participants: true }
  });

  if (!room) {
    throw new Response("Room not found", { status: 404 });
  }

  if (room.participants.length > room.maxHumanUsers) {
    throw new Response("Room human user limit exceeded", { status: 409 });
  }

  return room;
}
