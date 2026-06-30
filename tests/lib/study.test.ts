import { describe, expect, it } from "vitest";

import {
  buildStudyStats,
  buildTimelineFocusIntervals,
  projectFocusIntervalsToSegments,
} from "@/lib/study";

describe("buildStudyStats", () => {
  it("counts today and week sessions in the user's timezone", () => {
    const sessions = [
      {
        id: "s-1",
        userId: "user-1",
        startedAt: "2026-06-29T01:00:00.000Z",
        endedAt: "2026-06-29T01:25:00.000Z",
        actualMinutes: 25,
      },
      {
        id: "s-2",
        userId: "user-1",
        startedAt: "2026-06-28T01:00:00.000Z",
        endedAt: "2026-06-28T01:50:00.000Z",
        actualMinutes: 50,
      },
      {
        id: "s-3",
        userId: "user-1",
        startedAt: "2026-06-20T01:00:00.000Z",
        endedAt: "2026-06-20T01:25:00.000Z",
        actualMinutes: 25,
      },
    ];

    expect(
      buildStudyStats(sessions, new Date("2026-06-29T12:00:00.000Z"), "Asia/Shanghai")
    ).toEqual({
      todayCount: 1,
      todayMinutes: 25,
      weekCount: 2,
      weekMinutes: 75,
      streakDays: 2,
    });
  });
});

describe("buildTimelineFocusIntervals", () => {
  it("sorts intervals ascending and assigns stable lanes per user", () => {
    const intervals = buildTimelineFocusIntervals([
      {
        id: "s-2",
        userId: "user-2",
        startedAt: "2026-06-29T02:00:00.000Z",
        endedAt: "2026-06-29T02:25:00.000Z",
        actualMinutes: 25,
        user: { displayName: "Bob" },
      },
      {
        id: "s-1",
        userId: "user-1",
        startedAt: "2026-06-29T01:00:00.000Z",
        endedAt: "2026-06-29T01:25:00.000Z",
        actualMinutes: 25,
        user: { displayName: "Alice" },
      },
    ]);

    expect(intervals.map((item) => item.id)).toEqual(["s-1", "s-2"]);
    expect(intervals.map((item) => item.lane)).toEqual([0, 1]);
  });
});

describe("projectFocusIntervalsToSegments", () => {
  it("projects focus intervals onto measured post markers", () => {
    const segments = projectFocusIntervalsToSegments(
      [
        {
          id: "s-1",
          userId: "user-1",
          userDisplayName: "Alice",
          startedAt: "2026-06-29T01:00:00.000Z",
          endedAt: "2026-06-29T01:30:00.000Z",
          actualMinutes: 30,
          lane: 0,
        },
      ],
      [
        { publishedAt: "2026-06-29T01:00:00.000Z", centerY: 100 },
        { publishedAt: "2026-06-29T02:00:00.000Z", centerY: 300 },
      ]
    );

    expect(segments).toEqual([
      expect.objectContaining({
        id: "s-1",
        userId: "user-1",
        topPx: 100,
        heightPx: 100,
      }),
    ]);
  });
});
