import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Timeline, type TimelinePost } from "@/components/blog/Timeline";

const publishedAt = "2026-09-13T01:02:03.123Z";

function post(id: string, overrides: Partial<TimelinePost> = {}): TimelinePost {
  return {
    id, slug: id, title: id, content: "共同记录", type: "user_post", authorId: "author-a",
    author: { id: "author-a", displayName: "甲", avatarLabel: "甲" }, publishedAt, ...overrides,
  };
}

beforeEach(() => {
  vi.stubGlobal("IntersectionObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });
});

describe("Timeline 稳定时间顺序", () => {
  it("同时间用户文章与 Agent 日志按 ID 升序显示，输入顺序变化及重新渲染不改变结果", () => {
    const posts = [
      post("cpostc"),
      post("cposta", { publishedAt: new Date(publishedAt), authorId: "author-b" }),
      post("cpostb", { type: "agent_log", authorId: null, author: null }),
      post("cpostolder", { publishedAt: "2026-09-13T01:02:03.122Z" }),
      post("cpostnewer", { publishedAt: "2026-09-13T01:02:03.124Z" }),
    ];
    const originalIds = posts.map(({ id }) => id);
    const { rerender } = render(<Timeline posts={posts} currentUserId="author-a" />);
    const displayedTitles = () => screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent);
    const expected = ["cpostolder", "cposta", "cpostb", "cpostc", "cpostnewer"];
    expect(displayedTitles()).toEqual(expected);
    rerender(<Timeline posts={[...posts].reverse()} currentUserId="author-a" />);
    expect(displayedTitles()).toEqual(expected);
    rerender(<Timeline posts={[posts[2], posts[0], posts[4], posts[1], posts[3]]} currentUserId="author-a" />);
    expect(displayedTitles()).toEqual(expected);
    expect(posts.map(({ id }) => id)).toEqual(originalIds);
  });
});
