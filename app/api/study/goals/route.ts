import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocalDateKey, getStudyRoomForUser } from "@/lib/study";
import { readJsonBody, studyGoalPostSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await readJsonBody(request, studyGoalPostSchema);
    const room = await getStudyRoomForUser(user.id);
    const now = new Date();
    const localDate = getLocalDateKey(now, user.profile.timezone);

    const count = await prisma.studyGoal.count({
      where: { userId: user.id, localDate },
    });

    const goal = await prisma.studyGoal.create({
      data: {
        text: body.text,
        userId: user.id,
        roomId: room.id,
        localDate,
        sortOrder: count,
      },
      select: {
        id: true,
        text: true,
        done: true,
        sortOrder: true,
        localDate: true,
      },
    });

    const response = jsonOk({ goal });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
