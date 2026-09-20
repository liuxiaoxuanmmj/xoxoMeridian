import os from "node:os";

import { defineConfig, mergeConfig } from "vitest/config";

// 全量 Vitest 的峰值内存近似线性于 worker 数（每 worker 约 160MB）。默认 `maxWorkers = cpus - 1`
// 在本机（32 CPU / 7.8GB）解析为 31，峰值 RSS 达 5.1GB / 33 进程，与宿主及其他工具争用内存；
// 此时首个"在测试体内动态导入 Route"的用例（tests/server/atlas-storage-routes.test.ts 与
// tests/server/home-board-routes.test.ts 的首项）会在默认 5000ms 单项超时下失败（feat-066）。
// 对照实测（本机全量 84 文件/699 项）：31 workers → 峰值 5.1GB / 宿主余量 1.7–1.8GB；
// 16 → 3.2GB / 2.8–3.1GB；8 → 1.8GB / 3.9GB；4 → 1.1GB / 4.4GB。全量耗时 31→7.3–11.9s、
// 16→6.4–6.9s、8→8.8–10.4s、4→15.3s：压到 8 只比默认慢 1–3 秒，峰值内存降到三分之一。
// 因此把支持配置固定为"最多 8 个 worker，且不超过宿主可用并行度减一"，不改变任何断言与超时。
const MAX_TEST_WORKERS = 8;
const testMaxWorkers = Math.max(1, Math.min(MAX_TEST_WORKERS, os.availableParallelism() - 1));

export const sharedVitestConfig = defineConfig({
  oxc: false,
  esbuild: {
    jsx: "automatic",
  },
  test: {
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      include: ["agent/**/*.ts", "app/api/**/*.ts", "lib/**/*.ts"],
      exclude: [
        "**/*.d.ts",
        "agent/agent-worker.ts",
        "lib/prisma.ts",
      ],
      thresholds: {
        branches: 35,
        functions: 45,
        lines: 40,
        statements: 40,
      },
    },
  },
  resolve: {
    alias: {
      "@": new URL(".", import.meta.url).pathname,
    },
  },
});

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      maxWorkers: testMaxWorkers,
      projects: [
        {
          extends: true,
          test: {
            name: "node",
            environment: "node",
            include: [
              "tests/agent/**/*.test.ts",
              "tests/lib/**/*.test.ts",
              "tests/server/**/*.test.ts",
            ],
          },
        },
        {
          extends: true,
          test: {
            name: "component",
            environment: "jsdom",
            environmentOptions: {
              jsdom: {
                url: "http://localhost:3000",
              },
            },
            include: ["tests/component/**/*.test.{ts,tsx}"],
            setupFiles: ["./tests/setup/component.ts"],
          },
        },
      ],
    },
  })
);
