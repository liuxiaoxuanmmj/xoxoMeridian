import { SessionHeartbeat } from "@/components/auth/SessionHeartbeat";
import { requirePageUser } from "@/lib/auth";

export default async function ChatLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();
  return (
    <>
      <SessionHeartbeat expectedUserId={user.id} />
      {children}
    </>
  );
}
