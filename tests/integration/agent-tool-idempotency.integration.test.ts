import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { ExecutionTracer } from "@/agent/execution-tracer";
import { NO_TOOL_RETRY, TRANSIENT_TOOL_RETRY } from "@/agent/tool-errors";
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
      retry: NO_TOOL_RETRY,
      effect: "database-write",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }),
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

  it("aborts and rolls back a database write when the Executor deadline expires", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "timeout-rollback-agent",
        displayName: "Timeout Rollback Agent",
        description: "Verifies Tool deadline rollback"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        status: "running",
        input: { normalizedContent: "timeout and rollback" }
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
    const registry = new ToolRegistry({ defaultTimeoutMs: 100 });
    registry.register({
      name: "test.memo-create-then-timeout",
      description: "Creates a memo and waits past the Executor deadline",
      schema: { type: "object" },
      risk: "medium",
      retry: NO_TOOL_RETRY,
      effect: "database-write",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }),
      async execute(_input, toolContext) {
        await toolContext.prisma.memo.create({
          data: {
            roomId: toolContext.roomId,
            agentTaskId: toolContext.taskId,
            title: "Must time out",
            content: "Must roll back"
          }
        });
        await new Promise<never>((_resolve, reject) => {
          toolContext.signal?.addEventListener("abort", () => {
            reject(toolContext.signal?.reason);
          }, { once: true });
        });
      }
    });

    await expect(registry.execute(
      "test.memo-create-then-timeout",
      {},
      context,
      { stepKey: "tool:1" }
    )).rejects.toMatchObject({ category: "timeout" });

    await expect(prisma.memo.count({ where: { roomId: room.id } })).resolves.toBe(0);
    await expect(prisma.toolCall.findUniqueOrThrow({
      where: {
        taskId_stepKey: {
          taskId: task.id,
          stepKey: "tool:1"
        }
      }
    })).resolves.toMatchObject({ status: "failed" });
  });

  it("rolls back a database write whose output violates the Tool contract", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "invalid-output-agent",
        displayName: "Invalid Output Agent",
        description: "Verifies output contract rollback"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        status: "running",
        input: { normalizedContent: "invalid output" }
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
    const registry = new ToolRegistry({ defaultTimeoutMs: 1_000 });
    registry.register({
      name: "test.memo-create-invalid-output",
      description: "Creates a memo and returns an invalid result",
      schema: { type: "object" },
      risk: "medium",
      retry: TRANSIENT_TOOL_RETRY,
      effect: "database-write",
      inputSchema: z.object({}).strict(),
      outputSchema: z.object({ ok: z.boolean() }),
      async execute(_input, toolContext) {
        await toolContext.prisma.memo.create({
          data: {
            roomId: toolContext.roomId,
            agentTaskId: toolContext.taskId,
            title: "Must not commit",
            content: "Invalid output rolls this back"
          }
        });
        return { ok: "invalid" };
      }
    });

    await expect(registry.execute(
      "test.memo-create-invalid-output",
      {},
      context,
      { stepKey: "tool:1" }
    )).rejects.toMatchObject({
      category: "validation",
      direction: "output",
      retryable: false
    });

    await expect(prisma.memo.count({ where: { roomId: room.id } })).resolves.toBe(0);
    await expect(prisma.toolCall.findUniqueOrThrow({
      where: {
        taskId_stepKey: {
          taskId: task.id,
          stepKey: "tool:1"
        }
      }
    })).resolves.toMatchObject({
      status: "failed",
      error: expect.stringContaining("output validation failed")
    });
  });
});
