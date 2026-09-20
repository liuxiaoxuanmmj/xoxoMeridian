import { beforeEach, describe, expect, it, vi } from "vitest";

const mockPrisma = {
  atlasBoard: {
    upsert: vi.fn(),
  },
  atlasElement: {
    findMany: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
  },
  post: {
    findUnique: vi.fn(),
  },
};

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

function foreignKeyViolation() {
  return Object.assign(new Error("Foreign key constraint violated"), { code: "P2003" });
}

async function loadHomeBoard() {
  return import("@/lib/home-board");
}

describe("home-board helpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("upserts the home board idempotently", async () => {
    mockPrisma.atlasBoard.upsert.mockResolvedValueOnce({ id: "home-board" });

    const { getOrCreateHomeBoard } = await loadHomeBoard();

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

    const { ensureHomePostElements } = await loadHomeBoard();

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
    expect(mockPrisma.atlasElement.create).not.toHaveBeenCalled();
  });

  it("anchors the surviving posts when a post disappears before the batch insert", async () => {
    mockPrisma.atlasElement.findMany.mockResolvedValueOnce([]);
    mockPrisma.atlasElement.createMany.mockRejectedValueOnce(foreignKeyViolation());
    mockPrisma.atlasElement.create.mockImplementation(async ({ data }) => {
      if (data.postId === "post-deleted") throw foreignKeyViolation();
      return { id: `el-${data.postId}` };
    });
    mockPrisma.post.findUnique.mockImplementation(async ({ where }) => {
      return where.id === "post-deleted" ? null : { id: where.id };
    });

    const { ensureHomePostElements } = await loadHomeBoard();

    await expect(
      ensureHomePostElements({
        boardId: "home-board",
        posts: [
          { id: "post-deleted", authorId: "user-1" },
          { id: "post-live", authorId: "user-1" },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(mockPrisma.atlasElement.create).toHaveBeenCalledTimes(2);
    expect(mockPrisma.atlasElement.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({ postId: "post-deleted" }),
    });
    expect(mockPrisma.atlasElement.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({ postId: "post-live" }),
    });
    expect(mockPrisma.post.findUnique).toHaveBeenCalledWith({
      where: { id: "post-deleted" },
      select: { id: true },
    });
  });

  it("keeps the backfill idempotent when another home request already anchored a post", async () => {
    mockPrisma.atlasElement.findMany.mockResolvedValueOnce([]);
    mockPrisma.atlasElement.createMany.mockRejectedValueOnce(foreignKeyViolation());
    mockPrisma.atlasElement.create.mockImplementation(async ({ data }) => {
      if (data.postId === "post-race") {
        throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
      }
      return { id: `el-${data.postId}` };
    });

    const { ensureHomePostElements } = await loadHomeBoard();

    await expect(
      ensureHomePostElements({
        boardId: "home-board",
        posts: [
          { id: "post-race", authorId: "user-1" },
          { id: "post-live", authorId: "user-1" },
        ],
      }),
    ).resolves.toBeUndefined();

    expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
    expect(mockPrisma.atlasElement.create).toHaveBeenCalledTimes(2);
  });

  it("rethrows a foreign key violation that is not explained by a deleted post", async () => {
    mockPrisma.atlasElement.findMany.mockResolvedValueOnce([]);
    mockPrisma.atlasElement.createMany.mockRejectedValueOnce(foreignKeyViolation());
    mockPrisma.atlasElement.create.mockRejectedValue(foreignKeyViolation());
    mockPrisma.post.findUnique.mockResolvedValue({ id: "post-1" });

    const { ensureHomePostElements } = await loadHomeBoard();

    await expect(
      ensureHomePostElements({
        boardId: "home-board",
        posts: [{ id: "post-1", authorId: "user-1" }],
      }),
    ).rejects.toMatchObject({ code: "P2003" });
  });

  it("rethrows database errors that are not conflict violations", async () => {
    const outage = Object.assign(new Error("Can't reach database server"), { code: "P1001" });
    mockPrisma.atlasElement.findMany.mockResolvedValueOnce([]);
    mockPrisma.atlasElement.createMany.mockRejectedValueOnce(outage);

    const { ensureHomePostElements } = await loadHomeBoard();

    await expect(
      ensureHomePostElements({
        boardId: "home-board",
        posts: [{ id: "post-1", authorId: "user-1" }],
      }),
    ).rejects.toBe(outage);
    expect(mockPrisma.atlasElement.create).not.toHaveBeenCalled();
  });
});
