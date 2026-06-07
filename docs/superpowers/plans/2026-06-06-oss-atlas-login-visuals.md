# OSS Atlas Uploads and Login Visuals Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store Atlas uploads in private Aliyun OSS in production while adding manifest-driven login page image rotation with stable explicit themes.

**Architecture:** Atlas gets a server-side storage abstraction with `local` and `aliyun-oss` providers. Login visuals are loaded from a validated manifest URL, cached server-side, and passed into the existing auth panel with a built-in fallback.

**Tech Stack:** Next.js 14 App Router, TypeScript, Prisma, Vitest, Tailwind CSS, Aliyun OSS via `ali-oss`.

---

## File Structure

- Modify `package.json` and `package-lock.json`: add `ali-oss`.
- Modify `lib/env.ts`: add Atlas storage and login visual environment variables.
- Modify `.env.example`: document new environment variables.
- Modify `docker-compose.yml`: pass new environment variables to containers.
- Create `lib/storage/atlas-storage.ts`: storage interface, local provider, OSS provider, key helpers, provider selection.
- Modify `app/api/atlas/uploads/route.ts`: save uploads through the storage abstraction.
- Modify `app/api/atlas/uploads/[filename]/route.ts`: read images through the storage abstraction.
- Modify `app/api/atlas/route.ts`: delete images through the storage abstraction.
- Modify `app/api/atlas/elements/[elementId]/route.ts`: delete images through the storage abstraction.
- Create `lib/login-visuals.ts`: manifest schema, fetch/cache/fallback logic.
- Modify `app/page.tsx`: load login visuals server-side and pass them to `AuthPanel`.
- Modify `components/auth/AuthPanel.tsx`: render crossfading login images and CSS-variable theme values.
- Add tests under `tests/lib/atlas-storage.test.ts` and `tests/lib/login-visuals.test.ts`.

## Task 1: Add OSS Dependency and Environment Configuration

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `lib/env.ts`
- Modify: `.env.example`
- Modify: `docker-compose.yml`

- [ ] **Step 1: Install the OSS SDK**

Run:

```bash
npm install ali-oss
```

Expected: `package.json` and `package-lock.json` include `ali-oss`.

- [ ] **Step 2: Add environment schema fields**

In `lib/env.ts`, add these fields to `baseSchema` after `CHAT_LOG_DIR`:

```ts
  ATLAS_STORAGE_PROVIDER: z.enum(["local", "aliyun-oss"]).default("local"),
  ATLAS_UPLOAD_DIR: z.string().optional().default("data/atlas-uploads"),
  ALIYUN_OSS_REGION: z.string().optional().default(""),
  ALIYUN_OSS_BUCKET: z.string().optional().default(""),
  ALIYUN_OSS_ACCESS_KEY_ID: z.string().optional().default(""),
  ALIYUN_OSS_ACCESS_KEY_SECRET: z.string().optional().default(""),
  ALIYUN_OSS_ENDPOINT: z.string().optional().default(""),
  ALIYUN_OSS_PREFIX: z.string().optional().default("atlas/"),

  LOGIN_VISUALS_MANIFEST_URL: z.string().url().optional().or(z.literal("")).default(""),
  LOGIN_VISUALS_CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
```

After `const result = baseSchema.safeParse(source);` succeeds and before `return result.data;`, add provider validation:

```ts
  if (result.success && result.data.ATLAS_STORAGE_PROVIDER === "aliyun-oss") {
    const missing = [
      ["ALIYUN_OSS_REGION", result.data.ALIYUN_OSS_REGION],
      ["ALIYUN_OSS_BUCKET", result.data.ALIYUN_OSS_BUCKET],
      ["ALIYUN_OSS_ACCESS_KEY_ID", result.data.ALIYUN_OSS_ACCESS_KEY_ID],
      ["ALIYUN_OSS_ACCESS_KEY_SECRET", result.data.ALIYUN_OSS_ACCESS_KEY_SECRET],
    ].filter(([, value]) => !value);

    if (missing.length > 0 && !isBuildPhase && !isTest) {
      console.error(
        `[env] ATLAS_STORAGE_PROVIDER=aliyun-oss requires: ${missing
          .map(([key]) => key)
          .join(", ")}`
      );
      process.exit(1);
    }
  }
```

If TypeScript complains because this block appears after the existing failure branch, instead place it immediately after the failure branch and before the final `return result.data;`.

