import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { getCurrentUser } from "@/lib/auth";
import { getLoginVisuals } from "@/lib/login-visuals";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/home");
  }

  const loginVisuals = await getLoginVisuals();

  return <AuthPanel visuals={loginVisuals} />;
}
