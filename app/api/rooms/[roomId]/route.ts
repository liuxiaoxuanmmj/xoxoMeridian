import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rate-limit";
import { deleteRoomPreservingUserMembership } from "@/lib/room-lifecycle";

export const dynamic = "force-dynamic";

// DELETE /api/rooms/[roomId] — delete entire room (messages, tasks, memories, …
// all cascaded by schema). Refuses if the caller would be left with zero rooms,
// so /chat always has something to redirect to.
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const user = await requireCurrentUser();
    const { roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const limited = enforceRateLimit(request, `room-delete:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const result = await deleteRoomPreservingUserMembership(roomId, user.id);
    if (result.status === "last-room") {
      return Response.json(
        { error: "Cannot delete the last remaining room. Create another first." },
        { status: 409 }
      );
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
