import { randomBytes } from "node:crypto";

import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { readJsonBody, roomCreateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireCurrentUser();

    const participants = await prisma.roomParticipant.findMany({
      where: { userId: user.id },
      include: {
        room: {
          include: {
            _count: { select: { messages: true } },
          },
        },
      },
      orderBy: { joinedAt: "asc" },
    });

    const rooms = participants.map((p) => ({
      id: p.room.id,
      slug: p.room.slug,
      name: p.room.name,
      createdAt: p.room.createdAt,
      updatedAt: p.room.updatedAt,
      messageCount: p.room._count.messages,
    }));

    return jsonOk({ rooms }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const limited = enforceRateLimit(request, `room-create:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const { name } = await readJsonBody(request, roomCreateSchema);

    // Collect every user who has ever shared a room with the caller — that's
    // the "partner" set for this private-chat app. The new room becomes
    // visible to all of them automatically, so there's no separate invite /
    // join step. This matches the existing demo model (me + her share every
    // room) without hard-coding demoRole. Capped to maxHumanUsers.
    const sharedUserIds = await findSharedUserIds(user.id);

    const slug = `room-${randomBytes(6).toString("hex")}`;
    const finalName = name && name.length > 0 ? name : "新会话";

    const room = await prisma.room.create({
      data: {
        slug,
        name: finalName,
        participants: {
          create: [
            { userId: user.id, role: "owner" },
            ...sharedUserIds.map((uid) => ({ userId: uid, role: "member" })),
          ],
        },
      },
    });

    return jsonOk({ room }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}

async function findSharedUserIds(callerId: string): Promise<string[]> {
  const rooms = await prisma.roomParticipant.findMany({
    where: { userId: callerId },
    select: { roomId: true },
  });
  if (rooms.length === 0) return [];

  const peers = await prisma.roomParticipant.findMany({
    where: {
      roomId: { in: rooms.map((r) => r.roomId) },
      userId: { not: callerId },
    },
    select: { userId: true },
    distinct: ["userId"],
  });

  // Current schema defaults maxHumanUsers to 2, so at most 1 peer joins the
  // new room. If multi-partner rooms are introduced later, bump the slice.
  return peers.slice(0, 1).map((p) => p.userId);
}
