import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/chat");
  }

  return <AuthPanel />;
}
