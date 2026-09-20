import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { mockServer } from "@/tests/mocks/server";

const nativeFetch = globalThis.fetch;

beforeAll(() => {
  mockServer.listen({ onUnhandledRequest: "error" });
  const interceptedFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => {
    const normalizedInput =
      typeof input === "string" && input.startsWith("/")
        ? new URL(input, window.location.origin)
        : input;
    return interceptedFetch(normalizedInput, init);
  };
});

// 卸载会同步冲刷待执行的被动效果，组件可能在 cleanup() 期间才访问全局替身（例如 useScrollReveal 的 IntersectionObserver）。
// 因此顺序固定为：先卸载、再恢复全局替身；各测试文件不要在 afterEach 里提前恢复，否则卸载阶段会缺少替身。
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
  globalThis.fetch = nativeFetch;
});
