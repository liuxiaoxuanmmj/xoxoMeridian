import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { Prisma, PrismaClient } from "@prisma/client";
import { expect, request as playwrightRequest, test, type Locator } from "@playwright/test";

import type { ChatMessage, RoomSnapshot } from "@/components/chat/types";
import { cancelOnlyPlan, scheduleClarificationPrompt } from "@/tests/fixtures/schedule-clarification";

import { E2E_PASSWORD, E2E_USERS } from "./support/credentials";
import { startStudyFocus, stopStudyFocus, withStudyUser } from "./support/study";

test("Agent 创建的较长备忘录和计划可在 UI 编辑保存并刷新回读", async ({ page }) => {
  test.setTimeout(120_000);
  // 共享字段校验进入浏览器后，也必须在生产 CSP 下加载和提交。
  const cspViolations: string[] = [];
  await page.exposeFunction("recordLifeFieldViolation", (directive: string) => cspViolations.push(directive));
  await page.addInitScript(() => {
    addEventListener("securitypolicyviolation", (event) => {
      const recorder = (window as unknown as { recordLifeFieldViolation: (directive: string) => Promise<void> }).recordLifeFieldViolation;
      void recorder(event.violatedDirective);
    });
  });
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const roomId = `e2e-life-fields-${Date.now().toString(36)}`;
  const title = "备忘录".repeat(100);
  const content = "一起记录生活".repeat(1500);
  const description = "每天记得休息".repeat(50);
  const updatedTitle = title.slice(0, -1) + "新";
  const updatedContent = content.slice(0, -1) + "新";
  const updatedDescription = description.slice(0, -1) + "新";

  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
    const agent = await db.agent.findUniqueOrThrow({ where: { slug: "life-assistant" } });
    await db.room.create({ data: {
      id: roomId, slug: roomId, name: "生活字段一致性房间",
      participants: { create: { userId: user.id, role: "owner" } },
    } });
    const task = await db.agentTask.create({ data: {
      roomId, agentId: agent.id, requestedById: user.id,
      input: { normalizedContent: "保存备忘录并安排每日休息提醒", trigger: "mention" },
      plan: {
        intent: "manage_life", confidence: 0.95,
        requiredTools: ["memo.create", "schedule.create"],
        taskSteps: ["保存备忘录", "保存每日提醒"],
        finalResponsePlan: "确认保存结果", finalResponseText: "备忘录与每日提醒已保存。",
        toolInputs: {
          "memo.create": { title, content },
          "schedule.create": { cron: "0 9 * * *", timezone: "Asia/Shanghai", prompt: "提醒一起休息", description },
        },
      },
    } });
    await page.goto(`/chat/${roomId}`);
    const response = await page.request.post(`/api/agent/tasks/${task.id}/run`, {
      headers: { origin: new URL(page.url()).origin },
    });
    expect(response.ok(), await response.text()).toBe(true);
    await promisify(execFile)(process.execPath, [
      "--import", "tsx", resolve("tests/e2e/support/run-agent-task.ts"), task.id,
    ], {
      env: {
        ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
        LLM_PROVIDER: "mock", LLM_API_KEY: "", AGENT_DEBUG_ENABLED: "false",
      },
      timeout: 30_000,
    });
    expect((await db.agentTask.findUniqueOrThrow({ where: { id: task.id } })).status).toBe("completed");
    expect(await db.toolCall.count({ where: { taskId: task.id, status: "completed" } })).toBe(2);
    const memo = await db.memo.findFirstOrThrow({ where: { roomId } });
    const job = await db.scheduledJob.findFirstOrThrow({ where: { roomId } });
    expect(memo).toMatchObject({ title, content });
    expect(job.payload).toMatchObject({ description });

    const save = async (path: string) => {
      const saved = page.waitForResponse((reply) => new URL(reply.url()).pathname === path && reply.request().method() === "PATCH");
      await page.getByRole("button", { name: "保存", exact: true }).click();
      expect((await saved).status()).toBe(200);
      await expect(page.getByRole("button", { name: "保存", exact: true })).toHaveCount(0);
    };
    await page.getByRole("button", { name: "编辑备忘录", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "标题 *" })).toHaveValue(title);
    await expect(page.getByRole("textbox", { name: "内容 *" })).toHaveValue(content);
    for (const name of ["标题 *", "内容 *"]) {
      const input = page.getByRole("textbox", { name });
      await input.focus();
      await input.press("ControlOrMeta+End");
      await input.press("Backspace");
      await page.keyboard.insertText("新");
    }
    await save(`/api/rooms/${roomId}/memos/${memo.id}`);
    expect(await db.memo.findUniqueOrThrow({ where: { id: memo.id } })).toMatchObject({ title: updatedTitle, content: updatedContent });

    await page.getByRole("button", { name: "编辑任务", exact: true }).click();
    const descriptionInput = page.getByRole("textbox", { name: "任务描述" });
    await expect(descriptionInput).toHaveValue(description);
    await descriptionInput.focus();
    await descriptionInput.press("End");
    await descriptionInput.press("Backspace");
    await page.keyboard.insertText("新");
    await save(`/api/rooms/${roomId}/scheduled-jobs/${job.id}`);
    const stored = await db.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.payload).toMatchObject({ description: updatedDescription, prompt: "提醒一起休息", runOnce: false });
    expect(stored.nextRunAt).toEqual(job.nextRunAt);
    expect(stored.cron).toBe(job.cron);

    await page.reload();
    await page.getByRole("button", { name: "编辑备忘录", exact: true }).click();
    await expect(page.getByRole("textbox", { name: "标题 *" })).toHaveValue(updatedTitle);
    await expect(page.getByRole("textbox", { name: "内容 *" })).toHaveValue(updatedContent);
    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "编辑任务", exact: true }).click();
    await expect(descriptionInput).toHaveValue(updatedDescription);
    expect(cspViolations).toEqual([]);
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    try {
      await db.room.deleteMany({ where: { id: roomId } });
    } finally {
      await db.$disconnect();
    }
  }
});

