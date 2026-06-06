import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import type { LoginVisualsManifest } from "@/lib/login-visuals";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

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

describe("AuthPanel login visuals", () => {
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
});
