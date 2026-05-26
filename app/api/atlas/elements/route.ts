import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody, atlasElementCreateSchema } from "@/lib/validation";
import { getOrCreateBoard } from "@/lib/atlas-board";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const board = await getOrCreateBoard();

    const count = await prisma.atlasElement.count({ where: { boardId: board.id } });
    if (count >= 200) {
      return jsonError("Element limit reached (200)", 400);
    }

    const body = await readJsonBody(request, atlasElementCreateSchema);

    const rotation = body.rotation ?? (Math.random() * 6 - 3);

    const element = await prisma.atlasElement.create({
      data: {
        boardId: board.id,
        type: body.type,
        x: body.x,
        y: body.y,
        content: body.content ?? null,
        caption: body.caption ?? null,
        rotation,
        createdById: user.id,
      },
    });

    return jsonOk({ element }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
