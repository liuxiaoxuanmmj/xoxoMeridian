import { describe, expect, it } from "vitest";

import {
  getSessionCookieDomainCandidates,
  getSessionCookieDomainForHost,
  signSession,
  verifySession
} from "@/lib/auth";
import { chatRoomRedirectPath } from "@/lib/chat-redirect";
import { applyNoStoreHeaders } from "@/lib/api";
import { isNoStorePath } from "@/middleware";

describe("session signing", () => {
  it("round-trips sessionId and userId through sign and verify", () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now
    const token = signSession("session-123", "user-456", futureTimestamp);
    const result = verifySession(token);
    expect(result).not.toBeNull();
    expect(result?.sessionId).toBe("session-123");
    expect(result?.userId).toBe("user-456");
    expect(result?.expiresAt).toBe(futureTimestamp);
  });

  it("rejects a tampered signature", () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 3600;
    const token = signSession("session-123", "user-456", futureTimestamp);
    const [payload] = token.split(".");
    const tampered = `${payload}.AAAA`;
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const longAgo = Math.floor((Date.now() - 1000 * 60 * 60 * 24 * 365) / 1000);
    const token = signSession("session-123", "user-456", longAgo);
    expect(verifySession(token)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession("a.b.c")).toBeNull();
  });
});

describe("session cookie domains", () => {
  it("derives the canonical cookie domain from the request host", () => {
    expect(getSessionCookieDomainForHost("xoxo.top")).toBe("xoxo.top");
    expect(getSessionCookieDomainForHost("www.xoxo.top")).toBe("xoxo.top");
    expect(getSessionCookieDomainForHost("127.0.0.1")).toBeUndefined();
    expect(getSessionCookieDomainForHost("localhost:3000")).toBeUndefined();
  });

  it("clears stale domain cookies even when APP_BASE_URL is an IP", () => {
    expect(
      getSessionCookieDomainCandidates("http://154.12.28.37", "xoxo.top")
    ).toEqual(["xoxo.top"]);
    expect(
      getSessionCookieDomainCandidates("http://154.12.28.37", "www.xoxo.top")
    ).toEqual(["xoxo.top"]);
    expect(
      getSessionCookieDomainCandidates("https://xoxo.top", "154.12.28.37")
    ).toEqual([]);
    expect(
      getSessionCookieDomainCandidates("https://xoxo.top", "127.0.0.1:3000")
    ).toEqual(["xoxo.top"]);
  });
});

describe("auth response caching", () => {
  it("marks auth responses as uncacheable by browsers and nginx", () => {
    const headers = new Headers();
    applyNoStoreHeaders(headers);

    expect(headers.get("Cache-Control")).toContain("no-store");
    expect(headers.get("X-Accel-Expires")).toBe("0");
    expect(headers.get("Vary")).toContain("Cookie");
  });

  it("marks authenticated pages and APIs as no-store middleware paths", () => {
    expect(isNoStorePath("/chat")).toBe(true);
    expect(isNoStorePath("/chat/room-1")).toBe(true);
    expect(isNoStorePath("/me")).toBe(true);
    expect(isNoStorePath("/api/auth/me")).toBe(true);
    expect(isNoStorePath("/api/rooms/room-1/messages")).toBe(true);
    expect(isNoStorePath("/")).toBe(false);
  });
});

describe("chat auth redirects", () => {
  it("preserves auth cache-bust query when redirecting to the default room", () => {
    expect(chatRoomRedirectPath("room-1", "user-1")).toBe("/chat/room-1?auth=user-1");
    expect(chatRoomRedirectPath("room-1", "user 1")).toBe("/chat/room-1?auth=user+1");
    expect(chatRoomRedirectPath("room-1", null)).toBe("/chat/room-1");
  });
});
