import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { ATLAS_GLOBAL_BOARD_ID } from "@/lib/atlas-board";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody, atlasElementPatchSchema } from "@/lib/validation";
import { extractAtlasStorageKey, getAtlasStorage } from "@/lib/storage/atlas-storage";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ elementId: string }> }
) {
  try {
    await requireCurrentUser();
    const { elementId } = await params;
    const body = await readJsonBody(request, atlasElementPatchSchema);

    const result = await prisma.atlasElement.updateMany({
      where: {
        id: elementId,
        boardId: ATLAS_GLOBAL_BOARD_ID,
        postId: null,
      },
      data: body,
    });
    if (result.count !== 1) {
      return jsonError("Element not found", 404);
    }

    const updated = await prisma.atlasElement.findFirst({
      where: {
        id: elementId,
        boardId: ATLAS_GLOBAL_BOARD_ID,
        postId: null,
      },
    });
    if (!updated) {
      return jsonError("Element not found", 404);
    }

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
    const { elementId } = await params;

    const element = await prisma.atlasElement.findFirst({
      where: {
        id: elementId,
        boardId: ATLAS_GLOBAL_BOARD_ID,
        postId: null,
      },
    });
    if (!element) {
      return jsonError("Element not found", 404);
    }

    const result = await prisma.atlasElement.deleteMany({
      where: {
        id: elementId,
        boardId: ATLAS_GLOBAL_BOARD_ID,
        postId: null,
      },
    });
    if (result.count !== 1) {
      return jsonError("Element not found", 404);
    }

    if (element.type === "photo" && element.imageUrl) {
      const key = extractAtlasStorageKey(element.imageUrl);
      if (key) await getAtlasStorage().delete(key).catch(() => {});
    }

    return jsonOk({ deleted: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
