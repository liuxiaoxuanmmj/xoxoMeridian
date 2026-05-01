import { ChatApp } from "@/components/chat/ChatApp";
import { getDefaultRoomForUser } from "@/lib/access";
import { requirePageUser } from "@/lib/auth";
import { getRoomSnapshot } from "@/lib/room-snapshot";

export default async function ChatPage() {
  const user = await requirePageUser();
  const room = await getDefaultRoomForUser(user);
  const snapshot = await getRoomSnapshot(room.id);

  return (
    <ChatApp
      currentUser={JSON.parse(JSON.stringify(user))}
      initialSnapshot={JSON.parse(JSON.stringify(snapshot))}
    />
  );
}
