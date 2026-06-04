import { redirect } from "next/navigation";

import { ChatApp } from "@/components/chat/ChatApp";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";

export const dynamic = "force-dynamic";

export default async function ChatRoomPage({ params }: { params: { roomId: string } }) {
  const user = await requirePageUser();

  const participant = await prisma.roomParticipant.findUnique({
    where: { roomId_userId: { roomId: params.roomId, userId: user.id } },
  });
  // Room was deleted (cascade dropped the participant row) or the user was
  // ejected. Bounce to /chat, which redirects to the user's default room.
  if (!participant) redirect("/chat");

  const snapshot = await getRoomSnapshot(params.roomId, user.id);

  return (
    <ChatApp
      key={`${user.id}:${params.roomId}`}
      currentUser={JSON.parse(JSON.stringify(user))}
      initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
    />
  );
}
