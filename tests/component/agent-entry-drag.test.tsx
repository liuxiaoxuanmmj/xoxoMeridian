import { Suspense, lazy, useEffect } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentEntrySceneProps } from "@/components/agent-entry/agent-entry.types";
import { mockServer } from "@/tests/mocks/server";

const scene = vi.hoisted(() => ({ props: undefined as AgentEntrySceneProps | undefined, mounts: 0 }));
const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ usePathname: () => "/home", useRouter: () => router }));
vi.mock("next/dynamic", () => ({
  default: (loader: Parameters<typeof lazy>[0]) => {
    const Scene = lazy(loader);
    return function DynamicScene(props: Record<string, unknown>) {
      return <Suspense fallback={null}><Scene {...props} /></Suspense>;
    };
  },
}));
// jsdom 没有 WebGL；仅替代 Next 动态加载和视觉边界，保留真实入口及拖拽 hook。
vi.mock("@/components/agent-entry/AgentEntryScene", () => ({
  default: function Scene(props: AgentEntrySceneProps) {
    scene.props = props;
    useEffect(() => { scene.mounts += 1; }, []);
    return <canvas aria-hidden="true" />;
  },
}));

import AgentEntry from "@/components/agent-entry/AgentEntry";
import { agentEntryRegistry } from "@/components/agent-entry/agent-entry.registry";

const storageKey = "xoxo:agent-entry:position:default:v1";
const saved = JSON.stringify({ version: 1, x: 0.5, y: 0.5 });
const invalid = vi.fn();
let viewport: EventTarget & { width: number; height: number; offsetTop: number; offsetLeft: number };

// PointerEvent 与 pointer capture 是 jsdom 缺少的平台能力，不替代产品事件处理。
class TestPointerEvent extends MouseEvent {
  readonly pointerId: number;
  readonly isPrimary: boolean;
  readonly pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.isPrimary = init.isPrimary ?? true;
    this.pointerType = init.pointerType ?? "mouse";
  }
}

function entry(theme: keyof typeof agentEntryRegistry = "default") {
  return <AgentEntry config={agentEntryRegistry[theme]} principalId="user-a" onIdentityInvalid={invalid} />;
}

function container(button: HTMLElement) {
  return button.closest<HTMLElement>("[data-agent-entry]")!;
}

function position(button: HTMLElement) {
  const rect = container(button).getBoundingClientRect();
  return { x: rect.left, y: rect.top };
}

function expectPosition(button: HTMLElement, expected: { x: number; y: number }) {
  const actual = position(button);
  // 归一化存储往返可产生 IEEE 754 尾数差异；精度仍远小于可见像素。
  expect(actual.x).toBeCloseTo(expected.x, 6);
  expect(actual.y).toBeCloseTo(expected.y, 6);
}

async function ready() {
  await waitFor(() => expect(scene.props).toBeDefined());
  act(() => { scene.props?.onReady(scene.props.config.model); });
  const button = screen.getByRole("button", { name: "打开 Agent 聊天" });
  const captured = new Set<number>();
  Object.defineProperties(button, {
    setPointerCapture: { configurable: true, value: vi.fn((id: number) => captured.add(id)) },
    hasPointerCapture: { configurable: true, value: (id: number) => captured.has(id) },
    releasePointerCapture: { configurable: true, value: vi.fn((id: number) => captured.delete(id)) },
  });
  return button;
}

function pointer(button: HTMLElement, type: string, x: number, y: number, extra: PointerEventInit = {}) {
  fireEvent(button, new TestPointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 1, button: 0, buttons: type === "pointerup" ? 0 : 1,
    clientX: x, clientY: y, ...extra,
  }));
}

async function startDrag(button: HTMLElement, dx = 90, dy = 60) {
  const from = position(button);
  // 从按钮内部偏离中心的位置拿起，验证抓取偏移得以保留。
  const grab = { x: from.x + 31, y: from.y + 47 };
  pointer(button, "pointerdown", grab.x, grab.y);
  pointer(button, "pointermove", grab.x + dx, grab.y + dy);
  await waitFor(() => expectPosition(button, { x: from.x + dx, y: from.y + dy }));
  return { from, to: { x: grab.x + dx, y: grab.y + dy } };
}

