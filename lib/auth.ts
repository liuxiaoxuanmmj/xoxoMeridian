import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";

export const USER_COOKIE = "xoxo_user_id";

export type DemoRole = "me" | "her";

export function normalizeDemoRole(role: unknown): DemoRole {
  if (role === "me" || role === "her") {
    return role;
  }

  throw new Error("Unsupported demo role");
}

export async function getDemoUserByRole(role: DemoRole) {
  return prisma.user.findUnique({
    where: { demoRole: role },
    include: { profile: true }
  });
}

export async function getCurrentUser() {
  const userId = cookies().get(USER_COOKIE)?.value;
  if (!userId) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true }
  });
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  return user;
}

export async function requirePageUser() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/");
  }

  return user;
}
