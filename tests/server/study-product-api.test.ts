import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCurrentUser,
  mockFocusStateFindUnique,
  mockFocusStateUpsert,
  mockFocusStateUpdate,
  mockFocusSessionCreate,
  mockRoomParticipantFindFirst,
  mockRevalidatePath,
  mockStudyGoalCreate,
  mockStudyGoalUpdate,
  mockStudyGoalFindFirst,
  mockStudyGoalCount,
} = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
  mockFocusStateFindUnique: vi.fn(),
  mockFocusStateUpsert: vi.fn(),
  mockFocusStateUpdate: vi.fn(),
  mockFocusSessionCreate: vi.fn(),
  mockRoomParticipantFindFirst: vi.fn(),
  mockRevalidatePath: vi.fn(),
  mockStudyGoalCreate: vi.fn(),
  mockStudyGoalUpdate: vi.fn(),
  mockStudyGoalFindFirst: vi.fn(),
  mockStudyGoalCount: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireCurrentUser: mockRequireCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mockRevalidatePath }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    focusState: {
      findUnique: mockFocusStateFindUnique,
      upsert: mockFocusStateUpsert,
      update: mockFocusStateUpdate,
    },
    focusSession: { create: mockFocusSessionCreate },
    roomParticipant: { findFirst: mockRoomParticipantFindFirst },
    studyGoal: {
      create: mockStudyGoalCreate,
      update: mockStudyGoalUpdate,
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
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockFocusStateUpsert.mockResolvedValue({
      status: "running",
      mode: "short",
      plannedMinutes: 5,
      remainingSeconds: null,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-30T01:05:00.000Z"),
      pausedAt: null,
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
    expect(mockFocusStateUpsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: "running", mode: "short", roomId: "room-1" }),
      create: expect.objectContaining({ userId: "user-1", status: "running", mode: "short", roomId: "room-1" }),
    }));
  });

  it("pauses a running focus timer and stores remaining seconds", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      userId: "user-1",
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-30T01:25:00.000Z"),
      roomId: "room-1",
    });
    mockFocusStateUpdate.mockResolvedValue({
      status: "paused",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: 900,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: null,
      pausedAt: new Date("2026-06-30T01:10:00.000Z"),
    });

    const response = await PAUSE(new Request("http://localhost/api/study/pause", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("paused");
    expect(mockFocusStateUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "paused", expectedEndAt: null, remainingSeconds: 900 }),
    }));
  });

  it("resumes a paused timer with a new expected end", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      userId: "user-1",
      status: "paused",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: 900,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      roomId: "room-1",
    });
    mockFocusStateUpdate.mockResolvedValue({
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: null,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-30T01:25:00.000Z"),
      pausedAt: null,
    });

    const response = await RESUME(new Request("http://localhost/api/study/resume", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("running");
    expect(data.state.startedAt).toBe("2026-06-30T01:00:00.000Z");
  });

  it("stops a paused short break and writes a short session", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      userId: "user-1",
      status: "paused",
      mode: "short",
      plannedMinutes: 5,
      remainingSeconds: 120,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      roomId: "room-1",
    });
    mockFocusSessionCreate.mockResolvedValue({
      id: "session-1",
      mode: "short",
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      endedAt: new Date("2026-06-30T01:03:00.000Z"),
      actualMinutes: 3,
    });
    mockFocusStateUpdate.mockResolvedValue({ status: "idle" });

    const response = await STOP(new Request("http://localhost/api/study/stop", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.mode).toBe("short");
    expect(mockFocusSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mode: "short", roomId: "room-1" }),
    }));
  });

  it("stops a running focus timer and writes a session with correct actual minutes", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      userId: "user-1",
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-30T01:25:00.000Z"),
      roomId: "room-1",
    });
    mockFocusSessionCreate.mockResolvedValue({
      id: "session-2",
      mode: "focus",
      startedAt: new Date("2026-06-30T01:00:00.000Z"),
      endedAt: new Date("2026-06-30T01:10:00.000Z"),
      actualMinutes: 10,
    });
    mockFocusStateUpdate.mockResolvedValue({ status: "idle" });

    const response = await STOP(new Request("http://localhost/api/study/stop", { method: "POST" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.mode).toBe("focus");
    expect(data.session.actualMinutes).toBe(10);
    expect(mockFocusSessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ mode: "focus", roomId: "room-1" }),
    }));
  });
});

import { POST as CREATE_GOAL } from "@/app/api/study/goals/route";
import { PATCH as PATCH_GOAL } from "@/app/api/study/goals/[goalId]/route";

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
      { params: { goalId: "goal-1" } }
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.goal.done).toBe(true);
  });
});