test("计划语义澄清与仍有效的旧计划在执行后和刷新后保持一致", async ({ page }) => {
  test.setTimeout(90_000);
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const roomId = `e2e-schedule-clarify-${Date.now().toString(36)}`;
  const description = "澄清前的晚间散步计划";
  let plannerServer: Server | undefined;
  let plannerCalls = 0;

  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
    const agent = await db.agent.findUniqueOrThrow({ where: { slug: "life-assistant" } });
    await db.room.create({ data: {
      id: roomId, slug: roomId, name: "计划澄清测试房间",
      participants: { create: { userId: user.id, role: "owner" } }
    } });
    const job = await db.scheduledJob.create({ data: {
      roomId, agentId: agent.id, createdById: user.id, enabled: true,
      cron: "0 20 * * *", timezone: "Asia/Shanghai", nextRunAt: new Date("2099-09-13T12:00:00Z"),
      payload: { description, prompt: "提醒散步", runOnce: false }
    } });
    const plan = cancelOnlyPlan(job.id);
    // 仅替换进程外 LLM HTTP 边界；真实 Provider、Runtime、数据库和浏览器均参与执行。
    plannerServer = createServer((request, response) => {
      request.resume();
      plannerCalls += 1;
      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
        intent: plan.intent, confidence: plan.confidence, required_tools: plan.requiredTools,
        task_steps: plan.taskSteps, final_response_plan: plan.finalResponsePlan,
        final_response_text: plan.finalResponseText, tool_inputs: plan.toolInputs
      }) } }] }));
    });
    await new Promise<void>((resolve, reject) => {
      plannerServer!.once("error", reject);
      plannerServer!.listen(0, "127.0.0.1", resolve);
    });
    const address = plannerServer.address();
    if (!address || typeof address === "string") throw new Error("测试 Planner 未绑定本地端口。");
    const task = await db.agentTask.create({ data: {
      roomId, agentId: agent.id, requestedById: user.id,
      input: { normalizedContent: scheduleClarificationPrompt, trigger: "mention" }
    } });
    await page.goto(`/chat/${roomId}`);
    await expect(page.getByText(description, { exact: true })).toBeVisible();
    const response = await page.request.post(`/api/agent/tasks/${task.id}/run`, {
      headers: { origin: new URL(page.url()).origin }
    });
    expect(response.ok(), await response.text()).toBe(true);
    await promisify(execFile)(process.execPath, [
      "--import", "tsx", resolve("tests/e2e/support/run-agent-task.ts"), task.id
    ], {
      env: {
        ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
        LLM_PROVIDER: "openai-compatible", LLM_API_KEY: "isolated-test-planner",
        LLM_BASE_URL: `http://127.0.0.1:${address.port}/v1`, LLM_MODEL: "test-planner",
        AGENT_DEBUG_ENABLED: "false"
      },
      timeout: 30_000
    });
    expect(plannerCalls).toBe(2);
    const saved = await db.agentTask.findUniqueOrThrow({
      where: { id: task.id }, include: { finalMessage: true, eventLogs: true }
    });
    expect(saved.status).toBe("completed");
    expect(saved.eventLogs.some((event) => event.type === "agent.plan.validation.fallback")).toBe(true);
    expect(await db.toolCall.count({ where: { taskId: task.id } })).toBe(0);
    expect(await db.scheduledJob.findMany({ where: { roomId } })).toEqual([job]);
    const clarification = page.getByText("请再确认这次一次性任务的具体日期、时间和时区。", { exact: true });
    const assertConsistent = async () => {
      await expect(clarification).toBeVisible();
      await expect(page.getByText(/已经.*取消|已取消|帮你取消/)).toHaveCount(0);
      await expect(page.getByText(plan.finalResponseText, { exact: true })).toHaveCount(0);
      const card = page.getByText(description, { exact: true }).locator("..");
      await expect(card).toBeVisible();
      await expect(card.getByRole("button", { name: "停用任务", exact: true })).toBeEnabled();
    };
    await assertConsistent();
    await page.reload();
    await assertConsistent();
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    if (plannerServer) await new Promise<void>((resolve) => plannerServer!.close(() => resolve()));
    try {
      await db.room.deleteMany({ where: { id: roomId } });
    } finally {
      await db.$disconnect();
    }
  }
});

test("shows an invalid Agent plan as failed after execution and reload", async ({ page }) => {
  test.setTimeout(90_000);
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const roomId = `e2e-plan-validation-${Date.now().toString(36)}`;
  const misleadingReply = "已经替你保存了散步备忘录，任务全部完成。";

  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
    const agent = await db.agent.findUniqueOrThrow({ where: { slug: "life-assistant" } });
    await db.room.create({
      data: {
        id: roomId, slug: roomId, name: "计划校验测试房间",
        participants: { create: { userId: user.id, role: "owner" } }
      }
    });
    const task = await db.agentTask.create({
      data: {
        roomId, agentId: agent.id, requestedById: user.id,
        input: { normalizedContent: "帮我保存散步备忘录", trigger: "mention" },
        plan: {
          intent: "create_memo", confidence: 0.9, requiredTools: ["memo.create"],
          taskSteps: ["保存备忘录"], finalResponsePlan: "确认完成",
          finalResponseText: misleadingReply, toolInputs: { "memo.create": [] }
        }
      }
    });
    await page.goto(`/chat/${roomId}`);
    const response = await page.request.post(`/api/agent/tasks/${task.id}/run`, {
      headers: { origin: new URL(page.url()).origin }
    });
    expect(response.ok(), await response.text()).toBe(true);
    // E2E Web 关闭 inline 且不启动常驻 Worker；独立进程只消费本例的隔离任务。
    await promisify(execFile)(process.execPath, [
      "--import", "tsx", resolve("tests/e2e/support/run-agent-task.ts"), task.id
    ], {
      env: {
        ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
        LLM_PROVIDER: "mock", LLM_API_KEY: "", AGENT_DEBUG_ENABLED: "false"
      },
      timeout: 30_000
    });
    const failure = page.getByText("我无法确认这次任务的操作和参数，任务未完成。请把要做的事说得更具体一些后重试。", { exact: true });
    await expect(failure).toBeVisible();
    await expect(page.getByText(/执行失败/, { exact: false })).toBeVisible();
    await expect(page.getByText(misleadingReply, { exact: true })).toHaveCount(0);
    await page.reload();
    await expect(failure).toBeVisible();
    await expect(page.getByText(/执行失败/, { exact: false })).toBeVisible();
    await expect(page.getByText(misleadingReply, { exact: true })).toHaveCount(0);
    const saved = await db.agentTask.findUniqueOrThrow({ where: { id: task.id }, include: { finalMessage: true } });
    expect(saved.status).toBe("failed");
    expect(saved.finalMessage?.status).toBe("failed");
    expect(saved.error).toContain("empty_tool_calls");
    expect(await db.toolCall.count({ where: { taskId: task.id } })).toBe(0);
    expect(await db.memo.count({ where: { roomId } })).toBe(0);
    const trace = await page.request.get(`/api/agent/tasks/${task.id}/trace`);
    expect(trace.ok()).toBe(true);
    expect(JSON.stringify(await trace.json())).toContain("agent.plan.validation.failed");
  } finally {
    await page.goto("/home");
    await db.room.deleteMany({ where: { id: roomId } });
    await db.$disconnect();
  }
});

