import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// 用例收尾时卸载是同步发生的：cleanup() → unmount → 冲刷待执行的被动效果。
// HomeTimelineBoard 的搜索响应替换卡片时，useScrollReveal 的效果体正是在这条路径上构造 IntersectionObserver，
// 所以卸载期间全局替身必须仍然存在；文件级 afterEach 先于共享 cleanup() 运行，在那里恢复替身会让卸载抛 ReferenceError。
// 反过来说，替身也不能永久残留：共享收尾负责在 cleanup() 之后恢复，使下一个用例看到真实全局。
const nativeIntersectionObserver = globalThis.IntersectionObserver;

class StubIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

function UnmountRevealProbe() {
  useEffect(
    () => () => {
      // 与 useScrollReveal 的效果体一样，卸载期间执行的代码需要 IntersectionObserver。
      new IntersectionObserver(() => {}, { threshold: 0.15 }).disconnect();
    },
    [],
  );

  return <p>卸载探针已挂载</p>;
}

describe("卸载期间的全局替身", () => {
  describe("替身由用例自己安装时", () => {
    beforeEach(() => {
      vi.stubGlobal("IntersectionObserver", StubIntersectionObserver);
    });

    it("组件卸载仍能访问替身，卸载路径不抛错", () => {
      render(<UnmountRevealProbe />);

      expect(screen.getByText("卸载探针已挂载")).toBeInTheDocument();
    });
  });

  describe("上一个用例的收尾完成后", () => {
    it("共享收尾已在卸载之后恢复全局，替身不残留到下一个用例", () => {
      expect(globalThis.IntersectionObserver).toBe(nativeIntersectionObserver);
    });
  });
});
