import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { LoginVisualsManifest } from "@/lib/login-visuals";

(globalThis as typeof globalThis & { React: typeof React }).React = React;

const authPanelMock = vi.fn((props: { visuals: LoginVisualsManifest }) =>
  React.createElement("auth-panel", props)
);

const getCurrentUserMock = vi.fn();
const getLoginVisualsMock = vi.fn();
const redirectMock = vi.fn();

vi.mock("@/components/auth/AuthPanel", () => ({
  AuthPanel: authPanelMock,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: getCurrentUserMock,
}));

vi.mock("@/lib/login-visuals", () => ({
  getLoginVisuals: getLoginVisualsMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

describe("HomePage login visuals", () => {
  beforeEach(() => {
    authPanelMock.mockClear();
    getCurrentUserMock.mockReset();
    getLoginVisualsMock.mockReset();
    redirectMock.mockReset();
  });

  it("passes loaded login visuals to AuthPanel for unauthenticated users", async () => {
    const visuals: LoginVisualsManifest = {
      version: 1,
      intervalMs: 8000,
      items: [
        {
          id: "login-01",
          imageUrl: "https://cdn.example.com/login/login-01.jpg",
          theme: {
            accent: "#123456",
            accentHover: "#234567",
            gradientFrom: "#345678",
            gradientTo: "#456789",
            overlay: "rgba(0,0,0,0.2)",
          },
        },
      ],
    };
    getCurrentUserMock.mockResolvedValueOnce(null);
    getLoginVisualsMock.mockResolvedValueOnce(visuals);

    const { default: HomePage } = await import("@/app/page");
    const element = await HomePage();

    expect(getLoginVisualsMock).toHaveBeenCalledOnce();
    expect(React.isValidElement(element)).toBe(true);
    expect(element.type).toBe(authPanelMock);
    expect(element.props).toEqual({ visuals });
  });

  it("redirects authenticated users without loading login visuals", async () => {
    getCurrentUserMock.mockResolvedValueOnce({ id: "user-1" });
    redirectMock.mockImplementationOnce(() => {
      throw new Error("redirect:/home");
    });

    const { default: HomePage } = await import("@/app/page");

    await expect(HomePage()).rejects.toThrow("redirect:/home");
    expect(redirectMock).toHaveBeenCalledWith("/home");
    expect(getLoginVisualsMock).not.toHaveBeenCalled();
    expect(authPanelMock).not.toHaveBeenCalled();
  });
});
