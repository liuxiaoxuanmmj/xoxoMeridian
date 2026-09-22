import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { expect, type Page } from "@playwright/test";

export async function privateDatabaseUrl() {
  return process.env.E2E_DATABASE_URL
    ?? (await readFile(resolve("test-results/.e2e-database-url"), "utf8")).trim();
}

export async function runPrivateTask(taskId: string, databaseUrl: string) {
  await promisify(execFile)(process.execPath, [
    "--import", "tsx", resolve("tests/e2e/support/run-agent-task.ts"), taskId,
  ], {
    env: {
      ...process.env, NODE_ENV: "test", DATABASE_URL: databaseUrl, DIRECT_URL: databaseUrl,
      LLM_PROVIDER: "mock", LLM_API_KEY: "", AGENT_DEBUG_ENABLED: "false",
    },
    timeout: 30_000,
  });
}

export type EntryFrame = { at: number; top: number; bottom: number; center: number; height: number; pixels: number };
type EntryMeasurements = { draws: number; frames: EntryFrame[] };

/** 在实际 WebGL draw 之后读回透明轮廓，不依赖模型内部 ref 或逐像素黄金图。 */
export async function observeModelFrames(page: Page) {
  await page.addInitScript(() => {
    const measured = window as unknown as { entryMeasurements: EntryMeasurements };
    measured.entryMeasurements = { draws: 0, frames: [] };
    const queued = new WeakSet<WebGL2RenderingContext>();
    const original = WebGL2RenderingContext.prototype.drawElements;
    WebGL2RenderingContext.prototype.drawElements = function (...args: Parameters<typeof original>) {
      const result = Reflect.apply(original, this, args);
      const canvas = this.canvas;
      if (!(canvas instanceof HTMLCanvasElement) || !canvas.closest("[data-agent-entry]")) return result;
      // PMREM 使用帧缓冲；只采样最终提交到可见画布的帧。
      if (this.getParameter(this.FRAMEBUFFER_BINDING) !== null) return result;
      const state = measured.entryMeasurements;
      state.draws += 1;
      if (queued.has(this)) return result;
      queued.add(this);
      // 一个 render 可有多个 mesh draw；在渲染回调结束后只读完整画面。
      queueMicrotask(() => {
        queued.delete(this);
        if (this.isContextLost()) return;
        const width = this.drawingBufferWidth;
        const height = this.drawingBufferHeight;
        const pixels = new Uint8Array(width * height * 4);
        this.readPixels(0, 0, width, height, this.RGBA, this.UNSIGNED_BYTE, pixels);
        let top = height;
        let bottom = -1;
        let total = 0;
        let sum = 0;
        for (let y = 0; y < height; y += 2) {
          for (let x = 0; x < width; x += 2) {
            if (pixels[(y * width + x) * 4 + 3] < 32) continue;
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            total += 1;
            sum += y;
          }
        }
        if (total) state.frames.push({ at: performance.now(), top, bottom, center: sum / total, height, pixels: total });
        if (state.frames.length > 600) state.frames.splice(0, 300);
      });
      return result;
    };
  });
}

export async function modelMeasurements(page: Page) {
  return page.evaluate(() => (window as unknown as { entryMeasurements: EntryMeasurements }).entryMeasurements);
}

export async function expectModelSettled(page: Page) {
  let previous = -1;
  let stable = 0;
  await expect.poll(async () => {
    const { draws } = await modelMeasurements(page);
    stable = draws === previous && draws > 0 ? stable + 1 : 0;
    previous = draws;
    return stable;
  }, { intervals: [100, 150, 200], timeout: 8_000 }).toBeGreaterThanOrEqual(3);
}