- [ ] **Step 3: Document environment variables**

Replace the Atlas section in `.env.example` with:

```env
# --- Atlas storage ---
# local: store uploads under ATLAS_UPLOAD_DIR.
# aliyun-oss: store uploads in a private Aliyun OSS bucket.
ATLAS_STORAGE_PROVIDER=local
ATLAS_UPLOAD_DIR=data/atlas-uploads

# Required when ATLAS_STORAGE_PROVIDER=aliyun-oss.
ALIYUN_OSS_REGION=
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_ENDPOINT=
ALIYUN_OSS_PREFIX=atlas/

# --- Login visuals ---
# Optional JSON manifest for public login-page image rotation.
# When empty or invalid, the app uses /images/login-bg.jpg and the built-in theme.
LOGIN_VISUALS_MANIFEST_URL=
LOGIN_VISUALS_CACHE_TTL_SECONDS=300
```

- [ ] **Step 4: Pass environment variables through Docker compose**

In `docker-compose.yml`, add these entries to `x-app-env` after `AGENT_DEBUG_ENABLED`:

```yaml
  ATLAS_STORAGE_PROVIDER: ${ATLAS_STORAGE_PROVIDER:-local}
  ATLAS_UPLOAD_DIR: ${ATLAS_UPLOAD_DIR:-data/atlas-uploads}
  ALIYUN_OSS_REGION: ${ALIYUN_OSS_REGION:-}
  ALIYUN_OSS_BUCKET: ${ALIYUN_OSS_BUCKET:-}
  ALIYUN_OSS_ACCESS_KEY_ID: ${ALIYUN_OSS_ACCESS_KEY_ID:-}
  ALIYUN_OSS_ACCESS_KEY_SECRET: ${ALIYUN_OSS_ACCESS_KEY_SECRET:-}
  ALIYUN_OSS_ENDPOINT: ${ALIYUN_OSS_ENDPOINT:-}
  ALIYUN_OSS_PREFIX: ${ALIYUN_OSS_PREFIX:-atlas/}
  LOGIN_VISUALS_MANIFEST_URL: ${LOGIN_VISUALS_MANIFEST_URL:-}
  LOGIN_VISUALS_CACHE_TTL_SECONDS: ${LOGIN_VISUALS_CACHE_TTL_SECONDS:-300}
```

- [ ] **Step 5: Verify configuration compiles**

Run:

```bash
npm test
```

Expected: existing tests pass or fail only for pre-existing unrelated reasons. If `lib/env.ts` type errors, fix the provider validation placement and rerun.

## Task 2: Add Atlas Storage Abstraction

**Files:**
- Create: `lib/storage/atlas-storage.ts`
- Create: `tests/lib/atlas-storage.test.ts`

- [ ] **Step 1: Write failing storage tests**

Create `tests/lib/atlas-storage.test.ts`:

```ts
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, afterEach, vi } from "vitest";

import {
  createLocalAtlasStorage,
  extractAtlasStorageKey,
  makeAtlasImageUrl,
  sanitizeAtlasBaseName,
} from "@/lib/storage/atlas-storage";

const tempDirs: string[] = [];

describe("atlas-storage", () => {
  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("sanitizes uploaded base names", () => {
    expect(sanitizeAtlasBaseName("hello world!*&中文")).toBe("hello_world____");
  });

  it("builds and extracts internal image URLs", () => {
    const key = "atlas/abc-photo.jpg";
    const url = makeAtlasImageUrl(key);
    expect(url).toBe("/api/atlas/uploads/atlas%2Fabc-photo.jpg");
    expect(extractAtlasStorageKey(url)).toBe(key);
    expect(extractAtlasStorageKey("https://example.com/api/atlas/uploads/atlas%2Fabc-photo.jpg")).toBe(key);
    expect(extractAtlasStorageKey("/images/login-bg.jpg")).toBeNull();
  });

  it("saves reads and deletes local images", async () => {
    const dir = await mkdtemp(join(tmpdir(), "atlas-storage-"));
    tempDirs.push(dir);

    const storage = createLocalAtlasStorage(dir);
    const input = Buffer.from("image-bytes");
    const saved = await storage.save({
      originalName: "My Photo.JPG",
      mimeType: "image/jpeg",
      buffer: input,
    });

    expect(saved.key).toMatch(/^[a-f0-9-]+-My_Photo\.jpg$/);
    expect(saved.contentType).toBe("image/jpeg");
    expect(await readFile(join(dir, saved.key), "utf8")).toBe("image-bytes");

    const read = await storage.read(saved.key);
    expect(read.contentType).toBe("image/jpeg");
    expect(read.buffer.toString("utf8")).toBe("image-bytes");

    await storage.delete(saved.key);
    await expect(storage.read(saved.key)).rejects.toMatchObject({ code: "ENOENT" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/lib/atlas-storage.test.ts
```

