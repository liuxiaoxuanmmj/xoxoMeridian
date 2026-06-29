import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: vi.fn(() => "/study"),
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
});
