import { mergeConfig, defineConfig } from "vitest/config";

import { sharedVitestConfig } from "./vitest.config.ts";

export default mergeConfig(
  sharedVitestConfig,
  defineConfig({
    test: {
      name: "integration",
      environment: "node",
      include: ["tests/integration/**/*.integration.test.ts"],
      globalSetup: ["./tests/integration/global-setup.ts"],
      fileParallelism: false,
      maxWorkers: 1,
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  })
);
