import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
    const body = await request.json();
    const content = String(body.content ?? "").trim();

    if (!content) {
      return Response.json({ error: "Note content is required." }, { status: 400 });
    }

    const note = await prisma.note.create({
      data: {
        roomId: params.roomId,
        createdById: user.id,
        content,
        color: String(body.color ?? "warm")
      }
    });

    return jsonOk({ note }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
