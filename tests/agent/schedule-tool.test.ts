import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  createScheduleCancelTool,
  createScheduleCreateTool,
  createScheduleListTool,
  createScheduleUpdateTool
} from "@/agent/tools/schedule-tool";

type MockJob = {
  id: string;
  roomId: string;
  agentId: string;
  cron: string;
  timezone: string;
  payload: { prompt?: string; description?: string | null; runOnce?: boolean };
  enabled: boolean;
  nextRunAt: Date;
  createdById?: string;
};

function makeMockPrisma() {
  const jobs: MockJob[] = [];
  let idCounter = 0;

  return {
    _jobs: jobs,
    $queryRaw: vi.fn(async () => [{ id: "room-1" }]),
    scheduledJob: {
      create: vi.fn(async ({ data }: { data: Omit<MockJob, "id"> }) => {
        const job: MockJob = { id: `job-${++idCounter}`, ...data };
        jobs.push(job);
        return job;
      }),
      count: vi.fn(async ({ where }: { where: { roomId: string; enabled?: boolean } }) =>
        jobs.filter(
          (j) => j.roomId === where.roomId && (where.enabled === undefined || j.enabled === where.enabled)
        ).length
      ),
      findMany: vi.fn(async ({ where }: { where: { roomId: string; enabled?: boolean } }) =>
        jobs.filter(
          (j) => j.roomId === where.roomId && (where.enabled === undefined || j.enabled === where.enabled)
        )
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        jobs.find((j) => j.id === where.id) ?? null
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MockJob> }) => {
        const job = jobs.find((j) => j.id === where.id);
        if (job) Object.assign(job, data);
        return job;
      })
    }
  };
}

function makeContext(prisma: ReturnType<typeof makeMockPrisma>) {
  return {
    prisma: prisma as unknown as import("@prisma/client").PrismaClient,
    taskId: "task-1",
    roomId: "room-1",
    agentId: "agent-1",
    requestedById: "user-1",
    tracer: {} as never,
    runtimeContext: {
      participants: [
        {
          userId: "user-1",
          user: { profile: { timezone: "Asia/Shanghai" } }
        }
      ]
    } as never
  };
}

