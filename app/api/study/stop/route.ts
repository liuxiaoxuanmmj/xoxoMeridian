import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { serializeFocusState } from "@/lib/study";
import {
  stopFocusTimer,
  StudyTransitionConflictError,
} from "@/lib/study-transitions";
import { readJsonBody, studyTransitionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await readJsonBody(request, studyTransitionSchema);
    const { session, state } = await stopFocusTimer(user.id, body.sessionKey);

    const response = jsonOk({
      session: {
        ...session,
        startedAt: session.startedAt.toISOString(),
        endedAt: session.endedAt.toISOString(),
      },
      state: serializeFocusState(state),
    });
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = error instanceof StudyTransitionConflictError
      ? jsonError(error.message, 409)
      : errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
