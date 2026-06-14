import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  atlasBoard: {
    upsert: vi.fn(),
  },
  atlasElement: {
    findMany: vi.fn(),
    createMany: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

describe("home-board helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts the home board idempotently", async () => {
    mockPrisma.atlasBoard.upsert.mockResolvedValueOnce({ id: "home-board" });

    const { getOrCreateHomeBoard } = await import("@/lib/home-board");

    await expect(getOrCreateHomeBoard()).resolves.toEqual({ id: "home-board" });
    expect(mockPrisma.atlasBoard.upsert).toHaveBeenCalledWith({
      where: { id: "home-board" },
      update: {},
      create: { id: "home-board" },
    });
  });

  it("creates missing post-linked elements without duplicating existing ones", async () => {
    mockPrisma.atlasElement.findMany.mockResolvedValueOnce([
      { id: "el-1", postId: "post-1" },
    ]);
    mockPrisma.atlasElement.createMany.mockResolvedValueOnce({ count: 1 });

    const { ensureHomePostElements } = await import("@/lib/home-board");

    await ensureHomePostElements({
      boardId: "home-board",
      posts: [
        { id: "post-1", authorId: "user-1" },
        { id: "post-2", authorId: "user-2" },
      ],
    });

    expect(mockPrisma.atlasElement.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          boardId: "home-board",
          type: "note",
          postId: "post-2",
          createdById: "user-2",
          x: 0,
          y: 0,
          width: 320,
          height: 180,
        }),
      ],
      skipDuplicates: true,
    });
  });
});