Expected: FAIL because `@/lib/storage/atlas-storage` does not exist.

- [ ] **Step 3: Implement the storage module**

Create `lib/storage/atlas-storage.ts`:

```ts
import { randomUUID } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";

import OSS from "ali-oss";

import { env } from "@/lib/env";

export const ATLAS_ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ATLAS_MAX_FILE_SIZE = 5 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type AtlasStorageSaveInput = {
  originalName: string;
  mimeType: string;
  buffer: Buffer;
};

export type AtlasStorageSaveResult = {
  key: string;
  contentType: string;
};

export type AtlasStorageReadResult = {
  buffer: Buffer;
  contentType: string;
};

export type AtlasStorage = {
  save(input: AtlasStorageSaveInput): Promise<AtlasStorageSaveResult>;
  read(key: string): Promise<AtlasStorageReadResult>;
  delete(key: string): Promise<void>;
};

export function sanitizeAtlasBaseName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
}

export function normalizeAtlasPrefix(prefix: string): string {
  const trimmed = prefix.trim().replace(/^\/+/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

export function makeAtlasObjectKey(originalName: string, prefix = ""): string {
  const rawExt = extname(originalName).replace(".", "").toLowerCase();
  const ext = rawExt === "jpeg" ? "jpg" : rawExt || "jpg";
  const base = sanitizeAtlasBaseName(originalName.replace(/\.[^.]+$/, ""));
  return `${normalizeAtlasPrefix(prefix)}${randomUUID()}-${base}.${ext}`;
}

export function contentTypeForKey(key: string): string {
  const ext = key.split(".").pop()?.toLowerCase() ?? "jpg";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function makeAtlasImageUrl(key: string): string {
  return `/api/atlas/uploads/${encodeURIComponent(key)}`;
}

export function extractAtlasStorageKey(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;

  try {
    const url = imageUrl.startsWith("http")
      ? new URL(imageUrl)
      : new URL(imageUrl, "http://local.invalid");
    const prefix = "/api/atlas/uploads/";
    if (!url.pathname.startsWith(prefix)) return null;
    const encoded = url.pathname.slice(prefix.length);
    if (!encoded) return null;
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

export function createLocalAtlasStorage(uploadDir: string): AtlasStorage {
  return {
    async save(input) {
      const key = makeAtlasObjectKey(input.originalName);
      await mkdir(uploadDir, { recursive: true });
      await writeFile(join(uploadDir, key), input.buffer);
      return { key, contentType: input.mimeType };
    },
    async read(key) {
      const buffer = await readFile(join(uploadDir, key));
      return { buffer, contentType: contentTypeForKey(key) };
    },
    async delete(key) {
      try {
        await unlink(join(uploadDir, key));
      } catch {
        return;
      }
    },
  };
}

export function createAliyunOssAtlasStorage(): AtlasStorage {
  const client = new OSS({
    region: env.ALIYUN_OSS_REGION,
    bucket: env.ALIYUN_OSS_BUCKET,
    accessKeyId: env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    endpoint: env.ALIYUN_OSS_ENDPOINT || undefined,
  });

  return {
    async save(input) {
      const key = makeAtlasObjectKey(input.originalName, env.ALIYUN_OSS_PREFIX);
      await client.put(key, input.buffer, {
        headers: {
          "Content-Type": input.mimeType,
        },
      });
      return { key, contentType: input.mimeType };
    },
    async read(key) {
      const result = await client.get(key);
      const content = result.content;
      const buffer = Buffer.isBuffer(content) ? content : Buffer.from(content);
      return { buffer, contentType: contentTypeForKey(key) };
    },
    async delete(key) {
      try {
        await client.delete(key);
      } catch {
        return;
      }
    },
  };
}

export function getAtlasStorage(): AtlasStorage {
  if (env.ATLAS_STORAGE_PROVIDER === "aliyun-oss") {
    return createAliyunOssAtlasStorage();
  }
  return createLocalAtlasStorage(env.ATLAS_UPLOAD_DIR);
}

export function validateAtlasImageFile(file: File): void {
  if (!ATLAS_ALLOWED_MIMES.has(file.type)) {
    throw new Error(`Unsupported file type: ${file.type}`);
  }
  if (file.size > ATLAS_MAX_FILE_SIZE) {
    throw new Error(`File too large: ${file.size} bytes (max ${ATLAS_MAX_FILE_SIZE})`);
  }
}
```