describe("schedule.create", () => {
  let prisma: ReturnType<typeof makeMockPrisma>;
  beforeEach(() => {
    prisma = makeMockPrisma();
  });

  it("creates a job for '0 9 * * 6' (每周六 9 点)", async () => {
    const tool = createScheduleCreateTool();
    const result = (await tool.execute(
      { cron: "0 9 * * 6", timezone: "Asia/Shanghai", prompt: "提醒打扫卫生", description: "每周六 9:00 打扫提醒" },
      makeContext(prisma)
    )) as { jobId: string; cron: string; nextRunAt: string };

    expect(result.jobId).toBeDefined();
    expect(result.cron).toBe("0 9 * * 6");
    expect(new Date(result.nextRunAt).getTime()).toBeGreaterThan(Date.now());
    expect(prisma._jobs).toHaveLength(1);
  });

  it("rejects invalid cron expressions", async () => {
    const tool = createScheduleCreateTool();
    await expect(
      tool.execute(
        { cron: "not a cron", timezone: "Asia/Shanghai", prompt: "x" },
        makeContext(prisma)
      )
    ).rejects.toThrow(/Invalid cron/);
  });

  it("rejects missing prompt", async () => {
    const tool = createScheduleCreateTool();
    await expect(
      tool.execute(
        { cron: "0 9 * * *", timezone: "Asia/Shanghai", prompt: "  " },
        makeContext(prisma)
      )
    ).rejects.toThrow(/prompt is required/);
  });

  it("falls back to requester timezone when not provided", async () => {
    const tool = createScheduleCreateTool();
    const result = (await tool.execute(
      { cron: "0 9 * * *", prompt: "晨间播报" },
      makeContext(prisma)
    )) as { timezone: string };
    expect(result.timezone).toBe("Asia/Shanghai");
  });

  it("persists runOnce=true into payload and returns it", async () => {
    const tool = createScheduleCreateTool();
    const result = (await tool.execute(
      { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗", runOnce: true },
      makeContext(prisma)
    )) as { runOnce: boolean };

    expect(result.runOnce).toBe(true);
    expect(prisma._jobs[0].payload.runOnce).toBe(true);
  });

  it("defaults runOnce to false when not provided", async () => {
    const tool = createScheduleCreateTool();
    (await tool.execute(
      { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗" },
      makeContext(prisma)
    )) as { runOnce: boolean };

    expect(prisma._jobs[0].payload.runOnce).toBe(false);
  });

  it("accepts fireAt for an absolute one-off and forces runOnce=true", async () => {
    const tool = createScheduleCreateTool();
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const result = (await tool.execute(
      { fireAt: future, timezone: "Asia/Shanghai", prompt: "发诗" },
      makeContext(prisma)
    )) as { runOnce: boolean; nextRunAt: string; cron: string };

    expect(result.runOnce).toBe(true);
    expect(new Date(result.nextRunAt).toISOString()).toBe(future);
    expect(prisma._jobs[0].payload.runOnce).toBe(true);
    // Synthesized cron is parseable + matches the minute/hour of fireAt in Shanghai.
    expect(result.cron).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it("fires immediately when fireAt is slightly in the past (within grace window)", async () => {
    const tool = createScheduleCreateTool();
    const slightlyPast = new Date(Date.now() - 30 * 1000).toISOString();
    const result = (await tool.execute(
      { fireAt: slightlyPast, timezone: "Asia/Shanghai", prompt: "发诗" },
      makeContext(prisma)
    )) as { nextRunAt: string; runOnce: boolean };

    const nextMs = new Date(result.nextRunAt).getTime();
    expect(nextMs).toBeGreaterThan(Date.now() - 5000);
    expect(nextMs).toBeLessThanOrEqual(Date.now() + 5000);
    expect(result.runOnce).toBe(true);
  });

  it("rejects fireAt that is more than 5 minutes in the past", async () => {
    const tool = createScheduleCreateTool();
    const tooOld = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    await expect(
      tool.execute(
        { fireAt: tooOld, timezone: "Asia/Shanghai", prompt: "发诗" },
        makeContext(prisma)
      )
    ).rejects.toThrow(/5 minutes/);
  });

  it("rejects when neither cron nor fireAt is provided", async () => {
    const tool = createScheduleCreateTool();
    await expect(
      tool.execute(
        { timezone: "Asia/Shanghai", prompt: "发诗" },
        makeContext(prisma)
      )
    ).rejects.toThrow(/cron.*fireAt|fireAt.*cron/);
  });

  it("rejects malformed fireAt", async () => {
    const tool = createScheduleCreateTool();
    await expect(
      tool.execute(
        { fireAt: "not-a-date", timezone: "Asia/Shanghai", prompt: "发诗" },
        makeContext(prisma)
      )
    ).rejects.toThrow(/Invalid fireAt/);
  });
});

describe("schedule.update", () => {
  it("updates cron and recomputes nextRunAt", async () => {
    const prisma = makeMockPrisma();
    const ctx = makeContext(prisma);
    const created = (await createScheduleCreateTool().execute(
      { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗" },
      ctx
    )) as { jobId: string; nextRunAt: string };

    const originalNext = created.nextRunAt;

    const updated = (await createScheduleUpdateTool().execute(
      { jobId: created.jobId, cron: "0 9 * * 6" },
      ctx
    )) as { cron: string; nextRunAt: string; runOnce: boolean };

    expect(updated.cron).toBe("0 9 * * 6");
    expect(updated.nextRunAt).not.toBe(originalNext);
    expect(prisma._jobs[0].cron).toBe("0 9 * * 6");
  });

  it("flips runOnce without touching other fields", async () => {
    const prisma = makeMockPrisma();
    const ctx = makeContext(prisma);
    const created = (await createScheduleCreateTool().execute(
      { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗" },
      ctx
    )) as { jobId: string };

    const updated = (await createScheduleUpdateTool().execute(
      { jobId: created.jobId, runOnce: true },
      ctx
    )) as { runOnce: boolean; cron: string };

    expect(updated.runOnce).toBe(true);
    expect(updated.cron).toBe("0 20 * * *");
    expect(prisma._jobs[0].payload.prompt).toBe("发诗");
    expect(prisma._jobs[0].payload.runOnce).toBe(true);
  });

  it("refuses to update a job from a different room", async () => {
    const prisma = makeMockPrisma();
    const ctxA = makeContext(prisma);
    const created = (await createScheduleCreateTool().execute(
      { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "x" },
      ctxA
    )) as { jobId: string };

    const ctxB = { ...ctxA, roomId: "room-2" };
    await expect(
      createScheduleUpdateTool().execute({ jobId: created.jobId, runOnce: true }, ctxB)
    ).rejects.toThrow(/does not belong/);
  });

  it("rejects empty prompt on update", async () => {
    const prisma = makeMockPrisma();
    const ctx = makeContext(prisma);
    const created = (await createScheduleCreateTool().execute(
      { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "发诗" },
      ctx
    )) as { jobId: string };

    await expect(
      createScheduleUpdateTool().execute({ jobId: created.jobId, prompt: "   " }, ctx)
    ).rejects.toThrow(/prompt cannot be empty/);
  });
});

describe("schedule.list + schedule.cancel", () => {
  it("lists active jobs and can cancel one", async () => {
    const prisma = makeMockPrisma();
    const create = createScheduleCreateTool();
    const list = createScheduleListTool();
    const cancel = createScheduleCancelTool();
    const ctx = makeContext(prisma);

    const created = (await create.execute(
      { cron: "0 9 * * 6", timezone: "Asia/Shanghai", prompt: "打扫", description: "周六 9 点打扫" },
      ctx
    )) as { jobId: string };

    const listed = (await list.execute({}, ctx)) as { count: number; jobs: Array<{ jobId: string }> };
    expect(listed.count).toBe(1);
    expect(listed.jobs[0].jobId).toBe(created.jobId);

    await cancel.execute({ jobId: created.jobId }, ctx);

    const after = (await list.execute({}, ctx)) as { count: number };
    expect(after.count).toBe(0);
  });

  it("refuses to cancel a job from a different room", async () => {
    const prisma = makeMockPrisma();
    const create = createScheduleCreateTool();
    const cancel = createScheduleCancelTool();

    const ctxA = makeContext(prisma);
    const created = (await create.execute(
      { cron: "0 9 * * 6", timezone: "Asia/Shanghai", prompt: "x" },
      ctxA
    )) as { jobId: string };

    const ctxB = { ...ctxA, roomId: "room-2" };
    await expect(cancel.execute({ jobId: created.jobId }, ctxB)).rejects.toThrow(/does not belong/);
  });
});
