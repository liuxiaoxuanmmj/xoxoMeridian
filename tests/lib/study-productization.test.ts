import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  buildStudyStats,
  normalizeFocusStatus,
  serializeFocusState,
  getLocalDateKey,
} from "@/lib/study";
import {
  parseBody,
  studyGoalPatchSchema,
  studyGoalPostSchema,
  studyStartSchema,
} from "@/lib/validation";

describe("study room Prisma contract", () => {
  it("declares the productized timer states, modes, presence, and goals", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf8");

    expect(schema).toContain("enum FocusStatus");
    expect(schema).toContain("focusing");
    expect(schema).toContain("running");
    expect(schema).toContain("paused");
    expect(schema).toContain("enum StudyTimerMode");
    expect(schema).toContain("remainingSeconds");
    expect(schema).toContain("lastStudySeenAt");
    expect(schema).toContain("model StudyGoal");
    expect(schema).toContain("@@index([userId, localDate, sortOrder])");
  });
});

describe("productized study helpers", () => {
  it("counts only completed focus sessions for focus stats and streak", () => {
    const sessions = [
      { id: "f1", userId: "u1", mode: "focus", status: "completed", startedAt: "2026-06-30T01:00:00.000Z", endedAt: "2026-06-30T01:25:00.000Z", actualMinutes: 25 },
      { id: "s1", userId: "u1", mode: "short", status: "completed", startedAt: "2026-06-30T02:00:00.000Z", endedAt: "2026-06-30T02:05:00.000Z", actualMinutes: 5 },
      { id: "f2", userId: "u1", mode: "focus", status: "completed", startedAt: "2026-06-29T01:00:00.000Z", endedAt: "2026-06-29T01:25:00.000Z", actualMinutes: 25 },
      { id: "f3", userId: "u1", mode: "focus", status: "cancelled", startedAt: "2026-06-28T01:00:00.000Z", endedAt: "2026-06-28T01:10:00.000Z", actualMinutes: 10 },
    ];

    expect(buildStudyStats(sessions, new Date("2026-06-30T12:00:00.000Z"), "Asia/Shanghai")).toEqual({
      todayCount: 1,
      todayMinutes: 25,
      weekCount: 2,
      weekMinutes: 50,
      streakDays: 2,
    });
  });

  it("serializes paused state with remaining seconds and null ISO fields", () => {
    expect(
      serializeFocusState({
        status: "paused",
        mode: "focus",
        plannedMinutes: 25,
        remainingSeconds: 900,
        startedAt: new Date("2026-06-30T01:00:00.000Z"),
        expectedEndAt: null,
        pausedAt: new Date("2026-06-30T01:10:00.000Z"),
      })
    ).toEqual({
      status: "paused",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: 900,
      startedAt: "2026-06-30T01:00:00.000Z",
      expectedEndAt: null,
      pausedAt: "2026-06-30T01:10:00.000Z",
    });
  });

  it("normalizes legacy focusing state as running for API consumers", () => {
    expect(normalizeFocusStatus("focusing")).toBe("running");
    expect(normalizeFocusStatus("paused")).toBe("paused");
  });

  it("computes the local date key in the user's timezone", () => {
    expect(getLocalDateKey(new Date("2026-06-29T16:30:00.000Z"), "Asia/Shanghai")).toBe("2026-06-30");
  });
});

describe("study validation schemas", () => {
  it("accepts timer mode and planned minutes on start", () => {
    expect(parseBody(studyStartSchema, { mode: "short", plannedMinutes: 5 })).toEqual({
      mode: "short",
      plannedMinutes: 5,
    });
  });

  it("trims new study goals", () => {
    expect(parseBody(studyGoalPostSchema, { text: "  整理笔记  " })).toEqual({
      text: "整理笔记",
    });
  });

  it("requires at least one field when patching a study goal", () => {
    expect(() => parseBody(studyGoalPatchSchema, {})).toThrow("Validation failed");
  });
});
