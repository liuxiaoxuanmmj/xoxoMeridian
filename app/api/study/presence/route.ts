import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudyRoomForUser } from "@/lib/study";

export async function POST(_request: Request) {
  try {
    const user = await requireCurrentUser();
    const room = await getStudyRoomForUser(user.id);
    const now = new Date();

    const state = await prisma.focusState.upsert({
      where: { userId: user.id },
      update: { lastStudySeenAt: now, roomId: room.id },
      create: {
        userId: user.id,
        roomId: room.id,
        status: "idle",
        mode: "focus",
        plannedMinutes: 25,
        lastStudySeenAt: now,
      },
    });

    const response = jsonOk({ ok: true, seenAt: state.lastStudySeenAt?.toISOString() ?? now.toISOString() });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
