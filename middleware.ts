import { NextResponse, type NextRequest } from "next/server";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// APP_BASE_URL is read on the Edge runtime, which can't import the Node-only
// lib/env.ts validator — so we parse once at module init and tolerate misconfig
// by silently disabling the CSRF check (the Node-side env.ts will already have
// exited the process if APP_BASE_URL is missing in production).
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
  matcher: ["/api/:path*", "/chat/:path*", "/me"],
};

export function middleware(request: NextRequest) {
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
      applyNoStoreHeaders(response);
      return response;
    }

    if (!ALLOWED_ORIGINS.has(candidate)) {
      response = NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
      applyNoStoreHeaders(response);
      return response;
    }
  }

  response = NextResponse.next();
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
    pathname === "/chat" ||
    pathname.startsWith("/chat/") ||
    pathname.startsWith("/api/auth/") ||
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
