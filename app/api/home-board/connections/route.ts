import { Prisma } from "@prisma/client";
import { jsonOk, jsonError, errorToResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import {
  getHomeBoardConnectionAccessWhere,
  getHomeBoardElementAccessWhere,
  getOrCreateHomeBoard,
} from "@/lib/home-board";
import { isConnectablePair, type HomeSpatialKind } from "@/lib/home-spatial";
import { prisma } from "@/lib/prisma";
import { readJsonBody, homeBoardConnectionCreateSchema } from "@/lib/validation";

function kindForElement(element: { type: string; postId: string | null }): HomeSpatialKind {
  return element.postId ? "post" : "photo";
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const board = await getOrCreateHomeBoard();
    const body = await readJsonBody(request, homeBoardConnectionCreateSchema);
    const elementAccessWhere = getHomeBoardElementAccessWhere({
      boardId: board.id,
      userId: user.id,
    });

    if (body.fromId === body.toId) {
      return jsonError("Cannot connect an element to itself", 400);
    }

    const [fromEl, toEl] = await Promise.all([
      prisma.atlasElement.findFirst({
        where: { id: body.fromId, AND: [elementAccessWhere] },
        select: { id: true, boardId: true, type: true, postId: true },
      }),
      prisma.atlasElement.findFirst({
        where: { id: body.toId, AND: [elementAccessWhere] },
        select: { id: true, boardId: true, type: true, postId: true },
      }),
    ]);

    if (!fromEl || !toEl) {
      return jsonError("Element not found on home board", 404);
    }

    if (!isConnectablePair(kindForElement(fromEl), kindForElement(toEl))) {
      return jsonError("Post-to-post connections are not supported on home board", 400);
    }

    const existing = await prisma.atlasConnection.findFirst({
      where: {
        boardId: board.id,
        OR: [
          { fromId: body.fromId, toId: body.toId },
          { fromId: body.toId, toId: body.fromId },
        ],
      },
      select: { id: true },
    });

    if (existing) {
      return jsonError("Connection already exists", 409);
    }

    const connection = await prisma.atlasConnection.create({
      data: {
        board: { connect: { id: board.id } },
        fromEl: {
          connect: { id: body.fromId, AND: [elementAccessWhere] },
        },
        toEl: {
          connect: { id: body.toId, AND: [elementAccessWhere] },
        },
        color: body.color ?? "#668a5b",
      },
    });

    return jsonOk({ connection }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return jsonError("Connection already exists", 409);
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return jsonError("Element not found on home board", 404);
    }
    return errorToResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const board = await getOrCreateHomeBoard();
    const url = new URL(request.url);
    const connectionId = url.searchParams.get("id");

    if (!connectionId) {
      return jsonError("Missing connection id", 400);
    }

    const deleted = await prisma.atlasConnection.deleteMany({
      where: {
        id: connectionId,
        ...getHomeBoardConnectionAccessWhere({
          boardId: board.id,
          userId: user.id,
        }),
      },
    });

    if (deleted.count === 0) {
      return jsonError("Connection not found", 404);
    }

    return jsonOk({ deleted: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