test("retries Home photo edits and deletions without false success after failures", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1600, height: 1000 });
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = Date.now().toString(36);
  const photoIds = [1, 2, 3].map((id) => `e2e-home-retry-${suffix}-${id}`);
  const photoId = photoIds[0];
  const caption = `保存重试照片 ${suffix}`;
  const editedCaption = `保存后的标注 ${suffix}`;
  const photoUrl = `/api/home-board/elements/${photoId}`;
  const photoCard = () => page.locator("[data-home-photo]").filter({ has: page.getByRole("img", { name: caption, exact: true }) });

  try {
    const user = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
    await db.atlasBoard.upsert({ where: { id: "home-board" }, update: {}, create: { id: "home-board" } });
    await db.atlasElement.createMany({
      data: photoIds.map((id, index) => ({
        id, boardId: "home-board", type: "photo" as const,
        x: 24, y: 80 + index * 290, width: 240, height: 180,
        caption: index === 0 ? caption : `${caption} 伙伴 ${index}`,
        imageUrl: "/brand/logo_white.svg", createdById: user.id,
      })),
    });
    await db.atlasConnection.createMany({
      data: photoIds.slice(1).map((toId, index) => ({
        id: `e2e-home-retry-connection-${suffix}-${index}`, boardId: "home-board", fromId: photoId, toId,
      })),
    });
    await page.goto("/home");
    await expect(page.getByRole("img", { name: caption, exact: true })).toBeVisible();

    await page.route(`**${photoUrl}`, (route) => route.fulfill({ status: 500, json: { error: "test failure" } }), { times: 1 });
    const resize = photoCard().getByRole("button", { name: /调整照片大小/ });
    await photoCard().hover({ position: { x: 20, y: 20 } });
    const handle = await resize.boundingBox();
    if (!handle) throw new Error("照片缩放控件没有可操作的位置");
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
    await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2);
    await page.mouse.up();
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveText("照片大小保存失败。");
    expect(await db.atlasElement.findUniqueOrThrow({ where: { id: photoId } })).toMatchObject({ width: 240, height: 180 });
    await expect(photoCard()).toHaveCSS("width", "280px");
    const resized = page.waitForResponse((response) => response.url().endsWith(photoUrl) && response.request().method() === "PATCH" && response.ok());
    await page.getByRole("button", { name: "重试保存照片大小" }).press("Enter");
    await resized;
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveCount(0);
    await page.reload();
    await expect(photoCard()).toHaveCSS("width", "280px");
    expect(await db.atlasElement.findUniqueOrThrow({ where: { id: photoId } })).toMatchObject({ width: 280, height: 210 });

    await page.route(`**${photoUrl}`, (route) => route.abort("connectionreset"), { times: 1 });
    await page.getByRole("button", { name: caption, exact: true }).press("Enter");
    await page.getByLabel("照片标注", { exact: true }).fill(`  ${editedCaption}  `);
    await page.getByLabel("照片标注", { exact: true }).press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveText("照片标注保存失败。");
    expect(await db.atlasElement.findUniqueOrThrow({ where: { id: photoId } })).toMatchObject({ caption });
    await expect(page.getByRole("img", { name: editedCaption, exact: true })).toBeVisible();
    const captionSaved = page.waitForResponse((response) => response.url().endsWith(photoUrl) && response.request().method() === "PATCH" && response.ok());
    await page.getByRole("button", { name: "重试保存照片标注" }).press("Enter");
    await captionSaved;
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("img", { name: editedCaption, exact: true })).toBeVisible();
    expect(await db.atlasElement.findUniqueOrThrow({ where: { id: photoId } })).toMatchObject({ caption: editedCaption, width: 280, height: 210 });

    let deletedConnectionId: string | null = null;
    await page.route("**/api/home-board/connections?*", (route) => {
      deletedConnectionId = new URL(route.request().url()).searchParams.get("id");
      return route.fulfill({ status: 500, json: { error: "test failure" } });
    }, { times: 1 });
    await page.getByRole("button", { name: /^删除连线 / }).first().press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveText("连线删除失败。");
    expect(await db.atlasConnection.count({ where: { fromId: photoId } })).toBe(2);
    await expect(page.getByRole("button", { name: /^删除连线 / })).toHaveCount(2);
    const connectionDeleted = page.waitForResponse((response) => response.url().includes("/api/home-board/connections?") && response.request().method() === "DELETE" && response.ok());
    await page.getByRole("button", { name: "重试删除连线" }).press("Enter");
    await connectionDeleted;
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveCount(0);
    expect(deletedConnectionId).not.toBeNull();
    expect(await db.atlasConnection.count({ where: { id: deletedConnectionId! } })).toBe(0);
    await page.reload();
    await expect(page.getByRole("button", { name: /^删除连线 / })).toHaveCount(1);

    await page.route(`**${photoUrl}`, (route) => route.abort("connectionreset"), { times: 1 });
    await page.getByRole("button", { name: `删除照片：${editedCaption}`, exact: true }).press("Enter");
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveText("照片删除失败。");
    await expect(page.getByRole("img", { name: editedCaption, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /^删除连线 / })).toHaveCount(1);
    expect(await db.atlasElement.count({ where: { id: photoId } })).toBe(1);
    expect(await db.atlasConnection.count({ where: { fromId: photoId } })).toBe(1);
    const photoDeleted = page.waitForResponse((response) => response.url().endsWith(photoUrl) && response.request().method() === "DELETE" && response.ok());
    await page.getByRole("button", { name: "重试删除照片" }).press("Enter");
    await photoDeleted;
    await expect(page.getByRole("img", { name: editedCaption, exact: true })).toHaveCount(0);
    await expect(page.getByRole("alert").filter({ hasText: "失败" })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("img", { name: editedCaption, exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^删除连线 / })).toHaveCount(0);
    expect(await db.atlasElement.count({ where: { id: { in: photoIds } } })).toBe(2);
    expect(await db.atlasConnection.count({ where: { fromId: photoId } })).toBe(0);
  } finally {
    await db.atlasElement.deleteMany({ where: { id: { in: photoIds } } });
    await db.$disconnect();
  }
});

test("renders the authenticated home navigation", async ({ page }) => {
  await page.goto("/home");

  const brandLink = page.getByRole("link", { name: "XOXO Meridian" });
  await expect(brandLink.locator("img")).toHaveAttribute(
    "src",
    "/brand/logo_transparent.svg",
  );
  await expect(brandLink.locator("img").locator("..")).toHaveCSS(
    "background-color",
    "rgb(125, 168, 120)",
  );
  await expect(page.getByRole("link", { name: "Blog" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Chat" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Study" })).toBeVisible();
  await expect(page.getByRole("link", { name: E2E_USERS[0].displayName })).toBeVisible();
});

test("keeps room-scoped Home anchors out of non-member payloads and mutations", async ({
  baseURL,
  page,
}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required for Home board authorization");
  }
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const e2ePrisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const suffix = Date.now().toString(36);
  const privateRoomId = `e2e-home-private-room-${suffix}`;
  const hiddenPostId = `e2e-home-hidden-post-${suffix}`;
  const globalPostId = `e2e-home-global-post-${suffix}`;
  const hiddenAnchorId = `e2e-home-hidden-anchor-${suffix}`;
  const globalAnchorId = `e2e-home-global-anchor-${suffix}`;
  const photoOneId = `e2e-home-photo-one-${suffix}`;
  const photoTwoId = `e2e-home-photo-two-${suffix}`;
  const hiddenConnectionId = `e2e-home-hidden-connection-${suffix}`;
  const visibleConnectionId = `e2e-home-visible-connection-${suffix}`;

  try {
    const users = await e2ePrisma.user.findMany({
      where: { email: { in: E2E_USERS.map((user) => user.email) } },
      select: { id: true, email: true },
    });
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const currentUser = userByEmail.get(E2E_USERS[0].email);
    const otherUser = userByEmail.get(E2E_USERS[1].email);
    expect(currentUser).toBeDefined();
    expect(otherUser).toBeDefined();
    if (!currentUser || !otherUser) return;

    await e2ePrisma.room.create({
      data: {
        id: privateRoomId,
        slug: `e2e-home-private-${suffix}`,
        name: "E2E private Home room",
        participants: { create: { userId: otherUser.id } },
      },
    });
    await e2ePrisma.atlasBoard.upsert({
      where: { id: "home-board" },
      update: {},
      create: { id: "home-board" },
    });
    await e2ePrisma.post.createMany({
      data: [
        {
          id: hiddenPostId,
          slug: `e2e-home-hidden-${suffix}`,
          title: "Hidden room agent log",
          content: "This content and its spatial anchor are room scoped.",
          type: "agent_log",
          roomId: privateRoomId,
          publishedAt: new Date(),
        },
        {
          id: globalPostId,
          slug: `e2e-home-global-${suffix}`,
          title: "Visible global user post",
          content: "User posts remain globally visible.",
          type: "user_post",
          authorId: otherUser.id,
          roomId: privateRoomId,
          publishedAt: new Date(),
        },
      ],
    });
    await e2ePrisma.atlasElement.createMany({
      data: [
        {
          id: hiddenAnchorId,
          boardId: "home-board",
          type: "note",
          postId: hiddenPostId,
          x: 10,
          y: 20,
        },
        {
          id: globalAnchorId,
          boardId: "home-board",
          type: "note",
          postId: globalPostId,
          x: 30,
          y: 40,
        },
        {
          id: photoOneId,
          boardId: "home-board",
          type: "photo",
          imageUrl: "/api/atlas/uploads/atlas%2Fe2e-home-one.jpg",
          x: 50,
          y: 60,
          createdById: otherUser.id,
        },
        {
          id: photoTwoId,
          boardId: "home-board",
          type: "photo",
          imageUrl: "/api/atlas/uploads/atlas%2Fe2e-home-two.jpg",
          x: 70,
          y: 80,
          createdById: otherUser.id,
        },
      ],
    });
    await e2ePrisma.atlasConnection.createMany({
      data: [
        {
          id: hiddenConnectionId,
          boardId: "home-board",
          fromId: hiddenAnchorId,
          toId: photoOneId,
        },
        {
          id: visibleConnectionId,
          boardId: "home-board",
          fromId: globalAnchorId,
          toId: photoOneId,
        },
      ],
    });

    const homeResponse = await page.goto("/home");
    expect(homeResponse?.ok()).toBe(true);
    const homePayload = await homeResponse?.text();
    expect(homePayload).toContain(globalAnchorId);
    expect(homePayload).toContain(photoOneId);
    expect(homePayload).toContain(visibleConnectionId);
    expect(homePayload).not.toContain(hiddenPostId);
    expect(homePayload).not.toContain(hiddenAnchorId);
    expect(homePayload).not.toContain(hiddenConnectionId);

    const requestHeaders = { origin: baseURL };
    const patchResponse = await page.request.patch(
      `/api/home-board/elements/${hiddenAnchorId}`,
      { headers: requestHeaders, data: { x: 999 } },
    );
    const createResponse = await page.request.post("/api/home-board/connections", {
      headers: requestHeaders,
      data: { fromId: hiddenAnchorId, toId: photoTwoId },
    });
    const deleteResponse = await page.request.delete(
      `/api/home-board/connections?id=${hiddenConnectionId}`,
      { headers: requestHeaders },
    );

    expect(patchResponse.status()).toBe(404);
    expect(createResponse.status()).toBe(404);
    expect(deleteResponse.status()).toBe(404);
    await expect(e2ePrisma.atlasElement.findUniqueOrThrow({
      where: { id: hiddenAnchorId },
    })).resolves.toMatchObject({ x: 10, y: 20 });
    await expect(e2ePrisma.atlasConnection.findUnique({
      where: { id: hiddenConnectionId },
    })).resolves.not.toBeNull();
    await expect(e2ePrisma.atlasConnection.count({
      where: {
        boardId: "home-board",
        fromId: hiddenAnchorId,
        toId: photoTwoId,
      },
    })).resolves.toBe(0);
  } finally {
    await e2ePrisma.post.deleteMany({
      where: { id: { in: [hiddenPostId, globalPostId] } },
    });
    await e2ePrisma.atlasElement.deleteMany({
      where: { id: { in: [photoOneId, photoTwoId] } },
    });
    await e2ePrisma.room.deleteMany({ where: { id: privateRoomId } });
    await e2ePrisma.$disconnect();
  }
});

