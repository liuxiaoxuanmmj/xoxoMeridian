import { z } from "zod";

import { env } from "@/lib/env";

const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;
const RGBA_PATTERN =
  /^rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*((?:\d+(?:\.\d+)?)|(?:\.\d+))\s*\)$/;

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

export type LoginVisualTheme = z.infer<typeof LoginVisualThemeSchema>;
export type LoginVisualItem = z.infer<typeof LoginVisualItemSchema>;
export type LoginVisualsManifest = z.infer<typeof LoginVisualsManifestSchema>;

export const FALLBACK_LOGIN_VISUALS: LoginVisualsManifest = {
  version: 1,
  intervalMs: 7000,
  items: [
    {
      id: "fallback-login-bg",
      imageUrl: "/images/login-bg.jpg",
      theme: {
        accent: "#3a5b22",
        accentHover: "#2e4a1a",
        gradientFrom: "#f5f1e9",
        gradientTo: "#dbe6cf",
        overlay: "rgba(255,255,255,0.12)",
      },
    },
  ],
};

type LoginVisualsFetch = (
  input: string,
  init: { cache: "no-store" }
) => Promise<Pick<Response, "json" | "ok" | "status">>;

type LoginVisualsLoaderOptions = {
  manifestUrl?: string;
  ttlSeconds?: number;
  fetchImpl?: LoginVisualsFetch;
  nowMs?: () => number;
};

type ResolvedLoginVisualsLoaderOptions = {
  manifestUrl?: string;
  ttlSeconds: number;
  fetchImpl: LoginVisualsFetch;
  nowMs?: () => number;
};

type LoginVisualsCacheEntry = {
  manifestUrl: string;
  expiresAtMs: number;
  value: LoginVisualsManifest;
};

let cacheEntry: LoginVisualsCacheEntry | null = null;

function logFallbackError(error: unknown) {
  console.error("[login-visuals] falling back to default visuals", error);
}

async function loadLoginVisuals({
  manifestUrl,
  ttlSeconds,
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

  try {
    const response = await fetchImpl(url, { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`Manifest request failed with status ${response.status}`);
    }

    const parsed = LoginVisualsManifestSchema.parse(await response.json());
    cacheEntry = {
      manifestUrl: url,
      expiresAtMs: now + ttlSeconds * 1000,
      value: parsed,
    };

    return parsed;
  } catch (error) {
    logFallbackError(error);
    return FALLBACK_LOGIN_VISUALS;
  }
}

export async function getLoginVisuals(): Promise<LoginVisualsManifest> {
  return loadLoginVisuals({
    manifestUrl: env.LOGIN_VISUALS_MANIFEST_URL,
    ttlSeconds: env.LOGIN_VISUALS_CACHE_TTL_SECONDS,
    fetchImpl: globalThis.fetch,
  });
}

export async function getLoginVisualsForTest(
  options: LoginVisualsLoaderOptions
): Promise<LoginVisualsManifest> {
  return loadLoginVisuals({
    ttlSeconds: 300,
    fetchImpl: globalThis.fetch,
    ...options,
  });
}

export function resetLoginVisualsCacheForTest() {
  cacheEntry = null;
}
