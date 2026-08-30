import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { clearAllTimers, schedulerTick } from "@/agent/scheduler-tick";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  clearAllTimers();
  await resetTestDatabase();
});

afterAll(async () => {
  clearAllTimers();
  await prisma.$disconnect();
});

describe("Scheduler atomic task derivation", () => {
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
