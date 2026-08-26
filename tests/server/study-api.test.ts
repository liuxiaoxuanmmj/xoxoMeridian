import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
}));

const {
  mockFocusStateFindUnique,
  mockFocusSessionFindMany,
  mockFocusStateUpsert,
  mockFocusStateUpdate,
  mockFocusSessionCreate,
  mockRoomParticipantFindFirst,
  mockRoomParticipantFindMany,
  mockStudyGoalFindMany,
  mockFocusStateFindMany,
  mockGetRoomSnapshot,
} = vi.hoisted(() => ({
  mockFocusStateFindUnique: vi.fn(),
  mockFocusSessionFindMany: vi.fn(),
  mockFocusStateUpsert: vi.fn(),
  mockFocusStateUpdate: vi.fn(),
  mockFocusSessionCreate: vi.fn(),
  mockRoomParticipantFindFirst: vi.fn(),
  mockRoomParticipantFindMany: vi.fn(),
  mockStudyGoalFindMany: vi.fn(),
  mockFocusStateFindMany: vi.fn(),
  mockGetRoomSnapshot: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/lib/room-snapshot", () => ({
  getRoomSnapshot: mockGetRoomSnapshot,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    focusState: {
      findUnique: mockFocusStateFindUnique,
      findMany: mockFocusStateFindMany,
      upsert: mockFocusStateUpsert,
      update: mockFocusStateUpdate,
    },
    focusSession: {
      findMany: mockFocusSessionFindMany,
      create: mockFocusSessionCreate,
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
  });
});

describe("POST /api/study/start", () => {
  it("starts focus with a 25 minute default", async () => {
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockFocusStateUpsert.mockResolvedValue({
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-29T01:25:00.000Z"),
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
  });

  it("returns the existing state when focus is already running", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-29T01:25:00.000Z"),
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
    expect(mockFocusStateUpsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/study/stop", () => {
  it("stops focus and writes a completed session", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      userId: "user-1",
      status: "running",
      mode: "focus",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
      expectedEndAt: new Date("2026-06-29T01:25:00.000Z"),
      roomId: "room-1",
    });
    mockFocusSessionCreate.mockResolvedValue({
      id: "session-1",
      mode: "focus",
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
      endedAt: new Date("2026-06-29T01:25:00.000Z"),
      actualMinutes: 25,
    });

    const response = await STOP(
      new Request("http://localhost/api/study/stop", { method: "POST" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.session.actualMinutes).toBe(25);
    expect(data.state.status).toBe("idle");
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(mockFocusSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        status: "completed",
        mode: "focus",
        plannedMinutes: 25,
        actualMinutes: 25,
        roomId: "room-1",
      }),
      select: expect.any(Object),
    });
    expect(mockFocusStateUpdate).toHaveBeenCalled();
  });

  it("returns 409 when no focus session is active", async () => {
    mockFocusStateFindUnique.mockResolvedValueOnce(null);

    const response = await STOP(
      new Request("http://localhost/api/study/stop", { method: "POST" })
    );
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.error).toContain("No active focus session");
  });
});
