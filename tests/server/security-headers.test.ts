import { describe, expect, it, afterEach } from "vitest";

import nextConfig from "../../next.config.mjs";

function getCspHeader(headers: Awaited<ReturnType<NonNullable<typeof nextConfig.headers>>>) {
  const routeHeaders = headers[0]?.headers ?? [];
  const csp = routeHeaders.find((header) => header.key === "Content-Security-Policy");
  if (!csp) {
    throw new Error("Content-Security-Policy header not found");
  }
  return csp.value;
}

describe("security headers", () => {
  afterEach(() => {
    delete process.env.LOGIN_VISUALS_IMAGE_SRC;
  });

  it("keeps external login visual image sources disabled by default", async () => {
    delete process.env.LOGIN_VISUALS_IMAGE_SRC;

    const csp = getCspHeader(await nextConfig.headers!());

    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).not.toContain("https://cdn.example.com");
  });

  it("adds configured login visual image sources to img-src", async () => {
    process.env.LOGIN_VISUALS_IMAGE_SRC =
      "https://cdn.example.com, https://*.alicdn.com https://oss-cn-hangzhou.aliyuncs.com";

    const csp = getCspHeader(await nextConfig.headers!());

    expect(csp).toContain(
      "img-src 'self' data: blob: https://cdn.example.com https://*.alicdn.com https://oss-cn-hangzhou.aliyuncs.com"
    );
  });
});
