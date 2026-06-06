import React from "react";
import { JSDOM } from "jsdom";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginVisualsManifest } from "@/lib/login-visuals";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mockedFallbackVisuals = vi.hoisted<LoginVisualsManifest>(() => ({
  version: 1,
  intervalMs: 9000,
  items: [
    {
      id: "mocked-fallback",
      imageUrl: "https://cdn.example.com/login/fallback.jpg",
      theme: {
        accent: "#102030",
        accentHover: "#203040",
        gradientFrom: "#304050",
        gradientTo: "#405060",
        overlay: "rgba(0,0,0,0.18)",
      },
    },
  ],
}));

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: () => React.createElement("form", { "data-testid": "login-form" }),
}));

vi.mock("@/components/auth/RegisterForm", () => ({
  RegisterForm: () => React.createElement("form", { "data-testid": "register-form" }),
}));

vi.mock("@/lib/login-visuals", () => ({
  FALLBACK_LOGIN_VISUALS: mockedFallbackVisuals,
}));

const twoVisuals: LoginVisualsManifest = {
  version: 1,
  intervalMs: 5000,
  items: [
    {
      id: "first",
      imageUrl: "https://cdn.example.com/login/first.jpg",
      theme: {
        accent: "#112233",
        accentHover: "#223344",
        gradientFrom: "#334455",
        gradientTo: "#445566",
        overlay: "rgba(0,0,0,0.12)",
      },
    },
    {
      id: "second",
      imageUrl: "https://cdn.example.com/login/second.jpg",
      theme: {
        accent: "#665544",
        accentHover: "#554433",
        gradientFrom: "#443322",
        gradientTo: "#332211",
        overlay: "rgba(255,255,255,0.18)",
      },
    },
  ],
};

let dom: JSDOM | null = null;
let root: Root | null = null;
let container: HTMLDivElement | null = null;
let loadedImages: string[] = [];

function installDom({ reducedMotion = false }: { reducedMotion?: boolean } = {}) {
  dom = new JSDOM("<!doctype html><html><body><div id=\"root\"></div></body></html>", {
    url: "http://localhost:3000",
  });
  container = dom.window.document.getElementById("root") as HTMLDivElement;

  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("MediaQueryListEvent", dom.window.Event);

  dom.window.matchMedia = vi.fn().mockReturnValue({
    matches: reducedMotion,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });

  loadedImages = [];
  class MockImage {
    set src(value: string) {
      loadedImages.push(value);
    }
  }
  vi.stubGlobal("Image", MockImage);
}

async function renderAuthPanel(visuals: LoginVisualsManifest) {
  const { AuthPanel } = await import("@/components/auth/AuthPanel");
  root = createRoot(container!);
  await React.act(async () => {
    root!.render(React.createElement(AuthPanel, { visuals }));
  });
}

describe("AuthPanel login visuals", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    if (root) {
      React.act(() => {
        root!.unmount();
      });
    }
    root = null;
    container = null;
    dom = null;
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("uses the shared fallback visuals when manifest items are unexpectedly empty", async () => {
    const { AuthPanel } = await import("@/components/auth/AuthPanel");

    const html = renderToStaticMarkup(
      React.createElement(AuthPanel, {
        visuals: { version: 1, intervalMs: 7000, items: [] } as unknown as LoginVisualsManifest,
      })
    );

    expect(html).toContain("https://cdn.example.com/login/fallback.jpg");
    expect(html).toContain("--auth-accent:#102030");
  });

  it("rotates visual layers on the configured interval and preloads the next image", async () => {
    installDom();
    await renderAuthPanel(twoVisuals);

    expect(
      container!.querySelector('[data-testid="auth-visual-layer-first"]')?.getAttribute("data-active")
    ).toBe("true");
    expect(
      container!.querySelector('[data-testid="auth-visual-layer-second"]')?.getAttribute("data-active")
    ).toBe("false");
    expect(loadedImages).toContain("https://cdn.example.com/login/second.jpg");

    await React.act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(
      container!.querySelector('[data-testid="auth-visual-layer-first"]')?.getAttribute("data-active")
    ).toBe("false");
    expect(
      container!.querySelector('[data-testid="auth-visual-layer-second"]')?.getAttribute("data-active")
    ).toBe("true");
  });

  it("does not auto-rotate when the user prefers reduced motion", async () => {
    installDom({ reducedMotion: true });
    await renderAuthPanel(twoVisuals);

    await React.act(async () => {
      vi.advanceTimersByTime(15000);
    });

    expect(
      container!.querySelector('[data-testid="auth-visual-layer-first"]')?.getAttribute("data-active")
    ).toBe("true");
    expect(
      container!.querySelector('[data-testid="auth-visual-layer-second"]')?.getAttribute("data-active")
    ).toBe("false");
  });
});
