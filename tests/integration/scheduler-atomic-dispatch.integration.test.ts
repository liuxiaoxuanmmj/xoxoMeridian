import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllTimers, schedulerTick } from "@/agent/scheduler-tick";
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
});