beforeEach(() => {
  scene.props = undefined; scene.mounts = 0; invalid.mockReset();
  localStorage.clear();
  viewport = Object.assign(new EventTarget(), { width: 1024, height: 768, offsetTop: 0, offsetLeft: 0 });
  vi.stubGlobal("visualViewport", viewport);
  vi.stubGlobal("innerWidth", 1024);
  vi.stubGlobal("innerHeight", 768);
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.stubGlobal("matchMedia", () => Object.assign(new EventTarget(), { matches: false }));
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  // jsdom 不做 CSS 排版；此处提供浏览器测量边界，坐标仍取产品写入的内联样式。
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const avatar = this.closest<HTMLElement>("[data-agent-entry]");
    if (avatar) {
      const mobile = viewport.width < 768;
      const open = avatar.parentElement?.dataset.open === "true";
      const size = mobile ? open ? viewport.height <= 420 ? 56 : 96 : 160 : 208;
      const left = avatar.style.left ? Number.parseFloat(avatar.style.left) : viewport.width - size - (mobile ? 16 : 24);
      const top = avatar.style.top ? Number.parseFloat(avatar.style.top) : viewport.height - size - (mobile ? 16 : 24);
      return new DOMRect(left, top, size, size);
    }
    return new DOMRect(0, viewport.offsetTop, viewport.width, viewport.height);
  });
  mockServer.use(http.get("/api/agent/conversation", () => HttpResponse.json({
    currentUser: { id: "user-a", displayName: "用户A", avatarLabel: "A" },
    agent: { id: "agent", displayName: "小助手", enabled: true },
    roomId: null, messages: [], tasks: [], pendingApprovals: [],
  })));
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
});

