import { StrictMode, lazy, Suspense } from "react";
import { act, render, screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { mockServer } from "@/tests/mocks/server";

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
  default: function Entry() {
    entryModule.mounts();
    return <button type="button">打开 Agent 聊天</button>;
  },
}));

import AgentEntryGate from "@/components/agent-entry/AgentEntryGate";
import { agentEntryRegistry } from "@/components/agent-entry/agent-entry.registry";

const config = agentEntryRegistry.default;

beforeEach(() => {
  navigation.pathname = "/home";
  entryModule.mounts.mockClear();
});

describe("Agent Entry 认证与路由 Gate", () => {
  it.each(["/chat", "/chat/room", "/chat/room/atlas"])("%s 首屏不探测认证、不挂载动态入口", async (pathname) => {
    navigation.pathname = pathname;
    const probe = vi.fn(() => HttpResponse.json({}));
    mockServer.use(http.get("/api/auth/me", probe));
    render(<AgentEntryGate config={config} />);
    await act(async () => {});
    expect(probe).not.toHaveBeenCalled();
    expect(entryModule.mounts).not.toHaveBeenCalled();
  });

  it.each([401, 500])("HTTP %s 静默隐藏，不解析身份载荷", async (status) => {
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
    mockServer.use(http.get("/api/auth/me", () => new HttpResponse(null, { status: 200 })));
    navigation.pathname = "/about";
    view.rerender(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button", { name: "打开 Agent 聊天" })).toBeVisible();
  });

  it("200 后挂载，非 Chat 导航及 Chat 往返复用成功结果", async () => {
    const probe = vi.fn(() => new HttpResponse("不需身份载荷", { status: 200 }));
    mockServer.use(http.get("/api/auth/me", probe));
    const view = render(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    navigation.pathname = "/about";
    view.rerender(<AgentEntryGate config={config} />);
    navigation.pathname = "/chat/room";
    view.rerender(<AgentEntryGate config={config} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    navigation.pathname = "/study";
    view.rerender(<AgentEntryGate config={config} />);
    expect(await screen.findByRole("button")).toBeVisible();
    expect(probe).toHaveBeenCalledTimes(1);
  });

  it("Chat 首屏离开后才发起认证探测", async () => {
    navigation.pathname = "/chat/room";
    const probe = vi.fn(() => new HttpResponse(null, { status: 200 }));
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
      return new HttpResponse(null, { status: 200 });
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
      return new HttpResponse(null, { status: 200 });
    }));
    const view = render(<StrictMode><AgentEntryGate config={config} /></StrictMode>);
    expect(await screen.findByRole("button")).toBeVisible();
    const requests = signals.length;
    await act(async () => {});
    expect(signals.length).toBe(requests);
    view.unmount();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
