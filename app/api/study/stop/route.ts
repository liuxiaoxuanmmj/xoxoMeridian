import { revalidatePath } from "next/cache";

import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { serializeFocusState } from "@/lib/study";

export async function POST(_request: Request) {
  try {
    const user = await requireCurrentUser();
    const state = await prisma.focusState.findUnique({
      where: { userId: user.id },
    });

    if (!state || (state.status !== "running" && state.status !== "paused")) {
      const response = jsonError("No active focus session.", 409);
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const endedAt = new Date();
    let actualMinutes: number;

    if (state.status === "paused") {
      const elapsedSeconds = state.plannedMinutes * 60 - (state.remainingSeconds ?? 0);
      actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    } else {
      const elapsedSeconds = state.expectedEndAt
        ? state.plannedMinutes * 60 - Math.max(0, Math.ceil((state.expectedEndAt.getTime() - endedAt.getTime()) / 1000))
        : state.plannedMinutes * 60;
      actualMinutes = Math.max(1, Math.round(elapsedSeconds / 60));
    }

    const session = await prisma.focusSession.create({
      data: {
        userId: user.id,
        status: "completed",
        mode: state.mode ?? "focus",
        plannedMinutes: state.plannedMinutes,
        actualMinutes,
        startedAt: state.startedAt ?? endedAt,
        endedAt,
        roomId: state.roomId,
      },
      select: {
        id: true,
        mode: true,
        startedAt: true,
        endedAt: true,
        actualMinutes: true,
      },
    });

    await prisma.focusState.update({
      where: { userId: user.id },
      data: {
        status: "idle",
        mode: "focus",
        startedAt: null,
        expectedEndAt: null,
        pausedAt: null,
        remainingSeconds: null,
        lastStudySeenAt: new Date(),
      },
    });

    revalidatePath("/home");

    const response = jsonOk({
      session: {
        ...session,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
      },
      state: serializeFocusState({
        status: "idle",
        mode: "focus",
        plannedMinutes: state.plannedMinutes,
        remainingSeconds: null,
        startedAt: null,
        expectedEndAt: null,
        pausedAt: null,
      }),
    });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
