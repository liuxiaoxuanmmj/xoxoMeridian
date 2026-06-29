import { revalidatePath } from "next/cache";

import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request) {
  try {
    const user = await requireCurrentUser();
    const state = await prisma.focusState.findUnique({
      where: { userId: user.id },
    });

    if (!state || state.status !== "focusing" || !state.startedAt) {
      const response = jsonError("No active focus session.", 409);
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const endedAt = new Date();
    const actualMinutes = Math.max(
      1,
      Math.round((endedAt.getTime() - state.startedAt.getTime()) / 60_000)
    );

    const session = await prisma.focusSession.create({
      data: {
        userId: user.id,
        status: "completed",
        plannedMinutes: state.plannedMinutes,
        actualMinutes,
        startedAt: state.startedAt,
        endedAt,
      },
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        actualMinutes: true,
      },
    });

    await prisma.focusState.update({
      where: { userId: user.id },
      data: {
        status: "idle",
        startedAt: null,
        expectedEndAt: null,
      },
    });

    revalidatePath("/home");

    const response = jsonOk({
      session: {
        ...session,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
      },
      state: { status: "idle" },
    });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
