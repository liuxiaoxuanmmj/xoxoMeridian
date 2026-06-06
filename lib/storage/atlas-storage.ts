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

export function makeAtlasObjectKey(originalName: string, prefix = "atlas/"): string {
  const extension = extname(originalName).replace(/^\./, "").toLowerCase() || "jpg";
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
    const url = new URL(imageUrl, "http://internal.local");
    if (!url.pathname.startsWith(ATLAS_UPLOAD_ROUTE)) {
      return null;
    }

    const encodedKey = url.pathname.slice(ATLAS_UPLOAD_ROUTE.length);
    return encodedKey ? decodeURIComponent(encodedKey) : null;
  } catch {
    return null;
  }
}

export function createLocalAtlasStorage(uploadDir: string): AtlasStorage {
  const root = resolve(uploadDir);

  function filepathForKey(key: string) {
    const filepath = resolve(root, key);
    if (filepath !== root && !filepath.startsWith(`${root}${sep}`)) {
      throw new Error(`Invalid atlas storage key: ${key}`);
    }
    return filepath;
  }

  return {
    async save(input) {
      const filepath = filepathForKey(input.key);
      await mkdir(dirname(filepath), { recursive: true });
      await writeFile(filepath, input.body);

      return {
        key: input.key,
        contentType: input.contentType,
        size: input.body.length,
      };
    },

    async read(key) {
      return {
        body: await readFile(filepathForKey(key)),
        contentType: contentTypeForKey(key),
      };
    },

    async delete(key) {
      try {
        await unlink(filepathForKey(key));
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
      await client.put(input.key, input.body, {
        mime: input.contentType,
        headers: { "Content-Type": input.contentType },
      });

      return {
        key: input.key,
        contentType: input.contentType,
        size: input.body.length,
      };
    },

    async read(key) {
      const result = await client.get(key);
      return {
        body: result.content,
        contentType: result.res?.headers?.["content-type"] ?? contentTypeForKey(key),
      };
    },

    async delete(key) {
      try {
        await client.delete(key);
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
