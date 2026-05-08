import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

type ReminderRow = {
  id: string;
  roomId: string;
  title: string;
  body: string | null;
  dueAt: Date | null;
  status: "pending" | "fired" | "done" | "cancelled" | "skipped";
  metadata: Record<string, unknown> | null;
  createdById: string | null;
  agentTaskId: string | null;
  timezone: string | null;
  contactWindowStart: string | null;
  contactWindowEnd: string | null;
  notifyChannel: string | null;
  createdAt: Date;
  updatedAt: Date;
};

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

const reminders: ReminderRow[] = [];
const jobs: ScheduledJobRow[] = [];
const agents: AgentRow[] = [];
const agentTasks: { id: string; roomId: string; agentId: string; input: unknown }[] = [];
const eventLogs: { type: string; payload: unknown; agentTaskId: string }[] = [];

let dispatchHook: (() => Promise<void>) | null = null;

function reset() {
  reminders.length = 0;
  jobs.length = 0;
  agents.length = 0;
  agentTasks.length = 0;
  eventLogs.length = 0;
  dispatchHook = null;
}

const mockPrisma = {
  reminder: {
    findMany: vi.fn(async ({ where, orderBy }: { where: any; orderBy?: any }) => {
      let rows = reminders.filter((r) => {
        if (where.status && r.status !== where.status) return false;
        if (where.dueAt) {
          if (where.dueAt.not !== undefined && r.dueAt === null) return false;
          if (where.dueAt.lte && (!r.dueAt || r.dueAt > where.dueAt.lte)) return false;
          if (where.dueAt.gt && (!r.dueAt || r.dueAt <= where.dueAt.gt)) return false;
        }
        return true;
      });
      if (orderBy?.dueAt === "asc") {
        rows = rows.slice().sort((a, b) => (a.dueAt!.getTime() - b.dueAt!.getTime()));
      }
      return rows.map((r) => ({ ...r }));
    }),
    findFirst: vi.fn(async ({ where }: { where: any }) => {
      const row = reminders.find((r) => {
        if (where.status && r.status !== where.status) return false;
        return true;
      });
      return row ? { id: row.id } : null;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = reminders.find((r) => r.id === where.id);
      return row ? { ...row } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: any; data: any }) => {
      const matched = reminders.filter((r) => {
        if (where.id && r.id !== where.id) return false;
        if (where.status && r.status !== where.status) return false;
        return true;
      });
      for (const r of matched) Object.assign(r, data);
      return { count: matched.length };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: any }) => {
      const r = reminders.find((row) => row.id === where.id);
      if (!r) throw new Error("not found");
      Object.assign(r, data);
      return { ...r };
    }),
  },
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
        if (where.nextRunAt && j.nextRunAt.getTime() !== where.nextRunAt.getTime()) return false;
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
      eventLogs.push(data);
      return { id: `log-${eventLogs.length}`, ...data };
    }),
  },
};

vi.mock("@/lib/prisma", () => ({ prisma: mockPrisma }));

const { schedulerTick, clearAllTimers } = await import("@/agent/scheduler-tick");

function makeReminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: `r-${reminders.length + 1}`,
    roomId: "room-1",
    title: "test reminder",
    body: null,
    dueAt: new Date(Date.now() - 1000),
    status: "pending",
    metadata: null,
    createdById: null,
    agentTaskId: null,
    timezone: "Asia/Shanghai",
    contactWindowStart: null,
    contactWindowEnd: null,
    notifyChannel: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

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

describe("schedulerTick - reminder atomic claim", () => {
  it("only dispatches a due reminder once when two ticks race", async () => {
    reminders.push(makeReminder());

    const now = new Date();
    await Promise.all([schedulerTick(now), schedulerTick(now)]);

    expect(agentTasks).toHaveLength(1);
    expect(reminders[0].status).toBe("fired");
  });

  it("rolls back to pending and increments fireAttempts on dispatch failure", async () => {
    reminders.push(makeReminder());

    dispatchHook = async () => {
      throw new Error("dispatch boom");
    };

    await schedulerTick(new Date());

    expect(reminders[0].status).toBe("pending");
    expect((reminders[0].metadata as any).fireAttempts).toBe(1);
    expect((reminders[0].metadata as any).lastError).toMatch(/boom/);
  });

  it("cancels reminder after MAX_FAIL_COUNT consecutive failures", async () => {
    reminders.push(makeReminder({ metadata: { fireAttempts: 2, lastError: "prev" } }));
    dispatchHook = async () => {
      throw new Error("still broken");
    };

    await schedulerTick(new Date());

    expect(reminders[0].status).toBe("cancelled");
    expect((reminders[0].metadata as any).fireAttempts).toBe(3);
  });

  it("marks as skipped when past missed-window", async () => {
    const farPast = new Date(Date.now() - 2 * 60 * 60 * 1000);
    reminders.push(makeReminder({ dueAt: farPast }));

    await schedulerTick(new Date());

    expect(reminders[0].status).toBe("skipped");
    expect(agentTasks).toHaveLength(0);
  });
});

describe("schedulerTick - scheduled job CAS", () => {
  it("only dispatches a due job once when two ticks race", async () => {
    jobs.push(makeJob());

    const now = new Date();
    await Promise.all([schedulerTick(now), schedulerTick(now)]);

    expect(agentTasks).toHaveLength(1);
    expect(jobs[0].nextRunAt.getTime()).toBeGreaterThan(now.getTime());
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
});
