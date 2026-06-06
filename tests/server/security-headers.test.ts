import { describe, expect, it, afterEach } from "vitest";

import { buildContentSecurityPolicy } from "@/middleware";

describe("security headers", () => {
  afterEach(() => {
    delete process.env.LOGIN_VISUALS_IMAGE_SRC;
  });

  it("keeps external login visual image sources disabled by default", async () => {
    delete process.env.LOGIN_VISUALS_IMAGE_SRC;

    const csp = buildContentSecurityPolicy();

    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).not.toContain("https://cdn.example.com");
  });

  it("adds configured login visual image sources to img-src", async () => {
    process.env.LOGIN_VISUALS_IMAGE_SRC =
      "https://cdn.example.com, https://*.alicdn.com https://oss-cn-hangzhou.aliyuncs.com";

    const csp = buildContentSecurityPolicy();

    expect(csp).toContain(
      "img-src 'self' data: blob: https://cdn.example.com https://*.alicdn.com https://oss-cn-hangzhou.aliyuncs.com"
    );
  });
});
