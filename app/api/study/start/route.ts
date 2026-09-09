import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getStudyRoomForUser, serializeFocusState } from "@/lib/study";
import { startFocusTimer } from "@/lib/study-transitions";
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

    const room = await getStudyRoomForUser(user.id);
    const state = await startFocusTimer({
      userId: user.id,
      roomId: room.id,
      mode,
      plannedMinutes,
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
