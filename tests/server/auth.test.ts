import { describe, expect, it } from "vitest";

import { normalizeDemoRole } from "@/lib/auth";

describe("demo auth helpers", () => {
  it("normalizes the two supported demo roles", () => {
    expect(normalizeDemoRole("me")).toBe("me");
    expect(normalizeDemoRole("her")).toBe("her");
  });

  it("rejects unsupported demo roles", () => {
    expect(() => normalizeDemoRole("guest")).toThrow("Unsupported demo role");
  });
});
