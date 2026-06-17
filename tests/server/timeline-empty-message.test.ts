import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Timeline } from "@/components/blog/Timeline";

describe("Timeline emptyMessage", () => {
  it("renders custom emptyMessage when provided and posts is empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, {
        posts: [],
        currentUserId: "user-1",
        emptyMessage: "No posts match your search.",
      })
    );

    expect(html).toContain("No posts match your search.");
  });

  it("falls back to default message when emptyMessage is not provided", () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, {
        posts: [],
        currentUserId: "user-1",
      })
    );

    expect(html).toContain("No moments yet.");
  });

  it("does not show empty message when posts is non-empty", () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, {
        posts: [
          {
            id: "post-1",
            slug: "test",
            title: "Test",
            content: "Content",
            type: "user_post",
            authorId: "user-1",
            publishedAt: new Date().toISOString(),
            author: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
          },
        ],
        currentUserId: "user-1",
        emptyMessage: "No posts match your search.",
      })
    );

    expect(html).not.toContain("No posts match your search.");
    expect(html).not.toContain("No moments yet.");
  });
});