test("reuses the brand mark in the chat navigation", async ({ page }) => {
  await page.goto("/chat");

  await expect(page).toHaveURL(/\/chat\/[^/?]+/);
  const brandLink = page.getByRole("link", { name: "XOXO Meridian" });
  await expect(brandLink.locator("img")).toHaveAttribute(
    "src",
    "/brand/logo_transparent.svg",
  );
  await expect(brandLink.locator("img").locator("..")).toHaveCSS(
    "background-color",
    "rgb(125, 168, 120)",
  );
});

test("resolves life panel identity for the second room participant", async ({
  baseURL,
  browser,
}) => {
  if (!baseURL) {
    throw new Error("Playwright baseURL is required for the second participant journey");
  }
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const e2ePrisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const authContext = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { origin: baseURL },
    storageState: { cookies: [], origins: [] },
  });
  const loginResponse = await authContext.post("/api/auth/login", {
    data: {
      email: E2E_USERS[1].email,
      password: E2E_PASSWORD,
    },
  });
  expect(loginResponse.status()).toBe(200);
  const context = await browser.newContext({
    baseURL,
    storageState: await authContext.storageState(),
  });
  await authContext.dispose();

  try {
    const users = await e2ePrisma.user.findMany({
      where: { email: { in: E2E_USERS.map((user) => user.email) } },
      select: { id: true, email: true },
    });
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const firstUser = userByEmail.get(E2E_USERS[0].email);
    const secondUser = userByEmail.get(E2E_USERS[1].email);
    expect(firstUser).toBeDefined();
    expect(secondUser).toBeDefined();
    if (!firstUser || !secondUser) return;

    const participant = await e2ePrisma.roomParticipant.findFirstOrThrow({
      where: { userId: secondUser.id },
      select: { roomId: true },
    });
    await Promise.all([
      e2ePrisma.userProfile.update({
        where: { userId: firstUser.id },
        data: { city: "Tokyo", timezone: "Asia/Tokyo" },
      }),
      e2ePrisma.userProfile.update({
        where: { userId: secondUser.id },
        data: { city: "London", timezone: "Europe/London" },
      }),
    ]);

    const page = await context.newPage();
    const weatherResponsePromise = page.waitForResponse((response) =>
      new URL(response.url()).pathname === `/api/rooms/${participant.roomId}/weather`
    );
    await page.goto(`/chat/${participant.roomId}`);

    const weatherResponse = await weatherResponsePromise;
    const weatherPayload = await weatherResponse.json() as {
      results: Array<{ subject: string; displayName: string; city: string }>;
    };
    expect(weatherPayload.results[0]).toMatchObject({
      subject: "partner",
      displayName: E2E_USERS[0].displayName,
      city: "Tokyo",
    });

    const timeSection = page.getByRole("heading", { name: "两地时间" }).locator("..");
    const timeTexts = await timeSection.locator("p").allTextContents();
    expect(timeTexts.indexOf(E2E_USERS[1].displayName)).toBeLessThan(
      timeTexts.indexOf(E2E_USERS[0].displayName)
    );

    await page.getByTitle("新建任务").click();
    await expect(page.getByRole("combobox", { name: "时区" })).toHaveValue("Europe/London");
  } finally {
    await e2ePrisma.userProfile.updateMany({
      where: { user: { email: { in: E2E_USERS.map((user) => user.email) } } },
      data: { city: "—", timezone: "Asia/Shanghai" },
    });
    await context.close();
    await e2ePrisma.$disconnect();
  }
});

