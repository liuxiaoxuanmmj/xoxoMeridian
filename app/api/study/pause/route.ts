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

    if (!state || state.status !== "running") {
      const response = jsonError("No running timer to pause.", 409);
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const now = new Date();
    const remainingSeconds = state.expectedEndAt
      ? Math.max(0, Math.ceil((state.expectedEndAt.getTime() - now.getTime()) / 1000))
      : 0;

    const updated = await prisma.focusState.update({
      where: { userId: user.id },
      data: {
        status: "paused",
        expectedEndAt: null,
        pausedAt: now,
        remainingSeconds,
      },
    });

    const response = jsonOk({ state: serializeFocusState(updated) });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
