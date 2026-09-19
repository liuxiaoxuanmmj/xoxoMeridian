import { readFile } from "node:fs/promises";
import { PrismaClient } from "@prisma/client";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { entryChunks, entryName, expectReady, hostInteraction, modelPath, observeEntry, settleHydration } from "./support/agent-entry";
import { e2eAppMode } from "./support/app-mode";
import { E2E_PASSWORD, E2E_USERS } from "./support/credentials";

// 完整 Chromium 支持原生窗口焦点；默认 headless shell 的 bringToFront 不产生 focus。
// channel 是 worker 级设置，须对整个入口 spec 配置。
test.use({ channel: "chromium" });

test("Chat 冷启动不下载入口代码与模型", async ({ page }) => {
  const observed = observeEntry(page);
  await page.goto("/chat");
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
  await settleHydration(page);
  const chunks = await entryChunks();
  expect(observed.requests.filter((url) => url.endsWith(".glb") || chunks.includes(new URL(url).pathname))).toEqual([]);
  await expect(page.getByRole("button", { name: entryName })).toHaveCount(0);
  expect(observed.errors).toEqual([]);
});

test("真实首帧、构建主题、导航及 Chat 往返缓存", async ({ page }) => {
  const observed = observeEntry(page);
  await page.addInitScript(() => {
    (window as unknown as { entryViolations: string[] }).entryViolations = [];
    addEventListener("securitypolicyviolation", (event) => {
      (window as unknown as { entryViolations: string[] }).entryViolations.push(event.violatedDirective);
    });
  });
  const response = await page.goto("/home");
  await expectReady(page);
  if (e2eAppMode() === "production") {
    expect(response!.headers()["content-security-policy"]).toContain("'wasm-unsafe-eval'");
    expect(response!.headers()["content-security-policy"]).not.toContain(" 'unsafe-eval'");
  }
  await hostInteraction(page);
  await page.getByRole("button", { name: entryName }).click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  await expect(page.locator("[data-agent-entry] canvas")).toHaveCount(0);
  await page.goBack();
  await expectReady(page);
  expect(observed.requests.filter((url) => url.endsWith(".glb")).map((url) => new URL(url).pathname)).toEqual([modelPath]);
  const external = observed.requests.filter((url) => /\.(?:glb|wasm|hdr)(?:\?|$)/.test(url) && new URL(url).origin !== new URL(page.url()).origin);
  expect(external).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { entryViolations: string[] }).entryViolations)).toEqual([]);
  expect(observed.errors).toEqual([]);
});

