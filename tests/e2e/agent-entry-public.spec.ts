import { expect, test } from "@playwright/test";
import { entryChunks, entryName, observeEntry, settleHydration } from "./support/agent-entry";

test("匿名 about 冷启动不下载入口代码或 GLB，页面仍可操作", async ({ page }) => {
  const observed = observeEntry(page);
  const auth = page.waitForResponse((response) => new URL(response.url()).pathname === "/api/auth/me");
  await page.goto("/about");
  expect((await auth).status()).toBe(401);
  await page.keyboard.press("End");
  await expect(page.getByRole("contentinfo")).toBeInViewport();
  await settleHydration(page);
  const chunks = await entryChunks();
  expect(observed.requests.filter((url) => url.endsWith(".glb") || chunks.includes(new URL(url).pathname))).toEqual([]);
  await expect(page.getByRole("button", { name: entryName })).toHaveCount(0);
  expect(observed.errors).toEqual([]);
});