- [ ] **Step 4: Run storage tests**

Run:

```bash
npm test -- tests/lib/atlas-storage.test.ts
```

Expected: PASS. If TypeScript reports `ali-oss` import type issues, switch to `import OSS = require("ali-oss");` only in `lib/storage/atlas-storage.ts`.

- [ ] **Step 5: Commit**

Run:

```bash
git add package.json package-lock.json lib/env.ts .env.example docker-compose.yml lib/storage/atlas-storage.ts tests/lib/atlas-storage.test.ts
git commit -m "feat(atlas): add configurable image storage"
```

## Task 3: Wire Atlas Routes to Storage

**Files:**
- Modify: `app/api/atlas/uploads/route.ts`
- Modify: `app/api/atlas/uploads/[filename]/route.ts`
- Modify: `app/api/atlas/route.ts`
- Modify: `app/api/atlas/elements/[elementId]/route.ts`
- Modify or delete: `lib/atlas-upload.ts`

- [ ] **Step 1: Replace upload route storage calls**

In `app/api/atlas/uploads/route.ts`, replace the `saveUploadedImage` import:

```ts
import {
  getAtlasStorage,
  makeAtlasImageUrl,
  validateAtlasImageFile,
} from "@/lib/storage/atlas-storage";
```

Replace:

```ts
    const { filename } = await saveUploadedImage(file);

    const imageUrl = `/api/atlas/uploads/${filename}`;
```

with:

```ts
    validateAtlasImageFile(file);
    const buffer = Buffer.from(await file.arrayBuffer());
    const saved = await getAtlasStorage().save({
      originalName: file.name,
      mimeType: file.type,
      buffer,
    });

    const imageUrl = makeAtlasImageUrl(saved.key);
```

Keep the existing error handling for unsupported type and file size.

- [ ] **Step 2: Replace image read route**

Replace `app/api/atlas/uploads/[filename]/route.ts` with:

```ts
import { requireCurrentUser } from "@/lib/auth";
import { getAtlasStorage } from "@/lib/storage/atlas-storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: { filename: string } }
) {
  try {
    await requireCurrentUser();

    const key = decodeURIComponent(params.filename);
    const { buffer, contentType } = await getAtlasStorage().read(key);
    const body = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength
    ) as ArrayBuffer;

    return new Response(body, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=86400",
        "Content-Length": String(buffer.length),
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return new Response("Not found", { status: 404 });
    }
    return new Response("Internal error", { status: 500 });
  }
}
```

- [ ] **Step 3: Replace delete helpers in board clear route**

In `app/api/atlas/route.ts`, replace:

```ts
// Remove the legacy Atlas upload helper import.
```

with:

```ts
import { extractAtlasStorageKey, getAtlasStorage } from "@/lib/storage/atlas-storage";
```

Replace the cleanup loop with:

```ts
    const storage = getAtlasStorage();
    for (const el of photoElements) {
      const key = extractAtlasStorageKey(el.imageUrl);
      if (key) await storage.delete(key).catch(() => {});
    }
```

- [ ] **Step 4: Replace delete helpers in element route**

In `app/api/atlas/elements/[elementId]/route.ts`, replace:

```ts
// Remove the legacy Atlas upload helper import.
```

with:

```ts
import { extractAtlasStorageKey, getAtlasStorage } from "@/lib/storage/atlas-storage";
```

Replace the photo cleanup block with:

```ts
    if (element.type === "photo" && element.imageUrl) {
      const key = extractAtlasStorageKey(element.imageUrl);
      if (key) await getAtlasStorage().delete(key).catch(() => {});
    }
```

- [ ] **Step 5: Remove or reduce old local helper**

If no imports remain, delete `lib/atlas-upload.ts`:

```bash
rg "atlas-upload"
```

Expected: no results after deleting the file. If another file still imports it, update that import to use `lib/storage/atlas-storage.ts`.

- [ ] **Step 6: Run tests and lint**

Run:

