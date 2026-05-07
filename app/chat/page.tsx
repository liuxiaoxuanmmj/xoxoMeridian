import { redirect } from "next/navigation";

import { getDefaultRoomForUser } from "@/lib/access";
import { requirePageUser } from "@/lib/auth";

export default async function ChatIndexPage() {
  const user = await requirePageUser();
  const room = await getDefaultRoomForUser(user);
  redirect(`/chat/${room.id}`);
}
