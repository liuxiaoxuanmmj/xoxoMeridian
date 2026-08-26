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
