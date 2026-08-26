import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AuthPanel } from "@/components/auth/AuthPanel";
import {
  FALLBACK_LOGIN_VISUALS,
  type LoginVisualsManifest,
} from "@/lib/login-visuals-shared";

vi.mock("@/components/auth/LoginForm", () => ({
  LoginForm: ({ onSwitchToRegister }: { onSwitchToRegister: () => void }) => (
    <div>
      <span>登录表单</span>
      <button type="button" onClick={onSwitchToRegister}>创建账号</button>
    </div>
  ),
}));

vi.mock("@/components/auth/RegisterForm", () => ({
  RegisterForm: ({ onSwitchToLogin }: { onSwitchToLogin: () => void }) => (
    <div>
      <span>注册表单</span>
      <button type="button" onClick={onSwitchToLogin}>返回登录</button>
    </div>
  ),
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

let loadedImages: string[];

function installBrowserPreferences(reducedMotion = false) {
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
    matches: reducedMotion,
    media: "(prefers-reduced-motion: reduce)",
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  window.matchMedia = globalThis.matchMedia;

  loadedImages = [];
  class MockImage {
    set src(value: string) {
      loadedImages.push(value);
    }
  }
  vi.stubGlobal("Image", MockImage);
}

describe("AuthPanel", () => {
  beforeEach(() => {
    installBrowserPreferences();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("falls back to the shared visual when the manifest is empty", () => {
    render(
      <AuthPanel
        visuals={{ version: 1, intervalMs: 7000, items: [] } as LoginVisualsManifest}
      />
    );

    const fallback = FALLBACK_LOGIN_VISUALS.items[0];
    const layer = screen.getByTestId(`auth-visual-layer-${fallback.id}`);
    expect(layer).toHaveStyle({ backgroundImage: `url(${JSON.stringify(fallback.imageUrl)})` });
    expect(layer).toHaveAttribute("data-active", "true");
  });

  it("switches between login and registration as the user clicks", async () => {
    const user = userEvent.setup();
    render(<AuthPanel visuals={twoVisuals} />);

    expect(screen.getByText("登录表单")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "注册" }));
    expect(screen.getByText("注册表单")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "登录" }));
    expect(screen.getByText("登录表单")).toBeInTheDocument();
  });

  it("rotates visual layers and preloads the next image", () => {
    vi.useFakeTimers();
    render(<AuthPanel visuals={twoVisuals} />);

    expect(screen.getByTestId("auth-visual-layer-first")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("auth-visual-layer-second")).toHaveAttribute("data-active", "false");
    expect(loadedImages).toContain("https://cdn.example.com/login/second.jpg");

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByTestId("auth-visual-layer-first")).toHaveAttribute("data-active", "false");
    expect(screen.getByTestId("auth-visual-layer-second")).toHaveAttribute("data-active", "true");
  });

  it("does not rotate when reduced motion is enabled", () => {
    vi.useFakeTimers();
    installBrowserPreferences(true);
    render(<AuthPanel visuals={twoVisuals} />);

    act(() => {
      vi.advanceTimersByTime(15000);
    });

    expect(screen.getByTestId("auth-visual-layer-first")).toHaveAttribute("data-active", "true");
    expect(screen.getByTestId("auth-visual-layer-second")).toHaveAttribute("data-active", "false");
  });
});
