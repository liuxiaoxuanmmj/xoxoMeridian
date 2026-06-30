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

    if (!state || state.status !== "paused") {
      const response = jsonError("No paused timer to resume.", 409);
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const now = new Date();
    const remainingMs = (state.remainingSeconds ?? 0) * 1000;
    const expectedEndAt = new Date(now.getTime() + remainingMs);

    const updated = await prisma.focusState.update({
      where: { userId: user.id },
      data: {
        status: "running",
        expectedEndAt,
        pausedAt: null,
        remainingSeconds: null,
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
