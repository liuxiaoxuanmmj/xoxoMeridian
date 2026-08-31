import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  beginAgentStep,
  completeAgentStep,
  executeDurableToolStep
} from "@/agent/durable-step";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { claimAgentTask } from "@/agent/task-claim";
import { NO_TOOL_RETRY } from "@/agent/tool-errors";
import {
  decideToolApproval,
  ToolApprovalRequiredError
} from "@/agent/tool-approval";
import { createToolRegistry, ToolRegistry } from "@/agent/tool-registry";
import type {
  AgentTaskLeaseOwnership,
  RuntimeContext,
  ToolExecutionContext
} from "@/agent/types";
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

describe("Agent durable steps", () => {
  it("restores completed Plan and read Tool steps and fences duplicate Final", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "durable-read-agent",
        displayName: "Durable Read Agent",
        description: "Verifies generic step recovery"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        input: { normalizedContent: "resume the durable workflow" }
      }
    });
    const firstClaim = await claimAgentTask(task.id, {
      workerId: "worker-plan",
      leaseDurationMs: 60_000
    }, prisma);
    const firstLease = leaseFromClaim(firstClaim);
    const plan = {
      intent: "durable_test",
      confidence: 1,
      requiredTools: ["test.read"],
      taskSteps: ["read once"],
      finalResponsePlan: "reply once",
      finalResponseText: "恢复完成。",
      toolInputs: { "test.read": {} }
    };
    const planInput = { prompt: "resume", availableTools: ["test.read"] };

    await beginAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease: firstLease,
      stepKey: "plan",
      kind: "plan",
      stepInput: planInput
    });
    await completeAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease: firstLease,
      stepKey: "plan",
      output: plan,
      taskData: { plan }
    });
    const afterPlan = await prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      select: { leaseExpiresAt: true }
    });
    if (!afterPlan.leaseExpiresAt) throw new Error("Plan lease expiration is missing.");

    const secondClaim = await claimAgentTask(task.id, {
      workerId: "worker-tool",
      leaseDurationMs: 60_000,
      now: new Date(afterPlan.leaseExpiresAt.getTime() + 1)
    }, prisma);
    const secondLease = leaseFromClaim(secondClaim);
    const resumedPlan = await beginAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease: secondLease,
      stepKey: "plan",
      kind: "plan",
      stepInput: planInput
    });
    expect(resumedPlan).toMatchObject({
      resumed: true,
      step: { status: "completed", attemptCount: 1, output: plan }
    });

    const firstExecute = vi.fn().mockResolvedValue({ value: "stable read" });
    const firstRegistry = createReadRegistry(firstExecute);
    const firstContext = createContext(task.id, room.id, agent.id, secondLease);
    await expect(executeDurableToolStep({
      registry: firstRegistry,
      toolName: "test.read",
      toolInput: {},
      stepKey: "tool:1",
      context: firstContext
    })).resolves.toEqual({
      toolName: "test.read",
      output: { value: "stable read" }
    });
    expect(firstExecute).toHaveBeenCalledTimes(1);
    const afterTool = await prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      select: { leaseExpiresAt: true }
    });
    if (!afterTool.leaseExpiresAt) throw new Error("Tool lease expiration is missing.");

    const thirdClaim = await claimAgentTask(task.id, {
      workerId: "worker-recovery",
      leaseDurationMs: 60_000,
      now: new Date(afterTool.leaseExpiresAt.getTime() + 1)
    }, prisma);
    const thirdLease = leaseFromClaim(thirdClaim);
    const reconstructedExecute = vi.fn().mockRejectedValue(
      new Error("completed read Tool must not run again")
    );
    const reconstructedRegistry = createReadRegistry(reconstructedExecute);
    const recoveredContext = createContext(task.id, room.id, agent.id, thirdLease);
    await expect(executeDurableToolStep({
      registry: reconstructedRegistry,
      toolName: "test.read",
      toolInput: {},
      stepKey: "tool:1",
      context: recoveredContext
    })).resolves.toEqual({
      toolName: "test.read",
      output: { value: "stable read" }
    });
    expect(reconstructedExecute).not.toHaveBeenCalled();

    await beginAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease: thirdLease,
      stepKey: "final",
      kind: "final",
      stepInput: { intent: plan.intent, content: plan.finalResponseText }
    });
    const recoveryTracer = new ExecutionTracer(
      prisma,
      task.id,
      room.id,
      thirdLease
    );
    await recoveryTracer.completeWithMessage({
      roomId: room.id,
      senderType: "agent",
      senderAgentId: agent.id,
      content: plan.finalResponseText,
      targetType: "all"
    }, { plan, toolResults: [{ toolName: "test.read", output: { value: "stable read" } }] });

    const staleTracer = new ExecutionTracer(
      prisma,
      task.id,
      room.id,
      secondLease
    );
    await expect(staleTracer.completeWithMessage({
      roomId: room.id,
      senderType: "agent",
      senderAgentId: agent.id,
      content: "duplicate final",
      targetType: "all"
    }, { duplicate: true })).rejects.toThrow("Agent task lease lost");

    const completed = await prisma.agentTask.findUniqueOrThrow({
      where: { id: task.id },
      include: { steps: { orderBy: { createdAt: "asc" } } }
    });
    expect(completed).toMatchObject({
      status: "completed",
      attemptCount: 3,
      currentStepKey: null
    });
    expect(completed.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ stepKey: "plan", status: "completed", attemptCount: 1 }),
      expect.objectContaining({ stepKey: "tool:1", status: "completed", attemptCount: 1 }),
      expect.objectContaining({ stepKey: "final", status: "completed", attemptCount: 1 })
    ]));
    await expect(prisma.message.count({ where: { roomId: room.id } })).resolves.toBe(1);
  });

  it("resumes an approved high-risk Tool step and replays its completed side effect", async () => {
    const user = await createTestUser();
    const room = await createTestRoom();
    await prisma.roomParticipant.create({
      data: { roomId: room.id, userId: user.id }
    });
    const agent = await prisma.agent.create({
      data: {
        slug: "durable-approval-agent",
        displayName: "Durable Approval Agent",
        description: "Verifies approval step recovery"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        requestedById: user.id,
        input: { normalizedContent: "delete after approval" }
      }
    });
    const memo = await prisma.memo.create({
      data: {
        roomId: room.id,
        createdById: user.id,
        title: "Delete once",
        content: "Approval protected"
      }
    });
    const firstClaim = await claimAgentTask(task.id, {
      workerId: "worker-approval",
      leaseDurationMs: 60_000
    }, prisma);
    const firstLease = leaseFromClaim(firstClaim);
    const firstContext = createContext(
      task.id,
      room.id,
      agent.id,
      firstLease,
      user.id
    );

    await expect(executeDurableToolStep({
      registry: createToolRegistry(),
      toolName: "memo.delete",
      toolInput: { memoId: memo.id },
      stepKey: "tool:1",
      context: firstContext
    })).rejects.toBeInstanceOf(ToolApprovalRequiredError);
    const approval = await prisma.agentToolApproval.findUniqueOrThrow({
      where: {
        taskId_stepKey: { taskId: task.id, stepKey: "tool:1" }
      }
    });
    await expect(prisma.agentStep.findUniqueOrThrow({
      where: {
        taskId_stepKey: { taskId: task.id, stepKey: "tool:1" }
      }
    })).resolves.toMatchObject({ status: "waiting_approval", attemptCount: 1 });
    await expect(prisma.memo.count({ where: { id: memo.id } })).resolves.toBe(1);

    await decideToolApproval({
      taskId: task.id,
      approvalId: approval.id,
      decision: "approve",
      decidedById: user.id
    });
    const resumedClaim = await claimAgentTask(task.id, {
      workerId: "worker-approved",
      leaseDurationMs: 60_000
    }, prisma);
    const resumedLease = leaseFromClaim(resumedClaim);
    const resumedContext = createContext(
      task.id,
      room.id,
      agent.id,
      resumedLease,
      user.id
    );
    const registry = createToolRegistry();

    const completedResult = await executeDurableToolStep({
      registry,
      toolName: "memo.delete",
      toolInput: { memoId: memo.id },
      stepKey: "tool:1",
      context: resumedContext
    });
    await expect(executeDurableToolStep({
      registry: createToolRegistry(),
      toolName: "memo.delete",
      toolInput: { memoId: memo.id },
      stepKey: "tool:1",
      context: resumedContext
    })).resolves.toEqual(completedResult);

    await expect(prisma.memo.count({ where: { id: memo.id } })).resolves.toBe(0);
    await expect(prisma.toolCall.count({
      where: { taskId: task.id, stepKey: "tool:1", status: "completed" }
    })).resolves.toBe(1);
    await expect(prisma.agentStep.findUniqueOrThrow({
      where: {
        taskId_stepKey: { taskId: task.id, stepKey: "tool:1" }
      }
    })).resolves.toMatchObject({ status: "completed", attemptCount: 2 });
  });
});

