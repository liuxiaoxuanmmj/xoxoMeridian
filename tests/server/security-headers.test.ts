import { describe, expect, it, afterEach, vi } from "vitest";

import { buildContentSecurityPolicy } from "@/proxy";

function getDirective(csp: string, name: string) {
  const directive = csp.split("; ").find((part) => part.startsWith(`${name} `));
  if (!directive) {
    throw new Error(`${name} directive not found`);
  }
  return directive;
}

describe("security headers", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
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

  it("ignores unsafe CSP tokens in configured login visual image sources", async () => {
    process.env.LOGIN_VISUALS_IMAGE_SRC =
      "https://cdn.example.com 'unsafe-inline' data: javascript:alert(1)";

    const csp = buildContentSecurityPolicy();
    const imgSrc = getDirective(csp, "img-src");

    expect(imgSrc).toBe("img-src 'self' data: blob: https://cdn.example.com");
    expect(imgSrc).not.toContain("'unsafe-inline'");
    expect(imgSrc).not.toContain("javascript:");
  });

  it("allows eval only for Next.js development scripts", async () => {
    vi.stubEnv("NODE_ENV", "development");

    const csp = buildContentSecurityPolicy();
    const scriptSrc = getDirective(csp, "script-src");

    expect(scriptSrc).toContain("'unsafe-eval'");
  });

  it("keeps eval disabled outside development", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const csp = buildContentSecurityPolicy();
    const scriptSrc = getDirective(csp, "script-src");

    expect(scriptSrc).not.toContain("'unsafe-eval'");
  });

  it("allows the bundled Meshopt WebAssembly decoder under production CSP", () => {
    vi.stubEnv("NODE_ENV", "production");

    const csp = buildContentSecurityPolicy();
    const scriptSrc = getDirective(csp, "script-src");

    expect(scriptSrc.split(" ")).toContain("'wasm-unsafe-eval'");
    expect(scriptSrc.split(" ")).not.toContain("'unsafe-eval'");
    expect(getDirective(csp, "connect-src")).toBe("connect-src 'self' blob:");
    expect(getDirective(csp, "default-src")).toBe("default-src 'self'");
  });
});
