import { prisma } from "@/lib/prisma";

export type RoomListItem = {
  id: string;
  slug: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
};

// Sidebar room list for a given user. Used by the GET /api/rooms route and
// piggy-backed onto the room SSE snapshot so the sidebar refreshes in lockstep
// with the active room view.
export async function listRoomsForUser(userId: string): Promise<RoomListItem[]> {
  const participants = await prisma.roomParticipant.findMany({
    where: { userId },
    include: {
      room: { include: { _count: { select: { messages: true } } } }
    },
    orderBy: { joinedAt: "asc" }
  });
  return participants.map((p) => ({
    id: p.room.id,
    slug: p.room.slug,
    name: p.room.name,
    createdAt: p.room.createdAt,
    updatedAt: p.room.updatedAt,
    messageCount: p.room._count.messages
  }));
}
