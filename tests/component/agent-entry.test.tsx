import { Suspense, lazy, useEffect } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEntrySceneProps } from "@/components/agent-entry/agent-entry.types";
import { mockServer } from "@/tests/mocks/server";

const navigation = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), pathname: "/home" }));
const scene = vi.hoisted(() => ({ props: undefined as AgentEntrySceneProps | undefined, mounts: 0 }));
const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => navigation.pathname }));
vi.mock("next/dynamic", () => ({
  default: (loader: Parameters<typeof lazy>[0]) => {
    const Scene = lazy(loader);
    return function DynamicScene(props: Record<string, unknown>) { return <Suspense fallback={null}><Scene {...props} /></Suspense>; };
  },
}));
vi.mock("@/components/agent-entry/AgentEntryScene", () => ({
  default: function Scene(props: AgentEntrySceneProps) {
    scene.props = props;
    useEffect(() => { scene.mounts += 1; }, []);
    return <canvas aria-hidden="true" />;
  },
}));

import AgentEntry from "@/components/agent-entry/AgentEntry";
import { agentEntryRegistry } from "@/components/agent-entry/agent-entry.registry";
const config = agentEntryRegistry.default;
const invalid = vi.fn();
let mediaQuery: EventTarget;
const entry = () => <AgentEntry config={config} principalId="user-a" onIdentityInvalid={invalid} />;
async function ready() {
  await waitFor(() => expect(scene.props).toBeDefined());
  act(() => { scene.props?.onReady(config.model); });
  return screen.getByRole("button", { name: "打开 Agent 聊天" });
}

