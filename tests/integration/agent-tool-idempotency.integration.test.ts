import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ExecutionTracer } from "@/agent/execution-tracer";
import { createToolRegistry, ToolRegistry } from "@/agent/tool-registry";
import type { RuntimeContext, ToolExecutionContext } from "@/agent/types";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("database Tool idempotency", () => {
  it("replays completed memo and schedule steps without duplicate resources", async () => {
    const user = await createTestUser();
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "idempotency-test-agent",
        displayName: "Idempotency Test Agent",
        description: "Verifies replay safety"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        requestedById: user.id,
        status: "running",
        input: { normalizedContent: "create memo and schedule" }
      }
    });
    const context: ToolExecutionContext = {
      prisma,
      taskId: task.id,
      roomId: room.id,
      agentId: agent.id,
      requestedById: user.id,
      runtimeContext: { participants: [] } as unknown as RuntimeContext,
      tracer: new ExecutionTracer(prisma, task.id, room.id)
    };
    const registry = createToolRegistry();

    const memoInput = { title: "Only once", content: "Do not duplicate" };
    const firstMemo = await registry.execute("memo.create", memoInput, context, {
      stepKey: "tool:1"
    });
    const replayedMemo = await registry.execute("memo.create", memoInput, context, {
      stepKey: "tool:1"
    });

    const scheduleInput = {
      cron: "0 9 * * *",
      timezone: "Asia/Shanghai",
      prompt: "Good morning"
    };
    const firstSchedule = await registry.execute("schedule.create", scheduleInput, context, {
      stepKey: "tool:2"
    });
    const replayedSchedule = await registry.execute("schedule.create", scheduleInput, context, {
      stepKey: "tool:2"
    });

    expect(replayedMemo).toEqual(firstMemo);
    expect(replayedSchedule).toEqual(firstSchedule);
    await expect(prisma.memo.count({ where: { roomId: room.id } })).resolves.toBe(1);
    await expect(
      prisma.scheduledJob.count({ where: { roomId: room.id } })
    ).resolves.toBe(1);
    await expect(
      prisma.toolCall.count({ where: { taskId: task.id, status: "completed" } })
    ).resolves.toBe(2);
    await expect(
      prisma.eventLog.count({
        where: { agentTaskId: task.id, type: "agent.tool.replayed" }
      })
    ).resolves.toBe(2);
  });

  it("rolls back a database side effect when the Tool step cannot complete", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "rollback-test-agent",
        displayName: "Rollback Test Agent",
        description: "Verifies atomic Tool steps"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        status: "running",
        input: { normalizedContent: "rollback" }
      }
    });
    const context: ToolExecutionContext = {
      prisma,
      taskId: task.id,
      roomId: room.id,
      agentId: agent.id,
      requestedById: null,
      runtimeContext: { participants: [] } as unknown as RuntimeContext,
      tracer: new ExecutionTracer(prisma, task.id, room.id)
    };
    const registry = new ToolRegistry();
    registry.register({
      name: "test.memo-create-then-fail",
      description: "Creates a memo and then fails",
      schema: { type: "object" },
      risk: "medium",
      effect: "database-write",
      async execute(_input, toolContext) {
        await toolContext.prisma.memo.create({
          data: {
            roomId: toolContext.roomId,
            agentTaskId: toolContext.taskId,
            title: "Must roll back",
            content: "Must roll back"
          }
        });
        throw new Error("simulated failure after side effect");
      }
    });

    await expect(
      registry.execute("test.memo-create-then-fail", {}, context, {
        stepKey: "tool:1"
      })
    ).rejects.toThrow("simulated failure after side effect");

    await expect(prisma.memo.count({ where: { roomId: room.id } })).resolves.toBe(0);
    await expect(
      prisma.toolCall.findUniqueOrThrow({
        where: {
          taskId_stepKey: {
            taskId: task.id,
            stepKey: "tool:1"
          }
        }
      })
    ).resolves.toMatchObject({
      status: "failed",
      error: "simulated failure after side effect"
    });
  });
});
