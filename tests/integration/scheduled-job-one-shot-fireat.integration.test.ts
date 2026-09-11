import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ userId: "" }));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: vi.fn(async () => ({ id: authState.userId })),
}));

import { createToolRegistry } from "@/agent/tool-registry";
import type { RuntimeContext, ToolExecutionContext } from "@/agent/types";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { PATCH as patchScheduledJob } from "@/app/api/rooms/[roomId]/scheduled-jobs/[jobId]/route";
import { POST as createScheduledJob } from "@/app/api/rooms/[roomId]/scheduled-jobs/route";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase,
} from "@/tests/integration/support/database";

// A far-future instant so nothing here depends on the wall clock — this layer
// is not time-mocked, unlike the lib and server layers.
const FIRE_AT = "2030-05-09T21:15:00+08:00";
const FIRE_AT_ISO = "2030-05-09T13:15:00.000Z";
const FIRE_AT_CRON = "15 21 * * *";

// `enforceRateLimit` keys on the forwarded address, so each request gets its own.
let ipCounter = 0;
function nextIp() {
  ipCounter += 1;
  return `198.51.100.${ipCounter}`;
}

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createFixture() {
  const room = await createTestRoom();
  const user = await createTestUser();
  authState.userId = user.id;
  await prisma.roomParticipant.create({
    data: { roomId: room.id, userId: user.id, role: "owner" },
  });
  const agent = await prisma.agent.create({
    data: {
      slug: "life-assistant",
      displayName: "生活助手",
      description: "one-shot fireAt integration test",
    },
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      requestedById: user.id,
      status: "running",
      input: { normalizedContent: "edit schedule" },
    },
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

  return { room, user, agent, task, context };
}

async function createOneShot(roomId: string, agentId: string, userId: string) {
  return prisma.scheduledJob.create({
    data: {
      roomId,
      agentId,
      cron: "40 20 * * *",
      timezone: "Asia/Shanghai",
      payload: { prompt: "发一首诗", description: "今晚发诗", runOnce: true },
      enabled: true,
      nextRunAt: new Date("2030-05-09T12:40:00.000Z"),
      createdById: userId,
    },
  });
}

function patchRequest(roomId: string, jobId: string, body: unknown) {
  return patchScheduledJob(
    new Request(`http://localhost/api/rooms/${roomId}/scheduled-jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ roomId, jobId }) },
  );
}

describe("ScheduledJob one-shot fireAt", () => {
  it("persists a new fireAt as nextRunAt and a matching cron", async () => {
    const { room, agent, user } = await createFixture();
    const job = await createOneShot(room.id, agent.id, user.id);

    const response = await patchRequest(room.id, job.id, {
      fireAt: FIRE_AT,
      timezone: "Asia/Shanghai",
      prompt: "发一首诗",
      description: "今晚发诗",
      runOnce: true,
    });
    expect(response.status).toBe(200);

    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.nextRunAt.toISOString()).toBe(FIRE_AT_ISO);
    // The scheduler re-derives the next run from cron on every claim, so the
    // column has to describe the same instant the row is pinned to.
    expect(stored.cron).toBe(FIRE_AT_CRON);
    expect(stored.timezone).toBe("Asia/Shanghai");
    expect(stored.enabled).toBe(true);
    expect(stored.payload).toMatchObject({
      prompt: "发一首诗",
      description: "今晚发诗",
      runOnce: true,
    });
  });

  it("does not move the instant when only the prompt is edited", async () => {
    const { room, agent, user } = await createFixture();
    const job = await createOneShot(room.id, agent.id, user.id);

    const response = await patchRequest(room.id, job.id, { prompt: "改成发一句晚安" });
    expect(response.status).toBe(200);

    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.nextRunAt.toISOString()).toBe("2030-05-09T12:40:00.000Z");
    expect(stored.cron).toBe("40 20 * * *");
    expect(stored.payload).toMatchObject({ prompt: "改成发一句晚安", runOnce: true });
  });

  it("re-derives nextRunAt when a one-off is converted back to recurring", async () => {
    const { room, agent, user } = await createFixture();
    const job = await createOneShot(room.id, agent.id, user.id);

    // The cron string is unchanged, so a "did cron change?" test alone would
    // leave the job pinned to 2030 — the next fire would come a decade late.
    const response = await patchRequest(room.id, job.id, { runOnce: false });
    expect(response.status).toBe(200);

    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect((stored.payload as { runOnce?: boolean }).runOnce).toBe(false);
    const daysOut = (stored.nextRunAt.getTime() - Date.now()) / 86_400_000;
    expect(daysOut).toBeGreaterThanOrEqual(0);
    expect(daysOut).toBeLessThan(2);
  });

  it("converts a recurring job into a one-off at the requested instant", async () => {
    const { room, agent, user } = await createFixture();
    const job = await prisma.scheduledJob.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        cron: "0 9 * * *",
        timezone: "Asia/Shanghai",
        payload: { prompt: "每天早安", runOnce: false },
        enabled: true,
        nextRunAt: new Date("2030-05-09T01:00:00.000Z"),
        createdById: user.id,
      },
    });

    const response = await patchRequest(room.id, job.id, {
      fireAt: FIRE_AT,
      timezone: "Asia/Shanghai",
      prompt: "每天早安",
      runOnce: true,
    });
    expect(response.status).toBe(200);

    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.nextRunAt.toISOString()).toBe(FIRE_AT_ISO);
    expect(stored.cron).toBe(FIRE_AT_CRON);
    expect(stored.payload).toMatchObject({ runOnce: true });
  });

  it("agrees with the Agent schedule.update tool on the same fireAt", async () => {
    // The two authoring entries drifting apart is the defect this whole change
    // exists to prevent, so assert them against each other rather than only
    // against literals.
    const { room, agent, user, context } = await createFixture();
    const routeJob = await createOneShot(room.id, agent.id, user.id);
    const agentJob = await createOneShot(room.id, agent.id, user.id);

    const response = await patchRequest(room.id, routeJob.id, { fireAt: FIRE_AT });
    expect(response.status).toBe(200);

    const registry = createToolRegistry();
    await registry.execute(
      "schedule.update",
      { jobId: agentJob.id, fireAt: FIRE_AT },
      context,
      { stepKey: "tool:one-shot-fireat" },
    );

    const [viaRoute, viaAgent] = await Promise.all([
      prisma.scheduledJob.findUniqueOrThrow({ where: { id: routeJob.id } }),
      prisma.scheduledJob.findUniqueOrThrow({ where: { id: agentJob.id } }),
    ]);

    expect(viaRoute.nextRunAt.toISOString()).toBe(viaAgent.nextRunAt.toISOString());
    expect(viaRoute.cron).toBe(viaAgent.cron);
    expect(viaRoute.cron).toBe(FIRE_AT_CRON);
  });

  it("rejects a stale fireAt and leaves the stored schedule untouched", async () => {
    const { room, agent, user } = await createFixture();
    const job = await createOneShot(room.id, agent.id, user.id);

    const response = await patchRequest(room.id, job.id, {
      fireAt: "2020-01-01T00:00:00Z",
      prompt: "发一首诗",
      runOnce: true,
    });

    expect(response.status).toBe(400);
    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.nextRunAt.toISOString()).toBe("2030-05-09T12:40:00.000Z");
    expect(stored.cron).toBe("40 20 * * *");
  });

  it("answers 400 rather than 500 for an unusable cron or timezone", async () => {
    const { room, agent, user } = await createFixture();
    const job = await createOneShot(room.id, agent.id, user.id);

    const badCron = await patchRequest(room.id, job.id, { cron: "not a cron" });
    expect(badCron.status).toBe(400);
    expect((await badCron.json()).error).toMatch(/Invalid cron expression/);

    // The one-shot path builds its display cron with `Intl`, which throws a bare
    // RangeError for an unknown zone — that would surface as a 500 if unguarded.
    const badZone = await patchRequest(room.id, job.id, {
      fireAt: FIRE_AT,
      timezone: "Not/AZone",
    });
    expect(badZone.status).toBe(400);
    expect((await badZone.json()).error).toMatch(/Invalid timezone/);
  });

  it("rejects fireAt and cron supplied together", async () => {
    const { room, agent, user } = await createFixture();
    const job = await createOneShot(room.id, agent.id, user.id);

    const response = await patchRequest(room.id, job.id, {
      fireAt: FIRE_AT,
      cron: "0 9 * * *",
    });

    expect(response.status).toBe(400);
    const stored = await prisma.scheduledJob.findUniqueOrThrow({ where: { id: job.id } });
    expect(stored.nextRunAt.toISOString()).toBe("2030-05-09T12:40:00.000Z");
  });

  it("creates a one-shot through POST with the same instant semantics as PATCH", async () => {
    const { room, agent, user } = await createFixture();

    const response = await createScheduledJob(
      new Request(`http://localhost/api/rooms/${room.id}/scheduled-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": nextIp() },
        body: JSON.stringify({
          fireAt: FIRE_AT,
          timezone: "Asia/Shanghai",
          prompt: "发一首诗",
        }),
      }),
      { params: Promise.resolve({ roomId: room.id }) },
    );
    expect(response.status).toBe(201);

    const stored = await prisma.scheduledJob.findFirstOrThrow({ where: { roomId: room.id } });
    expect(stored.nextRunAt.toISOString()).toBe(FIRE_AT_ISO);
    expect(stored.cron).toBe(FIRE_AT_CRON);
    expect(stored.payload).toMatchObject({ runOnce: true });
  });
});