```bash
npm test
npm run lint
```

Expected: all tests and lint pass.

- [ ] **Step 7: Commit**

Run:

```bash
git add app/api/atlas/uploads/route.ts app/api/atlas/uploads/[filename]/route.ts app/api/atlas/route.ts app/api/atlas/elements/[elementId]/route.ts lib/atlas-upload.ts
git commit -m "feat(atlas): serve uploads through storage provider"
```

If `lib/atlas-upload.ts` was deleted, `git add lib/atlas-upload.ts` stages the deletion.

## Task 4: Add Login Visual Manifest Loader

**Files:**
- Create: `lib/login-visuals.ts`
- Create: `tests/lib/login-visuals.test.ts`

- [ ] **Step 1: Write failing manifest tests**

Create `tests/lib/login-visuals.test.ts`:

```ts
import { describe, expect, it, vi, afterEach } from "vitest";

import {
  FALLBACK_LOGIN_VISUALS,
  getLoginVisualsForTest,
  loginVisualsManifestSchema,
} from "@/lib/login-visuals";

describe("login visuals", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("accepts valid manifest data", () => {
    const parsed = loginVisualsManifestSchema.parse({
      version: 1,
      intervalMs: 7000,
      items: [
        {
          id: "one",
          imageUrl: "https://cdn.example.com/login/one.jpg",
          theme: {
            accent: "#3a5b22",
            accentHover: "#2f4a1c",
            gradientFrom: "#f5f1e9",
            gradientTo: "#dbe6cf",
            overlay: "rgba(255,255,255,0.12)",
          },
        },
      ],
    });

    expect(parsed.items).toHaveLength(1);
  });

  it("rejects invalid colors", () => {
    expect(() =>
      loginVisualsManifestSchema.parse({
        version: 1,
        items: [
          {
            id: "bad",
            imageUrl: "https://cdn.example.com/login/bad.jpg",
            theme: {
              accent: "green",
              accentHover: "#2f4a1c",
              gradientFrom: "#f5f1e9",
              gradientTo: "#dbe6cf",
              overlay: "rgba(255,255,255,0.12)",
            },
          },
        ],
      })
    ).toThrow();
  });

  it("falls back when no manifest URL is configured", async () => {
    const visuals = await getLoginVisualsForTest({ manifestUrl: "" });
    expect(visuals).toEqual(FALLBACK_LOGIN_VISUALS);
  });

  it("falls back when fetch fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 });
    const visuals = await getLoginVisualsForTest({
      manifestUrl: "https://cdn.example.com/login/manifest.json",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    expect(visuals).toEqual(FALLBACK_LOGIN_VISUALS);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- tests/lib/login-visuals.test.ts
```

Expected: FAIL because `@/lib/login-visuals` does not exist.

- [ ] **Step 3: Implement manifest loader**

Create `lib/login-visuals.ts`:

```ts
import { z } from "zod";

import { env } from "@/lib/env";

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const rgbaColor = z.string().regex(/^rgba\((\d{1,3}),(\d{1,3}),(\d{1,3}),(0|0?\.\d+|1)\)$/);

export const loginVisualThemeSchema = z.object({
  accent: hexColor,
  accentHover: hexColor,
  gradientFrom: hexColor,
  gradientTo: hexColor,
  overlay: rgbaColor,
});

export const loginVisualItemSchema = z.object({
  id: z.string().min(1).max(80),
  imageUrl: z.string().url(),
  theme: loginVisualThemeSchema,
});

export const loginVisualsManifestSchema = z.object({
  version: z.literal(1),
  intervalMs: z.number().int().min(4000).max(30000).default(7000),
  items: z.array(loginVisualItemSchema).min(1).max(12),
});

export type LoginVisualsManifest = z.infer<typeof loginVisualsManifestSchema>;

export const FALLBACK_LOGIN_VISUALS: LoginVisualsManifest = {
  version: 1,
  intervalMs: 7000,
  items: [
    {
      id: "fallback",
      imageUrl: "/images/login-bg.jpg",
      theme: {
        accent: "#3a5b22",
        accentHover: "#2f4a1c",
        gradientFrom: "#f5f1e9",
        gradientTo: "#dbe6cf",
        overlay: "rgba(255,255,255,0.12)",
      },
    },
  ],
};

let cached: { expiresAt: number; value: LoginVisualsManifest } | null = null;

async function loadLoginVisuals(options: {
  manifestUrl: string;
  cacheTtlSeconds?: number;
  fetchImpl?: typeof fetch;
}): Promise<LoginVisualsManifest> {
  const manifestUrl = options.manifestUrl.trim();
  if (!manifestUrl) return FALLBACK_LOGIN_VISUALS;

  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  try {
    const fetchImpl = options.fetchImpl ?? fetch;
    const response = await fetchImpl(manifestUrl, {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Login visuals manifest failed with ${response.status}`);
    }

    const raw = await response.json();
    const parsed = loginVisualsManifestSchema.parse(raw);
    cached = {
      expiresAt: now + (options.cacheTtlSeconds ?? env.LOGIN_VISUALS_CACHE_TTL_SECONDS) * 1000,
      value: parsed,
    };
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[login-visuals] using fallback:", message);
    return FALLBACK_LOGIN_VISUALS;
  }
}

