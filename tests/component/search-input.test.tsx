import { StrictMode, useEffect, useRef } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const navigation = vi.hoisted(() => ({
  pathname: "/home",
  searchParams: new URLSearchParams(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => navigation.pathname,
  useSearchParams: () => navigation.searchParams,
  useRouter: () => ({ replace: navigation.replace }),
}));

import { SearchInput } from "@/components/blog/SearchInput";

describe("SearchInput", () => {
  beforeEach(() => {
    navigation.pathname = "/home";
    navigation.searchParams = new URLSearchParams("tag=shared");
    window.history.replaceState({}, "", "/home?tag=shared");
    navigation.replace.mockReset();
  });

  it("debounces edits and preserves unrelated query parameters", async () => {
    const user = userEvent.setup();
    render(<SearchInput />);

    const input = screen.getByLabelText("Search posts");
    await user.type(input, "react hooks");

    expect(navigation.replace).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith(
        "/home?tag=shared&q=react+hooks"
      );
    });
  });

  it("开发模式首次挂载期间收到的查询在 effect 重放后仍会搜索", async () => {
    function EarlyInput() {
      const entered = useRef(false);
      useEffect(() => {
        if (entered.current) return;
        entered.current = true;
        // 模拟首次挂载尚未结束时到达的一次原生输入事件，不重复补发输入。
        const input = screen.getByLabelText("Search posts");
        const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
        if (!setValue) throw new Error("测试环境需要原生 input.value setter");
        setValue.call(input, "shared memories");
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }, []);
      return <SearchInput />;
    }

    await act(async () => {
      render(<StrictMode><EarlyInput /></StrictMode>);
    });
    expect(screen.getByLabelText("Search posts")).toHaveValue("shared memories");
    expect(screen.getByRole("button", { name: "Clear search" })).toBeVisible();
    await waitFor(() => {
      expect(navigation.replace).toHaveBeenCalledWith("/home?tag=shared&q=shared+memories");
    });
    expect(navigation.replace).toHaveBeenCalledTimes(1);
  });

  it.each(["清空", "卸载"] as const)("%s会取消尚未提交的搜索", (action) => {
    vi.useFakeTimers();
    try {
      const { unmount } = render(<SearchInput />);
      // 此处精确推进防抖时钟，只派发一次输入/清空事件。
      fireEvent.change(screen.getByLabelText("Search posts"), { target: { value: "pending query" } });
      if (action === "清空") {
        fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
        expect(screen.getByLabelText("Search posts")).toHaveValue("");
      } else {
        unmount();
      }
      act(() => { vi.advanceTimersByTime(300); });
      expect(navigation.replace.mock.calls).toEqual(action === "清空" ? [["/home"]] : []);
    } finally {
      vi.useRealTimers();
    }
  });

  it("replaces a local draft when navigation supplies a different query", async () => {
    navigation.searchParams = new URLSearchParams("q=first");
    const user = userEvent.setup();
    const { rerender } = render(<SearchInput />);

    const input = screen.getByLabelText("Search posts");
    await user.clear(input);
    await user.type(input, "local draft");
    expect(input).toHaveValue("local draft");

    navigation.searchParams = new URLSearchParams("q=from-navigation");
    rerender(<SearchInput />);

    expect(screen.getByLabelText("Search posts")).toHaveValue("from-navigation");
  });
});