test.describe("计划表单键盘操作", () => {
  test.use({ timezoneId: "Europe/London" });

  test("仅用键盘创建计划，刷新后仍按名称读回小时、分钟和时区", async ({ page }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL
      ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
    const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const roomId = `e2e-schedule-keyboard-${Date.now().toString(36)}`;
    const description = "键盘创建的晚间计划";
    const prompt = "提醒一起散步";
    const tabTo = async (target: Locator) => {
      for (let attempt = 0; attempt < 80; attempt += 1) {
        if (await target.evaluate((element) => element === document.activeElement)) break;
        await page.keyboard.press("Tab");
      }
      await expect(target).toBeFocused();
    };

    try {
      const user = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
      await db.room.create({
        data: {
          id: roomId,
          slug: roomId,
          name: "计划键盘测试房间",
          participants: { create: { userId: user.id, role: "owner" } },
        },
      });
      await page.goto(`/chat/${roomId}`);
      await tabTo(page.getByTitle("新建任务"));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "新建任务" })).toBeVisible();

      await tabTo(page.getByRole("textbox", { name: "任务描述" }));
      await page.keyboard.type(description);
      await page.keyboard.press("Tab");
      await expect(page.getByRole("textbox", { name: "执行指令 *" })).toBeFocused();
      await page.keyboard.type(prompt);

      const time = page.getByRole("group", { name: "执行时间" });
      const hour = time.getByRole("spinbutton", { name: "小时", exact: true });
      const minute = time.getByRole("spinbutton", { name: "分钟", exact: true });
      await page.keyboard.press("Tab");
      await expect(hour).toBeFocused();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("18");
      await page.keyboard.press("Tab");
      await expect(minute).toBeFocused();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("45");

      const timezone = page.getByRole("combobox", { name: "时区" });
      await expect(timezone).toHaveValue("Asia/Shanghai");
      await tabTo(timezone);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("Tab");
      await expect(timezone).toHaveValue("Europe/London");
      await expect(page.getByText("每天 18:45 执行", { exact: true })).toBeVisible();

      await tabTo(page.getByRole("button", { name: "保存", exact: true }));
      const createdResponse = page.waitForResponse((response) =>
        new URL(response.url()).pathname === `/api/rooms/${roomId}/scheduled-jobs`
        && response.request().method() === "POST"
      );
      await page.keyboard.press("Enter");
      const response = await createdResponse;
      expect(response.status()).toBe(201);
      await expect(page.getByText(description, { exact: true })).toBeVisible();
      const saved = await db.scheduledJob.findFirstOrThrow({ where: { roomId } });
      expect(saved).toMatchObject({
        cron: "45 18 * * *",
        timezone: "Europe/London",
        payload: { description, prompt, runOnce: false },
      });

      await page.reload();
      const card = page.getByText(description, { exact: true }).locator("..");
      await tabTo(card.getByRole("button", { name: "编辑任务" }));
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "编辑任务" })).toBeVisible();
      await expect(hour).toHaveValue("18");
      await expect(minute).toHaveValue("45");
      await expect(timezone).toHaveValue("Europe/London");
      await page.keyboard.press("Escape");
    } finally {
      // 超时后页面可能已关闭；清理导航失败也必须继续释放隔离数据与连接。
      await page.goto("about:blank").catch(() => undefined);
      try {
        await db.room.deleteMany({ where: { id: roomId } });
      } finally {
        await db.$disconnect();
      }
    }
  });
});

test("keeps private profile fields out of Chat and Study browser payloads", async ({ page }) => {
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const e2ePrisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const privateValues = [
    "e2e-private-profile-note-one",
    "e2e-private-profile-note-two",
    "e2e-private-preferences-one",
    "e2e-private-preferences-two",
    "198.51.100.21",
    "198.51.100.22",
  ];

  try {
    const users = await e2ePrisma.user.findMany({
      where: { email: { in: E2E_USERS.map((user) => user.email) } },
      orderBy: { email: "asc" },
      select: {
        id: true,
        email: true,
        displayName: true,
        avatarLabel: true,
        passwordHash: true,
      },
    });
    expect(users).toHaveLength(2);
    const userByEmail = new Map(users.map((user) => [user.email, user]));
    const currentUser = userByEmail.get(E2E_USERS[0].email);
    const partnerUser = userByEmail.get(E2E_USERS[1].email);
    expect(currentUser).toBeDefined();
    expect(partnerUser).toBeDefined();
    if (!currentUser || !partnerUser) return;

    const participant = await e2ePrisma.roomParticipant.findFirstOrThrow({
      where: { userId: currentUser.id },
      select: { roomId: true },
    });
    await Promise.all([
      e2ePrisma.userProfile.update({
        where: { userId: currentUser.id },
        data: {
          city: "Public City One",
          country: "Public Country One",
          timezone: "Asia/Tokyo",
          lastGeoIp: "198.51.100.21",
          preferences: { privateMarker: "e2e-private-preferences-one" },
          profileNote: "e2e-private-profile-note-one",
        },
      }),
      e2ePrisma.userProfile.update({
        where: { userId: partnerUser.id },
        data: {
          city: "Public City Two",
          country: "Public Country Two",
          timezone: "Asia/Seoul",
          lastGeoIp: "198.51.100.22",
          preferences: { privateMarker: "e2e-private-preferences-two" },
          profileNote: "e2e-private-profile-note-two",
        },
      }),
    ]);

    const chatResponse = await page.goto(`/chat/${participant.roomId}`);
    expect(chatResponse?.ok()).toBe(true);
    const chatPayload = await chatResponse?.text();
    expect(chatPayload).toContain("Public City One");
    expect(chatPayload).toContain("Public City Two");
    expect(chatPayload).toContain("Asia/Tokyo");
    expect(chatPayload).toContain("Asia/Seoul");
    await expect(page.getByText("Public City One", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Public City Two", { exact: true }).first()).toBeVisible();

    const studyResponse = await page.goto("/study");
    expect(studyResponse?.ok()).toBe(true);
    const studyPayload = await studyResponse?.text();
    expect(studyPayload).toContain("Public City One");
    expect(studyPayload).toContain("Public City Two");
    expect(studyPayload).toContain("Asia/Tokyo");
    expect(studyPayload).toContain("Asia/Seoul");

    for (const payload of [chatPayload, studyPayload]) {
      expect(payload).toContain(currentUser.displayName);
      expect(payload).toContain(partnerUser.displayName);
      expect(payload).toContain(currentUser.avatarLabel);
      for (const privateField of [
        "email",
        "passwordHash",
        "sessionVersion",
        "lastGeoIp",
        "preferences",
        "profileNote",
      ]) {
        expect(payload).not.toContain(privateField);
      }
      for (const privateValue of [
        ...privateValues,
        currentUser.email,
        currentUser.passwordHash,
        partnerUser.email,
        partnerUser.passwordHash,
      ]) {
        expect(payload).not.toContain(privateValue);
      }
    }
  } finally {
    await e2ePrisma.userProfile.updateMany({
      where: { user: { email: { in: E2E_USERS.map((user) => user.email) } } },
      data: {
        city: "—",
        country: "—",
        timezone: "Asia/Shanghai",
        lastGeoIp: null,
        preferences: Prisma.JsonNull,
        profileNote: null,
      },
    });
    await e2ePrisma.$disconnect();
  }
});

test("creates and displays a post", async ({ page }) => {
  await page.goto("/posts/new");
  await page.getByLabel("Post title").fill("E2E Test Post");
  await page.getByLabel("Post content").fill("Created by the Playwright acceptance suite.");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page).toHaveURL(/\/posts\/e2e-test-post$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Test Post" })).toBeVisible();
});

test("starts and stops a focus session", async ({ context }) => {
  await withStudyUser(context, async ({ page, db, userId }) => {
    await page.goto("/study");
    const sessionKey = await startStudyFocus(page);
    await stopStudyFocus(page, sessionKey);
    await expect(db.focusSession.count({ where: { userId, sessionKey } })).resolves.toBe(1);
  });
});

test("reconciles one expired focus session after leaving and revisiting Study", async ({ context }) => {
  await withStudyUser(context, async ({ page, db, userId }) => {
    await page.goto("/study");
    const sessionKey = await startStudyFocus(page);
    await page.goto("/home");
    const expectedEndAt = new Date(Date.now() - 60_000);
    await db.focusState.update({
      where: { userId, currentSessionKey: sessionKey },
      data: {
        startedAt: new Date(expectedEndAt.getTime() - 25 * 60_000),
        expectedEndAt,
      },
    });

    expect((await page.goto("/study"))?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "开始专注" })).toBeVisible();
    await expect(page.getByText("25 分钟", { exact: true })).toHaveCount(1);

    expect((await page.reload())?.status()).toBe(200);
    await expect(page.getByRole("button", { name: "开始专注" })).toBeVisible();
    await expect(page.getByText("25 分钟", { exact: true })).toHaveCount(1);
    await expect(db.focusSession.count({ where: { userId, sessionKey } })).resolves.toBe(1);
    await expect(db.focusState.findUniqueOrThrow({ where: { userId } })).resolves.toMatchObject({
      status: "idle", currentSessionKey: sessionKey, expectedEndAt: null,
    });
  });
});