export async function getLoginVisuals(): Promise<LoginVisualsManifest> {
  return loadLoginVisuals({
    manifestUrl: env.LOGIN_VISUALS_MANIFEST_URL,
    cacheTtlSeconds: env.LOGIN_VISUALS_CACHE_TTL_SECONDS,
  });
}

export async function getLoginVisualsForTest(options: {
  manifestUrl: string;
  cacheTtlSeconds?: number;
  fetchImpl?: typeof fetch;
}): Promise<LoginVisualsManifest> {
  cached = null;
  return loadLoginVisuals(options);
}
```

- [ ] **Step 4: Run manifest tests**

Run:

```bash
npm test -- tests/lib/login-visuals.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add lib/login-visuals.ts tests/lib/login-visuals.test.ts
git commit -m "feat(auth): add login visuals manifest loader"
```

## Task 5: Wire Login Visuals into the Auth Page

**Files:**
- Modify: `app/page.tsx`
- Modify: `components/auth/AuthPanel.tsx`

- [ ] **Step 1: Load visuals on the server page**

Modify `app/page.tsx`:

```tsx
import { redirect } from "next/navigation";

import { AuthPanel } from "@/components/auth/AuthPanel";
import { getCurrentUser } from "@/lib/auth";
import { getLoginVisuals } from "@/lib/login-visuals";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/chat");
  }

  const loginVisuals = await getLoginVisuals();
  return <AuthPanel visuals={loginVisuals} />;
}
```

- [ ] **Step 2: Update AuthPanel props and state**

Replace `components/auth/AuthPanel.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import { LoginForm } from "@/components/auth/LoginForm";
import { RegisterForm } from "@/components/auth/RegisterForm";
import type { LoginVisualsManifest } from "@/lib/login-visuals";

type Mode = "login" | "register";

