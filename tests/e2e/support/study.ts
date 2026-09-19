import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./credentials";

type StudyFixture = {
  page: Page;
  db: PrismaClient;
  userId: string;
  roomId: string;
};

// 每次使用独立账号，迟到的 start/presence 请求也不能污染下一项用例。
// 回调抛错时仍先关闭页面，再利用 User 级联删除清理 Focus 和认证状态。
export async function withStudyUser<T>(
  context: BrowserContext,
  run: (fixture: StudyFixture) => Promise<T>,
): Promise<T> {
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const userId = `e2e-focus-${randomUUID()}`;
  const roomId = `${userId}-room`;
  const email = `${userId}@example.com`;
  let page: Page | undefined;

  try {
    const template = await db.user.findUniqueOrThrow({
      where: { email: E2E_USERS[0].email },
      select: { passwordHash: true },
    });
    await db.user.create({ data: {
      id: userId,
      email,
      passwordHash: template.passwordHash,
      displayName: "E2E Focus",
      avatarLabel: "F",
      profile: { create: { city: "—", country: "—", timezone: "Asia/Shanghai" } },
      participants: { create: {
        role: "owner",
        room: { create: { id: roomId, slug: roomId, name: "独立专注测试房间" } },
      } },
    } });
    await context.clearCookies();
    const baseURL = test.info().project.use.baseURL;
    if (!baseURL) throw new Error("Study E2E 需要隔离测试服务的 baseURL。");
    const login = await context.request.post("/api/auth/login", {
      headers: { origin: new URL(baseURL).origin },
      data: { email, password: E2E_PASSWORD },
    });
    expect(login.status(), "独立 Study 账号登录成功").toBe(200);
    page = await context.newPage();
    return await run({ page, db, userId, roomId });
  } finally {
    try {
      await page?.close();
    } finally {
      try {
        await db.$transaction([
          db.user.deleteMany({ where: { id: userId } }),
          db.room.deleteMany({ where: { id: roomId } }),
        ]);
      } finally {
        await db.$disconnect();
      }
    }
  }
}

function studyResponse(page: Page, path: string, method: "GET" | "POST") {
  return page.waitForResponse((response) =>
    response.request().method() === method && new URL(response.url()).pathname === path,
  );
}

async function recordResponse(response: Response) {
  const { startTime, responseStart, responseEnd } = response.request().timing();
  await test.info().attach(`study-${response.request().method()}-${new URL(response.url()).pathname.split("/").at(-1)}`, {
    contentType: "application/json",
    body: JSON.stringify({ status: response.status(), startTime, responseStart, responseEnd }),
  });
}

export async function startStudyFocus(page: Page): Promise<string> {
  const [response] = await Promise.all([
    studyResponse(page, "/api/study/start", "POST"),
    page.getByRole("button", { name: "开始专注", exact: true }).click(),
  ]);
  expect(response.status(), "Focus 启动 HTTP 响应").toBe(200);
  const body = await response.json();
  expect(body).toMatchObject({ state: { status: "running", mode: "focus", sessionKey: expect.any(String) } });
  await recordResponse(response);
  // 5 秒 UI 断言从业务响应开始；开发模式的路由编译仍受原有用例超时约束。
  await expect(page.getByText(/专注中 ·/)).toBeVisible();
  return body.state.sessionKey;
}

export async function stopStudyFocus(page: Page, sessionKey: string) {
  const [, refresh] = await Promise.all([
    studyResponse(page, "/api/study/stop", "POST").then(async (response) => {
      expect(response.request().postDataJSON()).toEqual({ sessionKey });
      expect(response.status(), "Focus 停止 HTTP 响应").toBe(200);
      // 客户端只消费 stop 的状态码；业务结果由随后实际消费的 GET 响应确认。
      await recordResponse(response);
    }),
    studyResponse(page, "/api/study", "GET"),
    page.getByRole("button", { name: "停止", exact: true }).click(),
  ]);
  expect(refresh.status(), "Focus 停止后的状态回读").toBe(200);
  expect(await refresh.json()).toMatchObject({ currentState: { status: "idle", sessionKey } });
  await recordResponse(refresh);
  await expect(page.getByRole("button", { name: "开始专注", exact: true })).toBeEnabled();
}
