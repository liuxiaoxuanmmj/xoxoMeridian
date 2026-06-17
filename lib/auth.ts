import { createHmac, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { generateSecureToken } from "@/lib/crypto-utils";
import { getPublicClientIp, shouldSyncGeoProfile, syncGeoProfileInBackground } from "@/lib/geo-ip";

export const USER_COOKIE = "xoxo_session";

export type SessionPayload = {
  sessionId: string;
  userId: string;
  expiresAt: number;
};

type SessionCookie = {
  name: string;
  value: string;
  httpOnly: true;
  sameSite: "lax";
  secure: boolean;
  path: "/";
  domain?: string;
  maxAge: number;
  expires?: Date;
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

function normalizeHostname(hostOrUrl: string | null | undefined): string | undefined {
  const raw = hostOrUrl?.trim();
  if (!raw) return undefined;

  try {
    const url = raw.includes("://") ? new URL(raw) : new URL(`http://${raw}`);
    return url.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    return undefined;
  }
}

function isIpAddress(hostname: string): boolean {
  return isIP(hostname) !== 0;
}

function isInternalProxyHost(hostOrUrl: string | null | undefined): boolean {
  const hostname = normalizeHostname(hostOrUrl);
  if (!hostname || hostname === "localhost") return true;
  if (hostname === "::1" || hostname === "0.0.0.0") return true;
  if (!isIpAddress(hostname)) return false;

  if (hostname.startsWith("127.")) return true;
  if (hostname.startsWith("10.")) return true;
  if (hostname.startsWith("192.168.")) return true;

  const parts = hostname.split(".");
  if (parts.length === 4 && parts[0] === "172") {
    const second = Number.parseInt(parts[1], 10);
    return Number.isInteger(second) && second >= 16 && second <= 31;
  }

  return false;
}

function isCookieDomainAllowedForHost(domain: string, hostOrUrl: string | null | undefined): boolean {
  const hostname = normalizeHostname(hostOrUrl);
  return Boolean(hostname && (hostname === domain || hostname.endsWith(`.${domain}`)));
}

export function getSessionCookieDomainForHost(hostOrUrl: string | null | undefined): string | undefined {
  const hostname = normalizeHostname(hostOrUrl);
  if (!hostname || hostname === "localhost" || isIpAddress(hostname)) {
    return undefined;
  }
  return hostname.startsWith("www.") ? hostname.slice(4) : hostname;
}

export function getSessionCookieDomainCandidates(
  appBaseUrl: string,
  requestHost: string | null | undefined
): string[] {
  const domains = new Set<string>();
  const requestDomain = getSessionCookieDomainForHost(requestHost);
  if (requestDomain) {
    domains.add(requestDomain);
  }

  const configuredDomain = getSessionCookieDomainForHost(appBaseUrl);
  if (
    configuredDomain &&
    (isCookieDomainAllowedForHost(configuredDomain, requestHost) ||
      isInternalProxyHost(requestHost))
  ) {
    domains.add(configuredDomain);
  }

  return [...domains];
}

export function getConfiguredSessionCookieDomain(): string | undefined {
  return getSessionCookieDomainForHost(env.APP_BASE_URL);
}

function getRequestHostForCookie(): string | undefined {
  const headersList = headers();
  return headersList.get("x-forwarded-host")?.split(",")[0]?.trim() ?? headersList.get("host") ?? undefined;
}

function getSessionCookieDomainForRequest(): string | undefined {
  return getSessionCookieDomainCandidates(env.APP_BASE_URL, getRequestHostForCookie())[0];
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

function buildSessionCookie(value: string, domain?: string): SessionCookie {
  return {
    name: USER_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureRequest(),
    path: "/",
    domain,
    maxAge: env.SESSION_MAX_AGE_SECONDS,
  };
}

function buildClearSessionCookie(domain?: string): SessionCookie {
  return {
    ...buildSessionCookie("", domain),
    maxAge: 0,
    expires: new Date(0),
  };
}

function serializeSessionCookie(cookie: SessionCookie): string {
  const parts = [`${cookie.name}=${cookie.value}`, `Path=${cookie.path}`];
  if (cookie.expires) parts.push(`Expires=${cookie.expires.toUTCString()}`);
  parts.push(`Max-Age=${cookie.maxAge}`);
  if (cookie.domain) parts.push(`Domain=${cookie.domain}`);
  if (cookie.httpOnly) parts.push("HttpOnly");
  if (cookie.secure) parts.push("Secure");
  parts.push("SameSite=Lax");
  return parts.join("; ");
}

function getClearSessionCookieDomainsForRequest(): string[] {
  return getSessionCookieDomainCandidates(env.APP_BASE_URL, getRequestHostForCookie());
}

export function appendClearSessionCookieHeaders(responseHeaders: Headers) {
  responseHeaders.append("Set-Cookie", serializeSessionCookie(buildClearSessionCookie()));
  for (const domain of getClearSessionCookieDomainsForRequest()) {
    responseHeaders.append("Set-Cookie", serializeSessionCookie(buildClearSessionCookie(domain)));
  }
}

export function appendSessionCookieHeaders(responseHeaders: Headers, cookie: SessionCookie) {
  appendClearSessionCookieHeaders(responseHeaders);
  responseHeaders.append("Set-Cookie", serializeSessionCookie(cookie));
}

export async function createSessionCookie(userId: string): Promise<{ sessionId: string; cookie: SessionCookie }> {
  const jar = cookies();
  const previousSession = verifySession(jar.get(USER_COOKIE)?.value);
  const clientIp = getClientIp();
  const userAgent = getUserAgent();
  const now = Date.now();
  const expiresAt = new Date(now + env.SESSION_MAX_AGE_SECONDS * 1000);

  if (previousSession && previousSession.userId !== userId) {
    await prisma.session.delete({
      where: { id: previousSession.sessionId },
    }).catch(() => {
      // The previous browser session may already be gone; login can continue.
    });
  }

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
      ipAddress: clientIp,
      userAgent,
      expiresAt,
    },
  });

  // Set cookie with signed session token
  const cookieValue = signSession(session.id, userId, Math.floor(expiresAt.getTime() / 1000));

  return {
    sessionId: session.id,
    cookie: buildSessionCookie(cookieValue, getSessionCookieDomainForRequest()),
  };
}

export async function setSessionCookie(userId: string): Promise<string> {
  const { sessionId, cookie } = await createSessionCookie(userId);
  cookies().set(cookie);
  return sessionId;
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

  // 自动同步用户地理位置（fire-and-forget，不阻塞认证）
  const clientIp = getPublicClientIp();
  if (clientIp && shouldSyncGeoProfile({ profile: dbSession.user.profile, clientIp, now: new Date() })) {
    syncGeoProfileInBackground(dbSession.user.id, clientIp);
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
