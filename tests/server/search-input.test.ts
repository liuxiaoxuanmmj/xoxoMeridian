/**
 * @vitest-environment jsdom
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
}));

import { usePathname } from "next/navigation";

describe("SearchInput", () => {
  it("renders search input on /home path", async () => {
    vi.mocked(usePathname).mockReturnValue("/home");

    const { SearchInput } = await import("@/components/blog/SearchInput");
    const html = renderToStaticMarkup(
      React.createElement(SearchInput)
    );

    expect(html).toContain('type="text"');
    expect(html).toContain("Search posts...");
  });

  it("returns null on non-/home path", async () => {
    vi.mocked(usePathname).mockReturnValue("/chat");

    const { SearchInput } = await import("@/components/blog/SearchInput");
    const html = renderToStaticMarkup(
      React.createElement(SearchInput)
    );

    expect(html).toBe("");
  });

  it("renders magnifying glass icon", async () => {
    vi.mocked(usePathname).mockReturnValue("/home");

    const { SearchInput } = await import("@/components/blog/SearchInput");
    const html = renderToStaticMarkup(
      React.createElement(SearchInput)
    );

    // The search icon SVG is rendered with a circle and line path
    expect(html).toContain('viewBox="0 0 24 24"');
  });
});
