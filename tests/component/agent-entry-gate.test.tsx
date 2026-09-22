import { StrictMode, lazy, Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { mockServer } from "@/tests/mocks/server";
import { notifySessionLogout, SESSION_LOGOUT_EVENT } from "@/lib/session-logout";

const navigation = vi.hoisted(() => ({ pathname: "/home" }));
const entryModule = vi.hoisted(() => ({ mounts: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => navigation.pathname }));
vi.mock("next/dynamic", () => ({
  default: (loader: Parameters<typeof lazy>[0]) => {
    const Entry = lazy(loader);
    return function DynamicEntry(props: Record<string, unknown>) {
      return <Suspense fallback={null}><Entry {...props} /></Suspense>;
    };
  },
}));
vi.mock("@/components/agent-entry/AgentEntry", () => ({
  default: function Entry({ principalId }: { principalId: string }) {
    entryModule.mounts();
    return <div><span>{principalId}</span><button type="button">打开 Agent 聊天</button><canvas aria-hidden="true" /></div>;
  },
}));

import AgentEntryGate from "@/components/agent-entry/AgentEntryGate";
import { agentEntryRegistry } from "@/components/agent-entry/agent-entry.registry";

const config = agentEntryRegistry.default;

beforeEach(() => {
  navigation.pathname = "/home";
  entryModule.mounts.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  localStorage.clear();
});

function deferredResponse() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((done) => { resolve = done; });
  return { promise, resolve };
}

function focusWindow() {
  window.dispatchEvent(new Event("focus"));
}

