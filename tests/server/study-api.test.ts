import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRequireCurrentUser } = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
}));

const { mockFocusStateFindUnique, mockFocusSessionFindMany } = vi.hoisted(() => ({
  mockFocusStateFindUnique: vi.fn(),
  mockFocusSessionFindMany: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    focusState: { findUnique: mockFocusStateFindUnique },
    focusSession: { findMany: mockFocusSessionFindMany },
  },
}));

import { GET } from "@/app/api/study/route";

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
