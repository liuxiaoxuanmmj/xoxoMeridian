import type { FocusSessionStatus, StudyTimerMode } from "@prisma/client";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { prisma } from "@/lib/prisma";
import { getStudyPageData } from "@/lib/study";
import { studyCalendarCases, studyCalendarSessions } from "@/tests/fixtures/study-calendar";
import { createTestRoom, createTestUser, resetTestDatabase } from "@/tests/integration/support/database";

beforeEach(resetTestDatabase);
afterEach(() => vi.useRealTimers());
afterAll(() => prisma.$disconnect());

describe("Study 本地日历的真实数据库读取", () => {
  it("八天回看从本地日期起点读取完整日期，跨回退周不截断第一天", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-09T04:30:00Z"));
    const user = await createTestUser();
    const room = await createTestRoom();
    await prisma.roomParticipant.create({ data: { roomId: room.id, userId: user.id } });
    const midnights = [
      "2026-10-30T04:00:00Z", "2026-10-31T04:00:00Z", "2026-11-01T04:00:00Z",
      "2026-11-02T05:00:00Z", "2026-11-03T05:00:00Z", "2026-11-04T05:00:00Z",
      "2026-11-05T05:00:00Z", "2026-11-06T05:00:00Z", "2026-11-07T05:00:00Z",
      "2026-11-08T05:00:00Z",
    ];
    await prisma.focusSession.createMany({ data: midnights.map((midnight, index) => ({
      userId: user.id, roomId: room.id, sessionKey: `window-${index}`, mode: "focus", status: "completed",
      startedAt: new Date(midnight), endedAt: new Date(Date.parse(midnight) + 25 * 60_000),
      plannedMinutes: 25, actualMinutes: 25,
    })) });
    const data = await getStudyPageData(user, "America/New_York");
    expect(data.stats).toEqual({ todayCount: 1, todayMinutes: 25, weekCount: 1, weekMinutes: 25, streakDays: 9 });
    expect(data.members[0].todayFocusMinutes).toBe(25);
  });

  it.each(studyCalendarCases)("$name：本人和伙伴分钟包含真实午夜，排除昨天和下一天", async (scenario) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(scenario.now));
    const user = await createTestUser();
    const partner = await createTestUser();
    const outsider = await createTestUser();
    const room = await createTestRoom();
    await prisma.roomParticipant.createMany({ data: [user, partner].map(({ id }) => ({ roomId: room.id, userId: id })) });
    await prisma.userProfile.createMany({ data: [user, partner].map(({ id }) => ({
      userId: id,
      city: "测试城市",
      country: "测试国家",
      // 成员分钟和本人概览统一使用查看者传入的时区，而非伙伴档案时区。
      timezone: id === user.id ? scenario.timeZone : "Pacific/Auckland",
    })) });
    const sessions = studyCalendarSessions(scenario);
    await prisma.focusSession.createMany({ data: [user, partner, outsider].flatMap(({ id }) => sessions.map((session) => ({
      userId: id,
      roomId: room.id,
      sessionKey: session.id,
      mode: session.mode as StudyTimerMode,
      status: session.status as FocusSessionStatus,
      startedAt: new Date(session.startedAt),
      endedAt: new Date(session.endedAt),
      plannedMinutes: session.actualMinutes,
      actualMinutes: session.actualMinutes,
    }))) });

    const data = await getStudyPageData(user, scenario.timeZone);
    expect(data.members).toHaveLength(2);
    for (const member of [user, partner]) {
      expect.soft(data.members.find(({ userId }) => userId === member.id)?.todayFocusMinutes).toBe(60);
    }
    expect.soft(data.stats).toEqual({ todayCount: 2, todayMinutes: 60, weekCount: 2, weekMinutes: 60, streakDays: 2 });

    await prisma.focusSession.createMany({ data: [user, partner].map(({ id }) => ({
      userId: id, roomId: room.id, sessionKey: "next-local-day", mode: "focus", status: "completed",
      startedAt: new Date(scenario.end), endedAt: new Date(Date.parse(scenario.end) + 45 * 60_000),
      plannedMinutes: 45, actualMinutes: 45,
    })) });
    const beforeMidnight = await getStudyPageData(user, scenario.timeZone);
    expect(beforeMidnight.stats.todayMinutes).toBe(60);
    expect.soft(beforeMidnight.members.map((member) => member.todayFocusMinutes)).toEqual([60, 60]);

    vi.setSystemTime(new Date(scenario.end));
    const afterMidnight = await getStudyPageData(user, scenario.timeZone);
    expect.soft(afterMidnight.stats).toEqual({ todayCount: 1, todayMinutes: 45, weekCount: 3, weekMinutes: 105, streakDays: 3 });
    expect(afterMidnight.members.map((member) => member.todayFocusMinutes)).toEqual([45, 45]);
  });
});