test("Focus 用例失败后清理运行状态，下一次使用从 idle 开始", async ({ context }) => {
  let failedUserId = "";
  let failedRoomId = "";
  const failure = new Error("模拟 Focus 启动后的用例失败");
  await expect(withStudyUser(context, async ({ page, db, userId, roomId }) => {
    failedUserId = userId;
    failedRoomId = roomId;
    await page.goto("/study");
    const sessionKey = await startStudyFocus(page);
    await expect(db.focusState.findUniqueOrThrow({ where: { userId } })).resolves.toMatchObject({
      status: "running", currentSessionKey: sessionKey,
    });
    throw failure;
  })).rejects.toBe(failure);

  await withStudyUser(context, async ({ page, db, userId }) => {
    expect(userId).not.toBe(failedUserId);
    await expect(db.user.count({ where: { id: failedUserId } })).resolves.toBe(0);
    await expect(db.session.count({ where: { userId: failedUserId } })).resolves.toBe(0);
    await expect(db.focusState.count({ where: { userId: failedUserId } })).resolves.toBe(0);
    await expect(db.focusSession.count({ where: { userId: failedUserId } })).resolves.toBe(0);
    await expect(db.room.count({ where: { id: failedRoomId } })).resolves.toBe(0);
    await page.goto("/study");
    await expect(page.getByRole("button", { name: "开始专注", exact: true })).toBeVisible();
    await expect(page.getByText(/专注中 ·/)).toHaveCount(0);
    const sessionKey = await startStudyFocus(page);
    await stopStudyFocus(page, sessionKey);
  });
});

test("sends a room message and renders it in the timeline", async ({ page }) => {
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat\/[^/?]+/);
  await expect(page.getByText("连接中…", { exact: true })).toBeHidden({
    timeout: 15_000,
  });
  const message = `E2E message ${Date.now()}`;
  await page.getByLabel("消息内容").fill(message);
  const sendResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      /\/api\/rooms\/[^/]+\/messages$/.test(new URL(response.url()).pathname),
  );
  await page.getByRole("button", { name: "发送", exact: true }).click();
  expect((await sendResponse).ok()).toBe(true);

  await expect(page.getByRole("article").getByText(message, { exact: true })).toBeVisible();
});

test("keeps the latest 80 messages and task summaries through send, reload and SSE reconnect", async ({ page, context }) => {
  test.setTimeout(120_000);
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const e2ePrisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const suffix = Date.now().toString(36);
  const roomId = `e2e-long-chat-${suffix}`;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const snapshots: RoomSnapshot[] = [];
  cdp.on("Network.eventSourceMessageReceived", (event) => {
    if (event.eventName !== "snapshot") return;
    const snapshot = JSON.parse(event.data) as RoomSnapshot;
    if (snapshot.room.id === roomId) snapshots.push(snapshot);
  });
  const paragraphs = page.getByRole("article").locator(":scope > p");

  try {
    const [viewer, partner, agent] = await Promise.all([
      e2ePrisma.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } }),
      e2ePrisma.user.findUniqueOrThrow({ where: { email: E2E_USERS[1].email } }),
      e2ePrisma.agent.findUniqueOrThrow({ where: { slug: "life-assistant" } }),
    ]);
    await e2ePrisma.room.create({
      data: {
        id: roomId,
        slug: roomId,
        name: "长对话回归",
        participants: { create: [{ userId: viewer.id }, { userId: partner.id }] },
      },
    });
    const rows = Array.from({ length: 100 }, (_, index) => ({
      id: `${roomId}-${String(index).padStart(3, "0")}`,
      roomId,
      senderId: viewer.id,
      senderType: "human" as const,
      content: `长对话消息 ${String(index).padStart(3, "0")}`,
      createdAt: new Date(Date.UTC(2026, 8, 1, 0, 0, Math.floor(index / 7))),
    }));
    await e2ePrisma.message.createMany({ data: [...rows].reverse() });
    await e2ePrisma.message.update({
      where: { id: rows[99].id },
      data: {
        senderId: null,
        senderType: "agent",
        senderAgentId: agent.id,
        metadata: { toolResults: [{ output: "e2e-private-message-output" }] },
      },
    });
    await e2ePrisma.agentTask.create({
      data: {
        roomId,
        agentId: agent.id,
        requestedById: viewer.id,
        sourceMessageId: rows[98].id,
        finalMessageId: rows[99].id,
        status: "completed",
        input: { prompt: "e2e-private-task-prompt" },
        toolCalls: {
          create: {
            toolName: "memo.list",
            status: "completed",
            durationMs: 12,
            input: { prompt: "e2e-private-tool-input" },
            output: { content: "e2e-private-tool-output" },
          },
        },
        llmCalls: {
          create: {
            provider: "mock",
            model: "e2e-model",
            status: "completed",
            totalTokens: 42,
            inputSummary: "e2e-private-llm-prompt",
            requestPayload: { prompt: "e2e-private-llm-request" },
            responsePayload: { content: "e2e-private-llm-response" },
          },
        },
      },
    });

    let expectedRows = rows.slice(-80).map(({ id, content }) => ({ id, content }));
    const checkWindow = async () => {
      await expect(paragraphs).toHaveText(expectedRows.map((row) => row.content));
      const response = await page.request.get(`/api/rooms/${roomId}/messages`);
      expect(response.ok()).toBe(true);
      const messages = (await response.json()).messages as ChatMessage[];
      expect(messages.map(({ id }) => id)).toEqual(expectedRows.map(({ id }) => id));
      expect(JSON.stringify(messages)).not.toContain("e2e-private-");
      await expect.poll(() => snapshots.at(-1)?.messages.map(({ id }) => id))
        .toEqual(expectedRows.map(({ id }) => id));
      expect(snapshots.at(-1)?.messages).toEqual(messages);
      expect(JSON.stringify(snapshots)).not.toContain("e2e-private-");
    };

    const initialResponse = await page.goto(`/chat/${roomId}`);
    expect(initialResponse?.ok()).toBe(true);
    const initialPayload = await initialResponse!.text();
    expect(initialPayload).toContain(rows[99].content);
    expect(initialPayload).not.toContain(rows[0].content);
    expect(initialPayload).not.toContain("e2e-private-");
    await checkWindow();
    await page.getByText("执行链路", { exact: true }).click();
    await expect(page.getByText("memo.list / completed / 12ms", { exact: true })).toBeVisible();
    await expect(page.getByText("mock / e2e-model / completed / 42 tokens", { exact: true })).toBeVisible();
    await expect(page.getByText("已派发", { exact: true })).toBeVisible();

    const content = "长对话发送后的最新消息";
    await page.getByLabel("消息内容").fill(content);
    const sent = page.waitForResponse((response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === `/api/rooms/${roomId}/messages`,
    );
    await page.getByRole("button", { name: "发送", exact: true }).click();
    const sentResponse = await sent;
    expect(sentResponse.status()).toBe(201);
    const { message } = await sentResponse.json();
    expectedRows = [...expectedRows.slice(1), { id: message.id, content }];
    await checkWindow();

    // 刷新关闭旧连接后，在浏览器 HTTP 边界注入连接重置；恢复时仍连接真实 SSE 服务。
    let allowStream = false;
    await page.route(`**/api/rooms/${roomId}/stream`, async (route) => {
      if (allowStream) await route.continue();
      else await route.abort("connectionreset");
    });
    const reloaded = await page.reload();
    expect(await reloaded!.text()).not.toContain("e2e-private-");
    await expect(paragraphs).toHaveText(expectedRows.map((row) => row.content));

    await expect(page.getByText("重连中…", { exact: true })).toBeVisible();
    const offlineMessage = await e2ePrisma.message.create({
      data: { roomId, senderId: partner.id, senderType: "human", content: "离线期间伙伴的新消息" },
    });
    expectedRows = [...expectedRows.slice(1), { id: offlineMessage.id, content: offlineMessage.content }];
    const refreshed = page.waitForResponse((response) =>
      response.request().method() === "GET"
      && new URL(response.url()).pathname === `/api/rooms/${roomId}/messages`,
    );
    allowStream = true;
    expect((await refreshed).ok()).toBe(true);
    await checkWindow();
    await expect(page.getByText("重连中…", { exact: true })).toBeHidden();
    const snapshotCount = snapshots.length;
    await expect.poll(() => snapshots.length).toBeGreaterThan(snapshotCount);
    await checkWindow();
  } finally {
    await page.goto("about:blank");
    await page.unroute(`**/api/rooms/${roomId}/stream`);
    await cdp.detach();
    await e2ePrisma.room.deleteMany({ where: { id: roomId } });
    await e2ePrisma.$disconnect();
  }
});

