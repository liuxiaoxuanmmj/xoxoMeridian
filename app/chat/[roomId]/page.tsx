import { redirect } from "next/navigation";

import { ChatApp } from "@/components/chat/ChatApp";
import { requirePageUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";

export const dynamic = "force-dynamic";

export default async function ChatRoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const user = await requirePageUser();
  const { roomId } = await params;

  const participant = await prisma.roomParticipant.findUnique({
    where: { roomId_userId: { roomId, userId: user.id } },
  });
  // Room was deleted (cascade dropped the participant row) or the user was
  // ejected. Bounce to /chat, which redirects to the user's default room.
  if (!participant) redirect("/chat");

  const snapshot = await getRoomSnapshot(roomId, user.id);
  const currentUser = {
    id: user.id,
    displayName: user.displayName,
    avatarLabel: user.avatarLabel,
    profile: user.profile
      ? {
          city: user.profile.city,
          country: user.profile.country,
          timezone: user.profile.timezone,
        }
      : null,
  };

  return (
    <ChatApp
      key={`${user.id}:${roomId}`}
      currentUser={currentUser}
      initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
    />
  );
}
