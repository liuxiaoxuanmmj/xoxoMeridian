import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ATLAS_MAX_FILE_SIZE,
  AtlasImageValidationError,
  contentTypeForKey,
  createLocalAtlasStorage,
  detectAtlasImageFormat,
  extractAtlasStorageKey,
  makeAtlasImageUrl,
  makeAtlasObjectKey,
  normalizeAtlasStorageKey,
  sanitizeAtlasBaseName,
  validateAtlasImageContent,
  validateAtlasImageFile,
} from "@/lib/storage/atlas-storage";
import { env } from "@/lib/env";
import {
  JPEG_HEADER_ONLY_WITH_EOI,
  JPEG_WITHOUT_EOI,
  MINIMAL_JPEG,
  MINIMAL_PNG,
  MINIMAL_WEBP,
  PNG_WITHOUT_IEND,
  VALID_IMAGE_FIXTURES,
  WEBP_TRUNCATED_RIFF,
} from "@/tests/fixtures/image-bytes";

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
    expect(extractAtlasStorageKey(` https://example.com${url}`)).toBeNull();
    expect(extractAtlasStorageKey(`\n\thttps://example.com${url}`)).toBeNull();
    expect(extractAtlasStorageKey(`/\\example.com${url}`)).toBeNull();
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
  it("saves upload inputs by generating a secure atlas key", async () => {
    const uploadDir = await makeTempDir();
    const storage = createLocalAtlasStorage(uploadDir);
    const buffer = Buffer.from("upload image body");

    const saved = await storage.save({
      originalName: "photo.tmp",
      mimeType: "image/webp",
      buffer,
    });

    expect(saved).toEqual({
      key: expect.stringMatching(/^atlas\/[0-9a-f-]+-photo\.webp$/),
      contentType: "image/webp",
      size: buffer.length,
    });
    await expect(storage.read(saved.key)).resolves.toEqual({
      body: buffer,
      contentType: "image/webp",
    });
  });

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

  it("rejects slash keys when no storage prefix is configured", async () => {
    const uploadDir = await makeTempDir();
    const storage = createLocalAtlasStorage(uploadDir, "");

    await expect(storage.read("other/file.jpg")).rejects.toThrow("Invalid atlas storage key");
    await expect(storage.delete("other/file.jpg")).rejects.toThrow("Invalid atlas storage key");
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

  it("throws a typed error so upload routes can map it to a 400", () => {
    const file = new File(["not an image"], "note.txt", { type: "text/plain" });
    let caught: unknown;

    try {
      validateAtlasImageFile(file);
    } catch (error) {
      caught = error;
    }

    // 断言错误类型本身：路由的 catch 分支按 instanceof 判断，文案匹配会随措辞漂移。
    expect(caught).toBeInstanceOf(AtlasImageValidationError);
    expect((caught as Error).name).toBe("AtlasImageValidationError");
  });
});

describe("validateAtlasImageContent", () => {
  it("detects the three allowed formats from their bytes alone", () => {
    expect(detectAtlasImageFormat(MINIMAL_JPEG)).toBe("image/jpeg");
    expect(detectAtlasImageFormat(MINIMAL_PNG)).toBe("image/png");
    expect(detectAtlasImageFormat(MINIMAL_WEBP)).toBe("image/webp");

    for (const { mimeType, bytes } of VALID_IMAGE_FIXTURES) {
      expect(validateAtlasImageContent(bytes)).toBe(mimeType);
    }
  });

  it("rejects content that is not an image at all", () => {
    const forged = Buffer.from("this is definitely not an image");

    expect(detectAtlasImageFormat(forged)).toBeNull();
    expect(() => validateAtlasImageContent(forged)).toThrow(AtlasImageValidationError);
    expect(() => validateAtlasImageContent(forged)).toThrow(
      "Unsupported image content (expected JPEG, PNG or WebP)"
    );
  });

  it("rejects truncated images that still carry a valid header", () => {
    expect(detectAtlasImageFormat(JPEG_WITHOUT_EOI)).toBeNull();
    expect(detectAtlasImageFormat(PNG_WITHOUT_IEND)).toBeNull();
    expect(detectAtlasImageFormat(WEBP_TRUNCATED_RIFF)).toBeNull();
  });

  it("accepts a well-formed header even without decodable pixel data", () => {
    // 已知边界：契约是 magic bytes + 结构完整性，不是完整解码。
    // 这里固定现状，避免后来者把「通过校验」误读成「一定能渲染」；
    // 若要提升为可解码性校验，必须同时更新本用例与 QAM-06 报告。
    expect(validateAtlasImageContent(JPEG_HEADER_ONLY_WITH_EOI)).toBe("image/jpeg");
  });

  it("rejects payloads that only mimic the leading magic bytes", () => {
    expect(detectAtlasImageFormat(Buffer.from([0xff, 0xd8, 0xff, 0x00]))).toBeNull();
    expect(
      detectAtlasImageFormat(Buffer.concat([MINIMAL_PNG.subarray(0, 8), Buffer.from("garbage")]))
    ).toBeNull();
    expect(
      detectAtlasImageFormat(
        Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x0c, 0, 0, 0]), Buffer.from("WEBPGIF89a")])
      )
    ).toBeNull();
  });

  it("rejects empty and single-byte uploads", () => {
    expect(detectAtlasImageFormat(Buffer.alloc(0))).toBeNull();
    expect(detectAtlasImageFormat(Buffer.from([0xff]))).toBeNull();
    expect(detectAtlasImageFormat(Buffer.from([0x89]))).toBeNull();
  });
});
