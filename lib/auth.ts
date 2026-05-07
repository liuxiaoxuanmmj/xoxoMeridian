import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

export const USER_COOKIE = "xoxo_session";

export type DemoRole = "me" | "her";

export async function getDemoUserByRole(role: DemoRole) {
  return prisma.user.findUnique({
    where: { demoRole: role },
    include: { profile: true },
  });
}

function hmac(payload: string): Buffer {
  return createHmac("sha256", env.SESSION_SECRET).update(payload).digest();
}

function tryDecode(input: string): Buffer | null {
  try {
    return Buffer.from(input, "base64url");
  } catch {
    return null;
  }
}

export function signSession(userId: string, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + env.SESSION_MAX_AGE_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  const sig = hmac(payload).toString("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifySession(token: string | undefined, now = Date.now()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const payloadBuf = tryDecode(parts[0]);
  if (!payloadBuf) return null;
  const payload = payloadBuf.toString("utf8");

  const sep = payload.lastIndexOf(".");
  if (sep < 0) return null;
  const userId = payload.slice(0, sep);
  if (!userId) return null;
  const expiresAt = Number.parseInt(payload.slice(sep + 1), 10);
  if (!Number.isFinite(expiresAt)) return null;
  if (Math.floor(now / 1000) >= expiresAt) return null;

  const provided = tryDecode(parts[1]);
  if (!provided) return null;
  const expected = hmac(payload);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return userId;
}

export function verifyDemoPassword(provided: string): boolean {
  const expected = Buffer.from(env.DEMO_LOGIN_PASSWORD);
  const got = Buffer.from(provided);
  if (expected.length !== got.length) return false;
  return timingSafeEqual(expected, got);
}

export function setSessionCookie(userId: string) {
  cookies().set({
    name: USER_COOKIE,
    value: signSession(userId),
    httpOnly: true,
    sameSite: "lax",
    secure: env.APP_BASE_URL.startsWith("https://"),
    path: "/",
    maxAge: env.SESSION_MAX_AGE_SECONDS,
  });
}

export async function getCurrentUser() {
  const token = cookies().get(USER_COOKIE)?.value;
  const userId = verifySession(token);
  if (!userId) return null;

  return prisma.user.findUnique({
    where: { id: userId },
    include: { profile: true },
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
