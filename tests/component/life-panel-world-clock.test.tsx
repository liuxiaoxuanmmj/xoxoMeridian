import { act } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LifePanel } from "@/components/chat/LifePanel";
import { mockServer } from "@/tests/mocks/server";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const participants = [
  {
    id: "user-1",
    displayName: "Alice",
    avatarLabel: "A",
    profile: {
      city: "Shanghai",
      country: "CN",
      timezone: "Asia/Shanghai",
    },
  },
];

// 浏览器挂钟固定在 13:05Z；Asia/Shanghai 下应显示 21:05。首帧（SSR 与 hydration）
// 必须与挂钟无关，否则两端各自读 Date 就会在跨分钟时 mismatch。
const BROWSER_NOW = new Date(Date.UTC(2026, 0, 1, 13, 5));

function panel() {
  return (
    <LifePanel
      currentUserId="user-1"
      roomId="room-1"
      participants={participants}
      memos={[]}
      scheduledJobs={[]}
    />
  );
}

function stubWeather() {
  mockServer.use(
    http.get("/api/rooms/:roomId/weather", () => HttpResponse.json({ results: [] }))
  );
}

describe("LifePanel world clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not read the wall clock while rendering, so both hosts produce the same first paint", () => {
    stubWeather();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(BROWSER_NOW);

    // 渲染期不读 Date：无论宿主挂钟是什么，首帧都是同一个占位符。
    const first = renderToString(panel());
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 2, 6, 41)));

    expect(first).not.toContain("21:05");
    expect(renderToString(panel())).toBe(first);
  });

  it("hydrates the server markup without a recoverable error, then shows the browser time", async () => {
    stubWeather();
    vi.useFakeTimers({ toFake: ["Date", "setInterval"] });
    vi.setSystemTime(BROWSER_NOW);

    const html = renderToString(panel());
    expect(html).toContain("--:--");

    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.append(container);

    const recoverableErrors: unknown[] = [];
    const root = hydrateRoot(container, panel(), {
      onRecoverableError: (error) => {
        recoverableErrors.push(error);
      },
    });

    await act(async () => {
      await Promise.resolve();
    });

    // 修复前此处会收到 "server rendered text didn't match the client"，差异为
    // +21:05 / -18:05（服务端与浏览器各自读了挂钟）。
    expect(recoverableErrors).toEqual([]);
    expect(container.textContent).toContain("21:05");

    // 30 秒后挂钟推进一分钟，组件随之刷新。
    vi.setSystemTime(new Date(Date.UTC(2026, 0, 1, 13, 6)));
    await act(async () => {
      vi.advanceTimersByTime(30000);
    });
    expect(container.textContent).toContain("21:06");

    await act(async () => {
      root.unmount();
    });
    container.remove();
  });
});
