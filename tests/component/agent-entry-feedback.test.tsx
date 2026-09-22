import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useEntryFeedback } from "@/components/agent-entry/use-entry-feedback";

beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("小人拖拽本地反馈", () => {
  it("加载期间持续抓取，首帧就绪后继承拎起动作且不重发已经过期的台词", () => {
    const { result } = renderHook(() => useEntryFeedback(true, false));
    act(() => result.current.beginDrag());
    expect(result.current.feedback?.text).toBe("诶，要带我去哪？");
    expect(result.current.motion.frame(100).active).toBe(false);
    act(() => vi.advanceTimersByTime(2300));
    expect(result.current.feedback).toBeNull();
    act(() => result.current.onReady());
    expect(result.current.feedback).toBeNull();
    expect(result.current.motion.frame(3000).active).toBe(true);
    result.current.motion.updateDrag(1, 0);
    const pose = result.current.motion.frame(3100);
    expect(pose.y).toBeGreaterThan(0);
    expect(pose.roll).toBeGreaterThan(0);
    act(() => result.current.endDrag());
    expect(result.current.feedback?.text).toBe("好，就待在这里。");
  });

  it.each(["松手", "取消"])("加载完成前已%s，就绪时不补播拎起动作", (ending) => {
    const { result } = renderHook(() => useEntryFeedback(true, false));
    act(() => result.current.beginDrag());
    act(() => ending === "松手" ? result.current.endDrag() : result.current.cancelDrag());
    act(() => vi.advanceTimersByTime(2300));
    act(() => result.current.onReady());
    expect(result.current.feedback).toBeNull();
    expect(result.current.motion.frame(3000)).toEqual({ y: 0, tilt: 0, scale: 1, active: false });
    result.current.motion.updateDrag(1, 1);
    expect(result.current.motion.frame(3100).active).toBe(false);
  });

  it("拖拽覆盖点击保护，重复开始不刷新台词计时，抓住时屏蔽普通反馈", () => {
    const { result } = renderHook(() => useEntryFeedback(true, false));
    act(() => { result.current.onReady(); result.current.show("click"); });
    expect(result.current.feedback?.text).toBe("在呢，我们聊聊。");
    act(() => result.current.beginDrag());
    expect(result.current.feedback).toEqual({ symbol: "↗", text: "诶，要带我去哪？" });
    act(() => vi.advanceTimersByTime(1000));
    act(() => {
      result.current.beginDrag();
      result.current.show("attention");
      result.current.show("reply");
    });
    expect(result.current.feedback?.text).toBe("诶，要带我去哪？");
    act(() => vi.advanceTimersByTime(1300));
    expect(result.current.feedback).toBeNull();
    act(() => result.current.show("click"));
    expect(result.current.feedback).toBeNull();
    act(() => result.current.endDrag());
    expect(result.current.feedback).toEqual({ symbol: "✦", text: "好，就待在这里。" });
    act(() => { result.current.show("attention"); result.current.show("reply"); });
    expect(result.current.feedback?.text).toBe("好，就待在这里。");
    act(() => result.current.show("click"));
    expect(result.current.feedback?.text).toBe("在呢，我们聊聊。");
  });

  it("取消清除拖动台词，不播放放下台词，随后点击正常响应", () => {
    const { result } = renderHook(() => useEntryFeedback(true, false));
    act(() => { result.current.onReady(); result.current.beginDrag(); });
    act(() => result.current.cancelDrag());
    expect(result.current.feedback).toBeNull();
    act(() => result.current.endDrag());
    expect(result.current.feedback).toBeNull();
    act(() => result.current.show("click"));
    expect(result.current.feedback?.text).toBe("在呢，我们聊聊。");
  });

  it("隐藏取消反馈，恢复后的迟到松手不会补播放下", () => {
    const visibility = vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
    const { result } = renderHook(() => useEntryFeedback(true, false));
    act(() => { result.current.onReady(); result.current.beginDrag(); });
    visibility.mockReturnValue("hidden");
    fireEvent(document, new Event("visibilitychange"));
    expect(result.current.feedback).toBeNull();
    visibility.mockReturnValue("visible");
    fireEvent(document, new Event("visibilitychange"));
    act(() => result.current.endDrag());
    expect(result.current.feedback).toBeNull();
    act(() => result.current.beginDrag());
    expect(result.current.feedback?.text).toBe("诶，要带我去哪？");
  });

  it("减少动态仍显示拖动和放下文案，生日不新增反馈", () => {
    const { result, unmount } = renderHook(() => useEntryFeedback(true, true));
    act(() => { result.current.onReady(); result.current.beginDrag(); });
    expect(result.current.feedback?.text).toBe("诶，要带我去哪？");
    expect(result.current.motion.frame(100).active).toBe(false);
    act(() => result.current.endDrag());
    expect(result.current.feedback?.text).toBe("好，就待在这里。");
    expect(result.current.motion.frame(300).active).toBe(false);
    unmount();
    const birthday = renderHook(() => useEntryFeedback(false, false));
    act(() => { birthday.result.current.onReady(); birthday.result.current.beginDrag(); birthday.result.current.endDrag(); });
    expect(birthday.result.current.feedback).toBeNull();
  });
});