function createReadRegistry(
  execute: (input: unknown, context: ToolExecutionContext) => Promise<unknown>
) {
  const registry = new ToolRegistry({ defaultTimeoutMs: 1_000 });
  registry.register({
    name: "test.read",
    description: "Returns one stable read result",
    schema: { type: "object" },
    risk: "low",
    retry: NO_TOOL_RETRY,
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ value: z.string() }),
    execute
  });
  return registry;
}

function createContext(
  taskId: string,
  roomId: string,
  agentId: string,
  lease: AgentTaskLeaseOwnership,
  requestedById: string | null = null
) {
  return {
    prisma,
    taskId,
    roomId,
    agentId,
    requestedById,
    runtimeContext: { participants: [] } as unknown as RuntimeContext,
    tracer: new ExecutionTracer(prisma, taskId, roomId, lease),
    lease
  } satisfies ToolExecutionContext & { lease: AgentTaskLeaseOwnership };
}

function leaseFromClaim(claim: {
  claimed: boolean;
  attemptId: string;
  workerId: string;
  leaseDurationMs: number;
}) {
  if (!claim.claimed) throw new Error("AgentTask claim unexpectedly failed.");
  return {
    attemptId: claim.attemptId,
    workerId: claim.workerId,
    leaseDurationMs: claim.leaseDurationMs
  } satisfies AgentTaskLeaseOwnership;
}
