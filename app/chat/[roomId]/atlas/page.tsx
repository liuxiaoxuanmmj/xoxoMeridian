import { redirect } from "next/navigation";

import { AtlasApp } from "@/components/atlas/AtlasApp";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreateBoard } from "@/lib/atlas-board";

export const dynamic = "force-dynamic";

export default async function AtlasPage({ params }: { params: { roomId: string } }) {
  const user = await requirePageUser();

  const board = await getOrCreateBoard();

  const [elements, connections] = await Promise.all([
    prisma.atlasElement.findMany({
      where: { boardId: board.id },
      orderBy: { zIndex: "asc" },
    }),
    prisma.atlasConnection.findMany({
      where: { boardId: board.id },
    }),
  ]);

  const initialSnapshot = {
    boardId: board.id,
    elements,
    connections,
  };

  return (
    <AtlasApp
      key={`${user.id}:${params.roomId}`}
      roomId={params.roomId}
      currentUser={JSON.parse(JSON.stringify(user))}
      initialSnapshot={JSON.parse(JSON.stringify(initialSnapshot))}
    />
  );
}
