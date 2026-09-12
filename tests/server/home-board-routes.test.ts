import { beforeEach, describe, expect, it, vi } from "vitest";

const mockUser = { id: "user-1" };
const mockBoard = { id: "home-board" };

const mockStorage = {
  save: vi.fn(),
  read: vi.fn(),
  delete: vi.fn(),
};

const mockPrisma = {
  atlasElement: {
    count: vi.fn(),
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  atlasConnection: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
  },
};

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => mockUser),
}));

vi.mock("@/lib/home-board", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/home-board")>();
  return {
    ...actual,
    getOrCreateHomeBoard: vi.fn(async () => mockBoard),
  };
});

vi.mock("@/lib/prisma", () => ({
  prisma: mockPrisma,
}));

vi.mock("@/lib/storage/atlas-storage", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/storage/atlas-storage")>();
  return {
    ...actual,
    getAtlasStorage: vi.fn(() => mockStorage),
  };
});

describe("home-board routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStorage.save.mockResolvedValue({
      key: "atlas/home-photo.jpg",
      contentType: "image/jpeg",
      size: 10,
    });
    mockStorage.delete.mockResolvedValue(undefined);
    mockPrisma.atlasElement.count.mockResolvedValue(0);
    mockPrisma.atlasElement.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "photo-1",
      ...data,
    }));
    mockPrisma.atlasElement.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "photo-1",
      boardId: "home-board",
      ...data,
    }));
    mockPrisma.atlasConnection.findFirst.mockResolvedValue(null);
  });

  it("uploads a home photo into the home board with size metadata", async () => {
    const { POST } = await import("@/app/api/home-board/uploads/route");
    const formData = new FormData();
    formData.set("file", new File(["image-body"], "photo.jpg", { type: "image/jpeg" }));
    formData.set("x", "12");
    formData.set("y", "34");
    formData.set("width", "280");
    formData.set("height", "210");
    formData.set("caption", "linen");

    const response = await POST(new Request("http://localhost/api/home-board/uploads", {
      method: "POST",
      body: formData,
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mockPrisma.atlasElement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        boardId: "home-board",
        type: "photo",
        x: 12,
        y: 34,
        width: 280,
        height: 210,
        imageUrl: "/api/atlas/uploads/atlas%2Fhome-photo.jpg",
        caption: "linen",
        createdById: "user-1",
      }),
    });
    expect(payload.element.width).toBe(280);
  });

  it("preserves submitted portrait display dimensions for uploaded home photos", async () => {
    const { POST } = await import("@/app/api/home-board/uploads/route");
    const formData = new FormData();
    formData.set("file", new File(["image-body"], "portrait.jpg", { type: "image/jpeg" }));
    formData.set("x", "40");
    formData.set("y", "80");
    formData.set("width", "180");
    formData.set("height", "240");

    const response = await POST(new Request("http://localhost/api/home-board/uploads", {
      method: "POST",
      body: formData,
    }));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(mockPrisma.atlasElement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        boardId: "home-board",
        type: "photo",
        x: 40,
        y: 80,
        width: 180,
        height: 240,
        imageUrl: "/api/atlas/uploads/atlas%2Fhome-photo.jpg",
        caption: null,
        createdById: "user-1",
      }),
    });
    expect(payload.element.width).toBe(180);
    expect(payload.element.height).toBe(240);
  });

  it("patches only elements that belong to home board", async () => {
    mockPrisma.atlasElement.findFirst.mockResolvedValueOnce({
      id: "photo-1",
      boardId: "home-board",
      type: "photo",
    });

    const { PATCH } = await import("@/app/api/home-board/elements/[elementId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/home-board/elements/photo-1", {
        method: "PATCH",
        body: JSON.stringify({ width: 360, height: 270 }),
      }),
      { params: Promise.resolve({ elementId: "photo-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.atlasElement.update).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "photo-1" }),
      data: { width: 360, height: 270 },
    });
  });

  it("rejects patching an element outside the caller's home access scope", async () => {
    mockPrisma.atlasElement.findFirst.mockResolvedValueOnce(null);

    const { PATCH } = await import("@/app/api/home-board/elements/[elementId]/route");
    const response = await PATCH(
      new Request("http://localhost/api/home-board/elements/atlas-photo", {
        method: "PATCH",
        body: JSON.stringify({ width: 360 }),
      }),
      { params: Promise.resolve({ elementId: "atlas-photo" }) }
    );

    expect(response.status).toBe(404);
    expect(mockPrisma.atlasElement.update).not.toHaveBeenCalled();
  });

  it("creates a connection only when both elements belong to home board and pair is allowed", async () => {
    mockPrisma.atlasElement.findFirst
      .mockResolvedValueOnce({ id: "post-el", boardId: "home-board", type: "note", postId: "post-1" })
      .mockResolvedValueOnce({ id: "photo-el", boardId: "home-board", type: "photo", postId: null });
    mockPrisma.atlasConnection.create.mockResolvedValueOnce({
      id: "conn-1",
      boardId: "home-board",
      fromId: "post-el",
      toId: "photo-el",
      color: "#668a5b",
    });

    const { POST } = await import("@/app/api/home-board/connections/route");
    const response = await POST(new Request("http://localhost/api/home-board/connections", {
      method: "POST",
      body: JSON.stringify({ fromId: "post-el", toId: "photo-el" }),
    }));

    expect(response.status).toBe(201);
    expect(mockPrisma.atlasConnection.create).toHaveBeenCalledWith({
      data: {
        board: { connect: { id: "home-board" } },
        fromEl: { connect: expect.objectContaining({ id: "post-el" }) },
        toEl: { connect: expect.objectContaining({ id: "photo-el" }) },
        color: "#668a5b",
      },
    });
  });

  it("rejects reversed duplicate connections", async () => {
    mockPrisma.atlasElement.findFirst
      .mockResolvedValueOnce({ id: "photo-el", boardId: "home-board", type: "photo", postId: null })
      .mockResolvedValueOnce({ id: "post-el", boardId: "home-board", type: "note", postId: "post-1" });
    mockPrisma.atlasConnection.findFirst.mockResolvedValueOnce({
      id: "conn-1",
      boardId: "home-board",
      fromId: "post-el",
      toId: "photo-el",
    });

    const { POST } = await import("@/app/api/home-board/connections/route");
    const response = await POST(new Request("http://localhost/api/home-board/connections", {
      method: "POST",
      body: JSON.stringify({ fromId: "photo-el", toId: "post-el" }),
    }));

    expect(response.status).toBe(409);
    expect(mockPrisma.atlasConnection.create).not.toHaveBeenCalled();
  });

  it("deletes a home photo and cleans uploaded storage", async () => {
    mockPrisma.atlasElement.findFirst.mockResolvedValueOnce({
      id: "photo-1",
      boardId: "home-board",
      type: "photo",
      postId: null,
      imageUrl: "/api/atlas/uploads/atlas%2Fhome-photo.jpg",
    });
    mockPrisma.atlasElement.delete.mockResolvedValueOnce({ id: "photo-1" });

    const { DELETE } = await import("@/app/api/home-board/elements/[elementId]/route");
    const response = await DELETE(
      new Request("http://localhost/api/home-board/elements/photo-1", { method: "DELETE" }),
      { params: Promise.resolve({ elementId: "photo-1" }) }
    );

    expect(response.status).toBe(200);
    expect(mockPrisma.atlasElement.delete).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: "photo-1" }),
    });
    expect(mockStorage.delete).toHaveBeenCalledWith("atlas/home-photo.jpg");
  });

  it("does not delete post anchor elements through the photo endpoint", async () => {
    mockPrisma.atlasElement.findFirst.mockResolvedValueOnce({
      id: "post-el",
      boardId: "home-board",
      type: "note",
      postId: "post-1",
      imageUrl: null,
    });

    const { DELETE } = await import("@/app/api/home-board/elements/[elementId]/route");
    const response = await DELETE(
      new Request("http://localhost/api/home-board/elements/post-el", { method: "DELETE" }),
      { params: Promise.resolve({ elementId: "post-el" }) }
    );

    expect(response.status).toBe(400);
    expect(mockPrisma.atlasElement.delete).not.toHaveBeenCalled();
  });
});
