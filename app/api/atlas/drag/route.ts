import { jsonOk, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { readJsonBody, atlasDragSchema } from "@/lib/validation";
import { setDragPosition } from "@/lib/atlas-drag-cache";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const body = await readJsonBody(request, atlasDragSchema);
    setDragPosition(body.elementId, body.x, body.y, user.id);

    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
