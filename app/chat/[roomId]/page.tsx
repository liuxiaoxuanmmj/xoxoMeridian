import { notFound } from "next/navigation";

import { ChatApp } from "@/components/chat/ChatApp";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";

export default async function ChatRoomPage({ params }: { params: { roomId: string } }) {
  const user = await requirePageUser();

  const participant = await prisma.roomParticipant.findUnique({
    where: { roomId_userId: { roomId: params.roomId, userId: user.id } },
  });
  if (!participant) notFound();

  const snapshot = await getRoomSnapshot(params.roomId);

  return (
    <ChatApp
      currentUser={JSON.parse(JSON.stringify(user))}
      initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
    />
  );
}
