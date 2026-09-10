import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.userId })),
}));

import { PATCH as patchScheduledJob } from "@/app/api/rooms/[roomId]/scheduled-jobs/[jobId]/route";
import { POST as createScheduledJob } from "@/app/api/rooms/[roomId]/scheduled-jobs/route";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { createToolRegistry } from "@/agent/tool-registry";
import type { RuntimeContext, ToolExecutionContext } from "@/agent/types";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

const ENABLE_DELAY_TRIGGER = "delay_scheduled_job_enable";
const ENABLE_DELAY_FUNCTION = "delay_scheduled_job_enable";

type AttemptResult = {
  source: "route" | "agent";
  outcome: "success" | "conflict";
  message?: string;
};

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(async () => {
  await dropEnableDelay();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function dropEnableDelay() {
  await prisma.$executeRawUnsafe(
    `DROP TRIGGER IF EXISTS ${ENABLE_DELAY_TRIGGER} ON "ScheduledJob"`,
  );
  await prisma.$executeRawUnsafe(
    `DROP FUNCTION IF EXISTS ${ENABLE_DELAY_FUNCTION}()`,
  );
}

async function installEnableDelay() {
  await prisma.$executeRawUnsafe(`
    CREATE FUNCTION ${ENABLE_DELAY_FUNCTION}() RETURNS trigger AS $$
    BEGIN
      IF (TG_OP = 'INSERT' AND NEW.enabled)
        OR (TG_OP = 'UPDATE' AND NOT OLD.enabled AND NEW.enabled) THEN
        PERFORM pg_sleep(0.5);
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER ${ENABLE_DELAY_TRIGGER}
    BEFORE INSERT OR UPDATE ON "ScheduledJob"
    FOR EACH ROW EXECUTE FUNCTION ${ENABLE_DELAY_FUNCTION}()
  `);
}

async function createFixture() {
  const room = await createTestRoom();
  const user = await createTestUser();
  authState.userId = user.id;
  await prisma.roomParticipant.create({
    data: {
      roomId: room.id,
      userId: user.id,
      role: "owner",
    },
  });
  const agent = await prisma.agent.create({
    data: {
      slug: "life-assistant",
      displayName: "生活助手",
      description: "ScheduledJob active cap test",
    },
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      requestedById: user.id,
      status: "running",
      input: { normalizedContent: "update schedules" },
    },
  });
  const nextRunAt = new Date(Date.now() + 60 * 60 * 1000);
  await prisma.scheduledJob.createMany({
    data: Array.from({ length: 29 }, (_, index) => ({
      roomId: room.id,
      agentId: agent.id,
      cron: "0 9 * * *",
      timezone: "Asia/Shanghai",
      payload: { prompt: `existing-${index}`, runOnce: false },
      enabled: true,
      nextRunAt,
      createdById: user.id,
    })),
  });

  const context: ToolExecutionContext = {
    prisma,
    taskId: task.id,
    roomId: room.id,
    agentId: agent.id,
    requestedById: user.id,
    runtimeContext: { participants: [] } as unknown as RuntimeContext,
    tracer: new ExecutionTracer(prisma, task.id, room.id),
  };

  return { room, user, agent, context, nextRunAt };
}

async function routeAttempt(responsePromise: Promise<Response>): Promise<AttemptResult> {
  const response = await responsePromise;
  const body = await response.json();
  if (response.status === 409) {
    return { source: "route", outcome: "conflict", message: body.error };
  }
  expect([200, 201]).toContain(response.status);
  return { source: "route", outcome: "success" };
}

async function agentAttempt(operation: Promise<unknown>): Promise<AttemptResult> {
  try {
    await operation;
    return { source: "agent", outcome: "success" };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("active scheduled jobs")) {
      return { source: "agent", outcome: "conflict", message };
    }
    throw error;
  }
}

function expectSingleWinner(results: AttemptResult[]) {
  expect(results.map((result) => result.outcome).sort()).toEqual([
    "conflict",
    "success",
  ]);
  expect(results.find((result) => result.outcome === "conflict")?.message).toMatch(
    /30 active scheduled jobs \(max 30\)/,
  );
}

