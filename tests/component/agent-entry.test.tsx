import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgentEntrySceneProps } from "@/components/agent-entry/agent-entry.types";

const navigation = vi.hoisted(() => ({ push: vi.fn() }));
const scene = vi.hoisted(() => ({ props: undefined as AgentEntrySceneProps | undefined }));
const motionPreference = vi.hoisted(() => ({ reduced: false }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation }));
vi.mock("framer-motion", async (importOriginal) => ({
  ...await importOriginal<typeof import("framer-motion")>(),
  useReducedMotion: () => motionPreference.reduced,
}));
vi.mock("@/components/agent-entry/AgentEntryScene", () => ({
  default: function Scene(props: AgentEntrySceneProps) {
    scene.props = props;
    return <span aria-hidden="true">装饰场景</span>;
  },
}));

import AgentEntry from "@/components/agent-entry/AgentEntry";
import { agentEntryRegistry } from "@/components/agent-entry/agent-entry.registry";

const config = agentEntryRegistry.default;
async function ready() {
  await act(async () => { scene.props?.onReady(config.model); });
  return screen.getByRole("button", { name: "打开 Agent 聊天" });
}

beforeEach(() => {
  navigation.push.mockReset();
  scene.props = undefined;
  motionPreference.reduced = false;
});

describe("Agent Entry 原生按钮交互", () => {
  it("首帧前不可见、不可聚焦且不导航，首帧后才能使用", async () => {
    const user = userEvent.setup();
    render(<><button type="button">宿主控件</button><AgentEntry config={config} /></>);
    const button = screen.getByRole("button", { hidden: true, name: "打开 Agent 聊天" });
    expect(button).not.toBeVisible();
    expect(button).toBeDisabled();
    expect(button.tabIndex).toBe(-1);
    await user.tab();
    expect(screen.getByRole("button", { name: "宿主控件" })).toHaveFocus();
    await expect(user.click(button)).rejects.toThrow(/pointer-events: none/);
    expect(navigation.push).not.toHaveBeenCalled();
    expect(await ready()).toBeEnabled();
  });

  it.each(["鼠标", "Enter", "Space"])("%s 激活导航到 /chat", async (mode) => {
    const user = userEvent.setup();
    render(<AgentEntry config={config} />);
    const button = await ready();
    if (mode === "鼠标") await user.click(button);
    else {
      await user.tab();
      await user.keyboard(mode === "Enter" ? "{Enter}" : " ");
    }
    expect(navigation.push).toHaveBeenCalledExactlyOnceWith("/chat");
  });

  it("同一导航周期连续激活只 push 一次，导航结束仍在原页时恢复", async () => {
    render(<AgentEntry config={config} />);
    const button = await ready();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(navigation.push).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(navigation.push).toHaveBeenCalledTimes(2);
  });

  it("router.push 同步失败不影响宿主页面并允许再次激活", async () => {
    navigation.push.mockImplementationOnce(() => { throw new Error("导航取消"); });
    render(<AgentEntry config={config} />);
    const button = await ready();
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(navigation.push).toHaveBeenCalledTimes(2);
  });

  it("Hover 和 Focus 显示 tooltip，Escape 关闭且不移动焦点", async () => {
    const user = userEvent.setup();
    render(<AgentEntry config={config} />);
    const button = await ready();
    await user.hover(button);
    expect(screen.getByRole("tooltip")).toHaveTextContent("和 Agent 聊聊");
    await user.hover(screen.getByRole("tooltip"));
    expect(screen.getByRole("tooltip")).toBeVisible();
    await user.unhover(screen.getByRole("tooltip"));
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
    await user.tab();
    expect(screen.getByRole("tooltip")).toBeVisible();
    expect(button).toHaveAttribute("aria-describedby", screen.getByRole("tooltip").id);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(button).toHaveFocus();
  });

  it("reduced-motion 就绪立即可用，Hover 不缩放且保留 tooltip", async () => {
    motionPreference.reduced = true;
    const user = userEvent.setup();
    render(<AgentEntry config={config} />);
    const button = await ready();
    expect(button).toHaveStyle({ opacity: "1" });
    await user.hover(button);
    expect(button.style.transform).not.toContain("scale");
    expect(screen.getByRole("tooltip")).toBeVisible();
  });

  it("场景失败移除入口、保留宿主控件，迟到首帧不复活", async () => {
    render(<><button type="button">宿主控件</button><AgentEntry config={config} /></>);
    const oldProps = scene.props;
    await act(async () => { oldProps?.onError(); oldProps?.onReady(config.model); });
    expect(screen.queryByRole("button", { name: "打开 Agent 聊天", hidden: true })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "宿主控件" })).toBeEnabled();
  });

  it("错误模型身份不能解锁当前实例", async () => {
    render(<AgentEntry config={config} />);
    await act(async () => { scene.props?.onReady("/另一个模型.glb"); });
    expect(screen.getByRole("button", { hidden: true, name: "打开 Agent 聊天" })).toBeDisabled();
  });
});
