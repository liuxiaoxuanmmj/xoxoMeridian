import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TimelineFocusOverlay } from "@/components/blog/TimelineFocusOverlay";

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