export function AuthPanel({ visuals }: { visuals: LoginVisualsManifest }) {
  const [mode, setMode] = useState<Mode>("login");
  const [activeIndex, setActiveIndex] = useState(0);
  const items = visuals.items.length > 0 ? visuals.items : [];
  const active = items[activeIndex] ?? items[0];

  useEffect(() => {
    if (items.length <= 1) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reducedMotion) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, visuals.intervalMs);

    return () => window.clearInterval(timer);
  }, [items.length, visuals.intervalMs]);

  useEffect(() => {
    if (items.length <= 1) return;
    const next = items[(activeIndex + 1) % items.length];
    if (!next) return;
    const image = new Image();
    image.src = next.imageUrl;
  }, [activeIndex, items]);

  const themeStyle = useMemo(
    () =>
      ({
        "--auth-accent": active.theme.accent,
        "--auth-accent-hover": active.theme.accentHover,
        "--auth-gradient-from": active.theme.gradientFrom,
        "--auth-gradient-to": active.theme.gradientTo,
        "--auth-overlay": active.theme.overlay,
      }) as React.CSSProperties,
    [active.theme]
  );

  return (
    <div className="relative flex min-h-screen w-full bg-[linear-gradient(135deg,var(--auth-gradient-from),#ffffff_45%,var(--auth-gradient-to))]" style={themeStyle}>
      <div className="absolute left-6 top-6 z-10 flex items-center gap-2.5">
        <div className="flex h-8 w-8 items-center justify-center rounded-[8px] bg-[var(--auth-accent)] text-sm font-bold text-white">
          X
        </div>
        <div>
          <p className="text-xs font-semibold leading-tight text-black">XOXO</p>
          <p className="text-[10px] font-medium leading-tight text-black/40">Meridian</p>
        </div>
      </div>

      <div className="flex flex-1 items-center justify-center px-6 lg:px-10">
        <div className="w-full max-w-[404px]">
          <div className="mb-8 flex gap-2">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`flex-1 rounded-[10px] py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                mode === "login"
                  ? "bg-[var(--auth-accent)] text-white"
                  : "border border-[#d9d9d9] bg-white/75 text-black/70 hover:bg-white focus:ring-2 focus:ring-[var(--auth-accent)]/30"
              }`}
            >
              登录
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`flex-1 rounded-[10px] py-3 text-sm font-medium transition-colors duration-200 cursor-pointer ${
                mode === "register"
                  ? "bg-[var(--auth-accent)] text-white"
                  : "border border-[#d9d9d9] bg-white/75 text-black/70 hover:bg-white focus:ring-2 focus:ring-[var(--auth-accent)]/30"
              }`}
            >
              注册
            </button>
          </div>

          <h1 className="text-[28px] font-semibold leading-tight text-black">
            {mode === "login" ? "欢迎回来！" : "创建账号"}
          </h1>
          <p className="mt-1 text-[15px] leading-relaxed text-black/60">
            {mode === "login"
              ? "输入账号信息以继续使用"
              : "填写以下信息创建你的账号"}
          </p>

          <div className="mt-6">
            {mode === "login" ? (
              <LoginForm onSwitchToRegister={() => setMode("register")} />
            ) : (
              <RegisterForm onSwitchToLogin={() => setMode("login")} />
            )}
          </div>
        </div>
      </div>

      <div className="relative hidden overflow-hidden lg:block lg:w-[42%]">
        <div className="absolute inset-0 rounded-bl-[45px] rounded-tl-[45px] bg-[linear-gradient(135deg,var(--auth-gradient-from),var(--auth-gradient-to))]" />
        {items.map((item, index) => (
          <div
            key={item.id}
            className={`absolute inset-0 rounded-bl-[45px] rounded-tl-[45px] bg-cover bg-center transition-opacity duration-700 ${
              index === activeIndex ? "opacity-100" : "opacity-0"
            }`}
            style={{ backgroundImage: `url('${item.imageUrl}')` }}
            aria-hidden="true"
          />
        ))}
        <div className="absolute inset-0 rounded-bl-[45px] rounded-tl-[45px] bg-[var(--auth-overlay)]" />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Run lint**

Run:

```bash
npm run lint
```

Expected: PASS. If Tailwind does not accept arbitrary CSS variable ring opacity classes, replace `focus:ring-[var(--auth-accent)]/30` with `focus:ring-[#3a5b22]/30` to keep focus styling stable.

- [ ] **Step 4: Commit**

Run:

```bash
git add app/page.tsx components/auth/AuthPanel.tsx
git commit -m "feat(auth): rotate manifest-driven login visuals"
```

## Task 6: Full Verification and Deployment Notes

**Files:**
- Modify: `docs/production-launch-checklist.md`

- [ ] **Step 1: Add production checklist notes**

In `docs/production-launch-checklist.md`, add a storage checklist section near the existing environment checklist:

```md
### Atlas and Login Visual Storage

- [ ] `ATLAS_STORAGE_PROVIDER` is set to `aliyun-oss` in production.
- [ ] `ALIYUN_OSS_REGION`, `ALIYUN_OSS_BUCKET`, `ALIYUN_OSS_ACCESS_KEY_ID`, and `ALIYUN_OSS_ACCESS_KEY_SECRET` are set only in server-side environment variables.
- [ ] The Atlas OSS bucket is private.
- [ ] Existing local Atlas uploads have been uploaded to the configured OSS prefix before switching providers.
- [ ] `LOGIN_VISUALS_MANIFEST_URL` points to a valid manifest or is intentionally empty to use the fallback image.
- [ ] Login visual images and manifest contain no secrets.
```

- [ ] **Step 2: Run full verification**

Run:

```bash
npm test
npm run lint
npm run build
```

Expected: all commands pass.

- [ ] **Step 3: Smoke test locally**

Run:

```bash
npm run dev
```

Open the local app and verify:

- unauthenticated homepage renders the login panel;
- fallback image appears when `LOGIN_VISUALS_MANIFEST_URL` is empty;
- login/register tab colors remain readable;
- after login, Atlas still loads existing elements;
- Atlas upload creates a photo element;
- deleting a photo removes the element without API errors.

