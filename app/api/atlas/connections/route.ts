import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody, atlasConnectionCreateSchema } from "@/lib/validation";
import { ATLAS_GLOBAL_BOARD_ID, getOrCreateBoard } from "@/lib/atlas-board";

export async function POST(request: Request) {
  try {
    await requireCurrentUser();

    const board = await getOrCreateBoard();

    const body = await readJsonBody(request, atlasConnectionCreateSchema);

    if (body.fromId === body.toId) {
      return jsonError("Cannot connect an element to itself", 400);
    }

    const [fromEl, toEl] = await Promise.all([
      prisma.atlasElement.findUnique({ where: { id: body.fromId }, select: { boardId: true } }),
      prisma.atlasElement.findUnique({ where: { id: body.toId }, select: { boardId: true } }),
    ]);

    if (!fromEl || fromEl.boardId !== board.id || !toEl || toEl.boardId !== board.id) {
      return jsonError("Element not found on this board", 404);
    }

    const connection = await prisma.atlasConnection.create({
      data: {
        boardId: board.id,
        fromId: body.fromId,
        toId: body.toId,
        color: body.color ?? "#8B7355",
      },
    });

    return jsonOk({ connection }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await requireCurrentUser();

    const url = new URL(request.url);
    const connectionId = url.searchParams.get("id");
    if (!connectionId) return jsonError("Missing connection id", 400);

    const result = await prisma.atlasConnection.deleteMany({
      where: {
        id: connectionId,
        boardId: ATLAS_GLOBAL_BOARD_ID,
      },
    });
    if (result.count !== 1) {
      return jsonError("Connection not found", 404);
    }

    return jsonOk({ deleted: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
