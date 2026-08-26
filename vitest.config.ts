import { defineConfig, mergeConfig } from "vitest/config";

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
