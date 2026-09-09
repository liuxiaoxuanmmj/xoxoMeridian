import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

import { E2E_USERS } from "./support/credentials";

test("renders the authenticated home navigation", async ({ page }) => {
  await page.goto("/home");

  await expect(page.getByRole("link", { name: "Blog" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Chat" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Study" })).toBeVisible();
  await expect(page.getByRole("link", { name: E2E_USERS[0].displayName })).toBeVisible();
});

test("creates and displays a post", async ({ page }) => {
  await page.goto("/posts/new");
  await page.getByLabel("Post title").fill("E2E Test Post");
  await page.getByLabel("Post content").fill("Created by the Playwright acceptance suite.");
  await page.getByRole("button", { name: "Publish" }).click();

  await expect(page).toHaveURL(/\/posts\/e2e-test-post$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "E2E Test Post" })).toBeVisible();
});

test("starts and stops a focus session", async ({ page }) => {
  await page.goto("/study");
  await page.getByRole("button", { name: "开始专注" }).click();
  await expect(page.getByText(/专注中 ·/)).toBeVisible();
  const stopResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/study/stop",
  );
  await page.getByRole("button", { name: "停止" }).click();
  expect((await stopResponse).ok()).toBe(true);

  await expect(page.getByRole("button", { name: "开始专注" })).toBeVisible();
});

test("reconciles one expired focus session after leaving and revisiting Study", async ({ page }) => {
  await page.goto("/study");
  const startResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST"
      && new URL(response.url()).pathname === "/api/study/start",
  );
  await page.getByRole("button", { name: "开始专注" }).click();
  const startBody = await (await startResponse).json() as {
    state: { sessionKey: string };
  };
  await expect(page.getByText(/专注中 ·/)).toBeVisible();

  await page.goto("/home");
  const databaseUrl = process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
  const e2ePrisma = new PrismaClient({
    datasources: { db: { url: databaseUrl } },
  });
  const expectedEndAt = new Date(Date.now() - 60_000);
  try {
    const user = await e2ePrisma.user.findUniqueOrThrow({
      where: { email: E2E_USERS[0].email },
      select: { id: true },
    });
    await e2ePrisma.focusState.update({
      where: { userId: user.id },
      data: {
        startedAt: new Date(expectedEndAt.getTime() - 25 * 60_000),
        expectedEndAt,
      },
    });

    await page.goto("/study");
    await expect(page.getByRole("button", { name: "开始专注" })).toBeVisible();
    await expect(page.getByText("25 分钟", { exact: true })).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole("button", { name: "开始专注" })).toBeVisible();
    await expect(page.getByText("25 分钟", { exact: true })).toHaveCount(1);
    await expect(e2ePrisma.focusSession.count({
      where: {
        userId: user.id,
        sessionKey: startBody.state.sessionKey,
      },
    })).resolves.toBe(1);
  } finally {
    await e2ePrisma.$disconnect();
  }
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
