import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Timeline } from "@/components/blog/Timeline";
import { TimelineFocusOverlay } from "@/components/blog/TimelineFocusOverlay";

function formatExpectedTime(value: string) {
  return new Date(value).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

describe("Timeline focus overlay", () => {
  it("renders focus interval segments without changing post card content", () => {
    const html = renderToStaticMarkup(
      React.createElement(TimelineFocusOverlay, {
        segments: [
          {
            id: "s-1",
            userId: "user-1",
            lane: 0,
            topPx: 12,
            heightPx: 42,
          },
        ],
      })
    );

    expect(html).toContain('data-testid="timeline-focus-overlay"');
    expect(html).toContain('data-focus-user="user-1"');
    expect(html).toContain("top:12px");
  });
});

describe("Timeline study markers", () => {
  it("renders every completed study record on the center axis with hover details", () => {
    const html = renderToStaticMarkup(
      React.createElement(Timeline, {
        posts: [
          {
            id: "post-1",
            slug: "first",
            title: "First",
            content: "Hello",
            type: "user_post",
            authorId: "user-1",
            publishedAt: "2026-06-29T00:00:00.000Z",
            author: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
          },
        ],
        currentUserId: "user-1",
        focusIntervals: [
          {
            id: "s-1",
            userId: "user-1",
            userDisplayName: "Alice",
            startedAt: "2026-06-29T01:00:00.000Z",
            endedAt: "2026-06-29T01:25:00.000Z",
            actualMinutes: 25,
            lane: 0,
          },
          {
            id: "s-2",
            userId: "user-1",
            userDisplayName: "Alice",
            startedAt: "2026-06-29T02:00:00.000Z",
            endedAt: "2026-06-29T02:25:00.000Z",
            actualMinutes: 25,
            lane: 0,
          },
        ],
      })
    );

    expect(html.match(/data-testid="timeline-focus-marker"/g)).toHaveLength(2);
    expect(html).toContain('data-focus-user="user-1"');
    expect(html).toContain("Alice 在认真自习");
    const firstRange = `${formatExpectedTime("2026-06-29T01:00:00.000Z")} - ${formatExpectedTime("2026-06-29T01:25:00.000Z")}`;
    const secondRange = `${formatExpectedTime("2026-06-29T02:00:00.000Z")} - ${formatExpectedTime("2026-06-29T02:25:00.000Z")}`;

    expect(html).toContain(firstRange);
    expect(html).toContain(secondRange);
    expect(html).toContain("left-1/2");
  });
});
