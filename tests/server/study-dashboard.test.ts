import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudyDashboard } from "@/components/study/StudyDashboard";

describe("StudyDashboard", () => {
  it("renders the idle state CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: {
          currentState: {
            status: "idle",
            plannedMinutes: 25,
            startedAt: null,
            expectedEndAt: null,
          },
          recentSessions: [],
          stats: { todayCount: 0, todayMinutes: 0, weekCount: 0, weekMinutes: 0 },
        },
      })
    );

    expect(html).toContain("开始专注");
    expect(html).toContain("25:00");
  });

  it("renders the focusing state CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: {
          currentState: {
            status: "focusing",
            plannedMinutes: 25,
            startedAt: "2026-06-29T01:00:00.000Z",
            expectedEndAt: "2026-06-29T01:25:00.000Z",
          },
          recentSessions: [],
          stats: { todayCount: 1, todayMinutes: 25, weekCount: 1, weekMinutes: 25 },
        },
      })
    );

    expect(html).toContain("专注中");
    expect(html).toContain("结束专注");
  });
});
