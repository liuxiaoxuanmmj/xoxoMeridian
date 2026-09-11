import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// APP_BASE_URL is read directly at the Proxy boundary instead of importing the
// application-wide env validator. Parse once at module init and tolerate
// misconfiguration by disabling this secondary CSRF check; lib/env.ts still
// rejects a missing APP_BASE_URL in the production application runtime.
// Accept comma-separated list in APP_BASE_URL / ALLOWED_ORIGINS so the same
// deployment can be reached via IP and domain (e.g. http://154.12.28.37 and
// https://meridian.example.com) without tripping CSRF.
const ALLOWED_ORIGINS: Set<string> = (() => {
  const raw = [process.env.APP_BASE_URL, process.env.ALLOWED_ORIGINS]
    .filter(Boolean)
    .join(",");
  const set = new Set<string>();
  for (const part of raw.split(",")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    try {
      set.add(new URL(trimmed).origin);
    } catch {
      // ignore invalid entries
    }
  }
  return set;
})();

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/|images/).*)"],
};

export function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isApiRequest = pathname.startsWith("/api/");

  let response: NextResponse;

  if (!SAFE_METHODS.has(request.method) && isApiRequest && ALLOWED_ORIGINS.size > 0) {
    const candidate =
      request.headers.get("origin") ?? safeOrigin(request.headers.get("referer"));

    if (!candidate) {
      response = NextResponse.json(
        { error: "Origin header required for state-changing requests" },
        { status: 403 }
      );
      applySecurityHeaders(response);
      applyNoStoreHeaders(response);
      return response;
    }

    if (!ALLOWED_ORIGINS.has(candidate)) {
      response = NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
      applySecurityHeaders(response);
      applyNoStoreHeaders(response);
      return response;
    }
  }

  response = NextResponse.next();
  applySecurityHeaders(response);
  if (isNoStorePath(pathname)) {
    applyNoStoreHeaders(response);
  }
  return response;
}

function safeOrigin(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

export function isNoStorePath(pathname: string): boolean {
  return (
    pathname === "/me" ||
    pathname === "/home" ||
    pathname === "/chat" ||
    pathname.startsWith("/posts/") ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/api/posts/") ||
    pathname.startsWith("/api/rooms/")
  );
}

function applyNoStoreHeaders(response: NextResponse) {
  response.headers.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  response.headers.set("CDN-Cache-Control", "no-store");
  response.headers.set("Pragma", "no-cache");
  response.headers.set("Expires", "0");
  response.headers.set("X-Accel-Expires", "0");
  response.headers.append("Vary", "Cookie");
}

function getLoginVisualImageSources() {
  const raw = process.env.LOGIN_VISUALS_IMAGE_SRC ?? "";
  return raw
    .split(/[\s,]+/)
    .map((source) => source.trim())
    .filter(Boolean)
    .filter((source) =>
      /^https:\/\/(\*\.)?[a-zA-Z0-9.-]+(?::\d+)?$/.test(source) ||
      /^http:\/\/localhost(?::\d+)?$/.test(source)
    );
}

export function buildContentSecurityPolicy(): string {
  const loginVisualImageSources = getLoginVisualImageSources();
  // Meshopt uses bundled WebAssembly; JavaScript eval remains development-only.
  const scriptSrc = ["script-src", "'self'", "'unsafe-inline'", "'wasm-unsafe-eval'"];
  if (process.env.NODE_ENV === "development") {
    scriptSrc.push("'unsafe-eval'");
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    `img-src 'self' data: blob:${loginVisualImageSources.length > 0 ? ` ${loginVisualImageSources.join(" ")}` : ""}`,
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    scriptSrc.join(" "),
    // GLTFLoader 的 ImageBitmapLoader 会 fetch 内嵌纹理生成的本地 blob URL。
    "connect-src 'self' blob:",
    "form-action 'self'",
  ].join("; ");
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.headers.set("Content-Security-Policy", buildContentSecurityPolicy());
}