describe("ScheduledJob active cap", () => {
  it("serializes concurrent Route and Agent creates at the room limit", async () => {
    const { room, context } = await createFixture();
    await installEnableDelay();
    const registry = createToolRegistry();

    const results = await Promise.all([
      routeAttempt(createScheduledJob(
        new Request(`http://localhost/api/rooms/${room.id}/scheduled-jobs`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.81",
          },
          body: JSON.stringify({
            cron: "0 10 * * *",
            timezone: "Asia/Shanghai",
            prompt: "route-create",
          }),
        }),
        { params: Promise.resolve({ roomId: room.id }) },
      )),
      agentAttempt(registry.execute("schedule.create", {
        cron: "0 11 * * *",
        timezone: "Asia/Shanghai",
        prompt: "agent-create",
      }, context, { stepKey: "tool:create" })),
    ]);

    expectSingleWinner(results);
    await expect(prisma.scheduledJob.count({
      where: { roomId: room.id, enabled: true },
    })).resolves.toBe(30);
    const jobs = await prisma.scheduledJob.findMany({
      where: { roomId: room.id },
      select: { payload: true },
    });
    expect(jobs.filter((job) => {
      const payload = job.payload as { prompt?: string };
      return payload.prompt === "route-create" || payload.prompt === "agent-create";
    })).toHaveLength(1);
  });

  it("serializes concurrent Route and Agent re-enable operations at the room limit", async () => {
    const { room, user, agent, context, nextRunAt } = await createFixture();
    const [routeJob, agentJob] = await Promise.all([
      prisma.scheduledJob.create({
        data: {
          roomId: room.id,
          agentId: agent.id,
          cron: "0 12 * * *",
          timezone: "Asia/Shanghai",
          payload: { prompt: "route-re-enable", runOnce: false },
          enabled: false,
          nextRunAt,
          createdById: user.id,
        },
      }),
      prisma.scheduledJob.create({
        data: {
          roomId: room.id,
          agentId: agent.id,
          cron: "0 13 * * *",
          timezone: "Asia/Shanghai",
          payload: { prompt: "agent-re-enable", runOnce: false },
          enabled: false,
          nextRunAt,
          createdById: user.id,
        },
      }),
    ]);
    await installEnableDelay();
    const registry = createToolRegistry();

    const results = await Promise.all([
      routeAttempt(patchScheduledJob(
        new Request(`http://localhost/api/rooms/${room.id}/scheduled-jobs/${routeJob.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.82",
          },
          body: JSON.stringify({ enabled: true }),
        }),
        { params: Promise.resolve({ roomId: room.id, jobId: routeJob.id }) },
      )),
      agentAttempt(registry.execute("schedule.update", {
        jobId: agentJob.id,
      }, context, { stepKey: "tool:update" })),
    ]);

    expectSingleWinner(results);
    await expect(prisma.scheduledJob.count({
      where: { roomId: room.id, enabled: true },
    })).resolves.toBe(30);
    const candidates = await prisma.scheduledJob.findMany({
      where: { id: { in: [routeJob.id, agentJob.id] } },
      select: { enabled: true },
    });
    expect(candidates.filter((job) => job.enabled)).toHaveLength(1);
  });

  it("allows Route and Agent to edit already-active jobs at the limit", async () => {
    const { room, user, agent, context, nextRunAt } = await createFixture();
    const routeJob = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "0 14 * * *",
        timezone: "Asia/Shanghai",
        payload: { prompt: "route-existing", runOnce: false },
        enabled: true,
        nextRunAt,
        createdById: user.id,
      },
    });
    const agentJob = await prisma.scheduledJob.findFirstOrThrow({
      where: { roomId: room.id, id: { not: routeJob.id } },
    });
    const registry = createToolRegistry();

    const results = await Promise.all([
      routeAttempt(patchScheduledJob(
        new Request(`http://localhost/api/rooms/${room.id}/scheduled-jobs/${routeJob.id}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "198.51.100.83",
          },
          body: JSON.stringify({ prompt: "route-edited" }),
        }),
        { params: Promise.resolve({ roomId: room.id, jobId: routeJob.id }) },
      )),
      agentAttempt(registry.execute("schedule.update", {
        jobId: agentJob.id,
        prompt: "agent-edited",
      }, context, { stepKey: "tool:edit-active" })),
    ]);

    expect(results.map((result) => result.outcome)).toEqual(["success", "success"]);
    await expect(prisma.scheduledJob.count({
      where: { roomId: room.id, enabled: true },
    })).resolves.toBe(30);
  });
});
