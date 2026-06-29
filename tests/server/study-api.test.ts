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
  mockRevalidatePath,
} = vi.hoisted(() => ({
  mockFocusStateFindUnique: vi.fn(),
  mockFocusSessionFindMany: vi.fn(),
  mockFocusStateUpsert: vi.fn(),
  mockFocusStateUpdate: vi.fn(),
  mockFocusSessionCreate: vi.fn(),
  mockRevalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("next/cache", () => ({
  revalidatePath: mockRevalidatePath,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    focusState: {
      findUnique: mockFocusStateFindUnique,
      upsert: mockFocusStateUpsert,
      update: mockFocusStateUpdate,
    },
    focusSession: {
      findMany: mockFocusSessionFindMany,
      create: mockFocusSessionCreate,
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
});

describe("GET /api/study", () => {
  it("returns 401 when the user is not authenticated", async () => {
    mockRequireCurrentUser.mockRejectedValueOnce(new Response("Unauthorized", { status: 401 }));

    const response = await GET(new Request("http://localhost/api/study"));

    expect(response.status).toBe(401);
  });

  it("returns idle state, recent sessions, and computed stats", async () => {
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockFocusSessionFindMany.mockResolvedValue([
      {
        id: "s-1",
        userId: "user-1",
        startedAt: new Date("2026-06-29T01:00:00.000Z"),
        endedAt: new Date("2026-06-29T01:25:00.000Z"),
        actualMinutes: 25,
      },
    ]);

    const response = await GET(new Request("http://localhost/api/study"));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentState.status).toBe("idle");
    expect(data.recentSessions).toHaveLength(1);
    expect(data.stats.todayCount).toBe(1);
  });
});

describe("POST /api/study/start", () => {
  it("starts focus with a 25 minute default", async () => {
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockFocusStateUpsert.mockResolvedValue({
      status: "focusing",
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
    expect(data.state.status).toBe("focusing");
    expect(data.state.plannedMinutes).toBe(25);
  });

  it("returns the existing state when focus is already running", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      status: "focusing",
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
    expect(data.state.status).toBe("focusing");
    expect(mockFocusStateUpsert).not.toHaveBeenCalled();
  });
});

describe("POST /api/study/stop", () => {
  it("stops focus and writes a completed session", async () => {
    mockFocusStateFindUnique.mockResolvedValue({
      userId: "user-1",
      status: "focusing",
      plannedMinutes: 25,
      startedAt: new Date("2026-06-29T01:00:00.000Z"),
    });
    mockFocusSessionCreate.mockResolvedValue({
      id: "session-1",
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
    expect(mockFocusStateUpdate).toHaveBeenCalled();
    expect(mockRevalidatePath).toHaveBeenCalledWith("/home");
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
