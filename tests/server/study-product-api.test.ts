import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCurrentUser,
  mockFocusStateUpsert,
  mockRoomParticipantFindFirst,
  mockRevalidatePath,
  mockStudyGoalCreate,
  mockStudyGoalUpdate,
  mockStudyGoalDelete,
  mockStudyGoalFindFirst,
  mockStudyGoalCount,
} = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
  mockFocusStateUpsert: vi.fn(),
  mockRoomParticipantFindFirst: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockStudyGoalCreate: vi.fn(),
  mockStudyGoalUpdate: vi.fn(),
  mockStudyGoalDelete: vi.fn(),
  mockStudyGoalFindFirst: vi.fn(),
  mockStudyGoalCount: vi.fn(),
}));

const {
  mockStartFocusTimer,
  mockPauseFocusTimer,
  mockResumeFocusTimer,
  mockStopFocusTimer,
} = vi.hoisted(() => ({
  mockStartFocusTimer: vi.fn(),
  mockPauseFocusTimer: vi.fn(),
  mockResumeFocusTimer: vi.fn(),
  mockStopFocusTimer: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mockRequireCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/study-transitions", () => ({
  StudyTransitionConflictError: class StudyTransitionConflictError extends Error {},
  startFocusTimer: mockStartFocusTimer,
  pauseFocusTimer: mockPauseFocusTimer,
  resumeFocusTimer: mockResumeFocusTimer,
  stopFocusTimer: mockStopFocusTimer,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    focusState: {
      upsert: mockFocusStateUpsert,
    },
    roomParticipant: { findFirst: mockRoomParticipantFindFirst },
    studyGoal: {
      create: mockStudyGoalCreate,
      update: mockStudyGoalUpdate,
      delete: mockStudyGoalDelete,
      findFirst: mockStudyGoalFindFirst,
      count: mockStudyGoalCount,
    },
  },
}));

