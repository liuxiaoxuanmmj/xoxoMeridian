import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readJsonBody, atlasElementPatchSchema } from "@/lib/validation";
import { extractAtlasStorageKey, getAtlasStorage } from "@/lib/storage/atlas-storage";

export async function PATCH(
  request: Request,
  { params }: { params: { elementId: string } }
) {
  try {
    await requireCurrentUser();

    const element = await prisma.atlasElement.findUnique({
      where: { id: params.elementId },
    });

    if (!element) {
      return jsonError("Element not found", 404);
    }

    const body = await readJsonBody(request, atlasElementPatchSchema);

    const updated = await prisma.atlasElement.update({
      where: { id: params.elementId },
      data: body,
    });

    return jsonOk({ element: updated });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { elementId: string } }
) {
  try {
    await requireCurrentUser();

    const element = await prisma.atlasElement.findUnique({
      where: { id: params.elementId },
    });

    if (!element) {
      return jsonError("Element not found", 404);
    }

    await prisma.atlasElement.delete({ where: { id: params.elementId } });

    if (element.type === "photo" && element.imageUrl) {
      const key = extractAtlasStorageKey(element.imageUrl);
      if (key) await getAtlasStorage().delete(key).catch(() => {});
    }

    return jsonOk({ deleted: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
