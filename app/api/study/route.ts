import { applyNoStoreHeaders, errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getStudyPageData } from "@/lib/study";

export async function GET(_request: Request) {
  try {
    const user = await requireCurrentUser();
    const timeZone = user.profile?.timezone ?? "UTC";
    const payload = await getStudyPageData(
      { id: user.id, displayName: user.displayName, avatarLabel: user.avatarLabel },
      timeZone
    );
    const response = jsonOk(payload);
    applyNoStoreHeaders(response.headers);
    return response;
  } catch (error) {
    const response = errorToResponse(error);
    applyNoStoreHeaders(response.headers);
    return response;
  }
}
