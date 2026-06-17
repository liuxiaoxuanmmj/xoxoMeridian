/**
 * @vitest-environment jsdom
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockUseSearchParams } = vi.hoisted(() => ({
  mockUseSearchParams: vi.fn(() => new URLSearchParams()),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: mockUseSearchParams,
  useRouter: vi.fn(() => ({ replace: vi.fn() })),
  usePathname: vi.fn(() => "/home"),
}));

import { HomeTimelineBoard } from "@/components/home/HomeTimelineBoard";

const basePost = {
  id: "post-1",
  slug: "test-post",
  title: "Test Post",
  content: "Content",
  type: "user_post" as const,
  authorId: "user-1",
  publishedAt: "2026-06-15T08:00:00.000Z",
  author: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
};

const emptySnapshot = { boardId: "board-1", elements: [], connections: [] };

describe("HomeTimelineBoard search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders posts normally when no q param", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams());

    const html = renderToStaticMarkup(
      React.createElement(HomeTimelineBoard, {
        posts: [basePost],
        currentUserId: "user-1",
        initialSnapshot: emptySnapshot,
      })
    );

    expect(html).toContain("Test Post");
    expect(html).not.toContain("No posts match your search.");
  });

  it("renders initial posts as fallback when q is present (before fetch completes)", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("?q=docker"));

    const html = renderToStaticMarkup(
      React.createElement(HomeTimelineBoard, {
        posts: [basePost],
        currentUserId: "user-1",
        initialSnapshot: emptySnapshot,
      })
    );

    // During fetch (searchResults===null), should show initial posts
    expect(html).toContain("Test Post");
  });

  it("shows empty state when q present and posts is empty", () => {
    mockUseSearchParams.mockReturnValue(new URLSearchParams("?q=nonexistent"));

    const html = renderToStaticMarkup(
      React.createElement(HomeTimelineBoard, {
        posts: [],
        currentUserId: "user-1",
        initialSnapshot: emptySnapshot,
      })
    );

    // With no initial posts and no search results yet, Timeline renders empty state
    expect(html).toContain("No moments yet.");
  });
});
