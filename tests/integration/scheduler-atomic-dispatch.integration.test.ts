import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllTimers, drainSchedulerTasks, schedulerTick } from "@/agent/scheduler-tick";
import { prisma } from "@/lib/prisma";
import { resolveOneShotSchedule } from "@/lib/scheduled-job-one-shot";
import {
  createTestRoom,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  clearAllTimers();
  await resetTestDatabase();
});

afterEach(() => {
  clearAllTimers();
  vi.useRealTimers();
});

afterAll(async () => {
  clearAllTimers();
  await prisma.$disconnect();
});

// 近端 timer 的延迟：落在 JOB_PRECISE_THRESHOLD_MS（2 分钟）内，因此 tick 会为它装上真实定时器。
const TIMER_PATH_DELAY_MS = 500;
const TIMER_OBSERVE_BUDGET_MS = 10_000;

// 让 scheduler.job.fired 的插入必然失败，用于验证 claim 事务回滚。
async function installFiredEventFailure() {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION fail_scheduler_fired_event() RETURNS trigger AS $$
    BEGIN
      IF NEW.type = 'scheduler.job.fired' THEN
        RAISE EXCEPTION 'simulated scheduler Event failure';
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER fail_scheduler_fired_event_trigger
    BEFORE INSERT ON "EventLog"
    FOR EACH ROW EXECUTE FUNCTION fail_scheduler_fired_event()
  `);
}

async function removeFiredEventFailure() {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS fail_scheduler_fired_event_trigger ON "EventLog"`
  );
  await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_scheduler_fired_event()");
}

// timer 回调是异步的，测试无法直接 await 一个由 setTimeout 启动的任务；
// 轮询数据库状态直到它稳定，再配合 drainSchedulerTasks 确认任务自身已收尾。
async function waitForJobState(
  jobId: string,
  predicate: (job: { failCount: number; nextRunAt: Date; lastRunAt: Date | null; enabled: boolean }) => boolean
) {
  const deadline = Date.now() + TIMER_OBSERVE_BUDGET_MS;
  let last: unknown;
  while (Date.now() < deadline) {
    last = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: jobId } });
    if (predicate(last as { failCount: number; nextRunAt: Date; lastRunAt: Date | null; enabled: boolean })) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(
    `job ${jobId} 未在 ${TIMER_OBSERVE_BUDGET_MS}ms 内进入期望状态：${JSON.stringify(last)}`
  );
}

