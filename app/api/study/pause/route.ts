import { applyNoStoreHeaders, errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { serializeFocusState } from "@/lib/study";
import {
  pauseFocusTimer,
  StudyTransitionConflictError,
} from "@/lib/study-transitions";
import { readJsonBody, studyTransitionSchema } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await readJsonBody(request, studyTransitionSchema);
    const updated = await pauseFocusTimer(user.id, body.sessionKey);

    const response = jsonOk({ state: serializeFocusState(updated) });
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
