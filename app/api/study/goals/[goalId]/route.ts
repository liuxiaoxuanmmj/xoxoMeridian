import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody, studyGoalPatchSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  { params }: { params: { goalId: string } }
) {
  try {
    const user = await requireCurrentUser();
    const { goalId } = params;
    const body = await readJsonBody(request, studyGoalPatchSchema);

    const goal = await prisma.studyGoal.findFirst({
      where: { id: goalId, userId: user.id },
    });

    if (!goal) {
      const response = jsonError("Goal not found", 404);
      applyNoStoreHeaders(response.headers);
      return response;
    }

    const updated = await prisma.studyGoal.update({
      where: { id: goalId },
      data: body,
      select: {
        id: true,
        text: true,
        done: true,
        sortOrder: true,
        localDate: true,
      },
    });

    const response = jsonOk({ goal: updated });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
