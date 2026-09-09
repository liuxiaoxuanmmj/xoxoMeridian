import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
}));

const {
  mockFocusStateFindUnique,
  mockFocusSessionFindMany,
  mockRoomParticipantFindFirst,
  mockRoomParticipantFindMany,
  mockStudyGoalFindMany,
  mockFocusStateFindMany,
  mockGetRoomSnapshot,
} = vi.hoisted(() => ({
  mockFocusStateFindUnique: vi.fn(),
  mockFocusSessionFindMany: vi.fn(),
  mockRoomParticipantFindFirst: vi.fn(),
  mockRoomParticipantFindMany: vi.fn(),
  mockStudyGoalFindMany: vi.fn(),
  mockFocusStateFindMany: vi.fn(),
  mockGetRoomSnapshot: vi.fn(),
}));

const {
  MockStudyTransitionConflictError,
  mockReconcileExpiredFocusTimer,
  mockStartFocusTimer,
  mockStopFocusTimer,
} = vi.hoisted(() => {
  class MockStudyTransitionConflictError extends Error {}
  return {
    MockStudyTransitionConflictError,
    mockReconcileExpiredFocusTimer: vi.fn(),
    mockStartFocusTimer: vi.fn(),
    mockStopFocusTimer: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/lib/room-snapshot", () => ({
  getRoomSnapshot: mockGetRoomSnapshot,
}));

vi.mock("@/lib/study-transitions", () => ({
  StudyTransitionConflictError: MockStudyTransitionConflictError,
  reconcileExpiredFocusTimer: mockReconcileExpiredFocusTimer,
  startFocusTimer: mockStartFocusTimer,
  stopFocusTimer: mockStopFocusTimer,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    focusState: {
      findUnique: mockFocusStateFindUnique,
      findMany: mockFocusStateFindMany,
    },
    focusSession: {
      findMany: mockFocusSessionFindMany,
    },
    roomParticipant: {
      findFirst: mockRoomParticipantFindFirst,
      findMany: mockRoomParticipantFindMany,
    },
    studyGoal: {
      findMany: mockStudyGoalFindMany,
    },
  },
}));

import { GET } from "@/app/api/study/route";
import { POST as START } from "@/app/api/study/start/route";
import { POST as STOP } from "@/app/api/study/stop/route";

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireCurrentUser.mockResolvedValue({
    id: "user-1",
    profile: { timezone: "Asia/Shanghai" },
  });
  mockReconcileExpiredFocusTimer.mockResolvedValue(null);
  mockRoomParticipantFindFirst.mockResolvedValue({
    roomId: "room-1",
    room: { id: "room-1", slug: "room-1", name: "Room 1" },
  });
  mockRoomParticipantFindMany.mockResolvedValue([]);
  mockStudyGoalFindMany.mockResolvedValue([]);
  mockFocusStateFindMany.mockResolvedValue([]);
  mockGetRoomSnapshot.mockResolvedValue({
    room: null,
    messages: [],
    memos: [],
    scheduledJobs: [],
    agentStatus: { isWorking: false, runningTasks: 0, recentTasks: [] },
    rooms: [],
  });
});

describe("GET /api/study", () => {
  it("returns 401 when the user is not authenticated", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));

    const response = await GET(new Request("http://localhost/api/study"));

    expect(response.status).toBe(401);
  });

  it("returns idle state, recent sessions, and computed stats", async () => {
    mockFocusStateFindUnique.mockResolvedValue(null);
    const now = new Date();
    const todaySession = {
      id: "s-1",
      userId: "user-1",
      startedAt: now,
      endedAt: new Date(now.getTime() + 25 * 60_000),
      actualMinutes: 25,
    };
    mockFocusSessionFindMany.mockResolvedValue([todaySession]);

    const response = await GET(new Request("http://localhost/api/study"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentState.status).toBe("idle");
    expect(data.recentSessions).toHaveLength(1);
    expect(data.stats.todayCount).toBeGreaterThanOrEqual(1);
    expect(mockReconcileExpiredFocusTimer).toHaveBeenCalledWith("user-1", expect.any(Date));
  });
});

describe("POST /api/study/start", () => {
  it("starts focus with a 25 minute default", async () => {
    mockStartFocusTimer.mockResolvedValue({
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-29T01:25:00.000Z"),
      currentSessionKey: "focus-key",
    });

    const response = await START(
      new Request("http://localhost/api/study/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("running");
    expect(data.state.plannedMinutes).toBe(25);
    expect(data.state.sessionKey).toBe("focus-key");
    expect(mockStartFocusTimer).toHaveBeenCalledWith({
      userId: "user-1",
      roomId: "room-1",
      mode: "focus",
      plannedMinutes: 25,
    });
  });

  it("returns the existing state when focus is already running", async () => {
    mockStartFocusTimer.mockResolvedValue({
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-29T01:25:00.000Z"),
      currentSessionKey: "focus-key",
    });

    const response = await START(
      new Request("http://localhost/api/study/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.state.status).toBe("running");
  });
});

describe("POST /api/study/stop", () => {
  it("stops focus and writes a completed session", async () => {
    mockStopFocusTimer.mockResolvedValue({
      session: {
        id: "session-1",
        mode: "focus",
        startedAt: new Date("2026-06-29T01:00:00.000Z"),
        endedAt: new Date("2026-06-29T01:25:00.000Z"),
        actualMinutes: 25,
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

    const response = await STOP(
      new Request("http://localhost/api/study/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: "focus-key" }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.actualMinutes).toBe(25);
    expect(data.state.status).toBe("idle");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mockStopFocusTimer).toHaveBeenCalledWith("user-1", "focus-key");
  });

  it("returns 409 when no focus session is active", async () => {
    mockStopFocusTimer.mockRejectedValueOnce(
      new MockStudyTransitionConflictError("No active focus session."),
    );

    const response = await STOP(
      new Request("http://localhost/api/study/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionKey: "focus-key" }),
      })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("No active focus session");
  });
});
