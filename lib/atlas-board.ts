import { prisma } from "@/lib/prisma";

const GLOBAL_BOARD_ID = "atlas-global-board";

export async function getOrCreateBoard() {
  const board = await prisma.atlasBoard.findUnique({ where: { id: GLOBAL_BOARD_ID } });
  if (board) return board;
  return prisma.atlasBoard.create({ data: { id: GLOBAL_BOARD_ID } });
}
