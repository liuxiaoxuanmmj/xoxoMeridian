import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  assertRoomAccess: vi.fn(),
  enforceRateLimit: vi.fn(() => null),
  findMany: vi.fn(),
  requireCurrentUser: vi.fn(),
}));

vi.mock("@/lib/access", () => ({ assertRoomAccess: mocks.assertRoomAccess }));
vi.mock("@/lib/auth", () => ({ requireCurrentUser: mocks.requireCurrentUser }));
vi.mock("@/lib/prisma", () => ({
  prisma: { roomParticipant: { findMany: mocks.findMany } },
}));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: mocks.enforceRateLimit }));

import { createWeatherTool } from "@/agent/tools/weather-tool";
import { GET } from "@/app/api/rooms/[roomId]/weather/route";

const participants = [
  {
    userId: "u1",
    user: {
      id: "u1",
      displayName: "Alice",
      profile: { city: "Shanghai", timezone: "Asia/Shanghai" },
    },
  },
  {
    userId: "u2",
    user: {
      id: "u2",
      displayName: "Bob",
      profile: { city: "London", timezone: "Europe/London" },
    },
  },
];

describe("weather participant resolution", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEATHER_PROVIDER = "mock";
    mocks.requireCurrentUser.mockResolvedValue({ id: "u2" });
    mocks.findMany.mockResolvedValue(participants);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("keeps Route and Agent partner defaults aligned for the second participant", async () => {
    const response = await GET(
      new Request("http://localhost/api/rooms/room-1/weather?who=partner"),
      { params: Promise.resolve({ roomId: "room-1" }) }
    );
    const routePayload = await response.json() as {
      ok: boolean;
      results: Array<{ subject: string; displayName: string; city: string; snapshot: { city: string } }>;
    };

    const toolResult = (await createWeatherTool().execute(
      {},
      {
        taskId: "task-1",
        roomId: "room-1",
        agentId: "agent-1",
        requestedById: "u2",
        prisma: {} as never,
        tracer: {} as never,
        runtimeContext: { participants } as never,
      }
    )) as { city: string };

    expect(response.status).toBe(200);
    expect(routePayload.results[0]).toMatchObject({
      subject: "partner",
      displayName: "Alice",
      city: "Shanghai",
    });
    expect(toolResult.city).toBe(routePayload.results[0].snapshot.city);
    expect(mocks.assertRoomAccess).toHaveBeenCalledWith("room-1", "u2");
  });
});
