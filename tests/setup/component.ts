import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";

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

afterEach(() => {
  cleanup();
  mockServer.resetHandlers();
});

afterAll(() => {
  mockServer.close();
  globalThis.fetch = nativeFetch;
});
