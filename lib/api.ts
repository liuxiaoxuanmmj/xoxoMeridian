import { NextResponse } from "next/server";

import { env } from "@/lib/env";
import { ValidationError } from "@/lib/validation";

export function jsonOk<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function applyNoStoreHeaders(headers: Headers) {
  headers.set("Cache-Control", "private, no-store, no-cache, max-age=0, must-revalidate");
  headers.set("CDN-Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  headers.set("Expires", "0");
  headers.set("X-Accel-Expires", "0");
  headers.append("Vary", "Cookie");
}

export function jsonError(message: string, status = 500, details?: unknown) {
  return NextResponse.json({ error: message, details }, { status });
}

export function errorToResponse(error: unknown) {
  if (error instanceof Response) {
    return error;
  }

  if (error instanceof ValidationError) {
    return NextResponse.json(
      { error: "Invalid request", issues: error.issues },
      { status: 400 }
    );
  }

  const isProd = env.NODE_ENV === "production";
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : undefined;

  console.error("[api] unhandled error:", message, stack);

  if (isProd) {
    return jsonError("Internal server error", 500);
  }

  return jsonError(message, 500);
}