- [ ] **Step 4: Commit verification docs**

Run:

```bash
git add docs/production-launch-checklist.md
git commit -m "docs: add OSS storage deployment checklist"
```

## Operator OSS Setup Required Before Production Switch

The application implementation depends on this external OSS setup. Complete it before setting `ATLAS_STORAGE_PROVIDER=aliyun-oss` in production.

### Atlas Private Bucket

- Create a private Aliyun OSS bucket for Atlas uploads, for example `xoxo-atlas-prod`.
- Keep the bucket ACL private. Do not use public-read for Atlas.
- Use a dedicated prefix for this app, for example `atlas/prod/`.
- If the app server runs on Alibaba Cloud in the same region, prefer the internal OSS endpoint for lower latency and private network traffic.
- If the app server runs outside Alibaba Cloud, use the public HTTPS endpoint.
- CORS is not required for Atlas because browsers never upload to or read from OSS directly. The Next.js server proxies all Atlas upload and read operations.

### Atlas RAM Access

Create a dedicated RAM user or role for the app server. Grant only the permissions needed for the Atlas prefix:

```json
{
  "Version": "1",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "oss:PutObject",
        "oss:GetObject",
        "oss:DeleteObject"
      ],
      "Resource": [
        "acs:oss:*:*:xoxo-atlas-prod/atlas/prod/*"
      ]
    }
  ]
}
```

If the migration process needs to list existing uploaded objects, temporarily add `oss:ListObjects` on the bucket resource during migration and remove it afterward.

Production environment values should look like:

```env
ATLAS_STORAGE_PROVIDER=aliyun-oss
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=xoxo-atlas-prod
ALIYUN_OSS_ACCESS_KEY_ID=your_ram_access_key_id
ALIYUN_OSS_ACCESS_KEY_SECRET=your_ram_access_key_secret
ALIYUN_OSS_ENDPOINT=https://oss-cn-hangzhou.aliyuncs.com
ALIYUN_OSS_PREFIX=atlas/prod/
```

### Login Visual Public Assets

- Create a separate public bucket or a public CDN origin for login visuals, for example `xoxo-public-prod`.
- Store login images under a stable prefix, for example `login/`.
- Store the manifest at a stable URL, for example `https://cdn.example.com/login/manifest.json`.
- The login visual bucket or CDN path may be public-read because the login page is public.
- Do not place Atlas images in this bucket or prefix.
- The manifest must not contain secrets.

Example manifest:

```json
{
  "version": 1,
  "intervalMs": 7000,
  "items": [
    {
      "id": "login-01",
      "imageUrl": "https://cdn.example.com/login/login-01.jpg",
      "theme": {
        "accent": "#3a5b22",
        "accentHover": "#2f4a1c",
        "gradientFrom": "#f5f1e9",
        "gradientTo": "#dbe6cf",
        "overlay": "rgba(255,255,255,0.12)"
      }
    }
  ]
}
```

Production environment values should include:

```env
LOGIN_VISUALS_MANIFEST_URL=https://cdn.example.com/login/manifest.json
LOGIN_VISUALS_CACHE_TTL_SECONDS=300
LOGIN_VISUALS_IMAGE_SRC=https://cdn.example.com
```

### Pre-Switch Checks

- Upload current local Atlas files to the private Atlas bucket before switching the provider.
- Confirm one uploaded Atlas object can be read by the app server using the configured RAM credentials.
- Confirm the same Atlas object is not readable anonymously from a browser.
- Confirm `manifest.json` is reachable anonymously from the production domain or by the app server.
- Confirm all `imageUrl` values in the login manifest load over HTTPS.
- Confirm `LOGIN_VISUALS_IMAGE_SRC` includes every CDN/OSS origin used by login manifest `imageUrl` values.
- Confirm the login manifest has at least one valid item before enabling rotation.

## Self-Review Checklist

- Spec coverage: Atlas private OSS, local fallback, login manifest, explicit theme config, no Agent, no database migration, deployment notes, tests.
- Placeholder scan: no unresolved placeholder markers.
- Type consistency: `LoginVisualsManifest`, `AtlasStorage`, `makeAtlasImageUrl`, and `extractAtlasStorageKey` are used consistently across tasks.
- Scope: this plan does not include a one-off migration script for existing local files. It documents the deployment sequence and keeps URL shape stable so migration can be handled operationally before switching providers.