describe("Scheduler atomic task derivation", () => {
  it("disables a missed fireAt job without replaying it at the next synthesized cron occurrence", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "scheduler-missed-once-test-agent",
        displayName: "Scheduler Missed Once Test Agent",
        description: "Verifies missed one-shot termination"
      }
    });
    const scheduledFor = new Date("2026-05-08T10:00:00Z");
    const schedule = resolveOneShotSchedule({
      fireAt: scheduledFor.toISOString(),
      timezone: "UTC",
      now: scheduledFor.getTime() - 60_000
    });
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: schedule.cron,
        timezone: "UTC",
        payload: { prompt: "Missed fireAt test", runOnce: schedule.runOnce },
        nextRunAt: schedule.nextRunAt
      }
    });

    const missedResult = await schedulerTick(new Date("2026-05-08T12:00:00Z"));
    const nextDayResult = await schedulerTick(new Date("2026-05-09T10:00:00Z"));

    expect(schedule.cron).toBe("0 10 * * *");
    expect(missedResult.jobs).toEqual({ fired: 0, skipped: 1, failed: 0 });
    expect(nextDayResult.jobs).toEqual({ fired: 0, skipped: 0, failed: 0 });
    await expect(
      prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })
    ).resolves.toMatchObject({
      enabled: false,
      failCount: 0,
      lastRunAt: null
    });
    await expect(
      prisma.agentTask.count({ where: { roomId: room.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.eventLog.count({ where: { roomId: room.id } })
    ).resolves.toBe(0);
  });

  it("allows only one concurrent tick to derive a Task and fired Event", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "scheduler-concurrent-test-agent",
        displayName: "Scheduler Concurrent Test Agent",
        description: "Verifies concurrent scheduler claims"
      }
    });
    const now = new Date();
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "*/5 * * * *",
        timezone: "UTC",
        payload: { prompt: "Concurrent dispatch test" },
        nextRunAt: new Date(now.getTime() - 1000)
      }
    });

    const results = await Promise.all([schedulerTick(now), schedulerTick(now)]);

    expect(results.reduce((total, result) => total + result.jobs.fired, 0)).toBe(1);
    await expect(
      prisma.agentTask.count({ where: { roomId: room.id } })
    ).resolves.toBe(1);
    await expect(
      prisma.eventLog.count({
        where: {
          roomId: room.id,
          type: "scheduler.job.fired",
          payload: { path: ["jobId"], equals: job.id }
        }
      })
    ).resolves.toBe(1);
  });

  it("does not let an armed timer claim a rescheduled Job version", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-05-08T12:00:00Z");
    vi.setSystemTime(now);
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "scheduler-stale-timer-test-agent",
        displayName: "Scheduler Stale Timer Test Agent",
        description: "Verifies stale timer rejection"
      }
    });
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "*/5 * * * *",
        timezone: "UTC",
        payload: { prompt: "Stale timer test" },
        nextRunAt: new Date(now.getTime() + 30_000)
      }
    });

    await schedulerTick(now);
    const postponedNextRunAt = new Date(now.getTime() + 90_000);
    await prisma.scheduledJob.update({
      where: { id: job.id },
      data: { nextRunAt: postponedNextRunAt }
    });

    await vi.advanceTimersByTimeAsync(30_500);

    await expect(
      prisma.agentTask.count({ where: { roomId: room.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.eventLog.count({ where: { roomId: room.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })
    ).resolves.toMatchObject({
      enabled: true,
      failCount: 0,
      lastRunAt: null,
      nextRunAt: postponedNextRunAt
    });
  });

  it("rolls back the Task and Job claim when the fired Event insert fails", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "scheduler-atomic-test-agent",
        displayName: "Scheduler Atomic Test Agent",
        description: "Verifies atomic scheduler dispatch"
      }
    });
    const now = new Date();
    const originalNextRunAt = new Date(now.getTime() - 1000);
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "*/5 * * * *",
        timezone: "UTC",
        payload: { prompt: "Atomic dispatch test" },
        nextRunAt: originalNextRunAt
      }
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await prisma.$executeRawUnsafe(`
      CREATE FUNCTION fail_scheduler_fired_event() RETURNS trigger AS $$
      BEGIN
        IF NEW.type = 'scheduler.job.fired' THEN
          RAISE EXCEPTION 'simulated scheduler Event failure';
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER fail_scheduler_fired_event_trigger
      BEFORE INSERT ON "EventLog"
      FOR EACH ROW EXECUTE FUNCTION fail_scheduler_fired_event()
    `);

    try {
      await expect(schedulerTick(now)).resolves.toEqual({
        jobs: { fired: 0, skipped: 0, failed: 1 }
      });
    } finally {
      await prisma.$executeRawUnsafe(
        `DROP TRIGGER IF EXISTS fail_scheduler_fired_event_trigger ON "EventLog"`
      );
      await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS fail_scheduler_fired_event()");
      consoleError.mockRestore();
    }

    await expect(
      prisma.agentTask.count({ where: { roomId: room.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.eventLog.count({ where: { roomId: room.id } })
    ).resolves.toBe(0);
    await expect(
      prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })
    ).resolves.toMatchObject({
      enabled: true,
      failCount: 1,
      lastRunAt: null,
      nextRunAt: originalNextRunAt
    });
  });

  it("近端 timer 路径的 claim 回滚后，Job 仍可被下一次 tick 重新扫描到", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "scheduler-timer-rollback-test-agent",
        displayName: "Scheduler Timer Rollback Test Agent",
        description: "Verifies near-term timer dispatch rollback"
      }
    });
    const now = new Date();
    const originalNextRunAt = new Date(now.getTime() + TIMER_PATH_DELAY_MS);
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "*/5 * * * *",
        timezone: "UTC",
        payload: { prompt: "Timer rollback test" },
        nextRunAt: originalNextRunAt
      }
    });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // 先装失败触发器再 tick：nextRunAt 尚未到，扫描路径不会碰这个 Job，
    // 因此之后被触发的必然是 timer 路径，且不受装触发器耗时影响。
    let drained: boolean;
    try {
      await installFiredEventFailure();
      await schedulerTick(now);
      await waitForJobState(job.id, (state) => state.failCount === 1);
      drained = await drainSchedulerTasks(5_000);
    } finally {
      await removeFiredEventFailure();
      consoleError.mockRestore();
    }

    // 任务自身已收尾：in-flight 集合不是在超时后被放弃的。
    expect(drained).toBe(true);

    // 回滚后 Job 保持原状（仍启用、nextRunAt 未推进、无 lastRunAt），Task/Event 均未落库。
    await expect(
      prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } })
    ).resolves.toMatchObject({
      enabled: true,
      failCount: 1,
      lastRunAt: null,
      nextRunAt: originalNextRunAt
    });
    await expect(prisma.agentTask.count({ where: { roomId: room.id } })).resolves.toBe(0);
    await expect(prisma.eventLog.count({ where: { roomId: room.id } })).resolves.toBe(0);

    // 下一次 tick 能重新扫到这个 Job，且只产出一份 Task/Event。
    await expect(schedulerTick(new Date())).resolves.toEqual({
      jobs: { fired: 1, skipped: 0, failed: 0 }
    });
    await expect(prisma.agentTask.count({ where: { roomId: room.id } })).resolves.toBe(1);
    await expect(
      prisma.eventLog.count({
        where: {
          roomId: room.id,
          type: "scheduler.job.fired",
          payload: { path: ["jobId"], equals: job.id }
        }
      })
    ).resolves.toBe(1);

    const rescued = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(rescued.failCount).toBe(0);
    expect(rescued.lastRunAt).not.toBeNull();
    expect(rescued.nextRunAt.getTime()).toBeGreaterThan(originalNextRunAt.getTime());
  });

  it("近端 timer 路径提交后，后续 tick 不重复派生 Task 与 Event", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "scheduler-timer-commit-test-agent",
        displayName: "Scheduler Timer Commit Test Agent",
        description: "Verifies near-term timer dispatch is not duplicated"
      }
    });
    const now = new Date();
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "*/5 * * * *",
        timezone: "UTC",
        payload: { prompt: "Timer commit test" },
        nextRunAt: new Date(now.getTime() + TIMER_PATH_DELAY_MS)
      }
    });

    await schedulerTick(now);
    await waitForJobState(job.id, (state) => state.lastRunAt !== null);
    await expect(drainSchedulerTasks(5_000)).resolves.toBe(true);

    await expect(prisma.agentTask.count({ where: { roomId: room.id } })).resolves.toBe(1);
    await expect(
      prisma.eventLog.count({
        where: {
          roomId: room.id,
          type: "scheduler.job.fired",
          payload: { path: ["jobId"], equals: job.id }
        }
      })
    ).resolves.toBe(1);

    // nextRunAt 已推进，重复 tick 不应再次派生。
    await expect(schedulerTick(new Date())).resolves.toEqual({
      jobs: { fired: 0, skipped: 0, failed: 0 }
    });
    await expect(prisma.agentTask.count({ where: { roomId: room.id } })).resolves.toBe(1);
    await expect(
      prisma.eventLog.count({
        where: {
          roomId: room.id,
          type: "scheduler.job.fired",
          payload: { path: ["jobId"], equals: job.id }
        }
      })
    ).resolves.toBe(1);
  });
});
