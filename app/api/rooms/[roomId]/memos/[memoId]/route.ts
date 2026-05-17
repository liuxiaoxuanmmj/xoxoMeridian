import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { memoPatchSchema, readJsonBody } from "@/lib/validation";

export async function GET(
  _request: Request,
  { params }: { params: { roomId: string; memoId: string } }
) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const memo = await prisma.memo.findUnique({
      where: { id: params.memoId },
    });

    if (!memo || memo.roomId !== params.roomId) {
      return jsonError("Not found", 404);
    }

    return jsonOk({ memo });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { roomId: string; memoId: string } }
) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `memos-patch:${user.id}`, 20, 60_000);
    if (limited) return limited;

    const memo = await prisma.memo.findUnique({
      where: { id: params.memoId },
    });

    if (!memo || memo.roomId !== params.roomId) {
      return jsonError("Not found", 404);
    }

    const parsed = await readJsonBody(request, memoPatchSchema);

    const data: Record<string, unknown> = {};
    if (parsed.title !== undefined) data.title = parsed.title;
    if (parsed.content !== undefined) data.content = parsed.content;
    if (parsed.pinned !== undefined) data.pinned = parsed.pinned;
    if (parsed.metadata !== undefined) data.metadata = parsed.metadata;

    const updated = await prisma.memo.update({
      where: { id: params.memoId },
      data,
    });

    return jsonOk({ memo: updated });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { roomId: string; memoId: string } }
) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `memos-delete:${user.id}`, 20, 60_000);
    if (limited) return limited;

    const memo = await prisma.memo.findUnique({
      where: { id: params.memoId },
    });

    if (!memo || memo.roomId !== params.roomId) {
      return jsonError("Not found", 404);
    }

    await prisma.memo.delete({ where: { id: params.memoId } });

    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