import { POST as START } from "@/app/api/study/start/route";
import { POST as PAUSE } from "@/app/api/study/pause/route";
import { POST as RESUME } from "@/app/api/study/resume/route";
import { POST as STOP } from "@/app/api/study/stop/route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-06-30T01:10:00.000Z"));
  mockRequireCurrentUser.mockResolvedValue({ id: "user-1", profile: { timezone: "Asia/Shanghai" } });
  mockRoomParticipantFindFirst.mockResolvedValue({ roomId: "room-1", room: { id: "room-1" } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("productized study timer API", () => {
  it("starts a short break as running state in the default room", async () => {
    mockStartFocusTimer.mockResolvedValue({
      status: "running",
      mode: "short",
      plannedMinutes: 5,
      remainingSeconds: null,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-30T01:05:00.000Z"),
      pausedAt: null,
      currentSessionKey: "short-key",
    });

    const response = await START(new Request("http://localhost/api/study/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "short", plannedMinutes: 5 }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("running");
    expect(data.state.mode).toBe("short");
    expect(data.state.sessionKey).toBe("short-key");
    expect(mockStartFocusTimer).toHaveBeenCalledWith({
      userId: "user-1",
      roomId: "room-1",
      mode: "short",
      plannedMinutes: 5,
    });
  });

  it("pauses a running focus timer and stores remaining seconds", async () => {
    mockPauseFocusTimer.mockResolvedValue({
      status: "paused",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: 900,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: null,
      pausedAt: new Date("2026-06-30T01:10:00.000Z"),
      currentSessionKey: "focus-key",
    });

    const response = await PAUSE(new Request("http://localhost/api/study/pause", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey: "focus-key" }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("paused");
    expect(data.state.remainingSeconds).toBe(900);
    expect(mockPauseFocusTimer).toHaveBeenCalledWith("user-1", "focus-key");
  });

  it("resumes a paused timer with a new expected end", async () => {
    mockResumeFocusTimer.mockResolvedValue({
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: null,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-30T01:25:00.000Z"),
      pausedAt: null,
      currentSessionKey: "focus-key",
    });

    const response = await RESUME(new Request("http://localhost/api/study/resume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey: "focus-key" }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("running");
    expect(data.state.startedAt).toBe("2026-06-30T01:00:00.000Z");
    expect(mockResumeFocusTimer).toHaveBeenCalledWith("user-1", "focus-key");
  });

  it("stops a paused short break and writes a short session", async () => {
    mockStopFocusTimer.mockResolvedValue({
      session: {
        id: "session-1",
        mode: "short",
        startedAt: new Date("2026-06-30T01:00:00.000Z"),
        endedAt: new Date("2026-06-30T01:03:00.000Z"),
        actualMinutes: 3,
      },
      state: {
        status: "idle",
        mode: "focus",
        plannedMinutes: 5,
        remainingSeconds: null,
        startedAt: null,
        expectedEndAt: null,
        pausedAt: null,
      },
      replayed: false,
    });

    const response = await STOP(new Request("http://localhost/api/study/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey: "short-key" }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.mode).toBe("short");
    expect(mockStopFocusTimer).toHaveBeenCalledWith("user-1", "short-key");
  });

  it("stops a running focus timer and writes a session with correct actual minutes", async () => {
    mockStopFocusTimer.mockResolvedValue({
      session: {
        id: "session-2",
        mode: "focus",
        startedAt: new Date("2026-06-30T01:00:00.000Z"),
        endedAt: new Date("2026-06-30T01:10:00.000Z"),
        actualMinutes: 10,
      },
      state: {
        status: "idle",
        mode: "focus",
        plannedMinutes: 25,
        remainingSeconds: null,
        startedAt: null,
        expectedEndAt: null,
        pausedAt: null,
      },
      replayed: false,
    });

    const response = await STOP(new Request("http://localhost/api/study/stop", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionKey: "focus-key" }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.mode).toBe("focus");
    expect(data.session.actualMinutes).toBe(10);
    expect(mockStopFocusTimer).toHaveBeenCalledWith("user-1", "focus-key");
  });
});

import { POST as CREATE_GOAL } from "@/app/api/study/goals/route";
import { DELETE as DELETE_GOAL, PATCH as PATCH_GOAL } from "@/app/api/study/goals/[goalId]/route";
import { POST as PRESENCE } from "@/app/api/study/presence/route";

describe("study goals API", () => {
  it("creates a goal for today's local date in the study room", async () => {
    mockStudyGoalCount.mockResolvedValue(2);
    mockStudyGoalCreate.mockResolvedValue({
      id: "goal-1",
      text: "整理课堂笔记",
      done: false,
      sortOrder: 2,
      localDate: "2026-06-30",
    });

    const response = await CREATE_GOAL(new Request("http://localhost/api/study/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: " 整理课堂笔记 " }),
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.goal.text).toBe("整理课堂笔记");
    expect(mockStudyGoalCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ userId: "user-1", roomId: "room-1", sortOrder: 2 }),
    }));
  });

  it("patches only a goal owned by the current user", async () => {
    mockStudyGoalFindFirst.mockResolvedValue({ id: "goal-1", userId: "user-1" });
    mockStudyGoalUpdate.mockResolvedValue({
      id: "goal-1",
      text: "整理课堂笔记",
      done: true,
      sortOrder: 0,
    });

    const response = await PATCH_GOAL(
      new Request("http://localhost/api/study/goals/goal-1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: true }),
      }),
      { params: Promise.resolve({ goalId: "goal-1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.goal.done).toBe(true);
  });

  it("deletes only a goal owned by the current user", async () => {
    mockStudyGoalFindFirst.mockResolvedValue({ id: "goal-1", userId: "user-1" });
    mockStudyGoalDelete.mockResolvedValue({ id: "goal-1" });

    const response = await DELETE_GOAL(
      new Request("http://localhost/api/study/goals/goal-1", { method: "DELETE" }),
      { params: Promise.resolve({ goalId: "goal-1" }) }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockStudyGoalFindFirst).toHaveBeenCalledWith({
      where: { id: "goal-1", userId: "user-1" },
    });
    expect(mockStudyGoalDelete).toHaveBeenCalledWith({ where: { id: "goal-1" } });
  });
});

describe("study presence API", () => {
  it("records that the current user is viewing the study room without changing timer state", async () => {
    mockFocusStateUpsert.mockResolvedValue({
      status: "idle",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: null,
      startedAt: null,
      expectedEndAt: null,
      pausedAt: null,
      lastStudySeenAt: new Date("2026-06-30T01:10:00.000Z"),
    });

    const response = await PRESENCE(new Request("http://localhost/api/study/presence", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockFocusStateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ lastStudySeenAt: expect.any(Date) }),
      create: expect.objectContaining({
        userId: "user-1",
        roomId: "room-1",
        status: "idle",
        mode: "focus",
        plannedMinutes: 25,
      }),
    }));
  });
});
