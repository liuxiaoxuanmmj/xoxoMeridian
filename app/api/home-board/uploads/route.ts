import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateHomeBoard } from "@/lib/home-board";
import {
  getAtlasStorage,
  makeAtlasImageUrl,
  validateAtlasImageFile,
} from "@/lib/storage/atlas-storage";
import { clampPhotoSize } from "@/lib/home-spatial";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const board = await getOrCreateHomeBoard();

    const count = await prisma.atlasElement.count({ where: { boardId: board.id } });
    if (count >= 300) {
      return jsonError("Home board element limit reached (300)", 400);
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

    const x = Number(formData.get("x")) || 0;
    const y = Number(formData.get("y")) || 0;
    const requestedWidth = Number(formData.get("width")) || 240;
    const requestedHeight = Number(formData.get("height")) || 180;
    const aspectRatio = requestedWidth > 0 && requestedHeight > 0 ? requestedWidth / requestedHeight : 4 / 3;
    const size = clampPhotoSize({ width: requestedWidth, aspectRatio });
    const caption = (formData.get("caption") as string) ?? "";

    const element = await prisma.atlasElement.create({
      data: {
        boardId: board.id,
        type: "photo",
        x,
        y,
        width: size.width,
        height: size.height,
        rotation: Math.random() * 4 - 2,
        imageUrl: makeAtlasImageUrl(saved.key),
        caption: caption.trim() || null,
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
