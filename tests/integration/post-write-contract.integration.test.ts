import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ currentUserId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.currentUserId })),
  getCurrentUser: vi.fn(async () => ({ id: authState.currentUserId })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createPost as createPostAction, deletePost as deletePostAction } from "@/app/actions/posts";
import { POST as createPostRoute } from "@/app/api/posts/route";
import { PUT as updatePostRoute } from "@/app/api/posts/[slug]/route";
import { generateSlug } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import { createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

const CONTENT_MAX = 20_000;

function postRequest(body: unknown) {
  return createPostRoute(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

function putRequest(slug: string, body: unknown) {
  return updatePostRoute(
    new Request(`http://localhost/api/posts/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug }) }
  );
}

async function createPostFixture(userId: string, slug: string, title: string, content: string) {
  return prisma.post.create({
    data: {
      slug,
      title,
      content,
      type: "user_post",
      authorId: userId,
      publishedAt: new Date("2026-09-20T00:00:00Z"),
    },
  });
}

beforeEach(async () => {
  authState.currentUserId = "";
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Post 写入契约在真实 PostgreSQL 上的持久化边界", () => {
  it("畸形 body 不写库并返回验证错误（旧实现为 500）", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    const response = await postRequest({ title: { text: "Alpha" }, content: "正文" });

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "Invalid request" });
    await expect(prisma.post.count()).resolves.toBe(0);
  });

  it("只填空格的创建不写库", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    const response = await postRequest({ title: "   ", content: "  " });

    expect(response.status).toBe(400);
    await expect(prisma.post.count()).resolves.toBe(0);
  });

  it("超长正文不写库，边界长度可创建", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    const rejected = await postRequest({ title: "边界正文", content: "b".repeat(CONTENT_MAX + 1) });
    expect(rejected.status).toBe(400);
    await expect(prisma.post.count()).resolves.toBe(0);

    const accepted = await postRequest({ title: "边界正文", content: "b".repeat(CONTENT_MAX) });
    expect(accepted.status).toBe(200);
    const stored = await prisma.post.findFirstOrThrow({ select: { content: true } });
    expect(stored.content).toHaveLength(CONTENT_MAX);
  });

  it("只填空格的更新不改变数据库行（含 slug 与 updatedAt）", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const before = await createPostFixture(user.id, "alpha", "Alpha", "既有正文");

    const response = await putRequest("alpha", { title: "  ", content: "   " });

    expect(response.status).toBe(400);
    const after = await prisma.post.findUniqueOrThrow({ where: { id: before.id } });
    expect(after).toEqual(before);
    await expect(prisma.post.count()).resolves.toBe(1);
  });

  it("非字符串字段的更新不改变数据库行", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const before = await createPostFixture(user.id, "beta", "Beta", "既有正文");

    const response = await putRequest("beta", { title: 42 });

    expect(response.status).toBe(400);
    await expect(prisma.post.findUniqueOrThrow({ where: { id: before.id } })).resolves.toEqual(before);
  });

  it("合法中文与 Markdown 以 trim 后的值创建并更新，slug 保持产品规则", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    const created = await postRequest({ title: "  中文标题  ", content: "  # 标题\n\n正文段落  " });
    expect(created.status).toBe(200);

    const post = await prisma.post.findFirstOrThrow();
    expect(post).toMatchObject({
      slug: generateSlug("中文标题"),
      title: "中文标题",
      content: "# 标题\n\n正文段落",
      type: "user_post",
      authorId: user.id,
    });

    const updated = await putRequest(post.slug, { content: "  ## 新正文  " });
    expect(updated.status).toBe(200);

    const after = await prisma.post.findUniqueOrThrow({ where: { id: post.id } });
    expect(after).toMatchObject({
      slug: post.slug,
      title: "中文标题",
      content: "## 新正文",
      updatedAt: expect.any(Date),
    });
    await expect(prisma.post.count()).resolves.toBe(1);
  });

  it("Server Action 与 HTTP Route 使用同一契约：非法输入不写库，合法输入正常创建", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    await expect(createPostAction("   ", "正文")).resolves.toEqual({ error: "Title is required" });
    await expect(createPostAction(42 as unknown as string, "正文")).resolves.toEqual({
      error: "Title must be text",
    });
    await expect(prisma.post.count()).resolves.toBe(0);

    const created = await createPostAction("  中文标题  ", "  # 正文  ");
    expect(created).toHaveProperty("post.slug", generateSlug("中文标题"));
    const stored = await prisma.post.findFirstOrThrow();
    expect(stored).toMatchObject({ title: "中文标题", content: "# 正文" });
  });

  it("Server Action 的非法 slug 不查询也不删除既有文章", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const post = await createPostFixture(user.id, "gamma", "Gamma", "既有正文");

    await expect(deletePostAction(42 as unknown as string)).resolves.toEqual({
      error: "Post slug must be text",
    });

    await expect(prisma.post.findUniqueOrThrow({ where: { id: post.id } })).resolves.toEqual(post);
    await expect(prisma.post.count()).resolves.toBe(1);
  });
});
