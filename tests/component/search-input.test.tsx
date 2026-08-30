import { render, screen, waitFor } from "@testing-library/react";
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
