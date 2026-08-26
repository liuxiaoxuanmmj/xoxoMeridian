import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { memoPostSchema, readJsonBody } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const memos = await prisma.memo.findMany({
      where: { roomId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }]
    });

    return jsonOk({ memos });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ roomId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { roomId } = await params;
    await assertRoomAccess(roomId, user.id);

    const limited = enforceRateLimit(request, `memos:${user.id}`, 20, 60_000);
    if (limited) return limited;

    const { title, content, pinned, metadata } = await readJsonBody(request, memoPostSchema);

    const memo = await prisma.memo.create({
      data: {
        roomId,
        createdById: user.id,
        title,
        content,
        pinned,
        metadata: metadata as never
      }
    });

    return jsonOk({ memo }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
