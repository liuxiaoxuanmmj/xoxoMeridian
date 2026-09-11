import { expect, test } from "@playwright/test";

import { E2E_PASSWORD, E2E_USERS } from "./support/credentials";

test("shows accessible login and registration forms", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "欢迎回来！" })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
  await expect(page.getByLabel("密码", { exact: true })).toBeVisible();

  await page.locator("form").getByRole("button", { name: "注册", exact: true }).click();
  await expect(page.getByRole("heading", { name: "创建账号" })).toBeVisible();
  await expect(page.getByLabel("昵称")).toBeVisible();
  await expect(page.getByLabel("邀请码")).toBeVisible();
});

test("serves the shared brand mark and browser tab icon", async ({ page }) => {
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/");

    const brandLink = page.getByRole("link", { name: "XOXO Meridian" });
    const brandMark = brandLink.locator("img");
    await expect(brandLink).toBeVisible();
    await expect(brandLink).toHaveAttribute("href", "/home");
    await expect(brandMark).toHaveAttribute("src", "/brand/logo_transparent.svg");
    await expect(brandMark).toHaveAttribute("alt", "");
    await expect(brandMark).toHaveCSS("width", "24px");
    await expect(brandMark).toHaveCSS("height", "24px");
    await expect(brandMark.locator("..")).toHaveCSS("width", "32px");
    await expect(brandMark.locator("..")).toHaveCSS("height", "32px");

    const brandBox = await brandLink.boundingBox();
    expect(brandBox).not.toBeNull();
    expect((brandBox?.x ?? width) + (brandBox?.width ?? 0)).toBeLessThanOrEqual(width);
  }

  const iconLink = page.locator('head link[rel="icon"]');
  await expect(iconLink).toHaveAttribute("href", "/brand/logo_white.svg");
  await expect(iconLink).toHaveAttribute("type", "image/svg+xml");
  await expect(iconLink).toHaveAttribute("sizes", "any");

  const iconResponse = await page.request.get("/brand/logo_white.svg");
  expect(iconResponse.ok()).toBe(true);
  expect(iconResponse.headers()["content-type"]).toContain("image/svg+xml");

  const renderedIconSizes = await page.evaluate(async () => {
    return Promise.all([16, 32].map(async (size) => {
      const image = new Image(size, size);
      image.src = "/brand/logo_white.svg";
      image.style.width = `${size}px`;
      image.style.height = `${size}px`;
      document.body.append(image);
      await image.decode();
      const bounds = image.getBoundingClientRect();
      image.remove();
      return { width: bounds.width, height: bounds.height };
    }));
  });
  expect(renderedIconSizes).toEqual([
    { width: 16, height: 16 },
    { width: 32, height: 32 },
  ]);
});

test("supports password visibility and recovery entry points", async ({ page }) => {
  await page.goto("/");
  const password = page.getByLabel("密码", { exact: true });
  await password.fill("visible-password");
  await page.getByRole("button", { name: "显示密码" }).click();
  await expect(password).toHaveAttribute("type", "text");

  await page.getByRole("link", { name: "忘记密码？" }).click();
  await expect(page.getByRole("heading", { name: "重置密码" })).toBeVisible();
  await expect(page.getByLabel("邮箱")).toBeVisible();
});

test("redirects anonymous visitors away from protected pages", async ({ page }) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "欢迎回来！" })).toBeVisible();
});

test("logs an existing user in through the browser", async ({ page }) => {
  const loginUser = E2E_USERS[1];

  await page.goto("/");
  await page.getByLabel("邮箱").fill(loginUser.email);
  await page.getByLabel("密码", { exact: true }).fill(E2E_PASSWORD);
  await page.locator("form").getByRole("button", { name: "登录", exact: true }).click();

  await expect(page).toHaveURL(/\/home$/);
  await expect(page.getByRole("link", { name: loginUser.displayName })).toBeVisible();
});
