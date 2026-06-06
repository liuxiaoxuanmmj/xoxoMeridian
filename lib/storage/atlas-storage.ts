import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { dirname, extname, resolve, sep } from "node:path";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { env } from "@/lib/env";

const ATLAS_UPLOAD_ROUTE = "/api/atlas/uploads/";

export const ATLAS_ALLOWED_MIMES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const ATLAS_MAX_FILE_SIZE = 5 * 1024 * 1024;

export type AtlasStorageSaveInput = {
  key: string;
  body: Buffer;
  contentType: string;
};

export type AtlasStorageSaveResult = {
  key: string;
  contentType: string;
  size: number;
};

export type AtlasStorageReadResult = {
  body: Buffer;
  contentType: string;
};

export type AtlasStorage = {
  save(input: AtlasStorageSaveInput): Promise<AtlasStorageSaveResult>;
  read(key: string): Promise<AtlasStorageReadResult>;
  delete(key: string): Promise<void>;
};

type AliyunOssClient = {
  put(
    key: string,
    body: Buffer,
    options?: { mime?: string; headers?: Record<string, string> }
  ): Promise<unknown>;
  get(key: string): Promise<{ content: Buffer; res?: { headers?: Record<string, string> } }>;
  delete(key: string): Promise<unknown>;
};

type AliyunOssConstructor = new (options: Record<string, string>) => AliyunOssClient;

function invalidAtlasStorageKey(key: string) {
  return new Error(`Invalid atlas storage key: ${key}`);
}

function extensionForAtlasMime(contentType: string | undefined): string | null {
  switch (contentType) {
    case "image/jpeg":
      return "jpg";
    case "image/png":
      return "png";
    case "image/webp":
      return "webp";
    default:
      return null;
  }
}

function extensionForOriginalName(originalName: string): string {
  const extension = extname(originalName).replace(/^\./, "").toLowerCase();
  switch (extension) {
    case "jpg":
    case "jpeg":
      return "jpg";
    case "png":
    case "webp":
      return extension;
    default:
      return "jpg";
  }
}

export function sanitizeAtlasBaseName(name: string): string {
  return name
    .replace(/[^\x00-\x7F]+/g, "_")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
}

export function normalizeAtlasPrefix(prefix: string): string {
  const normalized = prefix
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "");

  return normalized ? `${normalized}/` : "";
}

export function normalizeAtlasStorageKey(key: string, prefix = env.ALIYUN_OSS_PREFIX): string {
  const normalizedKey = key.trim();
  const normalizedPrefix = normalizeAtlasPrefix(prefix);

  if (
    !normalizedKey ||
    normalizedKey.startsWith("/") ||
    normalizedKey.includes("\\") ||
    normalizedKey.includes("..") ||
    normalizedKey.includes("%") ||
    (normalizedPrefix &&
      (!normalizedKey.startsWith(normalizedPrefix) || normalizedKey === normalizedPrefix))
  ) {
    throw invalidAtlasStorageKey(key);
  }

  return normalizedKey;
}

export function makeAtlasObjectKey(
  originalName: string,
  prefix = env.ALIYUN_OSS_PREFIX,
  contentType?: string
): string {
  const extension = extensionForAtlasMime(contentType) ?? extensionForOriginalName(originalName);
  const baseName = originalName.replace(/\.[^.]+$/, "");
  const safeBaseName = sanitizeAtlasBaseName(baseName) || "image";

  return `${normalizeAtlasPrefix(prefix)}${randomUUID()}-${safeBaseName}.${extension}`;
}

export function contentTypeForKey(key: string): string {
  switch (extname(key).toLowerCase()) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    default:
      return "application/octet-stream";
  }
}

export function makeAtlasImageUrl(key: string): string {
  return `${ATLAS_UPLOAD_ROUTE}${encodeURIComponent(key)}`;
}

export function extractAtlasStorageKey(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) {
    return null;
  }

  try {
    const appOrigin = new URL(env.APP_BASE_URL).origin;
    const isAbsoluteUrl = /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(imageUrl) || imageUrl.startsWith("//");
    const url = new URL(imageUrl, env.APP_BASE_URL);
    if (isAbsoluteUrl && url.origin !== appOrigin) {
      return null;
    }

    if (!url.pathname.startsWith(ATLAS_UPLOAD_ROUTE)) {
      return null;
    }

    const encodedKey = url.pathname.slice(ATLAS_UPLOAD_ROUTE.length);
    return normalizeAtlasStorageKey(decodeURIComponent(encodedKey));
  } catch {
    return null;
  }
}

export function createLocalAtlasStorage(uploadDir: string): AtlasStorage {
  const root = resolve(uploadDir);

  function filepathForKey(key: string) {
    const safeKey = normalizeAtlasStorageKey(key, "");
    const filepath = resolve(root, safeKey);
    if (filepath === root || !filepath.startsWith(`${root}${sep}`)) {
      throw invalidAtlasStorageKey(key);
    }
    return { filepath, key: safeKey };
  }

  return {
    async save(input) {
      const { filepath, key } = filepathForKey(input.key);
      await mkdir(dirname(filepath), { recursive: true });
      await writeFile(filepath, input.body);

      return {
        key,
        contentType: input.contentType,
        size: input.body.length,
      };
    },

    async read(key) {
      const safeKey = filepathForKey(key);
      return {
        body: await readFile(safeKey.filepath),
        contentType: contentTypeForKey(safeKey.key),
      };
    },

    async delete(key) {
      const { filepath } = filepathForKey(key);
      try {
        await unlink(filepath);
      } catch {
        // Missing files are harmless for image cleanup.
      }
    },
  };
}

export function createAliyunOssAtlasStorage(): AtlasStorage {
  const require = createRequire(import.meta.url);
  const OssClient = require("ali-oss") as AliyunOssConstructor;
  const client = new OssClient({
    region: env.ALIYUN_OSS_REGION,
    bucket: env.ALIYUN_OSS_BUCKET,
    accessKeyId: env.ALIYUN_OSS_ACCESS_KEY_ID,
    accessKeySecret: env.ALIYUN_OSS_ACCESS_KEY_SECRET,
    ...(env.ALIYUN_OSS_ENDPOINT ? { endpoint: env.ALIYUN_OSS_ENDPOINT } : {}),
  });

  return {
    async save(input) {
      const key = normalizeAtlasStorageKey(input.key, env.ALIYUN_OSS_PREFIX);
      await client.put(key, input.body, {
        mime: input.contentType,
        headers: { "Content-Type": input.contentType },
      });

      return {
        key,
        contentType: input.contentType,
        size: input.body.length,
      };
    },

    async read(key) {
      const safeKey = normalizeAtlasStorageKey(key, env.ALIYUN_OSS_PREFIX);
      const result = await client.get(safeKey);
      return {
        body: result.content,
        contentType: result.res?.headers?.["content-type"] ?? contentTypeForKey(safeKey),
      };
    },

    async delete(key) {
      const safeKey = normalizeAtlasStorageKey(key, env.ALIYUN_OSS_PREFIX);
      try {
        await client.delete(safeKey);
      } catch {
        // OSS delete is best-effort because records may already reference missing objects.
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