test("登录态公开 about 也能显示入口", async ({ page }) => {
  await page.goto("/about");
  await expectReady(page);
  await page.getByRole("button", { name: entryName }).focus();
  await expect(page.getByRole("tooltip")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("tooltip")).toHaveCount(0);
  await expect(page.getByRole("button", { name: entryName })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
});

test("静止场景停止绘制，三次路由往返只保留一个 Canvas", async ({ page }, testInfo) => {
  let authenticatedAt = 0;
  page.on("response", (response) => {
    if (new URL(response.url()).pathname === "/api/auth/me" && response.status() === 200) authenticatedAt = Date.now();
  });
  await page.addInitScript(() => {
    const measured = window as unknown as { entryDraws: number };
    measured.entryDraws = 0;
    const draw = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args: Parameters<typeof draw>) {
      measured.entryDraws += 1;
      return Reflect.apply(draw, this, args);
    };
  });
  const started = Date.now();
  await page.goto("/home");
  await expectReady(page);
  const readyMilliseconds = Date.now() - started;
  const authToReadyMilliseconds = Date.now() - authenticatedAt;
  const heaps: (number | null)[] = [];
  for (let visit = 0; visit < 3; visit += 1) {
    await page.evaluate(() => new Promise<void>((resolve) => {
      let frames = 0;
      const tick = () => { if (++frames === 12) resolve(); else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    }));
    const before = await page.evaluate(() => (window as unknown as { entryDraws: number }).entryDraws);
    await settleHydration(page);
    expect(await page.evaluate(() => (window as unknown as { entryDraws: number }).entryDraws)).toBe(before);
    heaps.push(await page.evaluate(() => (performance as Performance & { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null));
    await page.getByRole("button", { name: entryName }).click();
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);
    await expect(page.locator("[data-agent-entry] canvas")).toHaveCount(0);
    await page.goBack();
    await expectReady(page);
  }
  await testInfo.attach("agent-entry-lifecycle", {
    body: JSON.stringify({ readyMilliseconds, authToReadyMilliseconds, heaps, note: "Chromium 功能观测；堆大小未强制 GC，不作为设备性能承诺。" }), contentType: "application/json",
  });
});

test("GLB 尚未到达时入口不显示、不聚焦且加载中进入 Chat 可安全卸载", async ({ page }) => {
  const observed = observeEntry(page);
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${modelPath}`, async (route) => { await gate; await route.continue().catch(() => undefined); });
  await page.goto("/home");
  await expect(page.locator("[data-agent-entry]")).toHaveCount(1);
  const button = page.locator(`[aria-label="${entryName}"]`);
  await expect(button).toBeDisabled();
  await expect(button).toHaveAttribute("tabindex", "-1");
  await expect(page.locator("[data-agent-entry]")).toHaveCSS("opacity", "0");
  await page.getByRole("link", { name: "Chat", exact: true }).click();
  await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  release();
  await settleHydration(page);
  await expect(page.locator("[data-agent-entry]")).toHaveCount(0);
  expect(observed.errors).toEqual([]);
});

for (const failure of ["404", "损坏", "chunk", "context-lost", "webgl-create"] as const) {
  test(`${failure} 故障隐藏入口，宿主页面保持可交互`, async ({ page }) => {
    const observed = observeEntry(page);
    let failedRequest = false;
    if (failure === "404" || failure === "损坏") {
      await page.route(`**${modelPath}`, (route) => {
        failedRequest = true;
        return route.fulfill({ status: failure === "404" ? 404 : 200, body: "invalid GLB", contentType: "model/gltf-binary" });
      });
    }
    if (failure === "chunk") {
      const chunks = await entryChunks();
      await page.route((url) => chunks.includes(url.pathname), (route) => { failedRequest = true; return route.abort(); });
    }
    if (failure === "webgl-create") {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
          if (type === "webgl2" || type === "webgl" || type === "experimental-webgl") return null;
          return Reflect.apply(original, this, [type, ...args]);
        } as typeof original;
      });
    }
    const auth = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/me");
    await page.goto("/home");
    expect((await auth).status()).toBe(200);
    if (failure === "context-lost") {
      await expectReady(page);
      await page.locator("[data-agent-entry] canvas").evaluate((node) => {
        const context = (node as HTMLCanvasElement).getContext("webgl2");
        const extension = context?.getExtension("WEBGL_lose_context");
        if (!extension) throw new Error("浏览器必须支持真实 WebGL context lost 验证");
        extension.loseContext();
      });
    } else if (failure !== "webgl-create") {
      await expect.poll(() => failedRequest).toBe(true);
    }
    await hostInteraction(page);
    await expect(page.locator("[data-agent-entry]")).toHaveCount(0);
    await expect(page.getByRole("button", { name: entryName })).toHaveCount(0);
    expect(observed.errors).toEqual([]);
  });
}

test("真实二进制释放后才可点击，移动触摸和窄屏布局正常", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ baseURL, storageState: "test-results/.auth/user-one.json", viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
  const page = await context.newPage();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route(`**${modelPath}`, async (route) => { await gate; await route.continue(); });
  try {
    await page.goto("/home");
    await expect(page.locator(`[aria-label="${entryName}"]`)).toBeDisabled();
    release();
    await expectReady(page);
    for (const viewport of [{ width: 390, height: 844 }, { width: 320, height: 568 }, { width: 844, height: 390 }]) {
      await page.setViewportSize(viewport);
      const box = await page.getByRole("button", { name: entryName }).boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
    }
    await page.getByRole("button", { name: entryName }).tap();
    await expect(page).toHaveURL(/\/chat\/[^/]+$/);
  } finally { release(); await context.close(); }
});

for (const width of [320, 390, 1280]) {
  test(`${width}px 页面表单、Study 与 Post 控件可操作`, async ({ page, baseURL }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/me");
    await expectReady(page);
    await page.getByLabel("昵称", { exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.getByRole("button", { name: "保存", exact: true }).click({ trial: true, timeout: 5_000 });
    await page.getByRole("button", { name: "退出登录", exact: true }).click({ trial: true, timeout: 5_000 });
    if (width < 768) {
      // 模拟输入期间可用视口缩短；真实系统软键盘仍须在目标设备复核。
      await page.getByLabel(/自我介绍/).click();
      await page.setViewportSize({ width, height: 400 });
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByRole("button", { name: "保存", exact: true }).click({ trial: true, timeout: 5_000 });
      await page.setViewportSize({ width, height: 844 });
    }

    await page.goto("/study");
    await expectReady(page);
    await page.getByRole("button", { name: "开始专注", exact: true }).click({ trial: true });
    await page.getByRole("textbox", { name: "添加待办" }).fill("入口布局检查");

    const created = await page.request.post("/api/posts", {
      headers: { origin: baseURL! },
      data: { title: `Agent Entry 布局 ${width}`, content: "正文段落\n\n".repeat(50) },
    });
    expect(created.ok()).toBe(true);
    const { post } = await created.json() as { post: { slug: string } };
    try {
      await page.goto(`/posts/${post.slug}`);
      await expectReady(page);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByRole("link", { name: "返回博客列表" }).click({ trial: true });
      await page.goto(`/posts/edit/${post.slug}`);
      await expectReady(page);
      await page.getByLabel("Post content", { exact: true }).click();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.getByRole("button", { name: "Update", exact: true }).click({ trial: true });
      await page.getByRole("button", { name: "Delete", exact: true }).click({ timeout: 5_000 });
      await expect(page.getByText("Are you sure you want to delete this post?", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Cancel", exact: true }).last().click();
    } finally {
      expect((await page.request.delete(`/api/posts/${post.slug}`, { headers: { origin: baseURL! } })).ok()).toBe(true);
    }
  });
}

async function secondUserContext(browser: Browser, baseURL: string | undefined) {
  if (!baseURL) throw new Error("入口身份生命周期验证需要隔离 E2E baseURL");
  // 独立登录第二位用户，避免使其他用例复用的第一位用户 Session 失效。
  const context = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
  try {
    const response = await context.request.post("/api/auth/login", {
      headers: { origin: baseURL },
      data: { email: E2E_USERS[1].email, password: E2E_PASSWORD },
    });
    expect(response.status()).toBe(200);
    if (e2eAppMode() === "development") {
      // 跨标签持有 WebGL 句柄期间不能发生首次路由编译引起的整页重载。
      for (const path of ["/", "/home", "/me", "/about", "/api/auth/logout"]) {
        const warm = await context.request.get(path);
        expect(warm.status()).toBe(path === "/api/auth/logout" ? 405 : 200);
      }
    }
    return context;
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function useNativeFocus(...pages: Page[]) {
  // Playwright 在跨文档导航后重新启用始终聚焦，须在导航完成后取消这个覆盖。
  for (const page of pages) {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  }
}

test.describe("入口身份生命周期", () => {
  test("跨标签退出卸载公开页入口与 WebGL，重新登录并聚焦后复用模型恢复导航", async ({ browser, baseURL }) => {
    test.setTimeout(90_000);
    const context = await secondUserContext(browser, baseURL);
    try {
      const otherTab = await context.newPage();
      await otherTab.goto("/me");
      await expectReady(otherTab);
      const page = await context.newPage();
      const observed = observeEntry(page);
      await page.goto("/about");
      await expectReady(page);
      await useNativeFocus(page, otherTab);
      await otherTab.bringToFront();
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
      const oldContext = await page.locator("[data-agent-entry] canvas").evaluateHandle((canvas) => {
        const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
        if (!gl) throw new Error("入口需要真实 WebGL2 context");
        return gl;
      });
      expect(await oldContext.evaluate((gl) => gl.isContextLost())).toBe(false);
      otherTab.once("dialog", (dialog) => dialog.accept());
      const logout = otherTab.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/logout");
      const invalidated = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/me" && response.status() === 401, { timeout: 10_000 });
      await otherTab.getByRole("button", { name: "退出登录", exact: true }).click();
      expect((await logout).status()).toBe(200);
      await invalidated;
      // 公开 About 没有 SessionHeartbeat；不导航、不手动聚焦也必须收到跨标签退出通知。
      await expect(page).toHaveURL(/\/about$/);
      await expect(page.getByRole("button", { name: entryName })).toHaveCount(0);
      await expect(page.locator("[data-agent-entry] canvas")).toHaveCount(0);
      await expect.poll(() => oldContext.evaluate((gl) => gl.isContextLost())).toBe(true);
      await oldContext.dispose();

      const loginForm = otherTab.locator("form");
      await expect(loginForm.getByRole("button", { name: "登录", exact: true })).toBeVisible();
      // 硬导航后的表单须已能交互，再填写受控输入；仅看到 SSR 按钮不足以证明 hydration 完成。
      await loginForm.getByRole("button", { name: "显示密码", exact: true }).click();
      await expect(loginForm.getByLabel("密码", { exact: true })).toHaveAttribute("type", "text");
      await loginForm.getByRole("button", { name: "隐藏密码", exact: true }).click();
      await loginForm.getByLabel("邮箱", { exact: true }).fill(E2E_USERS[1].email);
      await loginForm.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD);
      const login = otherTab.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/login");
      await loginForm.getByRole("button", { name: "登录", exact: true }).click();
      const loginResponse = await login;
      expect(loginResponse.request().postDataJSON()).toEqual({ email: E2E_USERS[1].email, password: E2E_PASSWORD });
      expect(loginResponse.status()).toBe(200);
      await expect(otherTab).toHaveURL(/\/home$/);
      await expectReady(otherTab);
      await useNativeFocus(page, otherTab);
      const revalidated = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/me" && response.status() === 200, { timeout: 10_000 });
      await page.bringToFront();
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
      await revalidated;
      await expectReady(page);
      expect(observed.requests.filter((url) => url.endsWith(".glb")).map((url) => new URL(url).pathname)).toEqual([modelPath]);
      await page.getByRole("button", { name: entryName }).focus();
      const chat = page.waitForResponse((response) => /^\/chat\/[^/]+$/.test(new URL(response.url()).pathname));
      await page.keyboard.press("Enter");
      expect((await chat).ok()).toBe(true);
      await expect(page).toHaveURL(/\/chat\/[^/]+$/);
      await expect(page.getByRole("button", { name: "发送", exact: true })).toBeVisible();
      await expect(page.locator("[data-agent-entry] canvas")).toHaveCount(0);
      expect(observed.errors).toEqual([]);
    } finally {
      try {
        await context.request.post("/api/auth/logout", { headers: { origin: baseURL! } });
      } finally { await context.close(); }
    }
  });

  test("真实 Session 到期后聚焦重验 401 并释放入口，不依赖退出通知", async ({ browser, baseURL }) => {
    const databaseUrl = process.env.E2E_DATABASE_URL
      ?? (await readFile("test-results/.e2e-database-url", "utf8")).trim();
    const database = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    const context = await secondUserContext(browser, baseURL);
    try {
      const page = await context.newPage();
      const observed = observeEntry(page);
      await page.goto("/about");
      await expectReady(page);
      const otherTab = await context.newPage();
      await otherTab.goto("about:blank");
      await useNativeFocus(page, otherTab);
      await otherTab.bringToFront();
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(false);
      const expired = await database.session.updateMany({
        where: { user: { email: E2E_USERS[1].email } },
        data: { expiresAt: new Date(0) },
      });
      expect(expired.count).toBe(1);
      expect((await context.request.get("/api/auth/me")).status()).toBe(401);
      const revalidated = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/me" && response.status() === 401, { timeout: 10_000 });
      await page.bringToFront();
      await expect.poll(() => page.evaluate(() => document.hasFocus())).toBe(true);
      await revalidated;
      await expect(page).toHaveURL(/\/about$/);
      await expect(page.getByRole("button", { name: entryName })).toHaveCount(0);
      await expect(page.locator("[data-agent-entry] canvas")).toHaveCount(0);
      expect(observed.requests.filter((url) => url.endsWith(".glb"))).toHaveLength(1);
      expect(observed.errors).toEqual([]);
    } finally {
      try {
        await context.request.post("/api/auth/logout", { headers: { origin: baseURL! } });
      } finally {
        await context.close();
        await database.$disconnect();
      }
    }
  });
});
