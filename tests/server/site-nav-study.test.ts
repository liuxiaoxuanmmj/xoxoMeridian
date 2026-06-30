import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mockNavigation = vi.hoisted(() => ({
  pathname: "/study",
}));

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => mockNavigation.pathname),
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
  useSearchParams: vi.fn(() => new URLSearchParams()),
}));

import { SiteNav } from "@/components/blog/SiteNav";

describe("SiteNav study link", () => {
  it("renders Study link and highlights it on /study", () => {
    const html = renderToStaticMarkup(
      React.createElement(SiteNav, {
        currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      })
    );

    expect(html).toContain(">Study<");
    expect(html).toContain('href="/study"');
  });

  it("uses the same full-width split layout as the chat header", () => {
    mockNavigation.pathname = "/home";

    const html = renderToStaticMarkup(
      React.createElement(SiteNav, {
        currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      })
    );

    expect(html).toContain("flex h-16 items-center justify-between px-5");
    expect(html).not.toContain("max-w-3xl");
  });

  it("hides New Post on the study page", () => {
    mockNavigation.pathname = "/study";

    const html = renderToStaticMarkup(
      React.createElement(SiteNav, {
        currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      })
    );

    expect(html).not.toContain(">New Post<");
    expect(html).not.toContain('href="/posts/new"');
  });

  it("keeps New Post available on the blog page", () => {
    mockNavigation.pathname = "/home";

    const html = renderToStaticMarkup(
      React.createElement(SiteNav, {
        currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      })
    );

    expect(html).toContain(">New Post<");
    expect(html).toContain('href="/posts/new"');
  });
});
