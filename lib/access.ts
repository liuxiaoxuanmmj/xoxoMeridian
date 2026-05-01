import type { User } from "@prisma/client";

import { prisma } from "@/lib/prisma";

export async function assertRoomAccess(roomId: string, userId: string) {
  const participant = await prisma.roomParticipant.findUnique({
    where: {
      roomId_userId: {
        roomId,
        userId
      }
    }
  });

  if (!participant) {
    throw new Response("Forbidden", { status: 403 });
  }

  return participant;
}

export async function getDefaultRoomForUser(user: Pick<User, "id">) {
  const participant = await prisma.roomParticipant.findFirst({
    where: { userId: user.id },
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
