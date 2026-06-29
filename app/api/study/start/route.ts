import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody, studyStartSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await readJsonBody(request, studyStartSchema);
    const existing = await prisma.focusState.findUnique({
      where: { userId: user.id },
      select: {
        status: true,
        plannedMinutes: true,
        startedAt: true,
        expectedEndAt: true,
      },
    });

    if (existing?.status === "focusing") {
      const response = jsonOk({
        state: {
          ...existing,
          startedAt: existing.startedAt?.toISOString() ?? null,
          expectedEndAt: existing.expectedEndAt?.toISOString() ?? null,
        },
      });
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const plannedMinutes = body.plannedMinutes ?? 25;
    const startedAt = new Date();
    const expectedEndAt = new Date(startedAt.getTime() + plannedMinutes * 60_000);

    const state = await prisma.focusState.upsert({
      where: { userId: user.id },
      update: {
        status: "focusing",
        plannedMinutes,
        startedAt,
        expectedEndAt,
      },
      create: {
        userId: user.id,
        status: "focusing",
        plannedMinutes,
        startedAt,
        expectedEndAt,
      },
      select: {
        status: true,
        plannedMinutes: true,
        startedAt: true,
        expectedEndAt: true,
      },
    });

    const response = jsonOk({
      state: {
        ...state,
        startedAt: state.startedAt?.toISOString() ?? null,
        expectedEndAt: state.expectedEndAt?.toISOString() ?? null,
      },
    });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
