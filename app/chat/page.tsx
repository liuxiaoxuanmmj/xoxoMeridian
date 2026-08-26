import { redirect } from "next/navigation";

import { getDefaultRoomForUser } from "@/lib/access";
import { requirePageUser } from "@/lib/auth";
import { chatRoomRedirectPath } from "@/lib/chat-redirect";

export const dynamic = "force-dynamic";

export default async function ChatIndexPage({
  searchParams,
}: {
  searchParams?: Promise<{ auth?: string }>;
}) {
  const user = await requirePageUser();
  const room = await getDefaultRoomForUser(user);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  redirect(chatRoomRedirectPath(room.id, resolvedSearchParams?.auth));
}
