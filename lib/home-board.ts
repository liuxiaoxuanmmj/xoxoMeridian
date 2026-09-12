import type { Prisma } from "@prisma/client";

import { getPostVisibilityWhere } from "@/lib/post-visibility";
import { prisma } from "@/lib/prisma";

export const HOME_BOARD_ID = "home-board";

type HomePostInput = {
  id: string;
  authorId: string | null;
};

type HomeBoardAccessScope = {
  boardId: string;
  userId: string;
};

export function getHomeBoardElementAccessWhere({
  boardId,
  userId,
}: HomeBoardAccessScope): Prisma.AtlasElementWhereInput {
  return {
    boardId,
    OR: [
      { type: "photo", postId: null },
      {
        post: {
          is: getPostVisibilityWhere(userId),
        },
      },
    ],
  };
}

export function getHomeBoardConnectionAccessWhere({
  boardId,
  userId,
}: HomeBoardAccessScope): Prisma.AtlasConnectionWhereInput {
  const elementWhere = getHomeBoardElementAccessWhere({ boardId, userId });

  return {
    boardId,
    fromEl: { is: elementWhere },
    toEl: { is: elementWhere },
  };
}

export async function getOrCreateHomeBoard() {
  return prisma.atlasBoard.upsert({
    where: { id: HOME_BOARD_ID },
    update: {},
    create: { id: HOME_BOARD_ID },
  });
}

export async function ensureHomePostElements({
  boardId,
  posts,
}: {
  boardId: string;
  posts: HomePostInput[];
}) {
  if (posts.length === 0) return;

  const existing = await prisma.atlasElement.findMany({
    where: {
      boardId,
      postId: { in: posts.map((post) => post.id) },
    },
    select: { postId: true },
  });

  const existingPostIds = new Set(existing.map((element) => element.postId).filter(Boolean));
  const missing = posts.filter((post) => !existingPostIds.has(post.id));

  if (missing.length === 0) return;

  await prisma.atlasElement.createMany({
    data: missing.map((post) => ({
      boardId,
      type: "note",
      postId: post.id,
      x: 0,
      y: 0,
      width: 320,
      height: 180,
      rotation: 0,
      zIndex: 0,
      createdById: post.authorId,
    })),
    skipDuplicates: true,
  });
}

export async function getHomeBoardSnapshot({ boardId, userId }: HomeBoardAccessScope) {
  const elementWhere = getHomeBoardElementAccessWhere({ boardId, userId });
  const connectionWhere = getHomeBoardConnectionAccessWhere({ boardId, userId });
  const [elements, connections] = await Promise.all([
    prisma.atlasElement.findMany({
      where: elementWhere,
      orderBy: { zIndex: "asc" },
    }),
    prisma.atlasConnection.findMany({
      where: connectionWhere,
    }),
  ]);

  return { boardId, elements, connections };
}
