import { z } from "zod";

import { env } from "@/lib/env";
import { FALLBACK_LOGIN_VISUALS } from "@/lib/login-visuals-shared";
import type {
  LoginVisualItem,
  LoginVisualsManifest,
  LoginVisualTheme,
} from "@/lib/login-visuals-shared";

export { FALLBACK_LOGIN_VISUALS } from "@/lib/login-visuals-shared";
export type {
  LoginVisualItem,
  LoginVisualsManifest,
  LoginVisualTheme,
} from "@/lib/login-visuals-shared";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RGBA_PATTERN =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*((?:\d+(?:\.\d+)?)|(?:\.\d+))\s*\)$/;
const LOGIN_VISUALS_FETCH_TIMEOUT_MS = 3000;

function isValidRgba(value: string) {
  const match = RGBA_PATTERN.exec(value);
  if (!match) return false;

  const channels = match.slice(1, 4).map((channel) => Number(channel));
  const alpha = Number(match[4]);

  return (
    channels.every((channel) => Number.isInteger(channel) && channel >= 0 && channel <= 255) &&
    Number.isFinite(alpha) &&
    alpha >= 0 &&
    alpha <= 1
  );
}

const HexColorSchema = z
  .string()
  .regex(HEX_COLOR_PATTERN, "Expected a #RRGGBB hex color");

const RgbaSchema = z
  .string()
  .refine(isValidRgba, "Expected rgba(R,G,B,A) with RGB 0-255 and alpha 0-1");

export const LoginVisualThemeSchema = z.object({
  accent: HexColorSchema,
  accentHover: HexColorSchema,
  gradientFrom: HexColorSchema,
  gradientTo: HexColorSchema,
  overlay: RgbaSchema,
});

export const LoginVisualItemSchema = z.object({
  id: z.string().min(1),
  imageUrl: z.string().url(),
  theme: LoginVisualThemeSchema,
});

export const LoginVisualsManifestSchema = z.object({
  version: z.literal(1),
  intervalMs: z.number().int().min(4000).max(30000).default(7000),
  items: z.array(LoginVisualItemSchema).min(1).max(12),
});

type LoginVisualsFetch = (
  input: string,
  init: { cache: "no-store"; signal: AbortSignal }
) => Promise<Pick<Response, "json" | "ok" | "status">>;

type LoginVisualsLoaderOptions = {
  manifestUrl?: string;
  ttlSeconds?: number;
  timeoutMs?: number;
  fetchImpl?: LoginVisualsFetch;
  nowMs?: () => number;
};

type ResolvedLoginVisualsLoaderOptions = {
  manifestUrl?: string;
  ttlSeconds: number;
  timeoutMs: number;
  fetchImpl: LoginVisualsFetch;
  nowMs?: () => number;
};

type LoginVisualsFallbackSummary =
  | { reason: "fetch_failed"; status?: number }
  | { reason: "invalid_json" }
  | { reason: "validation_failed"; issueCount: number }
  | { reason: "timeout" };

type LoginVisualsFetchResult =
  | { ok: true; value: LoginVisualsManifest }
  | { ok: false; summary: LoginVisualsFallbackSummary };

type LoginVisualsCacheEntry = {
  manifestUrl: string;
  expiresAtMs: number;
  value: LoginVisualsManifest;
};

let cacheEntry: LoginVisualsCacheEntry | null = null;

function logFallback(summary: LoginVisualsFallbackSummary) {
  console.error("[login-visuals] falling back to default visuals", summary);
}

async function fetchLoginVisualsManifest(
  url: string,
  fetchImpl: LoginVisualsFetch,
  signal: AbortSignal
): Promise<LoginVisualsFetchResult> {
  const response = await fetchImpl(url, { cache: "no-store", signal });

  if (!response.ok) {
    return { ok: false, summary: { reason: "fetch_failed", status: response.status } };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return { ok: false, summary: { reason: "invalid_json" } };
  }

  const parsed = LoginVisualsManifestSchema.safeParse(json);
  if (!parsed.success) {
    return {
      ok: false,
      summary: {
        reason: "validation_failed",
        issueCount: parsed.error.issues.length,
      },
    };
  }

  return { ok: true, value: parsed.data };
}

async function loadLoginVisuals({
  manifestUrl,
  ttlSeconds,
  timeoutMs,
  fetchImpl,
  nowMs,
}: ResolvedLoginVisualsLoaderOptions): Promise<LoginVisualsManifest> {
  const url = manifestUrl?.trim();
  if (!url) {
    return FALLBACK_LOGIN_VISUALS;
  }

  const now = nowMs?.() ?? Date.now();
  if (cacheEntry && cacheEntry.manifestUrl === url && cacheEntry.expiresAtMs > now) {
    return cacheEntry.value;
  }

  const controller = new AbortController();
  let timedOut = false;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    const timeoutPromise = new Promise<never>((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        timedOut = true;
        controller.abort();
        reject(new Error("Login visuals manifest request timed out"));
      }, timeoutMs);
    });

    const result = await Promise.race([
      fetchLoginVisualsManifest(url, fetchImpl, controller.signal),
      timeoutPromise,
    ]);

    if (!result.ok) {
      logFallback(result.summary);
      return FALLBACK_LOGIN_VISUALS;
    }

    cacheEntry = {
      manifestUrl: url,
      expiresAtMs: now + ttlSeconds * 1000,
      value: result.value,
    };

    return result.value;
  } catch {
    logFallback(timedOut ? { reason: "timeout" } : { reason: "fetch_failed" });
    return FALLBACK_LOGIN_VISUALS;
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export async function getLoginVisuals(): Promise<LoginVisualsManifest> {
  return loadLoginVisuals({
    manifestUrl: env.LOGIN_VISUALS_MANIFEST_URL,
    ttlSeconds: env.LOGIN_VISUALS_CACHE_TTL_SECONDS,
    timeoutMs: LOGIN_VISUALS_FETCH_TIMEOUT_MS,
    fetchImpl: globalThis.fetch,
  });
}

export async function getLoginVisualsForTest(
  options: LoginVisualsLoaderOptions
): Promise<LoginVisualsManifest> {
  return loadLoginVisuals({
    ttlSeconds: 300,
    timeoutMs: LOGIN_VISUALS_FETCH_TIMEOUT_MS,
    fetchImpl: globalThis.fetch,
    ...options,
  });
}

export function resetLoginVisualsCacheForTest() {
  cacheEntry = null;
}
