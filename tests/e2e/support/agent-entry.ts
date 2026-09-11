import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, type Page } from "@playwright/test";
import { e2eAgentEntryTheme, e2eAppMode } from "./app-mode";

export const entryName = "打开 Agent 聊天";
export const modelPath = `/models/agent-entry/${e2eAgentEntryTheme()}/scene.glb`;

/** 从构建的动态入口映射读取文件，再识别只属于场景的 bundle；不猜测 hash 文件名。 */
export async function entryChunks() {
  const buildDirectory = e2eAppMode() === "production" ? ".next" : ".next/dev";
  const manifest: Record<string, { files: string[] }> = JSON.parse(await readFile(join(buildDirectory, "react-loadable-manifest.json"), "utf8"));
  const entry = Object.entries(manifest).find(([key]) => key.includes("AgentEntryGate") && key.endsWith("./AgentEntry"));
  expect(entry, "构建必须提供入口动态资源映射").toBeDefined();
  const dedicated: string[] = [];
  for (const file of entry![1].files.filter((file) => file.endsWith(".js"))) {
    const bundle = await readFile(join(buildDirectory, file), "utf8");
    if (/THREE\.WebGLRenderer|THREE\.GLTFLoader|R3F:|data-agent-entry-scene/.test(bundle)) dedicated.push(`/_next/${file}`);
  }
  expect(dedicated.length, "至少识别实际入口/渲染 bundle").toBeGreaterThan(0);
  return dedicated;
}

export function observeEntry(page: Page) {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  return { requests, errors };
}

export async function expectReady(page: Page) {
  await expect(page.locator("[data-agent-entry][data-ready=true]")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: entryName })).toBeEnabled();
  await expect(page.locator("[data-agent-entry] canvas")).toHaveCount(1);
}

export async function hostInteraction(page: Page) {
  const search = page.getByPlaceholder("Search posts...");
  await search.fill("agent entry 验证");
  await expect(search).toHaveValue("agent entry 验证");
  await search.fill("");
}

export async function settleHydration(page: Page) {
  // 让已经完成的认证回调与 React 提交完成；不把网络空闲当成 SSE 页面就绪。
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}
