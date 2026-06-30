import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStudyRoomForUser, serializeFocusState } from "@/lib/study";
import { readJsonBody, studyStartSchema } from "@/lib/validation";

const DEFAULT_DURATIONS: Record<string, number> = {
  focus: 25,
  short: 5,
  long: 15,
};

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await readJsonBody(request, studyStartSchema);
    const mode = body.mode ?? "focus";
    const plannedMinutes = body.plannedMinutes ?? DEFAULT_DURATIONS[mode] ?? 25;

    const existing = await prisma.focusState.findUnique({
      where: { userId: user.id },
    });

    if (existing && (existing.status === "running" || existing.status === "paused")) {
      const response = jsonOk({ state: serializeFocusState(existing) });
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const room = await getStudyRoomForUser(user.id);

    const startedAt = new Date();
    const expectedEndAt = new Date(startedAt.getTime() + plannedMinutes * 60_000);

    const state = await prisma.focusState.upsert({
      where: { userId: user.id },
      update: {
        status: "running",
        mode,
        plannedMinutes,
        startedAt,
        expectedEndAt,
        remainingSeconds: null,
        pausedAt: null,
        lastStudySeenAt: new Date(),
        roomId: room.id,
      },
      create: {
        userId: user.id,
        status: "running",
        mode,
        plannedMinutes,
        startedAt,
        expectedEndAt,
        remainingSeconds: null,
        pausedAt: null,
        lastStudySeenAt: new Date(),
        roomId: room.id,
      },
    });

    const response = jsonOk({ state: serializeFocusState(state) });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
