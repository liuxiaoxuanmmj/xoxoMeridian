import { describe, expect, it } from "vitest";

import { signSession, verifySession } from "@/lib/auth";

describe("session signing", () => {
  it("round-trips a userId through sign and verify", () => {
    const token = signSession("user-123");
    expect(verifySession(token)).toBe("user-123");
  });

  it("rejects a tampered signature", () => {
    const token = signSession("user-123");
    const [payload] = token.split(".");
    const tampered = `${payload}.AAAA`;
    expect(verifySession(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const longAgo = Date.now() - 1000 * 60 * 60 * 24 * 365;
    const token = signSession("user-123", longAgo);
    expect(verifySession(token)).toBeNull();
  });

  it("rejects malformed input", () => {
    expect(verifySession(undefined)).toBeNull();
    expect(verifySession("")).toBeNull();
    expect(verifySession("not-a-token")).toBeNull();
    expect(verifySession("a.b.c")).toBeNull();
  });
});
