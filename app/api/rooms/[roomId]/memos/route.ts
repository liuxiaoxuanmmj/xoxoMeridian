import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const memos = await prisma.memo.findMany({
      where: { roomId: params.roomId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }]
    });

    return jsonOk({ memos });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const content = String(body.content ?? "").trim();

    if (!title || !content) {
      return Response.json({ error: "Memo title and content are required." }, { status: 400 });
    }

    const memo = await prisma.memo.create({
      data: {
        roomId: params.roomId,
        createdById: user.id,
        title,
        content,
        pinned: Boolean(body.pinned)
      }
    });

    return jsonOk({ memo }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
