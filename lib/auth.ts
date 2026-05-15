import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/crypto-utils";

export const USER_COOKIE = "xoxo_session";

export type SessionPayload = {
  sessionId: string;
  userId: string;
  expiresAt: number;
};

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

// Generate a cryptographically secure random session token
function generateSessionToken(): string {
  return generateSecureToken();
}

// Get client IP address from request headers
function getClientIp(): string | null {
  const headersList = headers();
  // Check common proxy headers
  const forwarded = headersList.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  const realIp = headersList.get("x-real-ip");
  if (realIp) {
    return realIp;
  }
  return null;
}

// Check if request came through HTTPS (considering proxy headers)
export function isSecureRequest(): boolean {
  // Always check APP_BASE_URL first - this is the source of truth
  if (env.APP_BASE_URL.startsWith("https://")) {
    return true;
  }
  // If APP_BASE_URL is http, respect x-forwarded-proto header in case of proxy
  const headersList = headers();
  const proto = headersList.get("x-forwarded-proto");
  if (proto) {
    return proto === "https";
  }
  return false;
}

// Get user agent from request headers
function getUserAgent(): string | null {
  const headersList = headers();
  return headersList.get("user-agent");
}

export function signSession(sessionId: string, userId: string, expiresAt: number): string {
  const payload = `${sessionId}.${userId}.${expiresAt}`;
  const sig = hmac(payload).toString("base64url");
  return `${Buffer.from(payload).toString("base64url")}.${sig}`;
}

export function verifySession(token: string | undefined, now = Date.now()): SessionPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const payloadBuf = tryDecode(parts[0]);
  if (!payloadBuf) return null;
  const payload = payloadBuf.toString("utf8");

  // payload format: `${sessionId}.${userId}.${expiresAt}`
  const pieces = payload.split(".");
  if (pieces.length !== 3) return null;
  const [sessionId, userId, expiresStr] = pieces;
  if (!sessionId || !userId) return null;
  const expiresAt = Number.parseInt(expiresStr, 10);
  if (!Number.isFinite(expiresAt)) return null;
  if (Math.floor(now / 1000) >= expiresAt) return null;

  const provided = tryDecode(parts[1]);
  if (!provided) return null;
  const expected = hmac(payload);
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;

  return { sessionId, userId, expiresAt };
}

export async function setSessionCookie(userId: string): Promise<string> {
  const clientIp = getClientIp();
  const userAgent = getUserAgent();
  const now = Date.now();
  const expiresAt = new Date(now + env.SESSION_MAX_AGE_SECONDS * 1000);

  // Invalidate all existing sessions for this user to ensure only one active session
  // This prevents old tabs from interfering with newly logged-in sessions
  await prisma.session.deleteMany({
    where: { userId },
  });

  // Create new session in database
  const sessionToken = generateSessionToken();
  const session = await prisma.session.create({
    data: {
      id: sessionToken,
      userId,
      token: sessionToken,
      ipAddress: clientIp,
      userAgent,
      expiresAt,
    },
  });

  // Set cookie with signed session token
  const cookieValue = signSession(session.id, userId, Math.floor(expiresAt.getTime() / 1000));

  cookies().set({
    name: USER_COOKIE,
    value: cookieValue,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(),
    path: "/",
    maxAge: env.SESSION_MAX_AGE_SECONDS,
  });

  return session.id;
}

export async function getCurrentUser() {
  const token = cookies().get(USER_COOKIE)?.value;
  const session = verifySession(token);
  if (!session) return null;

  // Verify session exists in database and hasn't expired
  const dbSession = await prisma.session.findUnique({
    where: { id: session.sessionId },
    include: { user: { include: { profile: true } } },
  });

  if (!dbSession || dbSession.expiresAt < new Date()) {
    return null;
  }

  return dbSession.user;
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

// Clean up expired sessions (should be called periodically)
export async function cleanupExpiredSessions() {
  await prisma.session.deleteMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });
}
