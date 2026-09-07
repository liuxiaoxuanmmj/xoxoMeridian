import { prisma } from "@/lib/prisma";

export const ATLAS_GLOBAL_BOARD_ID = "atlas-global-board";

export async function getOrCreateBoard() {
  const board = await prisma.atlasBoard.findUnique({ where: { id: ATLAS_GLOBAL_BOARD_ID } });
  if (board) return board;
  return prisma.atlasBoard.create({ data: { id: ATLAS_GLOBAL_BOARD_ID } });
}