test("慢查询跨多个轮询周期时聊天快照保持串行，消息和 Agent 状态在重连后稳定", async ({ page, context }) => {
  test.setTimeout(120_000);
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const roomId = `e2e-slow-stream-${Date.now().toString(36)}`;
  const streamUrl = `**/api/rooms/${roomId}/stream`;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  const snapshots: RoomSnapshot[] = [];
  cdp.on("Network.eventSourceMessageReceived", (event) => {
    if (event.eventName !== "snapshot") return;
    const snapshot = JSON.parse(event.data) as RoomSnapshot;
    if (snapshot.room.id === roomId) snapshots.push(snapshot);
  });

  try {
    const viewer = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
    const agent = await db.agent.findUniqueOrThrow({ where: { slug: "life-assistant" } });
    await db.room.create({ data: {
      id: roomId, slug: roomId, name: "慢查询实时回归",
      participants: { create: { userId: viewer.id, role: "owner" } },
    } });
    const task = await db.agentTask.create({ data: {
      roomId, agentId: agent.id, requestedById: viewer.id, status: "running", input: {},
    } });
    await page.goto(`/chat/${roomId}`);
    await expect.poll(() => snapshots.at(-1)?.agentStatus.isWorking).toBe(true);
    await expect(page.getByText(/正在调用工具$/)).toBeVisible();
    const snapshotCountBeforeLock = snapshots.length;

    // 只锁隔离数据库的 Memo 表，使真实 snapshot 中的一条 SELECT 阻塞。
    // 用 PostgreSQL 锁等待及查询年龄确认跨过多个 tick，不替换服务器或 EventSource。
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`LOCK TABLE "Memo" IN ACCESS EXCLUSIVE MODE`;
      const waitingReads = () => db.$queryRaw<Array<{ ageSeconds: number }>>`
        SELECT EXTRACT(EPOCH FROM (clock_timestamp() - activity.query_start))::float8 AS "ageSeconds"
        FROM pg_locks AS waiting_lock
        JOIN pg_stat_activity AS activity ON activity.pid = waiting_lock.pid
        WHERE waiting_lock.relation = '"Memo"'::regclass
          AND waiting_lock.mode = 'AccessShareLock' AND NOT waiting_lock.granted
          AND activity.datname = current_database()
      `;
      await expect.poll(async () => Math.max(0, ...(await waitingReads()).map((row) => row.ageSeconds)), {
        timeout: 15_000, intervals: [200],
      }).toBeGreaterThanOrEqual(6);
      expect(await waitingReads()).toHaveLength(1);

      await db.$transaction([
        db.agentTask.update({ where: { id: task.id }, data: { status: "completed" } }),
        db.message.create({ data: {
          roomId, senderType: "agent", senderAgentId: agent.id, content: "慢查询期间任务已完成",
        } }),
      ]);
    }, { timeout: 30_000 });

    await expect.poll(() => snapshots.at(-1)?.agentStatus.recentTasks[0]?.status, { timeout: 15_000 }).toBe("completed");
    await expect(page.getByRole("article").getByText("慢查询期间任务已完成", { exact: true })).toBeVisible();
    await expect(page.getByText(/已就绪$/)).toBeVisible();
    const completedIndex = snapshots.findIndex((snapshot) => snapshot.agentStatus.recentTasks[0]?.status === "completed");
    expect(completedIndex).toBeGreaterThanOrEqual(snapshotCountBeforeLock);
    await expect.poll(() => snapshots.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(completedIndex + 3);
    for (const snapshot of snapshots.slice(completedIndex)) {
      expect(snapshot.agentStatus).toMatchObject({ isWorking: false, runningTasks: 0 });
      expect(snapshot.agentStatus.recentTasks[0]?.status).toBe("completed");
      expect(snapshot.messages.map(({ content }) => content)).toEqual(["慢查询期间任务已完成"]);
    }

    let allowStream = false;
    await page.route(streamUrl, async (route) => {
      if (allowStream) await route.continue();
      else await route.abort("connectionreset");
    });
    await page.reload();
    await expect(page.getByText("重连中…", { exact: true })).toBeVisible();
    const nextTask = await db.agentTask.create({ data: {
      roomId, agentId: agent.id, requestedById: viewer.id, status: "running", input: {},
    } });
    await db.message.create({ data: {
      roomId, senderType: "human", senderId: viewer.id, content: "断线期间的新消息",
    } });
    const reconnectIndex = snapshots.length;
    allowStream = true;
    await expect.poll(() => snapshots.at(-1)?.agentStatus.recentTasks[0]?.id, { timeout: 15_000 }).toBe(nextTask.id);
    await expect(page.getByText("重连中…", { exact: true })).toBeHidden();
    await expect(page.getByText(/正在调用工具$/)).toBeVisible();
    await expect(page.getByRole("article").getByText("断线期间的新消息", { exact: true })).toBeVisible();
    await expect.poll(() => snapshots.length, { timeout: 10_000 }).toBeGreaterThanOrEqual(reconnectIndex + 3);
    for (const snapshot of snapshots.slice(reconnectIndex)) {
      expect(snapshot.agentStatus).toMatchObject({ isWorking: true, runningTasks: 1 });
      expect(snapshot.agentStatus.recentTasks[0]).toMatchObject({ id: nextTask.id, status: "running" });
      expect(snapshot.messages.map(({ content }) => content)).toEqual(["慢查询期间任务已完成", "断线期间的新消息"]);
    }
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    await page.unroute(streamUrl);
    await cdp.detach();
    try {
      await db.room.deleteMany({ where: { id: roomId } });
    } finally {
      await db.$disconnect();
    }
  }
});

