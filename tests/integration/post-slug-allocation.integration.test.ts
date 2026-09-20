import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ currentUserId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.currentUserId })),
  getCurrentUser: vi.fn(async () => ({ id: authState.currentUserId })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createPost as createPostAction, updatePost as updatePostAction } from "@/app/actions/posts";
import { POST as createPostRoute } from "@/app/api/posts/route";
import { PUT as updatePostRoute } from "@/app/api/posts/[slug]/route";
import { createAgentLogPost } from "@/lib/agent-posts";
import { generateSlug } from "@/lib/posts";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const POST_INSERT_DELAY_TRIGGER = "delay_concurrent_post_slug_insert";
const POST_INSERT_DELAY_FUNCTION = "delay_concurrent_post_slug_insert";
const POST_UPDATE_DELAY_TRIGGER = "delay_concurrent_post_slug_update";
const POST_UPDATE_DELAY_FUNCTION = "delay_concurrent_post_slug_update";

// 0.5s 与 session-issuance 的并发夹具一致：足以让两个请求都越过“检查”阶段后再写唯一索引。
async function delayPostWrites(event: "INSERT" | "UPDATE", seconds = 0.5) {
  const functionName =
    event === "INSERT" ? POST_INSERT_DELAY_FUNCTION : POST_UPDATE_DELAY_FUNCTION;
  const triggerName = event === "INSERT" ? POST_INSERT_DELAY_TRIGGER : POST_UPDATE_DELAY_TRIGGER;
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${functionName}() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_sleep(${seconds});
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${triggerName}
    BEFORE ${event} ON "Post"
    FOR EACH ROW EXECUTE FUNCTION ${functionName}()
  `);
}

async function dropPostWriteDelay(event: "INSERT" | "UPDATE") {
  const functionName =
    event === "INSERT" ? POST_INSERT_DELAY_FUNCTION : POST_UPDATE_DELAY_FUNCTION;
  const triggerName = event === "INSERT" ? POST_INSERT_DELAY_TRIGGER : POST_UPDATE_DELAY_TRIGGER;
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS ${triggerName} ON "Post"`);
  await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS ${functionName}()`);
}

function requestCreate(title: string) {
  return createPostRoute(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content: "并发写入的内容" }),
    })
  );
}

function requestUpdate(slug: string, title: string) {
  return updatePostRoute(
    new Request(`http://localhost/api/posts/${slug}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content: "并发改写的内容" }),
    }),
    { params: Promise.resolve({ slug }) }
  );
}

async function createPostFixture(userId: string, slug: string, title: string) {
  return prisma.post.create({
    data: {
      slug,
      title,
      content: "既有内容",
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

afterEach(async () => {
  await dropPostWriteDelay("INSERT");
  await dropPostWriteDelay("UPDATE");
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Post slug allocation under real concurrency", () => {
  it("让并发发布相同标题的两个请求都成功，并各得到不同 slug", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const baseSlug = generateSlug("Concurrent Publish");

    await delayPostWrites("INSERT");
    let responses: Response[];
    try {
      responses = await Promise.all([
        requestCreate("Concurrent Publish"),
        requestCreate("Concurrent Publish"),
      ]);
    } finally {
      await dropPostWriteDelay("INSERT");
    }

    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const posts = await prisma.post.findMany({
      where: { type: "user_post" },
      orderBy: { slug: "asc" },
      select: { slug: true, title: true, authorId: true },
    });
    expect(posts.map((post) => post.slug)).toEqual([baseSlug, `${baseSlug}-2`]);
    expect(posts.every((post) => post.title === "Concurrent Publish")).toBe(true);
    expect(posts.every((post) => post.authorId === user.id)).toBe(true);
  });

  it("让并发把两篇文章改成同一标题的两个请求都成功，并各得到不同 slug", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    await createPostFixture(user.id, "alpha", "Alpha");
    await createPostFixture(user.id, "beta", "Beta");
    const baseSlug = generateSlug("Shared Title");

    await delayPostWrites("UPDATE");
    let responses: Response[];
    try {
      responses = await Promise.all([
        requestUpdate("alpha", "Shared Title"),
        requestUpdate("beta", "Shared Title"),
      ]);
    } finally {
      await dropPostWriteDelay("UPDATE");
    }

    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const posts = await prisma.post.findMany({
      orderBy: { slug: "asc" },
      select: { slug: true, title: true },
    });
    expect(posts.map((post) => post.slug)).toEqual([baseSlug, `${baseSlug}-2`]);
    expect(posts.every((post) => post.title === "Shared Title")).toBe(true);
  });

  it("让编辑器使用的 Server Action 并发发布相同标题时返回成功而不是内部错误", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const baseSlug = generateSlug("Editor Publish");

    await delayPostWrites("INSERT");
    let results: Awaited<ReturnType<typeof createPostAction>>[];
    try {
      results = await Promise.all([
        createPostAction("Editor Publish", "编辑器并发内容"),
        createPostAction("Editor Publish", "编辑器并发内容"),
      ]);
    } finally {
      await dropPostWriteDelay("INSERT");
    }

    expect(results.map((result) => ("error" in result ? result.error : "ok"))).toEqual([
      "ok",
      "ok",
    ]);
    expect(
      results.map((result) => ("error" in result ? null : result.post.slug)).sort()
    ).toEqual([baseSlug, `${baseSlug}-2`]);

    const stored = await prisma.post.findMany({ orderBy: { slug: "asc" }, select: { slug: true } });
    expect(stored.map((post) => post.slug)).toEqual([baseSlug, `${baseSlug}-2`]);
  });

  it("让编辑器并发改成相同标题的两个 Server Action 调用都成功", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    await createPostFixture(user.id, "action-alpha", "Action Alpha");
    await createPostFixture(user.id, "action-beta", "Action Beta");
    const baseSlug = generateSlug("Action Shared");

    await delayPostWrites("UPDATE");
    let results: Awaited<ReturnType<typeof updatePostAction>>[];
    try {
      results = await Promise.all([
        updatePostAction("action-alpha", "Action Shared", "改写内容"),
        updatePostAction("action-beta", "Action Shared", "改写内容"),
      ]);
    } finally {
      await dropPostWriteDelay("UPDATE");
    }

    expect(results.map((result) => ("error" in result ? result.error : "ok"))).toEqual([
      "ok",
      "ok",
    ]);
    expect(
      results.map((result) => ("error" in result ? null : result.post.slug)).sort()
    ).toEqual([baseSlug, `${baseSlug}-2`]);
  });

  it("让 Agent 时间线投影在基础 slug 已被占用时顺延后缀而不是抛错", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const room = await createTestRoom();

    // 固定挂钟，使 createAgentLogPost 内部的 Date.now() 与夹具使用同一时间戳。
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-20T10:00:00Z"));
    const baseSlug = `agent-log-${Date.now()}`;
    try {
      await createPostFixture(user.id, baseSlug, "占位文章");

      const projection = await createAgentLogPost({
        title: "Agent: 小助手 — weather.get",
        content: "投影内容",
        roomId: room.id,
        metadata: { taskId: "task-concurrent-slug" },
      });

      expect(projection?.slug).toBe(`${baseSlug}-2`);
      const stored = await prisma.post.findFirst({
        where: { type: "agent_log" },
        select: { slug: true, roomId: true },
      });
      expect(stored).toEqual({ slug: `${baseSlug}-2`, roomId: room.id });
    } finally {
      vi.useRealTimers();
    }
  });
});
