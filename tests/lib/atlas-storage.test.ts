import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATLAS_MAX_FILE_SIZE,
  contentTypeForKey,
  createLocalAtlasStorage,
  extractAtlasStorageKey,
  makeAtlasImageUrl,
  sanitizeAtlasBaseName,
  validateAtlasImageFile,
} from "@/lib/storage/atlas-storage";

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
    expect(extractAtlasStorageKey(`https://example.com${url}`)).toBe(key);
    expect(extractAtlasStorageKey("https://example.com/uploads/atlas%2Fabc-photo.jpg")).toBeNull();
    expect(extractAtlasStorageKey(null)).toBeNull();
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
