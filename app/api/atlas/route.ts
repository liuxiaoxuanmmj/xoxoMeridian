import { jsonOk, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBoard } from "@/lib/atlas-board";
import { getDragPositions } from "@/lib/atlas-drag-cache";
import { extractAtlasStorageKey, getAtlasStorage } from "@/lib/storage/atlas-storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    await requireCurrentUser();

    const board = await getOrCreateBoard();

    const url = new URL(request.url);
    const viewport = url.searchParams.get("viewport");

    let elementsWhere: Record<string, unknown> = { boardId: board.id };
    if (viewport) {
      const [x1, y1, x2, y2] = viewport.split(",").map(Number);
      if ([x1, y1, x2, y2].every((n) => Number.isFinite(n))) {
        elementsWhere = {
          boardId: board.id,
          x: { gte: x1, lte: x2 },
          y: { gte: y1, lte: y2 },
        };
      }
    }

    const [elements, connections] = await Promise.all([
      prisma.atlasElement.findMany({
        where: elementsWhere,
        orderBy: { zIndex: "asc" },
      }),
      prisma.atlasConnection.findMany({
        where: { boardId: board.id },
      }),
    ]);

    const dragPositions = getDragPositions();
    const mergedElements = elements.map((el) => {
      const drag = dragPositions.get(el.id);
      return drag ? { ...el, x: drag.x, y: drag.y } : el;
    });

    return jsonOk({
      boardId: board.id,
      elements: mergedElements,
      connections,
    });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(_request: Request) {
  try {
    await requireCurrentUser();

    const board = await getOrCreateBoard();

    // Get all photo elements to clean up uploaded files
    const photoElements = await prisma.atlasElement.findMany({
      where: { boardId: board.id, type: "photo" },
      select: { imageUrl: true },
    });

    // Delete all elements and connections
    await prisma.$transaction([
      prisma.atlasConnection.deleteMany({ where: { boardId: board.id } }),
      prisma.atlasElement.deleteMany({ where: { boardId: board.id } }),
    ]);

    // Clean up uploaded files
    const storage = getAtlasStorage();
    for (const el of photoElements) {
      const key = extractAtlasStorageKey(el.imageUrl);
      if (key) await storage.delete(key).catch(() => {});
    }

    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