describe("默认 Agent 入口拖拽", () => {
  it("私聊归位通过键盘清除专用位置并立即恢复默认点，刷新式重挂载后仍可重新拖拽", async () => {
    localStorage.setItem(storageKey, saved);
    localStorage.setItem("other-preference", "keep");
    const removed = vi.spyOn(Storage.prototype, "removeItem");
    const user = userEvent.setup();
    const view = render(entry()); const button = await ready();
    const canvas = document.querySelector("canvas");
    expect(position(button)).not.toEqual({ x: 792, y: 536 });
    await user.click(button);
    const reset = screen.getByRole("button", { name: "归位" });
    const clear = screen.getByRole("button", { name: "清空与小助手的聊天记录" });
    expect(reset).toHaveAttribute("aria-label", "归位");
    expect(reset.querySelector("svg")).not.toBeNull();
    expect(reset.querySelector('span[aria-hidden="true"]')).toHaveTextContent("归位");
    expect(reset.compareDocumentPosition(clear) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.touchStart(reset);
    expect(reset).toHaveAttribute("data-touch-hint", "true");
    expect(clear).toHaveAttribute("data-touch-hint", "false");
    reset.focus();
    await user.keyboard("{Enter}");
    await waitFor(() => expectPosition(button, { x: 792, y: 536 }));
    expect(removed).toHaveBeenCalledWith(storageKey);
    expect(localStorage.getItem(storageKey)).toBeNull();
    expect(localStorage.getItem("other-preference")).toBe("keep");
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(document.querySelector("canvas")).toBe(canvas);
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    expectPosition(button, { x: 792, y: 536 });
    view.unmount(); scene.props = undefined;
    render(entry()); const mounted = await ready();
    expectPosition(mounted, { x: 792, y: 536 });
    const { to } = await startDrag(mounted, -90, -60);
    pointer(mounted, "pointerup", to.x, to.y);
    expect(localStorage.getItem(storageKey)).not.toBeNull();
  });

  it("手机开窗归位保留临时顶部位置，关闭后回到默认点", async () => {
    viewport.width = 390; viewport.height = 844;
    localStorage.setItem(storageKey, saved);
    const user = userEvent.setup();
    render(entry()); const button = await ready();
    await user.click(button);
    const compact = position(button);
    expect(compact.y).toBeLessThan(100);
    await user.click(screen.getByRole("button", { name: "归位" }));
    expectPosition(button, compact);
    expect(localStorage.getItem(storageKey)).toBeNull();
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    await waitFor(() => expectPosition(button, { x: 214, y: 668 }));
  });

  it("浏览器拒绝删除位置记录时仍恢复本次挂载中的默认点", async () => {
    localStorage.setItem(storageKey, saved);
    const remove = vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => { throw new DOMException("不可删除", "SecurityError"); });
    const user = userEvent.setup();
    render(entry()); const button = await ready();
    await user.click(button);
    await user.click(screen.getByRole("button", { name: "归位" }));
    expect(remove).toHaveBeenCalledWith(storageKey);
    expectPosition(button, { x: 792, y: 536 });
    expect(localStorage.getItem(storageKey)).toBe(saved);
  });

  it("小幅按压抖动仍可点击开窗，不保存为拖拽位置", async () => {
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(entry()); const button = await ready();
    const from = position(button);
    pointer(button, "pointerdown", from.x + 30, from.y + 30);
    pointer(button, "pointermove", from.x + 33, from.y + 32);
    pointer(button, "pointerup", from.x + 33, from.y + 32);
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole("dialog", { name: "与小助手聊天" })).toBeVisible();
    expect(writes).not.toHaveBeenCalled();
  });

  it("按抓取偏移放下且只保存一次，屏蔽拖拽后的 click，下一次点击仍开窗并保留 Canvas", async () => {
    localStorage.setItem(storageKey, saved);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(entry()); const button = await ready();
    const canvas = document.querySelector("canvas");
    const { from, to } = await startDrag(button);
    expect(writes).not.toHaveBeenCalled();
    pointer(button, "pointerup", to.x, to.y);
    fireEvent.click(button, { detail: 1 });
    expect(screen.queryByRole("dialog")).toBeNull();
    expectPosition(button, { x: from.x + 90, y: from.y + 60 });
    expect(writes).toHaveBeenCalledTimes(1);
    const stored = JSON.parse(localStorage.getItem(storageKey)!);
    expect(stored).toEqual({ version: 1, x: expect.any(Number), y: expect.any(Number) });
    expect(stored.x).toBeGreaterThan(0.5); expect(stored.x).toBeLessThan(1);
    expect(stored.y).toBeGreaterThan(0.5); expect(stored.y).toBeLessThan(1);
    pointer(button, "pointerdown", to.x, to.y);
    pointer(button, "pointerup", to.x, to.y);
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(document.querySelector("canvas")).toBe(canvas);
    expect(scene.mounts).toBe(1);
  });

  it.each(["pointercancel", "lostpointercapture", "blur", "hidden", "resize"])(
    "%s 取消未完成拖动，回到此前位置且不写入存储", async (reason) => {
      localStorage.setItem(storageKey, saved);
      const writes = vi.spyOn(Storage.prototype, "setItem");
      render(entry()); const button = await ready();
      const { from, to } = await startDrag(button);
      if (reason === "hidden") {
        vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden");
        fireEvent(document, new Event("visibilitychange"));
      } else if (reason === "blur" || reason === "resize") fireEvent(window, new Event(reason));
      else pointer(button, reason, to.x, to.y);
      await waitFor(() => expectPosition(button, from));
      pointer(button, "pointerup", to.x, to.y);
      expect(writes).not.toHaveBeenCalled();
      expect(localStorage.getItem(storageKey)).toBe(saved);
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  it("拖动中卸载不保存中间点，后续指针和视口事件不会修改已卸载入口", async () => {
    localStorage.setItem(storageKey, saved);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const view = render(entry()); const button = await ready();
    const { to } = await startDrag(button);
    const avatar = container(button);
    view.unmount();
    const afterUnmount = avatar.style.cssText;
    pointer(button, "pointermove", to.x + 50, to.y + 30);
    pointer(button, "pointerup", to.x + 50, to.y + 30);
    fireEvent(window, new Event("resize"));
    act(() => { viewport.dispatchEvent(new Event("resize")); });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBe(saved);
    expect(avatar.style.cssText).toBe(afterUnmount);
    expect(document.querySelector("[data-agent-entry-portal]")).toBeNull();
  });

  it.each(["not-json", JSON.stringify({ version: 9, x: 0.5, y: 0.5 }), JSON.stringify({ version: 1, x: 2, y: -1 })])(
    "无效位置 %s 不影响入口，下一次放置修复该浏览器记录", async (bad) => {
      localStorage.setItem(storageKey, bad);
      render(entry()); const button = await ready();
      const { to } = await startDrag(button, -90, -60);
      pointer(button, "pointerup", to.x, to.y);
      expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual({ version: 1, x: expect.any(Number), y: expect.any(Number) });
      fireEvent.click(button, { detail: 0 });
      expect(screen.getByRole("dialog")).toBeVisible();
    },
  );

  it("浏览器拒绝读取或写入存储时仍能拖拽和通过键盘激活私聊", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("不可访问", "SecurityError"); });
    const writes = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new DOMException("不可写入", "QuotaExceededError"); });
    render(entry()); const button = await ready();
    const { from, to } = await startDrag(button, -90, -60);
    pointer(button, "pointerup", to.x, to.y);
    expectPosition(button, { x: from.x - 90, y: from.y - 60 });
    expect(writes).toHaveBeenCalledTimes(1);
    fireEvent.click(button, { detail: 0 });
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("方向键移动、Shift 加速和松键保存，Escape 撤销未确认移动而 Enter 仍开窗", async () => {
    localStorage.setItem(storageKey, saved);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(entry()); const button = await ready();
    act(() => button.focus());
    const from = position(button);
    fireEvent.keyDown(button, { key: "ArrowLeft" });
    fireEvent.keyDown(button, { key: "ArrowUp", shiftKey: true });
    await waitFor(() => expectPosition(button, { x: from.x - 10, y: from.y - 40 }));
    expect(writes).not.toHaveBeenCalled();
    fireEvent.keyUp(button, { key: "ArrowUp", shiftKey: true });
    fireEvent.keyUp(button, { key: "ArrowLeft" });
    expect(writes).toHaveBeenCalledTimes(1);
    const placed = position(button);
    const stored = localStorage.getItem(storageKey);
    writes.mockClear();
    fireEvent.keyDown(button, { key: "ArrowRight" });
    fireEvent.keyDown(button, { key: "Escape" });
    fireEvent.keyUp(button, { key: "ArrowRight" });
    await waitFor(() => expectPosition(button, placed));
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBe(stored);
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("移动开窗与视口收缩不覆盖保存点，关闭后恢复用户放置位置", async () => {
    viewport.width = 390; viewport.height = 844;
    localStorage.setItem(storageKey, saved);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    const user = userEvent.setup();
    render(entry()); const button = await ready();
    const placed = position(button);
    await user.click(button);
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(position(button).y).toBeLessThan(placed.y);
    viewport.height = 380;
    act(() => { viewport.dispatchEvent(new Event("resize")); });
    expect(writes).not.toHaveBeenCalled();
    expect(localStorage.getItem(storageKey)).toBe(saved);
    viewport.height = 844;
    act(() => { viewport.dispatchEvent(new Event("resize")); });
    await user.click(screen.getByRole("button", { name: "关闭对话" }));
    await waitFor(() => expectPosition(button, placed));
    expect(writes).not.toHaveBeenCalled();
  });

  it("生日主题不启用拖拽和位置持久化，普通点击保持可用", async () => {
    localStorage.setItem(storageKey, saved);
    const writes = vi.spyOn(Storage.prototype, "setItem");
    render(entry("birthday-2026")); const button = await ready();
    const from = position(button);
    pointer(button, "pointerdown", from.x + 30, from.y + 30);
    pointer(button, "pointermove", from.x - 100, from.y - 50);
    pointer(button, "pointerup", from.x - 100, from.y - 50);
    expectPosition(button, from);
    expect(writes).not.toHaveBeenCalled();
    fireEvent.click(button, { detail: 1 });
    expect(screen.getByRole("dialog")).toBeVisible();
    expect(screen.queryByRole("button", { name: "归位" })).toBeNull();
  });
});
