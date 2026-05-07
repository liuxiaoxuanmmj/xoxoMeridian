import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { notePostSchema, readJsonBody } from "@/lib/validation";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const notes = await prisma.note.findMany({
      where: { roomId: params.roomId },
      orderBy: { createdAt: "desc" }
    });

    return jsonOk({ notes });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `notes:${user.id}`, 20, 60_000);
    if (limited) return limited;

    const { content, color, metadata } = await readJsonBody(request, notePostSchema);

    const note = await prisma.note.create({
      data: {
        roomId: params.roomId,
        createdById: user.id,
        content,
        color,
        metadata: metadata as never
      }
    });

    return jsonOk({ note }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
