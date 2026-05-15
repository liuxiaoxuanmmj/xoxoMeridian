import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "@/lib/auth";

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
