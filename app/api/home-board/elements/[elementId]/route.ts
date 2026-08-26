import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { getOrCreateHomeBoard } from "@/lib/home-board";
import { prisma } from "@/lib/prisma";
import { readJsonBody, homeBoardElementPatchSchema } from "@/lib/validation";
import { extractAtlasStorageKey, getAtlasStorage } from "@/lib/storage/atlas-storage";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ elementId: string }> }
) {
  try {
    await requireCurrentUser();
    const board = await getOrCreateHomeBoard();
    const { elementId } = await params;

    const element = await prisma.atlasElement.findUnique({
      where: { id: elementId },
    });

    if (!element || element.boardId !== board.id) {
      return jsonError("Element not found", 404);
    }

    const body = await readJsonBody(request, homeBoardElementPatchSchema);
    const updated = await prisma.atlasElement.update({
      where: { id: elementId },
      data: body,
    });

    return jsonOk({ element: updated });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ elementId: string }> }
) {
  try {
    await requireCurrentUser();
    const board = await getOrCreateHomeBoard();
    const { elementId } = await params;

    const element = await prisma.atlasElement.findUnique({
      where: { id: elementId },
    });

    if (!element || element.boardId !== board.id) {
      return jsonError("Element not found", 404);
    }

    if (element.postId) {
      return jsonError("Post anchors cannot be deleted from the home board", 400);
    }

    await prisma.atlasElement.delete({ where: { id: elementId } });

    if (element.type === "photo" && element.imageUrl) {
      const key = extractAtlasStorageKey(element.imageUrl);
      if (key) await getAtlasStorage().delete(key).catch(() => {});
    }

    return jsonOk({ deleted: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