test("搜索失败保留已有文章，键盘重试恢复后位置与首页一致", async ({ page }) => {
  test.setTimeout(90_000);
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const prefix = `e2e-search-${Date.now().toString(36)}`;
  const authorId = `${prefix}-author`;
  const legacyId = `${prefix}-legacy`;
  const snapshotId = `${prefix}-snapshot`;
  const legacyTitle = `${prefix} 旧文章`;
  const snapshotTitle = `${prefix} 快照文章`;
  const searchRoute = "**/api/posts?*";
  const searchError = page.getByRole("main").getByRole("alert");
  let failure: 401 | 500 | "network" | null = null;
  const legacyCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: legacyTitle, exact: true }) });
  const snapshotCard = page.getByRole("article").filter({ has: page.getByRole("heading", { name: snapshotTitle, exact: true }) });
  const searchResponse = (query: string) => page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/posts" && url.searchParams.get("q") === query;
  });
  const submitSearch = (query: string, status: number) => test.step(`搜索查询并收到 HTTP ${status}`, async () => {
    const [response] = await Promise.all([
      searchResponse(query),
      test.step("输入查询并更新 URL", async () => {
        const input = page.getByRole("textbox", { name: "Search posts", exact: true });
        await input.fill(query);
        await expect(page.getByRole("button", { name: "Clear search", exact: true })).toBeVisible();
        await page.waitForURL((url) => url.pathname === "/home" && url.searchParams.get("q") === query);
        await expect(input).toHaveValue(query);
      }),
    ]);
    expect(response.status()).toBe(status);
    return response;
  });

  try {
    await db.user.create({ data: {
      id: authorId, email: `${authorId}@example.com`, displayName: "搜索作者", avatarLabel: "搜",
      passwordHash: "unused-e2e-search-password-hash",
      profile: { create: { city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo" } },
    } });
    await db.post.createMany({ data: [
      {
        id: legacyId, slug: legacyId, title: legacyTitle, content: "旧文章没有位置快照，显示作者公开位置。",
        authorId, publishedAt: new Date("2026-09-13T00:00:00Z"),
      },
      {
        id: snapshotId, slug: snapshotId, title: snapshotTitle, content: "快照位置优先于作者当前档案。",
        authorId, publishedAt: new Date("2026-09-13T00:01:00Z"),
        authorCity: "London", authorCountry: "United Kingdom", authorTimezone: "Europe/London",
      },
    ] });
    await page.goto("/home");
    await expect(legacyCard).toBeVisible();
    await expect(snapshotCard).toBeVisible();
    const legacyTime = await legacyCard.locator("time").innerText();
    const snapshotTime = await snapshotCard.locator("time").innerText();
    expect(legacyTime).toContain("Tokyo");
    expect(snapshotTime).toContain("London");

    await page.route(searchRoute, async (route) => {
      if (failure === "network") return route.abort("connectionfailed");
      if (failure) return route.fulfill({ status: failure, json: { error: "测试搜索失败" } });
      return route.continue();
    });
    const initialSearch = await submitSearch(prefix, 200);
    const initialResults = await initialSearch.json() as { posts: Array<{ id: string }> };
    expect(initialResults.posts.map(({ id }) => id).sort()).toEqual([legacyId, snapshotId].sort());
    await test.step("首次结果已显示后再验证失败保留", async () => {
      await expect(page.getByRole("article")).toHaveCount(2);
      await expect(page.getByRole("status").filter({ hasText: "正在搜索…" })).toHaveCount(0);
    });
    await expect(legacyCard.locator("time")).toHaveText(legacyTime);
    await expect(snapshotCard.locator("time")).toHaveText(snapshotTime);

    failure = 500;
    await submitSearch(legacyTitle, 500);
    await expect(searchError).toContainText("搜索失败");
    await expect(legacyCard).toBeVisible();
    await expect(snapshotCard).toBeVisible();
    await expect(page.getByText("No posts match your search.", { exact: true })).toHaveCount(0);

    for (const nextFailure of [401, "network"] as const) {
      failure = nextFailure;
      const failed = nextFailure === "network"
        ? page.waitForEvent("requestfailed", (request) => new URL(request.url()).pathname === "/api/posts")
        : searchResponse(legacyTitle);
      await page.getByRole("button", { name: "重试搜索", exact: true }).focus();
      await page.keyboard.press("Enter");
      await failed;
      await expect(searchError).toContainText(nextFailure === 401 ? "登录已失效" : "搜索失败");
      await expect(legacyCard.locator("time")).toHaveText(legacyTime);
      await expect(snapshotCard).toBeVisible();
    }

    failure = null;
    const recovered = searchResponse(legacyTitle);
    await page.getByRole("button", { name: "重试搜索", exact: true }).focus();
    await page.keyboard.press("Enter");
    expect((await recovered).status()).toBe(200);
    await expect(searchError).toHaveCount(0);
    await expect(snapshotCard).toHaveCount(0);
    await expect(legacyCard.locator("time")).toHaveText(legacyTime);
    await legacyCard.getByRole("link", { name: legacyTitle, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/posts/${legacyId}$`));
    await expect(page.getByRole("heading", { name: legacyTitle, exact: true })).toBeVisible();
  } finally {
    try {
      // 路由拦截随此页关闭释放；超时已关闭页面时也不能阻断数据清理。
      await page.close();
    } finally {
      try {
        await db.$transaction([
          db.post.deleteMany({ where: { id: { in: [legacyId, snapshotId] } } }),
          db.user.deleteMany({ where: { id: authorId } }),
        ]);
      } finally {
        await db.$disconnect();
      }
    }
  }
});

test("同毫秒文章在首页与搜索保持稳定顺序，真实 API 分页无遗漏", async ({ page }) => {
  test.setTimeout(90_000);
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const prefix = `cpagination${Date.now().toString(36)}`;
  const ids = Array.from({ length: 53 }, (_, index) => `${prefix}${String(index).padStart(3, "0")}`);
  const publishedAt = new Date("2099-09-13T01:02:03.123Z");
  const headings = page.getByRole("article").getByRole("heading", { level: 2 });
  const expectedTitles = ids.slice(3).map((id) => `同毫秒记录 ${id}`);

  try {
    const author = await db.user.findUniqueOrThrow({ where: { email: E2E_USERS[0].email } });
    // 乱序写入，避免依赖数据库插入顺序恰好与预期相同。
    await db.post.createMany({ data: ids.map((_, index) => {
      const id = ids[(index * 7) % ids.length];
      return { id, slug: id, title: `同毫秒记录 ${id}`, content: "分页完整性回归", authorId: author.id, publishedAt };
    }) });
    await page.goto("/home");
    await expect(headings).toHaveText(expectedTitles);
    await expect(headings.first()).toBeVisible();
    await headings.last().scrollIntoViewIfNeeded();
    await expect(headings.last()).toBeVisible();
    await page.reload();
    await expect(headings).toHaveText(expectedTitles);

    const search = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/posts" && url.searchParams.get("q") === prefix;
    });
    await page.getByRole("textbox", { name: "Search posts", exact: true }).fill(prefix);
    const searchResponse = await search;
    expect(searchResponse.status()).toBe(200);
    const firstPage = await searchResponse.json() as { posts: Array<{ id: string }>; nextCursor: string | null };
    expect(firstPage.posts.map((post) => post.id)).toEqual([...ids].reverse().slice(0, 50));
    await expect(headings).toHaveText(expectedTitles);

    const pagedIds: string[] = [];
    const params: Record<string, string> = { q: prefix, limit: "17" };
    let ended = false;
    for (let index = 0; index < 5; index += 1) {
      const response = await page.request.get("/api/posts", { params });
      expect(response.status()).toBe(200);
      const body = await response.json() as { posts: Array<{ id: string }>; nextCursor: string | null };
      pagedIds.push(...body.posts.map((post) => post.id));
      if (body.nextCursor === null) {
        ended = true;
        break;
      }
      params.cursor = body.nextCursor;
    }
    expect(ended).toBe(true);
    expect(pagedIds).toEqual([...ids].reverse());
    expect(new Set(pagedIds).size).toBe(ids.length);
    const legacy = await page.request.get("/api/posts", { params: { cursor: publishedAt.toISOString() } });
    expect(legacy.status()).toBe(400);
    expect(await legacy.json()).toMatchObject({ error: "Invalid request" });
  } finally {
    await page.goto("about:blank").catch(() => undefined);
    try {
      await db.post.deleteMany({ where: { id: { in: ids } } });
    } finally {
      await db.$disconnect();
    }
  }
});
