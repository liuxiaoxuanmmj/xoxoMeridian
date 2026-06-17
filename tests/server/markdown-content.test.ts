import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { PostCard } from "@/components/blog/PostCard";

const post = {
  id: "post-1",
  slug: "markdown-post",
  title: "Markdown Post",
  content: "Hello **world**\nsecond line\n\n- first\n- second",
  publishedAt: "2026-06-15T08:00:00.000Z",
  author: {
    id: "user-1",
    displayName: "Alice",
    avatarLabel: "A",
    profile: null,
  },
};

describe("PostCard Markdown preview", () => {
  it("renders Markdown syntax instead of showing raw markers", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostCard, { post, isOwner: false })
    );

    expect(html).toContain("<strong>world</strong>");
    expect(html).toContain("<li>first</li>");
    expect(html).not.toContain("**world**");
  });

  it("renders single newlines as line breaks in the preview", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostCard, { post, isOwner: false })
    );

    expect(html).toContain("whitespace-pre-wrap");
    expect(html).toMatch(/Hello <strong>world<\/strong><br\/>\nsecond line/);
  });

  it("applies compact typography styles so lists look like Markdown in the home preview", () => {
    const html = renderToStaticMarkup(
      React.createElement(PostCard, { post, isOwner: false })
    );

    expect(html).toContain("prose");
    expect(html).toContain("prose-sm");
    expect(html).toContain("prose-ul:list-disc");
    expect(html).toContain("prose-ol:list-decimal");
  });
});
