import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

type ScheduledJobRow = {
  id: string;
  roomId: string;
  agentId: string;
  cron: string;
  timezone: string;
  payload: Record<string, unknown>;
  enabled: boolean;
  nextRunAt: Date;
  lastRunAt: Date | null;
  failCount: number;
  createdById: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type AgentRow = { id: string; slug: string };

const jobs: ScheduledJobRow[] = [];
const agents: AgentRow[] = [];
const agentTasks: { id: string; roomId: string; agentId: string; input: unknown }[] = [];
const eventLogs: { type: string; payload: unknown; agentTaskId: string }[] = [];

let dispatchHook: (() => Promise<void>) | null = null;
let eventHook: (() => Promise<void>) | null = null;
let afterRollbackHook: (() => Promise<void>) | null = null;

function reset() {
  jobs.length = 0;
  agents.length = 0;
  agentTasks.length = 0;
  eventLogs.length = 0;
  dispatchHook = null;
  eventHook = null;
  afterRollbackHook = null;
}

const mockPrisma = {
  $transaction: vi.fn(async (callback: (client: typeof mockPrisma) => Promise<unknown>) => {
    const jobSnapshot = jobs.map((job) => ({ ...job }));
    const taskSnapshot = agentTasks.map((task) => ({ ...task }));
    const eventSnapshot = eventLogs.map((event) => ({ ...event }));
    try {
      return await callback(mockPrisma);
    } catch (error) {
      jobs.splice(0, jobs.length, ...jobSnapshot);
      agentTasks.splice(0, agentTasks.length, ...taskSnapshot);
      eventLogs.splice(0, eventLogs.length, ...eventSnapshot);
      if (afterRollbackHook) await afterRollbackHook();
      throw error;
    }
  }),
  scheduledJob: {
    findMany: vi.fn(async ({ where, orderBy }: { where: any; orderBy?: any }) => {
      let rows = jobs.filter((j) => {
        if (where.enabled !== undefined && j.enabled !== where.enabled) return false;
        if (where.nextRunAt) {
          if (where.nextRunAt.lte && j.nextRunAt > where.nextRunAt.lte) return false;
          if (where.nextRunAt.gt && j.nextRunAt <= where.nextRunAt.gt) return false;
        }
        return true;
      });
      if (orderBy?.nextRunAt === "asc") {
        rows = rows.slice().sort((a, b) => a.nextRunAt.getTime() - b.nextRunAt.getTime());
      }
      return rows.map((r) => ({ ...r }));
    }),
    findFirst: vi.fn(async ({ where }: { where: any }) => {
      const row = jobs.find((j) => {
        if (where.enabled !== undefined && j.enabled !== where.enabled) return false;
        return true;
      });
      return row ? { id: row.id } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = jobs.find((j) => j.id === where.id);
      return row ? { ...row } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
      const matched = jobs.filter((j) => {
        if (where.id && j.id !== where.id) return false;
        if (where.enabled !== undefined && j.enabled !== where.enabled) return false;
        if (where.nextRunAt instanceof Date && j.nextRunAt.getTime() !== where.nextRunAt.getTime()) {
          return false;
        }
        if (where.nextRunAt && !(where.nextRunAt instanceof Date)) {
          if (
            where.nextRunAt.equals &&
            j.nextRunAt.getTime() !== where.nextRunAt.equals.getTime()
          ) return false;
          if (where.nextRunAt.lte && j.nextRunAt > where.nextRunAt.lte) return false;
        }
        if (Object.hasOwn(where, "lastRunAt")) {
          const left = j.lastRunAt?.getTime() ?? null;
          const right = where.lastRunAt?.getTime() ?? null;
          if (left !== right) return false;
        }
        if (where.failCount !== undefined && j.failCount !== where.failCount) return false;
        return true;
      });
      for (const j of matched) Object.assign(j, data);
      return { count: matched.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
      const j = jobs.find((row) => row.id === where.id);
      if (!j) throw new Error("not found");
      Object.assign(j, data);
      return { ...j };
    }),
  },
  agent: {
    findUnique: vi.fn(async ({ where }: { where: { slug: string } }) => {
      return agents.find((a) => a.slug === where.slug) ?? null;
    }),
  },
  agentTask: {
    create: vi.fn(async ({ data }: { data: any }) => {
      if (dispatchHook) await dispatchHook();
      const task = { id: `task-${agentTasks.length + 1}`, ...data };
      agentTasks.push(task);
      return task;
    }),
  },
  eventLog: {
    create: vi.fn(async ({ data }: { data: any }) => {
      if (eventHook) await eventHook();
      eventLogs.push(data);
      return { id: `log-${eventLogs.length}`, ...data };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { schedulerTick, clearAllTimers, TRIGGER_MARKER } = await import("@/agent/scheduler-tick");

function makeJob(overrides: Partial<ScheduledJobRow> = {}): ScheduledJobRow {
  return {
    id: `j-${jobs.length + 1}`,
    roomId: "room-1",
    agentId: "agent-1",
    cron: "*/5 * * * *",
    timezone: "Asia/Shanghai",
    payload: { prompt: "测试任务" },
    enabled: true,
    nextRunAt: new Date(Date.now() - 1000),
    lastRunAt: null,
    failCount: 0,
    createdById: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  reset();
  agents.push({ id: "agent-default", slug: "life-assistant" });
});

afterEach(() => {
  clearAllTimers();
  vi.useRealTimers();
});

describe("schedulerTick - scheduled job CAS", () => {
  it("only dispatches a due job once when two ticks race", async () => {
    jobs.push(makeJob());

    const now = new Date();
    await Promise.all([schedulerTick(now), schedulerTick(now)]);

    expect(agentTasks).toHaveLength(1);
    expect(jobs[0].nextRunAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("disables a runOnce job after a successful fire (polling path)", async () => {
    jobs.push(makeJob({ payload: { prompt: "发诗", runOnce: true } }));

    await schedulerTick(new Date());

    expect(agentTasks).toHaveLength(1);
    expect(jobs[0].enabled).toBe(false);
  });

  it("disables a runOnce job outside the missed window without replaying it at the next cron occurrence", async () => {
    vi.useFakeTimers();
    const scheduledFor = new Date("2026-05-08T10:00:00Z");
    const afterMissedWindow = new Date("2026-05-08T12:00:00Z");
    const nextCronOccurrence = new Date("2026-05-09T10:00:00Z");
    vi.setSystemTime(afterMissedWindow);
    jobs.push(makeJob({
      cron: "0 10 * * *",
      timezone: "UTC",
      payload: { prompt: "只提醒一次", runOnce: true },
      nextRunAt: scheduledFor
    }));

    const missedResult = await schedulerTick(afterMissedWindow);
    vi.setSystemTime(nextCronOccurrence);
    const nextDayResult = await schedulerTick(nextCronOccurrence);

    expect(missedResult.jobs).toEqual({ fired: 0, skipped: 1, failed: 0 });
    expect(nextDayResult.jobs).toEqual({ fired: 0, skipped: 0, failed: 0 });
    expect(jobs[0].enabled).toBe(false);
    expect(agentTasks).toHaveLength(0);
    expect(eventLogs).toHaveLength(0);
  });

  it("keeps a non-runOnce job enabled after firing", async () => {
    jobs.push(makeJob({ payload: { prompt: "发诗" } }));

    await schedulerTick(new Date());

    expect(agentTasks).toHaveLength(1);
    expect(jobs[0].enabled).toBe(true);
  });

  it("keeps a recurring job enabled and advances it after a missed window", async () => {
    const scheduledFor = new Date("2026-05-08T10:00:00Z");
    const afterMissedWindow = new Date("2026-05-08T12:00:00Z");
    jobs.push(makeJob({
      cron: "0 * * * *",
      timezone: "UTC",
      nextRunAt: scheduledFor
    }));

    const result = await schedulerTick(afterMissedWindow);

    expect(result.jobs).toEqual({ fired: 0, skipped: 1, failed: 0 });
    expect(jobs[0].enabled).toBe(true);
    expect(jobs[0].nextRunAt).toEqual(new Date("2026-05-08T13:00:00Z"));
    expect(jobs[0].lastRunAt).toBeNull();
    expect(agentTasks).toHaveLength(0);
    expect(eventLogs).toHaveLength(0);
  });

  it("wraps the fired prompt with a trigger marker so the agent does not re-schedule", async () => {
    jobs.push(makeJob({ payload: { prompt: "向房间发一首苏轼的诗词", runOnce: true } }));

    await schedulerTick(new Date());

    expect(agentTasks).toHaveLength(1);
    const input = agentTasks[0].input as { trigger: string; normalizedContent: string; rawContent: string };
    expect(input.trigger).toBe("scheduled.job");
    expect(input.normalizedContent).toContain(TRIGGER_MARKER);
    expect(input.normalizedContent).toContain("不要再调用 schedule.create");
    expect(input.normalizedContent).toContain("向房间发一首苏轼的诗词");
    // rawContent stays as the bare action so it round-trips into logs cleanly.
    expect(input.rawContent).toBe("向房间发一首苏轼的诗词");
  });

  it("re-enables a runOnce job on dispatch failure so it can retry", async () => {
    const oldNext = new Date(Date.now() - 1000);
    jobs.push(makeJob({ nextRunAt: oldNext, payload: { prompt: "发诗", runOnce: true } }));

    dispatchHook = async () => {
      throw new Error("boom");
    };

    await schedulerTick(new Date());

    expect(jobs[0].failCount).toBe(1);
    expect(jobs[0].enabled).toBe(true);
    expect(jobs[0].nextRunAt.getTime()).toBe(oldNext.getTime());
  });

  it("rolls back nextRunAt and increments failCount on dispatch failure", async () => {
    const oldNext = new Date(Date.now() - 1000);
    jobs.push(makeJob({ nextRunAt: oldNext }));

    dispatchHook = async () => {
      throw new Error("dispatch failed");
    };

    await schedulerTick(new Date());

    expect(jobs[0].nextRunAt.getTime()).toBe(oldNext.getTime());
    expect(jobs[0].failCount).toBe(1);
    expect(jobs[0].enabled).toBe(true);
  });

  it("rolls back the derived task when the fired event cannot be written", async () => {
    const oldNext = new Date(Date.now() - 1000);
    jobs.push(makeJob({ nextRunAt: oldNext }));
    eventHook = async () => {
      throw new Error("event insert failed");
    };

    await schedulerTick(new Date());

    expect(agentTasks).toHaveLength(0);
    expect(eventLogs).toHaveLength(0);
    expect(jobs[0].nextRunAt.getTime()).toBe(oldNext.getTime());
    expect(jobs[0].failCount).toBe(1);
  });

  it("does not overwrite a newer Job claim while recording a stale failure", async () => {
    const oldNext = new Date(Date.now() - 1000);
    const newerNext = new Date(Date.now() + 5 * 60_000);
    jobs.push(makeJob({ nextRunAt: oldNext }));
    eventHook = async () => {
      throw new Error("event insert failed");
    };
    afterRollbackHook = async () => {
      jobs[0].nextRunAt = newerNext;
      jobs[0].lastRunAt = new Date();
    };
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await schedulerTick(new Date());

    expect(jobs[0].nextRunAt).toBe(newerNext);
    expect(jobs[0].failCount).toBe(0);
    expect(consoleWarn).toHaveBeenCalledWith(
      expect.stringContaining("ignored stale failure"),
      "event insert failed"
    );
    consoleWarn.mockRestore();
  });

  it("disables job after MAX_FAIL_COUNT consecutive failures", async () => {
    const oldNext = new Date(Date.now() - 1000);
    jobs.push(makeJob({ nextRunAt: oldNext, failCount: 2 }));
    dispatchHook = async () => {
      throw new Error("still broken");
    };

    await schedulerTick(new Date());

    expect(jobs[0].enabled).toBe(false);
    expect(jobs[0].failCount).toBe(3);
  });
});

describe("schedulerTick - near-term timer arming", () => {
  it("arms a timer for a job within the precise window and skips polling fire", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const future = new Date(now.getTime() + 30_000);
    jobs.push(makeJob({ nextRunAt: future }));

    await schedulerTick(now);
    expect(agentTasks).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(30_500);
    expect(agentTasks).toHaveLength(1);
  });

  it("does NOT arm a timer for a job beyond the 2min window", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const future = new Date(now.getTime() + 5 * 60_000);
    jobs.push(makeJob({ nextRunAt: future }));

    await schedulerTick(now);

    await vi.advanceTimersByTimeAsync(2 * 60_000 + 500);
    expect(agentTasks).toHaveLength(0);
  });

  it("discards the old timer after a near-term job is postponed", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const originalNextRunAt = new Date(now.getTime() + 30_000);
    const postponedNextRunAt = new Date(now.getTime() + 90_000);
    jobs.push(makeJob({ nextRunAt: originalNextRunAt }));

    await schedulerTick(now);
    jobs[0].nextRunAt = postponedNextRunAt;

    await vi.advanceTimersByTimeAsync(30_500);
    expect(agentTasks).toHaveLength(0);
    expect(jobs[0].nextRunAt).toEqual(postponedNextRunAt);

    await schedulerTick(new Date());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(agentTasks).toHaveLength(1);
  });

  it("replaces an armed timer when the job is moved to an earlier time", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const originalNextRunAt = new Date(now.getTime() + 90_000);
    jobs.push(makeJob({ nextRunAt: originalNextRunAt }));

    await schedulerTick(now);
    jobs[0].nextRunAt = new Date(now.getTime() + 30_000);
    await schedulerTick(now);

    await vi.advanceTimersByTimeAsync(30_500);

    expect(agentTasks).toHaveLength(1);
  });

  it("does not let a disabled then rescheduled job reuse its old timer", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const originalNextRunAt = new Date(now.getTime() + 30_000);
    const reenabledNextRunAt = new Date(now.getTime() + 90_000);
    jobs.push(makeJob({ nextRunAt: originalNextRunAt }));

    await schedulerTick(now);
    jobs[0].enabled = false;
    jobs[0].nextRunAt = reenabledNextRunAt;
    jobs[0].enabled = true;

    await vi.advanceTimersByTimeAsync(30_500);
    expect(agentTasks).toHaveLength(0);

    await schedulerTick(new Date());
    await vi.advanceTimersByTimeAsync(60_000);

    expect(agentTasks).toHaveLength(1);
  });

  it("rechecks wall-clock due time when the clock moves backward", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const nextRunAt = new Date(now.getTime() + 30_000);
    jobs.push(makeJob({ nextRunAt }));

    await schedulerTick(now);
    vi.setSystemTime(new Date(now.getTime() - 60_000));

    await vi.advanceTimersByTimeAsync(30_500);
    expect(agentTasks).toHaveLength(0);
    expect(jobs[0].nextRunAt).toEqual(nextRunAt);

    vi.setSystemTime(new Date(nextRunAt.getTime() + 500));
    await schedulerTick(new Date());

    expect(agentTasks).toHaveLength(1);
  });
});

describe("schedulerTick - empty-skip", () => {
  it("does not call findMany when the table is empty", async () => {
    mockPrisma.scheduledJob.findMany.mockClear();
    mockPrisma.scheduledJob.findFirst.mockClear();

    const result = await schedulerTick(new Date());

    expect(mockPrisma.scheduledJob.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.scheduledJob.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      jobs: { fired: 0, skipped: 0, failed: 0 },
    });
  });
});
