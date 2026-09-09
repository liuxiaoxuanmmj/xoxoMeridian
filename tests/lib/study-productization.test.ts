import { FocusStatus, Prisma, StudyTimerMode } from "@prisma/client";
import { describe, expect, it } from "vitest";
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
  studyTransitionSchema,
} from "@/lib/validation";

describe("study room Prisma contract", () => {
  it("declares the productized timer states, modes, presence, and goals", () => {
    expect(Object.values(FocusStatus)).toEqual(
      expect.arrayContaining(["focusing", "running", "paused"])
    );
    expect(Object.values(StudyTimerMode)).toEqual(
      expect.arrayContaining(["focus", "short", "long"])
    );

    const focusState = Prisma.dmmf.datamodel.models.find((model) => model.name === "FocusState");
    const studyGoal = Prisma.dmmf.datamodel.models.find((model) => model.name === "StudyGoal");
    expect(focusState?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(["remainingSeconds", "lastStudySeenAt"])
    );
    expect(studyGoal?.fields.map((field) => field.name)).toEqual(
      expect.arrayContaining(["userId", "localDate", "sortOrder"])
    );
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
        currentSessionKey: "focus-key",
      })
    ).toEqual({
      status: "paused",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: 900,
      startedAt: "2026-06-30T01:00:00.000Z",
      expectedEndAt: null,
      pausedAt: "2026-06-30T01:10:00.000Z",
      sessionKey: "focus-key",
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

  it("requires a bounded session key for focus transitions", () => {
    expect(parseBody(studyTransitionSchema, { sessionKey: "focus-key" })).toEqual({
      sessionKey: "focus-key",
    });
    expect(() => parseBody(studyTransitionSchema, {})).toThrow("Validation failed");
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
