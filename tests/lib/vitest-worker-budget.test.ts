import os from "node:os";

import { describe, expect, it } from "vitest";

import vitestConfig from "@/vitest.config";
import integrationConfig from "@/vitest.integration.config";

// feat-066 的回归契约：默认 `maxWorkers = cpus - 1`（本机 31）会让全量 Vitest 的峰值 RSS 撞上
// 宿主内存上限，使首个"在测试体内动态导入 Route"的用例在默认 5000ms 单项超时下失败。
// 这里断言的是两份真实配置解析后的 worker 预算，而不是源码文本。
const MAX_SELECTED_WORKERS = 8;

describe("Vitest worker 预算", () => {
  it("默认配置把 worker 数压在宿主预算内，且不超过可用并行度减一", () => {
    const maxWorkers = vitestConfig.test?.maxWorkers ?? 0;

    expect(Number.isInteger(maxWorkers)).toBe(true);
    expect(maxWorkers).toBeGreaterThanOrEqual(1);
    expect(maxWorkers).toBeLessThanOrEqual(MAX_SELECTED_WORKERS);
    expect(maxWorkers).toBeLessThanOrEqual(Math.max(1, os.availableParallelism() - 1));
  });

  it("集成配置保持串行执行，不得被默认 worker 预算覆盖", () => {
    expect(integrationConfig.test?.maxWorkers).toBe(1);
  });
});
