import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ currentUserId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.currentUserId })),
  getCurrentUser: vi.fn(async () => ({ id: authState.currentUserId, profile: null })),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

import { createPost as createPostAction } from "@/app/actions/posts";
import { POST as createPostRoute } from "@/app/api/posts/route";
import { prisma } from "@/lib/prisma";
import { createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

// 本文件注入的是真实 PostgreSQL 拒绝：唯一约束由数据库索引裁定，数据库异常由触发器抛出。
// 断言只关心可观察响应与日志，不关心错误在内部如何传播。

const INTERNAL_MARKERS = [
  "prisma",
  "PrismaClientKnownRequestError",
  "Unique constraint",
  "duplicate key value violates unique constraint",
  "Post_title_probe_key",
  "Post_redaction_probe",
  "P2002",
  "INSERT INTO",
  "at Object.",
  "\n    at ",
];

function expectNoInternalDetails(payload: unknown) {
  const text = JSON.stringify(payload);
  for (const marker of INTERNAL_MARKERS) {
    expect(text).not.toContain(marker);
  }
}

function postRequest(body: unknown) {
  return createPostRoute(
    new Request("http://localhost/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );
}

function captureLogs() {
  const logged: string[] = [];
  const spy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    logged.push(args.map((value) => String(value)).join(" "));
  });
  return { logged, restore: () => spy.mockRestore() };
}

async function createExistingPost(userId: string, title: string) {
  return prisma.post.create({
    data: {
      slug: "redaction-probe-seed",
      title,
      content: "seed",
      type: "user_post",
      authorId: userId,
      publishedAt: new Date("2026-09-21T00:00:00Z"),
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

describe("错误响应在真实 PostgreSQL 上不泄漏内部异常", () => {
  it("真实唯一约束冲突只让客户端看到通用错误，日志仍带 `[api]` 与数据库原因", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;
    const title = "重复标题";
    await createExistingPost(user.id, title);

    // 临时唯一索引：让第二次写入触发数据库层面的唯一约束冲突（真实 P2002），
    // 而不是用假错误模拟。writePostWithUniqueSlug 只对 slug 冲突重试，标题冲突会原样上抛。
    await prisma.$executeRawUnsafe(
      'CREATE UNIQUE INDEX "Post_title_probe_key" ON "Post" ("title")'
    );

    const { logged, restore } = captureLogs();
    try {
      const response = await postRequest({ title, content: "正文" });

      expect(response.status).toBe(500);
      const payload = await response.json();
      expect(payload).toEqual({ error: "Internal server error" });
      expectNoInternalDetails(payload);

      // 日志侧的证据：既有 `[api]` 前缀，也有 Prisma 从数据库约束回推出的原因与冲突字段。
      // （Prisma 只把约束还原成字段名，不回传索引名，故这里不能断言 "Post_title_probe_key"。）
      const output = logged.join("\n");
      expect(output).toContain("[api]");
      expect(output).toContain("Unique constraint failed on the fields: (`title`)");
    } finally {
      restore();
      await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "Post_title_probe_key"');
    }

    await expect(prisma.post.count()).resolves.toBe(1);
  });

  it("真实数据库异常只返回通用错误，且响应中不含表名与触发器消息", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_post_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'duplicate key value violates unique constraint "Post_redaction_probe"';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_post_insert BEFORE INSERT ON "Post"
      FOR EACH ROW EXECUTE FUNCTION fail_post_insert()
    `);

    const { logged, restore } = captureLogs();
    try {
      const response = await postRequest({ title: "触发异常", content: "正文" });

      expect(response.status).toBe(500);
      const payload = await response.json();
      expect(payload).toEqual({ error: "Internal server error" });
      expectNoInternalDetails(payload);

      const output = logged.join("\n");
      expect(output).toContain("[api]");
      expect(output).toContain("Post_redaction_probe");
    } finally {
      restore();
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_post_insert ON "Post"');
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_post_insert()");
    }

    await expect(prisma.post.count()).resolves.toBe(0);
  });

  it("Server Action 在真实数据库拒绝时也只返回通用文案", async () => {
    const user = await createTestUser();
    authState.currentUserId = user.id;

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_post_insert() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'duplicate key value violates unique constraint "Post_redaction_probe"';
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_post_insert BEFORE INSERT ON "Post"
      FOR EACH ROW EXECUTE FUNCTION fail_post_insert()
    `);

    const { restore } = captureLogs();
    try {
      const result = await createPostAction("触发异常", "正文");

      expect(result).toEqual({ error: "Internal server error" });
      expectNoInternalDetails(result);
    } finally {
      restore();
      await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_post_insert ON "Post"');
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_post_insert()");
    }

    await expect(prisma.post.count()).resolves.toBe(0);
  });

  it("畸形 JSON 在真实请求边界仍是稳定的验证错误", async () => {
    // 防回归守卫：该契约在旧实现下同样成立，本用例固定它不被通用错误改动带走。
    const user = await createTestUser();
    authState.currentUserId = user.id;

    const { restore } = captureLogs();
    try {
      const response = await postRequest('{"title": "Alpha", ');

      expect(response.status).toBe(400);
      const payload = (await response.json()) as { error: string; issues: unknown[] };
      expect(payload.error).toBe("Invalid request");
      expect(payload.issues.length).toBeGreaterThan(0);
      expectNoInternalDetails(payload);
    } finally {
      restore();
    }

    await expect(prisma.post.count()).resolves.toBe(0);
  });
});
