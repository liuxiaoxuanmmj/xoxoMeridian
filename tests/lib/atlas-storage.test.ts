import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATLAS_MAX_FILE_SIZE,
  contentTypeForKey,
  createLocalAtlasStorage,
  extractAtlasStorageKey,
  makeAtlasImageUrl,
  makeAtlasObjectKey,
  normalizeAtlasStorageKey,
  sanitizeAtlasBaseName,
  validateAtlasImageFile,
} from "@/lib/storage/atlas-storage";
import { env } from "@/lib/env";

const tempDirs: string[] = [];

async function makeTempDir() {
  const dir = await mkdtemp(join(tmpdir(), "atlas-storage-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("atlas-storage helpers", () => {
  it("sanitizes uploaded base names", () => {
    expect(sanitizeAtlasBaseName("hello world!*&中文")).toBe("hello_world____");
  });

  it("makes and extracts internal image URLs", () => {
    const key = "atlas/abc-photo.jpg";
    const url = makeAtlasImageUrl(key);

    expect(url).toBe("/api/atlas/uploads/atlas%2Fabc-photo.jpg");
    expect(extractAtlasStorageKey(url)).toBe(key);
    expect(extractAtlasStorageKey(`${new URL(env.APP_BASE_URL).origin}${url}`)).toBe(key);
    expect(extractAtlasStorageKey(`https://example.com${url}`)).toBeNull();
    expect(extractAtlasStorageKey("https://example.com/uploads/atlas%2Fabc-photo.jpg")).toBeNull();
    expect(extractAtlasStorageKey(null)).toBeNull();
  });

  it("rejects internal URLs outside the atlas storage prefix", () => {
    expect(extractAtlasStorageKey(makeAtlasImageUrl("other/secret.jpg"))).toBeNull();
  });

  it("returns null for malformed encoded internal URLs", () => {
    expect(extractAtlasStorageKey("/api/atlas/uploads/%E0%A4%A")).toBeNull();
  });

  it("rejects unsafe storage keys", () => {
    expect(() => normalizeAtlasStorageKey("")).toThrow("Invalid atlas storage key");
    expect(() => normalizeAtlasStorageKey("/atlas/photo.jpg")).toThrow("Invalid atlas storage key");
    expect(() => normalizeAtlasStorageKey("atlas/../photo.jpg")).toThrow("Invalid atlas storage key");
    expect(() => normalizeAtlasStorageKey("atlas\\photo.jpg")).toThrow("Invalid atlas storage key");
    expect(() => normalizeAtlasStorageKey("atlas/%E0%A4%A.jpg")).toThrow(
      "Invalid atlas storage key"
    );
  });

  it("generates and validates keys with a custom prefix", () => {
    const key = makeAtlasObjectKey("photo.tmp", "custom/atlas", "image/webp");

    expect(key).toMatch(/^custom\/atlas\/[0-9a-f-]+-photo\.webp$/);
    expect(normalizeAtlasStorageKey(key, "custom/atlas")).toBe(key);
    expect(() => normalizeAtlasStorageKey(key)).toThrow("Invalid atlas storage key");
  });

  it("uses the MIME type to choose object key extensions", () => {
    expect(makeAtlasObjectKey("photo.tmp", "atlas/", "image/png")).toMatch(/\.png$/);
    expect(makeAtlasObjectKey("photo.tmp", "atlas/", "image/jpeg")).toMatch(/\.jpg$/);
    expect(makeAtlasObjectKey("photo.tmp", "atlas/", "image/webp")).toMatch(/\.webp$/);
  });

  it("maps content types from object key extensions", () => {
    expect(contentTypeForKey("atlas/photo.jpg")).toBe("image/jpeg");
    expect(contentTypeForKey("atlas/photo.jpeg")).toBe("image/jpeg");
    expect(contentTypeForKey("atlas/photo.png")).toBe("image/png");
    expect(contentTypeForKey("atlas/photo.webp")).toBe("image/webp");
    expect(contentTypeForKey("atlas/photo.gif")).toBe("application/octet-stream");
  });
});

describe("local atlas storage", () => {
  it("saves, reads, and deletes images from a temp directory", async () => {
    const uploadDir = await makeTempDir();
    const storage = createLocalAtlasStorage(uploadDir);
    const body = Buffer.from("test image body");

    const saved = await storage.save({
      key: "atlas/test-photo.jpg",
      body,
      contentType: "image/jpeg",
    });

    expect(saved).toEqual({
      key: "atlas/test-photo.jpg",
      contentType: "image/jpeg",
      size: body.length,
    });

    await expect(storage.read("atlas/test-photo.jpg")).resolves.toEqual({
      body,
      contentType: "image/jpeg",
    });

    await storage.delete("atlas/test-photo.jpg");
    await expect(storage.read("atlas/test-photo.jpg")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects path traversal keys and does not write outside the upload directory", async () => {
    const uploadDir = await makeTempDir();
    const storage = createLocalAtlasStorage(uploadDir);
    const outsideName = `${basename(uploadDir)}-escape.jpg`;
    const outsidePath = join(uploadDir, "..", outsideName);

    await expect(
      storage.save({
        key: `../${outsideName}`,
        body: Buffer.from("escape"),
        contentType: "image/jpeg",
      })
    ).rejects.toThrow("Invalid atlas storage key");
    await expect(storage.read(`../${outsideName}`)).rejects.toThrow("Invalid atlas storage key");
    await expect(storage.delete(`../${outsideName}`)).rejects.toThrow("Invalid atlas storage key");
    await expect(access(outsidePath)).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("validateAtlasImageFile", () => {
  it("rejects unsupported MIME types", () => {
    const file = new File(["not an image"], "note.txt", { type: "text/plain" });

    expect(() => validateAtlasImageFile(file)).toThrow("Unsupported file type: text/plain");
  });

  it("rejects oversized files", () => {
    const file = {
      name: "oversized.jpg",
      type: "image/jpeg",
      size: ATLAS_MAX_FILE_SIZE + 1,
      arrayBuffer: async () => new ArrayBuffer(0),
    } as File;

    expect(() => validateAtlasImageFile(file)).toThrow(
      `File too large: ${ATLAS_MAX_FILE_SIZE + 1} bytes (max ${ATLAS_MAX_FILE_SIZE})`
    );
  });
});
