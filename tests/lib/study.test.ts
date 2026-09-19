import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { describe, expect, it } from "vitest";

import {
  buildStudyStats,
  getLocalDateKey,
} from "@/lib/study";
import { getStudyDateWindow } from "@/lib/study-calendar";
import { studyCalendarCases, studyCalendarSessions } from "@/tests/fixtures/study-calendar";

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

  it.each(studyCalendarCases)("$name：两天记录只计两天，按本地周日分周并过滤休息和取消记录", (scenario) => {
    const sessions = studyCalendarSessions(scenario);
    expect(getLocalDateKey(new Date(scenario.now), scenario.timeZone)).toBe(scenario.today);
    expect(buildStudyStats(sessions, new Date(scenario.now), scenario.timeZone)).toEqual({
      todayCount: 2, todayMinutes: 60, weekCount: 2, weekMinutes: 60, streakDays: 2,
    });
  });

  it.each(studyCalendarCases)("$name：查询日界覆盖整个本地日期，包括重复或不存在的午夜", (scenario) => {
    const { todayStartUtc, tomorrowStartUtc } = getStudyDateWindow(new Date(scenario.now), scenario.timeZone);
    expect(todayStartUtc.toISOString()).toBe(scenario.start);
    expect(tomorrowStartUtc.toISOString()).toBe(scenario.end);
    expect(getLocalDateKey(new Date(todayStartUtc.getTime() - 1), scenario.timeZone)).not.toBe(scenario.today);
    expect(getLocalDateKey(todayStartUtc, scenario.timeZone)).toBe(scenario.today);
    expect(getLocalDateKey(new Date(tomorrowStartUtc.getTime() - 1), scenario.timeZone)).toBe(scenario.today);
    expect(getLocalDateKey(tomorrowStartUtc, scenario.timeZone)).not.toBe(scenario.today);
  });

  it("纽约回退日 23:30 的两条完成记录得到连续两天", () => {
    const sessions = ["2026-11-01T12:00:00Z", "2026-10-31T12:00:00Z"].map((startedAt, index) => ({
      id: `fall-${index}`, userId: "calendar-user", startedAt, endedAt: startedAt,
      actualMinutes: 25, mode: "focus", status: "completed",
    }));
    expect(buildStudyStats(sessions, new Date("2026-11-02T04:30:00Z"), "America/New_York")).toEqual({
      todayCount: 1, todayMinutes: 25, weekCount: 1, weekMinutes: 25, streakDays: 2,
    });
  });

  it.each(studyCalendarCases)("$name：午夜两侧使用 startedAt，本地周日开启新周，缺少今天时连续天数归零", (scenario) => {
    const sessions = studyCalendarSessions(scenario);
    expect(buildStudyStats(sessions.slice(0, 2), new Date(Date.parse(scenario.start) - 1), scenario.timeZone)).toEqual({
      todayCount: 2, todayMinutes: 35, weekCount: 2, weekMinutes: 35, streakDays: 1,
    });
    expect(buildStudyStats(sessions, new Date(scenario.start), scenario.timeZone)).toEqual({
      todayCount: 2, todayMinutes: 60, weekCount: 2, weekMinutes: 60, streakDays: 2,
    });
    expect(buildStudyStats(sessions, new Date(scenario.end), scenario.timeZone)).toEqual({
      todayCount: 0, todayMinutes: 0, weekCount: 2, weekMinutes: 60, streakDays: 0,
    });
    expect(buildStudyStats([
      ...sessions,
      { id: "monday", userId: "calendar-user", startedAt: scenario.end, endedAt: scenario.end, actualMinutes: 45 },
    ], new Date(scenario.end), scenario.timeZone)).toEqual({
      todayCount: 1, todayMinutes: 45, weekCount: 3, weekMinutes: 105, streakDays: 3,
    });
  });

  it.each(["UTC", "America/Los_Angeles", "Asia/Shanghai"])("服务器进程 TZ=%s 时，DST 统计和查询日界保持一致", async (timeZone) => {
    const moduleUrl = new URL("../../lib/study-calendar.ts", import.meta.url).href;
    const inputs = studyCalendarCases.map((scenario) => ({ ...scenario, sessions: studyCalendarSessions(scenario) }));
    const script = `
      const { buildStudyStats, getStudyDateWindow } = await import(${JSON.stringify(moduleUrl)});
      const inputs = JSON.parse(process.argv[1]);
      process.stdout.write(JSON.stringify(inputs.map(({ sessions, now, timeZone }) => ({
        stats: buildStudyStats(sessions, new Date(now), timeZone),
        window: getStudyDateWindow(new Date(now), timeZone),
      }))));
    `;
    const { stdout } = await promisify(execFile)(process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", script, JSON.stringify(inputs)],
      { env: { ...process.env, TZ: timeZone } },
    );
    expect(JSON.parse(stdout)).toEqual(studyCalendarCases.map((scenario) => ({
      stats: { todayCount: 2, todayMinutes: 60, weekCount: 2, weekMinutes: 60, streakDays: 2 },
      window: expect.objectContaining({ todayStartUtc: scenario.start, tomorrowStartUtc: scenario.end }),
    })));
  });
});
