import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { Prisma, PrismaClient } from "@prisma/client";
import { expect, request as playwrightRequest, test } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./support/credentials";

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
    await expect(page.getByRole("combobox")).toHaveValue("Europe/London");
  } finally {
    await e2ePrisma.userProfile.updateMany({
      where: { user: { email: { in: E2E_USERS.map((user) => user.email) } } },
      data: { city: "—", timezone: "Asia/Shanghai" },
    });
    await context.close();
    await e2ePrisma.$disconnect();
  }
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
