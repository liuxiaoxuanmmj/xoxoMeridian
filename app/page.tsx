import { redirect } from "next/navigation";

import { LoginForm } from "@/components/LoginForm";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/chat");
  }

  return <LoginForm />;
}
