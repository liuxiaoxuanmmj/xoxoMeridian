import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBoard } from "@/lib/atlas-board";
import {
  getAtlasStorage,
  makeAtlasImageUrl,
  validateAtlasImageFile,
} from "@/lib/storage/atlas-storage";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const board = await getOrCreateBoard();

    const count = await prisma.atlasElement.count({ where: { boardId: board.id } });
    if (count >= 200) {
      return jsonError("Element limit reached (200)", 400);
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) {
      return jsonError("No file provided", 400);
    }

    validateAtlasImageFile(file);

    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await getAtlasStorage().save({
      originalName: file.name,
      mimeType: file.type,
      buffer,
    });
    const imageUrl = makeAtlasImageUrl(saved.key);

    const x = Number(formData.get("x")) || 0;
    const y = Number(formData.get("y")) || 0;
    const caption = (formData.get("caption") as string) ?? "";

    const rotation = Math.random() * 6 - 3;

    const element = await prisma.atlasElement.create({
      data: {
        boardId: board.id,
        type: "photo",
        x,
        y,
        rotation,
        imageUrl,
        caption: caption || null,
        createdById: user.id,
      },
    });

    return jsonOk({ element }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && (error.message.includes("Unsupported file type") || error.message.includes("File too large"))) {
      return jsonError(error.message, 400);
    }
    return errorToResponse(error);
  }
}
