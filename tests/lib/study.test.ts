import { describe, expect, it } from "vitest";

import {
  buildStudyStats,
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
