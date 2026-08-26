import { describe, expect, it, vi } from "vitest";

vi.mock("ali-oss", () => {
  throw new Error("ali-oss must not load for local storage");
});

describe("atlas storage provider loading", () => {
  it("does not load the optional OSS client for the local provider", async () => {
    const { getAtlasStorage } = await import("@/lib/storage/atlas-storage");

    expect(getAtlasStorage()).toMatchObject({
      save: expect.any(Function),
      read: expect.any(Function),
      delete: expect.any(Function),
    });
  });
});
