import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockPostFindMany, mockPostFindUnique, mockPostCreate, mockPostUpdate, mockPostDelete } = vi.hoisted(() => ({
  mockPostFindMany: vi.fn(),
  mockPostFindUnique: vi.fn(),
  mockPostCreate: vi.fn(),
  mockPostUpdate: vi.fn(),
  mockPostDelete: vi.fn(),
}));

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    post: {
      findMany: mockPostFindMany,
      findUnique: mockPostFindUnique,
      create: mockPostCreate,
      update: mockPostUpdate,
      delete: mockPostDelete,
    },
  },
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { GET, POST } from "@/app/api/posts/route";
import { GET as GET_POST_DETAIL } from "@/app/api/posts/[slug]/route";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/posts", () => {
  it("requires authentication", async () => {
    mockRequireCurrentUser.mockRejectedValue(new Response("Unauthorized", { status: 401 }));
    const response = await GET(new Request("http://localhost/api/posts"));
    expect(response.status).toBe(401);
  });

  it("returns posts with author info", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockPostFindMany.mockResolvedValue([
      {
        id: "post-1",
        slug: "hello-world",
        title: "Hello World",
        content: "Test content",
        type: "user_post",
        authorId: "user-1",
        publishedAt: new Date(),
        author: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      },
    ]);

    const response = await GET(new Request("http://localhost/api/posts"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.posts).toHaveLength(1);
    expect(body.posts[0].slug).toBe("hello-world");
  });

  it("respects type filter", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockPostFindMany.mockResolvedValue([]);

    const response = await GET(new Request("http://localhost/api/posts?type=agent_log"));
    expect(response.status).toBe(200);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { type: "agent_log" } })
    );
  });
});

describe("POST /api/posts", () => {
  it("requires title and content", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    const response = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ title: "", content: "" }),
      })
    );
    expect(response.status).toBe(400);
  });

  it("creates a post with generated slug", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockPostFindUnique.mockResolvedValue(null);
    mockPostCreate.mockResolvedValue({
      id: "post-new",
      slug: "my-first-post",
      title: "My First Post",
      content: "Hello world",
      type: "user_post",
      authorId: "user-1",
    });

    const response = await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ title: "My First Post", content: "Hello world" }),
      })
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.post.slug).toBe("my-first-post");
  });

  it("writes authorCity, authorCountry, authorTimezone from user profile on create", async () => {
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      profile: { city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo" },
    });
    mockPostFindUnique.mockResolvedValue(null);
    mockPostCreate.mockResolvedValue({
      id: "post-new",
      slug: "hello",
      title: "Hello",
      content: "World",
      type: "user_post",
      authorId: "user-1",
      authorCity: "Tokyo",
      authorCountry: "Japan",
      authorTimezone: "Asia/Tokyo",
    });

    await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ title: "Hello", content: "World" }),
      })
    );

    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorCity: "Tokyo",
          authorCountry: "Japan",
          authorTimezone: "Asia/Tokyo",
        }),
      })
    );
  });

  it("writes null location fields when user has no profile", async () => {
    mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
    mockPostFindUnique.mockResolvedValue(null);
    mockPostCreate.mockResolvedValue({
      id: "post-new",
      slug: "hello",
      title: "Hello",
      content: "World",
      type: "user_post",
      authorId: "user-1",
    });

    await POST(
      new Request("http://localhost/api/posts", {
        method: "POST",
        body: JSON.stringify({ title: "Hello", content: "World" }),
      })
    );

    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          authorCity: null,
          authorCountry: null,
          authorTimezone: null,
        }),
      })
    );
  });
});

describe("GET /api/posts?q= search", () => {
    it("adds OR condition for title and content when q is present", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
      mockPostFindMany.mockResolvedValue([]);

      await GET(new Request("http://localhost/api/posts?q=docker"));

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            OR: [
              { title: { contains: "docker", mode: "insensitive" } },
              { content: { contains: "docker", mode: "insensitive" } },
            ],
          },
        })
      );
    });

    it("treats empty q same as no q", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
      mockPostFindMany.mockResolvedValue([]);

      await GET(new Request("http://localhost/api/posts?q="));

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it("treats whitespace-only q same as no q", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
      mockPostFindMany.mockResolvedValue([]);

      await GET(new Request("http://localhost/api/posts?q=   "));

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: {} })
      );
    });

    it("combines q with type filter", async () => {
      mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
      mockPostFindMany.mockResolvedValue([]);

      await GET(new Request("http://localhost/api/posts?q=docker&type=user_post"));

      expect(mockPostFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            type: "user_post",
            OR: [
              { title: { contains: "docker", mode: "insensitive" } },
              { content: { contains: "docker", mode: "insensitive" } },
            ],
          },
        })
      );
    });
  });

  describe("GET /api/posts/[slug]", () => {
  it("requires authentication before loading post details", async () => {
    mockRequireCurrentUser.mockRejectedValue(new Response("Unauthorized", { status: 401 }));

    const response = await GET_POST_DETAIL(
      new Request("http://localhost/api/posts/private-post"),
      { params: { slug: "private-post" } }
    );

    expect(response.status).toBe(401);
    expect(mockPostFindUnique).not.toHaveBeenCalled();
  });
});