beforeEach(() => {
  navigation.push.mockReset(); navigation.pathname = "/home";
  scene.props = undefined; scene.mounts = 0; motionPreference.reduced = false; invalid.mockReset();
  mediaQuery = new EventTarget();
  Object.defineProperty(mediaQuery, "matches", { get: () => motionPreference.reduced });
  vi.stubGlobal("matchMedia", () => mediaQuery);
  mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json({
    currentUser: { id: "user-a", displayName: "用户A", avatarLabel: "A" },
    agent: { id: "agent", displayName: "小助手", enabled: true }, roomId: null, messages: [], tasks: [], pendingApprovals: [],
  })));
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Agent Entry 私聊入口", () => {
  it("首帧前普通按钮即可开窗，加载不阻断私聊", async () => {
    const user = userEvent.setup();
    render(entry());
    const button = screen.getByRole("button", { name: "打开 Agent 聊天" });
    expect(button).toBeVisible(); expect(button).toBeEnabled();
    const logo = button.querySelector("img");
    expect(logo).toHaveAttribute("src", "/brand/logo_transparent.svg");
    expect(logo).toHaveAttribute("width", "24");
    expect(logo).toHaveAttribute("height", "24");
    expect(button).not.toHaveTextContent("✦");
    await user.click(button);
    expect(screen.getByRole("dialog", { name: "与小助手聊天" })).toBeVisible();
    expect(screen.getByRole("textbox", { name: "消息" })).toHaveFocus();
    expect(navigation.push).not.toHaveBeenCalled();
    expect(await screen.findByText("今天有什么想聊的？直接告诉我就好。")).toBeVisible();
  });

  it.each(["鼠标", "Enter", "Space"])("%s 激活立即开窗，点击台词不被 autofocus 中断", async (mode) => {
    const user = userEvent.setup(); render(entry());
    const button = await ready();
    if (mode === "鼠标") await user.click(button);
    else { await user.tab(); await user.keyboard(mode === "Enter" ? "{Enter}" : " "); }
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.getByRole("tooltip")).toHaveTextContent("在呢，我们聊聊。");
    expect(screen.getByRole("textbox", { name: "消息" })).toHaveFocus();
    expect(navigation.push).not.toHaveBeenCalled();
  });

  it("开关和重复点击只保留一个面板及相同 Canvas，草稿关窗后保留", async () => {
    const user = userEvent.setup(); render(entry());
    const button = await ready(); const canvas = document.querySelector("canvas");
    await user.click(button); await user.type(screen.getByRole("textbox"), "未发送的想法");
    await user.click(button);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    expect(button).toHaveFocus(); expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.querySelector("canvas")).toBe(canvas);
    await user.click(button);
    expect(screen.getByRole("textbox")).toHaveValue("未发送的想法");
    expect(scene.mounts).toBe(1);
  });

  it("视觉失败只移除 Canvas，保留开窗、草稿与宿主操作", async () => {
    const user = userEvent.setup(); render(<><button type="button">宿主控件</button>{entry()}</>);
    const button = await ready(); await user.click(button); await user.type(screen.getByRole("textbox"), "保留我");
    act(() => scene.props?.onError());
    expect(document.querySelector("canvas")).toBeNull();
    expect(button.querySelector("img")).toHaveAttribute("src", "/brand/logo_transparent.svg");
    expect(screen.getByRole("textbox")).toHaveValue("保留我");
    expect(button).toBeEnabled();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "宿主控件" })).toBeEnabled();
    await user.click(button); expect(screen.getByRole("textbox")).toHaveValue("保留我");
  });

  it("Escape、遮罩与焦点锁恢复原 inert/滚动设置，卸载清理 Portal", async () => {
    const user = userEvent.setup();
    const existing = document.createElement("div"); existing.setAttribute("inert", ""); document.body.appendChild(existing);
    document.body.style.overflow = "clip";
    const view = render(<><button type="button">宿主控件</button>{entry()}</>);
    const button = await ready(); await user.click(button);
    expect(view.container).toHaveAttribute("inert"); expect(document.body.style.overflow).toBe("hidden");
    fireEvent.focusIn(screen.getByRole("button", { name: "宿主控件", hidden: true }));
    expect(screen.getByRole("textbox")).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(view.container).not.toHaveAttribute("inert"); expect(existing).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("clip"); expect(button).toHaveFocus();
    await user.click(button); await user.click(screen.getByRole("button", { name: "关闭对话遮罩" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    await user.click(button); view.unmount();
    expect(document.querySelector("[data-agent-entry-portal]")).toBeNull();
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = ""; existing.remove();
  });

  it("程序性路由变更关闭模态并释放背景，保持模型实例", async () => {
    const user = userEvent.setup(); const view = render(entry()); const button = await ready();
    const canvas = document.querySelector("canvas"); await user.click(button);
    navigation.pathname = "/about"; view.rerender(entry());
    expect(screen.queryByRole("dialog")).toBeNull(); expect(document.querySelector("canvas")).toBe(canvas);
    expect(document.body.style.overflow).not.toBe("hidden");
  });

  it("Tab 与 Shift+Tab 在小人和面板中循环，不把遮罩加入键盘顺序", async () => {
    const user = userEvent.setup(); render(entry()); const button = await ready(); await user.click(button);
    const textbox = screen.getByRole("textbox");
    await user.type(textbox, "可发送");
    await user.tab(); expect(screen.getByRole("button", { name: "发送" })).toHaveFocus();
    await user.tab(); expect(button).toHaveFocus();
    await user.tab({ shift: true }); expect(screen.getByRole("button", { name: "发送" })).toHaveFocus();
    await user.tab({ shift: true }); expect(textbox).toHaveFocus();
  });

  it("身份卸载不将焦点恢复给已失效入口", async () => {
    const user = userEvent.setup(); const view = render(entry()); const button = await ready(); await user.click(button);
    const focus = vi.spyOn(button, "focus"); view.unmount();
    expect(focus).not.toHaveBeenCalled();
  });

  it("减少动态偏好保留文本反馈；生日主题保持静态", async () => {
    motionPreference.reduced = true;
    const user = userEvent.setup(); const view = render(entry()); await ready();
    await user.click(screen.getByRole("button", { name: "打开 Agent 聊天" }));
    expect(screen.getByRole("tooltip")).toHaveTextContent("在呢，我们聊聊。");
    expect(scene.props?.motion.frame(10000)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    view.unmount();
    render(<AgentEntry config={agentEntryRegistry["birthday-2026"]} principalId="user-a" onIdentityInvalid={invalid} />);
    await user.click(screen.getByRole("button", { name: "打开 Agent 聊天" }));
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByText("在呢，我们聊聊。")).toBeNull();
  });

  it("运行中启用减少动态立即归位，后续点击只显示台词且保留同一 Canvas", async () => {
    const user = userEvent.setup(); const view = render(entry()); const button = await ready();
    const canvas = document.querySelector("canvas");
    await user.click(button);
    const motion = scene.props!.motion;
    motion.frame(10000);
    expect(motion.frame(10300).y).toBeGreaterThan(0);
    act(() => { motionPreference.reduced = true; mediaQuery.dispatchEvent(new Event("change")); });
    expect(motion.frame(10310)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    await user.click(button);
    expect(motion.frame(11000).active).toBe(false);
    expect(screen.getByRole("tooltip")).toHaveTextContent("在呢，我们聊聊。");
    expect(document.querySelector("canvas")).toBe(canvas);
    expect(scene.mounts).toBe(1);
    const unsubscribe = vi.spyOn(mediaQuery, "removeEventListener");
    view.unmount();
    expect(unsubscribe).toHaveBeenCalledWith("change", expect.any(Function));
  });

  it("组件可见性接线取消正在播放的动作与台词，恢复不补播且卸载移除订阅", async () => {
    // 这是 jsdom 的事件接线验证；不作为实际浏览器切换标签触发 hidden 的证据。
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const subscribed = vi.spyOn(document, "addEventListener");
    const unsubscribed = vi.spyOn(document, "removeEventListener");
    const user = userEvent.setup(); const view = render(entry()); const button = await ready();
    const canvas = document.querySelector("canvas");
    const listeners = subscribed.mock.calls.filter(([name]) => name === "visibilitychange").map(([, listener]) => listener);
    expect(listeners.length).toBeGreaterThan(0);
    await user.click(button);
    const motion = scene.props!.motion;
    motion.frame(10000);
    expect(motion.frame(10300).y).toBeGreaterThan(0);
    expect(screen.getByRole("tooltip")).toHaveTextContent("在呢，我们聊聊。");

    act(() => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(motion.frame(10310)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    expect(screen.queryByRole("tooltip")).toBeNull();
    expect(document.querySelector("canvas")).toBe(canvas);

    act(() => {
      visibility.mockReturnValue("visible");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(motion.frame(20000)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    expect(screen.queryByRole("tooltip")).toBeNull();
    await user.click(button);
    motion.frame(21000);
    expect(motion.frame(21300).y).toBeGreaterThan(0);
    expect(screen.getByRole("tooltip")).toHaveTextContent("在呢，我们聊聊。");
    expect(document.querySelector("canvas")).toBe(canvas);
    expect(scene.mounts).toBe(1);

    const preferenceUpdates = vi.spyOn(motion, "setPreferences");
    view.unmount();
    for (const listener of listeners) expect(unsubscribed).toHaveBeenCalledWith("visibilitychange", listener);
    preferenceUpdates.mockClear();
    act(() => {
      visibility.mockReturnValue("hidden");
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(preferenceUpdates).not.toHaveBeenCalled();
    expect(document.querySelector("canvas")).toBeNull();
  });
});
