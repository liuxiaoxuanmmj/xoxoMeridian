import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockRequireCurrentUser,
  mockAssertRoomAccess,
  mockEnforceRateLimit,
  mockScheduledJobFindUnique,
  mockScheduledJobCount,
  mockScheduledJobUpdate,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockRequireCurrentUser: vi.fn(),
  mockAssertRoomAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockScheduledJobFindUnique: vi.fn(),
  mockScheduledJobCount: vi.fn(),
  mockScheduledJobUpdate: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

const { tx } = vi.hoisted(() => ({
  tx: {
    $queryRaw: mockQueryRaw,
    scheduledJob: {
      findUnique: mockScheduledJobFindUnique,
      count: mockScheduledJobCount,
      update: mockScheduledJobUpdate,
    },
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    ...tx,
    $transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser,
}));

vi.mock("@/lib/access", () => ({
  assertRoomAccess: mockAssertRoomAccess,
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit,
}));

import { PATCH } from "@/app/api/rooms/[roomId]/scheduled-jobs/[jobId]/route";

const ROOM_ID = "room-1";
const JOB_ID = "job-1";

/** The persisted one-shot job the route edits. */
function existingJob() {
  return {
    id: JOB_ID,
    roomId: ROOM_ID,
    agentId: "agent-1",
    cron: "40 20 * * *",
    timezone: "Asia/Shanghai",
    payload: { prompt: "发一条晚安", description: "睡眠提醒", runOnce: true },
    enabled: true,
    nextRunAt: new Date("2030-05-09T12:40:00.000Z"),
    lastRunAt: null,
    failCount: 0,
    createdById: "user-1",
    createdAt: new Date("2030-01-01T00:00:00.000Z"),
    updatedAt: new Date("2030-01-01T00:00:00.000Z"),
  };
}

async function patchJob(body: unknown) {
  const request = new Request(
    `http://localhost:3000/api/rooms/${ROOM_ID}/scheduled-jobs/${JOB_ID}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  const response = await PATCH(request, {
    params: Promise.resolve({ roomId: ROOM_ID, jobId: JOB_ID }),
  });
  return { response, body: await response.json() };
}

/** The `data` object the route handed to Prisma's update. */
function writtenData() {
  expect(mockScheduledJobUpdate).toHaveBeenCalledTimes(1);
  return mockScheduledJobUpdate.mock.calls[0][0].data;
}

describe("PATCH scheduled job one-shot contract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireCurrentUser.mockResolvedValue({
      id: "user-1",
      email: "a@example.com",
      displayName: "A",
      avatarLabel: "A",
    });
    mockAssertRoomAccess.mockResolvedValue(undefined);
    mockEnforceRateLimit.mockReturnValue(undefined);
    mockQueryRaw.mockResolvedValue([{ id: ROOM_ID }]);
    mockScheduledJobFindUnique.mockResolvedValue(existingJob());
    mockScheduledJobCount.mockResolvedValue(1);
    mockScheduledJobUpdate.mockImplementation(async (args) => ({
      ...existingJob(),
      ...args.data,
    }));
  });

  it("persists a changed fireAt as nextRunAt instead of silently dropping it", async () => {
    const { response } = await patchJob({
      fireAt: "2030-05-09T21:15:00+08:00",
      prompt: "发一条晚安",
      description: "睡眠提醒",
      timezone: "Asia/Shanghai",
      runOnce: true,
    });

    expect(response.status).toBe(200);
    const data = writtenData();
    expect(data.nextRunAt).toEqual(new Date("2030-05-09T21:15:00+08:00"));
    // The cron column stays parseable and follows the new wall clock, because the
    // scheduler advances nextRunAt from cron on the next claim.
    expect(data.cron).toBe("15 21 * * *");
    expect(data.payload.runOnce).toBe(true);
    expect(data.timezone).toBe("Asia/Shanghai");
  });

  it("keeps the prompt when only the one-shot time changes", async () => {
    await patchJob({
      fireAt: "2030-05-09T21:15:00+08:00",
      prompt: "发一条晚安",
      description: "睡眠提醒",
      timezone: "Asia/Shanghai",
      runOnce: true,
    });

    expect(writtenData().payload.prompt).toBe("发一条晚安");
    expect(writtenData().payload.description).toBe("睡眠提醒");
  });

  it("synthesizes the cron in the timezone submitted in the same request", async () => {
    await patchJob({
      fireAt: "2030-05-09T21:15:00+08:00",
      prompt: "发一条晚安",
      timezone: "Europe/London",
      runOnce: true,
    });

    // 21:15+08:00 is 14:15 in London (BST) — the synthesized cron must follow the
    // submitted zone, not the zone stored on the previous job row.
    expect(writtenData().cron).toBe("15 14 * * *");
  });

  it("rejects a fireAt more than the grace window in the past as a 400, not a 500", async () => {
    const { response } = await patchJob({
      fireAt: "2020-01-01T00:00:00+08:00",
      prompt: "发一条晚安",
      timezone: "Asia/Shanghai",
      runOnce: true,
    });

    expect(response.status).toBe(400);
    expect(mockScheduledJobUpdate).not.toHaveBeenCalled();
  });

  it("recomputes nextRunAt when a one-shot is converted back to recurring", async () => {
    // Same cron string as the stored row on purpose: a one-shot stores the
    // synthesized `M H * * *`, so converting it back to recurring with that very
    // string must still re-derive nextRunAt instead of staying pinned to the
    // one-off instant years away.
    await patchJob({
      cron: "40 20 * * *",
      prompt: "发一条晚安",
      timezone: "Asia/Shanghai",
      runOnce: false,
    });

    const data = writtenData();
    expect(data.cron).toBe("40 20 * * *");
    expect(data.payload.runOnce).toBe(false);
    const untilRun = data.nextRunAt.getTime() - Date.now();
    expect(untilRun).toBeGreaterThan(0);
    expect(untilRun).toBeLessThan(25 * 60 * 60 * 1000);
  });

  it("leaves the persisted schedule instant unchanged for a prompt-only edit", async () => {
    await patchJob({ prompt: "改一下措辞" });

    const data = writtenData();
    expect(data.payload.prompt).toBe("改一下措辞");
    // A non-schedule edit must not move the trigger time.
    expect(data.nextRunAt).toEqual(existingJob().nextRunAt);
  });
});