describe("Agent Entry 认证与路由 Gate", () => {
  it("200 A 到 200 B 也重新挂载身份范围，不需要 logout 通知", async () => {
    let id = "user-a";
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id })));
    render(<AgentEntryGate config={config} />);
    expect(await screen.findByText("user-a")).toBeVisible();
    const canvas = document.querySelector("canvas");
    id = "user-b";
    act(focusWindow);
    expect(await screen.findByText("user-b")).toBeVisible();
    expect(screen.queryByText("user-a")).toBeNull();
    expect(document.querySelector("canvas")).not.toBe(canvas);
  });

  it.each([{}, { id: "" }, { id: 1 }])("200 缺少有效用户 ID 时不授予入口身份：%j", async (payload) => {
    const probe = vi.fn(() => HttpResponse.json(payload));
    mockServer.use(http.get("/api/auth/me", probe));
    render(<AgentEntryGate config={config} />);
    await waitFor(() => expect(probe).toHaveBeenCalledOnce());
    await act(async () => {});
    expect(screen.queryByRole("button")).toBeNull();
  });

  it.each(["/chat", "/chat/room", "/chat/room/atlas"])("%s 首屏不探测认证、不挂载动态入口", async (pathname) => {
    navigation.pathname = pathname;
    const probe = vi.fn(() => HttpResponse.json({}));
    mockServer.use(http.get("/api/auth/me", probe));
    render(<AgentEntryGate config={config} />);
    await act(async () => {});
    expect(probe).not.toHaveBeenCalled();
    expect(entryModule.mounts).not.toHaveBeenCalled();
  });

  it.each([401, 403, 500])("HTTP %s 静默隐藏，不解析身份载荷", async (status) => {
    const probe = vi.fn(() => new HttpResponse("非 JSON 载荷", { status }));
    mockServer.use(http.get("/api/auth/me", probe));
    render(<AgentEntryGate config={config} />);
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(entryModule.mounts).not.toHaveBeenCalled();
  });

  it("网络失败静默隐藏，离开 Chat 后可重试", async () => {
    const probe = vi.fn(() => HttpResponse.error());
    mockServer.use(http.get("/api/auth/me", probe));
    const view = render(<AgentEntryGate config={config} />);
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    await act(async () => {});
    expect(entryModule.mounts).not.toHaveBeenCalled();
    navigation.pathname = "/chat/room";
    view.rerender(<AgentEntryGate config={config} />);
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "user-a" })));
    navigation.pathname = "/about";
    view.rerender(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button", { name: "打开 Agent 聊天" })).toBeVisible();
  });

  it("200 后非 Chat 导航保留入口，Chat 往返必须重新认证", async () => {
    const probe = vi.fn(() => HttpResponse.json({ id: "user-a" }));
    mockServer.use(http.get("/api/auth/me", probe));
    const view = render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    navigation.pathname = "/about";
    view.rerender(<AgentEntryGate config={config} />);
    expect(probe).toHaveBeenCalledTimes(1);
    navigation.pathname = "/chat/room";
    view.rerender(<AgentEntryGate config={config} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    navigation.pathname = "/study";
    view.rerender(<AgentEntryGate config={config} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(await screen.findByRole("button")).toBeVisible();
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it("Chat 首屏离开后才发起认证探测", async () => {
    navigation.pathname = "/chat/room";
    const probe = vi.fn(() => HttpResponse.json({ id: "user-a" }));
    mockServer.use(http.get("/api/auth/me", probe));
    const view = render(<AgentEntryGate config={config} />);
    expect(probe).not.toHaveBeenCalled();
    navigation.pathname = "/home";
    view.rerender(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("探测途中进入 Chat 会中止请求，迟到的 200 不复活入口", async () => {
    let finish!: () => void;
    let requestSignal: AbortSignal | undefined;
    const started = vi.fn();
    mockServer.use(http.get("/api/auth/me", async ({ request }) => {
      requestSignal = request.signal;
      started();
      await new Promise<void>((resolve) => { finish = resolve; });
      return HttpResponse.json({ id: "user-a" });
    }));
    const view = render(<AgentEntryGate config={config} />);
    await waitFor(() => expect(started).toHaveBeenCalledTimes(1));
    navigation.pathname = "/chat/room";
    view.rerender(<AgentEntryGate config={config} />);
    expect(requestSignal?.aborted).toBe(true);
    await act(async () => { finish(); });
    expect(entryModule.mounts).not.toHaveBeenCalled();
  });

  it("卸载中止在途探测，Strict Mode 只有最新有效结果生效且不循环", async () => {
    const signals: AbortSignal[] = [];
    mockServer.use(http.get("/api/auth/me", ({ request }) => {
      signals.push(request.signal);
      return HttpResponse.json({ id: "user-a" });
    }));
    const view = render(<StrictMode><AgentEntryGate config={config} /></StrictMode>);
    expect(await screen.findByRole("button")).toBeVisible();
    const requests = signals.length;
    await act(async () => {});
    expect(signals.length).toBe(requests);
    view.unmount();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it.each([401, 403])("已认证用户从 Chat 返回遇到 %s，不挂载旧入口或 Canvas", async (status) => {
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "user-a" })));
    const view = render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    navigation.pathname = "/chat/room";
    view.rerender(<AgentEntryGate config={config} />);
    const response = deferredResponse();
    const probe = vi.spyOn(globalThis, "fetch").mockReturnValue(response.promise);
    navigation.pathname = "/about";
    view.rerender(<AgentEntryGate config={config} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    await act(async () => { response.resolve(new Response(null, { status })); });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  for (const trigger of ["focus", "visibilitychange", "pageshow"] as const) {
    it.each([401, 403])(`${trigger} 重验从 200 变为 %s 后卸载入口与 Canvas`, async (status) => {
      let currentStatus = 200;
      const probe = vi.fn(() => currentStatus === 200 ? HttpResponse.json({ id: "user-a" }) : new HttpResponse(null, { status: currentStatus }));
      mockServer.use(http.get("/api/auth/me", probe));
      render(<AgentEntryGate config={config} />);
      expect(await screen.findByRole("button")).toBeVisible();
      currentStatus = status;
      act(() => {
        if (trigger === "visibilitychange") document.dispatchEvent(new Event(trigger));
        else if (trigger === "pageshow") window.dispatchEvent(new PageTransitionEvent(trigger, { persisted: true }));
        else focusWindow();
      });
      await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
      expect(document.querySelector("canvas")).toBeNull();
      expect(probe).toHaveBeenCalledTimes(2);
      currentStatus = 200;
      act(focusWindow);
      expect(await screen.findByRole("button")).toBeVisible();
      expect(probe).toHaveBeenCalledTimes(3);
    });
  }

  it("聚焦和可见事件合并重验，隐藏事件与等待时间不产生轮询", async () => {
    const probe = vi.fn(() => HttpResponse.json({ id: "user-a" }));
    mockServer.use(http.get("/api/auth/me", probe));
    render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    vi.useFakeTimers();
    const visible = vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
      focusWindow();
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false }));
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(probe).toHaveBeenCalledTimes(1);
    visible.mockReturnValue("visible");
    act(() => {
      for (let index = 0; index < 10; index += 1) {
        document.dispatchEvent(new Event("visibilitychange"));
        focusWindow();
      }
    });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(probe).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    expect(probe).toHaveBeenCalledTimes(2);
  });

  it.each(["500", "网络失败"])("已显示入口遇到重验 %s 时隐藏，后续聚焦成功可恢复", async (failure) => {
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "user-a" })));
    render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    mockServer.use(http.get("/api/auth/me", () => failure === "500"
      ? new HttpResponse(null, { status: 500 })
      : HttpResponse.error()));
    act(focusWindow);
    await waitFor(() => expect(screen.queryByRole("button")).not.toBeInTheDocument());
    expect(document.querySelector("canvas")).toBeNull();
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "user-a" })));
    act(focusWindow);
    expect(await screen.findByRole("button")).toBeVisible();
  });

  it.each(["同标签", "其他标签"])("%s退出立即隐藏并作废在途 200，最新 401 后不能复活", async (tab) => {
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "user-a" })));
    render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    const stale = deferredResponse();
    const latest = deferredResponse();
    // 传输故意忽略 AbortSignal，验证迟到响应也不能覆盖当前身份。
    const probe = vi.spyOn(globalThis, "fetch")
      .mockReturnValueOnce(stale.promise)
      .mockReturnValueOnce(latest.promise);
    act(focusWindow);
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(1));
    const oldSignal = probe.mock.calls[0][1]?.signal;
    act(() => {
      if (tab === "同标签") notifySessionLogout();
      else window.dispatchEvent(new StorageEvent("storage", { key: SESSION_LOGOUT_EVENT, newValue: "logout-notification" }));
    });
    expect(oldSignal?.aborted).toBe(true);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(document.querySelector("canvas")).toBeNull();
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
    await act(async () => { latest.resolve(new Response(null, { status: 401 })); });
    await act(async () => { stale.resolve(Response.json({ id: "user-a" })); });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    probe.mockResolvedValue(Response.json({ id: "user-a" }));
    act(focusWindow);
    expect(await screen.findByRole("button")).toBeVisible();
    expect(probe).toHaveBeenCalledTimes(3);
  });

  it("存储不可用不妨碍本标签退出通知，无关 storage 事件不重验", async () => {
    let status = 200;
    const probe = vi.fn(() => status === 200 ? HttpResponse.json({ id: "user-a" }) : new HttpResponse(null, { status }));
    mockServer.use(http.get("/api/auth/me", probe));
    render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", newValue: "value" }));
      window.dispatchEvent(new StorageEvent("storage", { key: SESSION_LOGOUT_EVENT, newValue: null }));
    });
    await act(async () => {});
    expect(probe).toHaveBeenCalledTimes(1);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("Storage disabled", "SecurityError"); });
    status = 401;
    act(() => { expect(notifySessionLogout).not.toThrow(); });
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    await waitFor(() => expect(probe).toHaveBeenCalledTimes(2));
  });

  it("离开或卸载时清理事件、定时器和在途请求", async () => {
    mockServer.use(http.get("/api/auth/me", () => HttpResponse.json({ id: "user-a" })));
    const view = render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    vi.useFakeTimers();
    const response = deferredResponse();
    const probe = vi.spyOn(globalThis, "fetch").mockReturnValue(response.promise);
    act(focusWindow);
    navigation.pathname = "/chat/room";
    view.rerender(<AgentEntryGate config={config} />);
    act(() => { focusWindow(); notifySessionLogout(); });
    await act(async () => { await vi.advanceTimersByTimeAsync(1_000); });
    expect(probe).not.toHaveBeenCalled();
    navigation.pathname = "/home";
    view.rerender(<AgentEntryGate config={config} />);
    expect(probe).toHaveBeenCalledTimes(1);
    const signal = probe.mock.calls[0][1]?.signal;
    view.unmount();
    expect(signal?.aborted).toBe(true);
    act(() => { focusWindow(); notifySessionLogout(); });
    await act(async () => {
      response.resolve(Response.json({ id: "user-a" }));
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(probe).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
