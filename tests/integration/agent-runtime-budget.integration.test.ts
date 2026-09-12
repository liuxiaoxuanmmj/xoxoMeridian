import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runAgentTask } from "@/agent/agent-runtime";
import {
  AgentRuntimeBudgetExceededError,
  estimateModelInputTokens,
  openAgentRuntimeBudget
} from "@/agent/runtime-budget";
import { claimAgentTask } from "@/agent/task-claim";
import type { AgentTaskLeaseOwnership, LLMPlanRequest } from "@/agent/types";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("Agent runtime budget", () => {
  it("persists Model/Tool usage and continues counting after Crash Recovery", async () => {
    const fixture = await createBudgetTask({
      maxTurns: 1,
      maxToolCalls: 2,
      maxTokens: 100_000,
      maxCostMicros: 100_000,
      maxCompletionTokens: 128,
      inputCostMicrosPerMillionTokens: 1_000_000,
      outputCostMicrosPerMillionTokens: 2_000_000
    });
    const firstClaim = await claimAgentTask(fixture.task.id, {
      workerId: "budget-worker-one",
      leaseDurationMs: 60_000
    }, prisma);
    const firstBudget = await openAgentRuntimeBudget({
      taskId: fixture.task.id,
      roomId: fixture.room.id,
      lease: leaseFromClaim(firstClaim)
    });
    const request = createRequest();
    const reservation = await firstBudget.reserveModelTurn({
      provider: "budget-test",
      model: "budget-model",
      inputSummary: request.prompt,
      request,
      requestPayload: { prompt: request.prompt }
    });
    await firstBudget.completeModelTurn(reservation, {
      intent: "test",
      confidence: 1,
      requiredTools: [],
      taskSteps: [],
      finalResponsePlan: "reply",
      finalResponseText: "done",
      toolInputs: {},
      usage: {
        promptTokens: 100,
        completionTokens: 20,
        totalTokens: 120
      }
    }, 25);
    await firstBudget.reserveToolCall({
      toolName: "test.read",
      stepKey: "tool:1",
      attempt: 1
    });
    const beforeRecovery = await prisma.agentTask.findUniqueOrThrow({
      where: { id: fixture.task.id }
    });
    expect(beforeRecovery).toMatchObject({
      turnsUsed: 1,
      toolCallsUsed: 1,
      tokensUsed: 120,
      costUsedMicros: 140
    });
    expect(beforeRecovery.deadlineAt).not.toBeNull();
    await expect(prisma.lLMCall.findUniqueOrThrow({
      where: { id: reservation.llmCallId }
    })).resolves.toMatchObject({
      status: "completed",
      turnIndex: 1,
      totalTokens: 120,
      costMicros: 140
    });
    firstBudget.dispose();

    if (!beforeRecovery.leaseExpiresAt) throw new Error("Lease expiration is missing.");
    const recoveryClaim = await claimAgentTask(fixture.task.id, {
      workerId: "budget-worker-recovery",
      leaseDurationMs: 60_000,
      now: new Date(beforeRecovery.leaseExpiresAt.getTime() + 1)
    }, prisma);
    const recoveryBudget = await openAgentRuntimeBudget({
      taskId: fixture.task.id,
      roomId: fixture.room.id,
      lease: leaseFromClaim(recoveryClaim)
    });
    await recoveryBudget.reserveToolCall({
      toolName: "test.read",
      stepKey: "tool:2",
      attempt: 1
    });
    await expect(recoveryBudget.reserveToolCall({
      toolName: "test.read",
      stepKey: "tool:2",
      attempt: 2
    })).rejects.toMatchObject({
      reason: "max_tool_calls"
    });
    await expect(recoveryBudget.reserveModelTurn({
      provider: "budget-test",
      model: "budget-model",
      inputSummary: request.prompt,
      request,
      requestPayload: { prompt: request.prompt }
    })).rejects.toMatchObject({
      reason: "max_turns"
    });
    await expect(prisma.agentTask.findUniqueOrThrow({
      where: { id: fixture.task.id }
    })).resolves.toMatchObject({
      attemptCount: 2,
      turnsUsed: 1,
      toolCallsUsed: 2,
      tokensUsed: 120,
      costUsedMicros: 140,
      deadlineAt: beforeRecovery.deadlineAt
    });
    recoveryBudget.dispose();
  });

  it("enforces token/cost reservations and stops on provider usage overage", async () => {
    const request = createRequest();
    const estimatedInput = estimateModelInputTokens(request);
    const tokenFixture = await createBudgetTask({
      maxTokens: estimatedInput,
      maxCostMicros: 1_000_000
    });
    const tokenBudget = await claimAndOpen(tokenFixture);
    await expect(tokenBudget.reserveModelTurn({
      provider: "budget-test",
      model: "budget-model",
      inputSummary: request.prompt,
      request,
      requestPayload: { prompt: request.prompt }
    })).rejects.toMatchObject({ reason: "max_tokens" });
    tokenBudget.dispose();

    const costFixture = await createBudgetTask({
      maxTokens: 100_000,
      maxCostMicros: 1,
      inputCostMicrosPerMillionTokens: 1_000_000,
      outputCostMicrosPerMillionTokens: 1_000_000
    });
    const costBudget = await claimAndOpen(costFixture);
    await expect(costBudget.reserveModelTurn({
      provider: "budget-test",
      model: "budget-model",
      inputSummary: request.prompt,
      request,
      requestPayload: { prompt: request.prompt }
    })).rejects.toMatchObject({ reason: "max_cost" });
    costBudget.dispose();

    const overageLimit = estimatedInput + 64;
    const overageFixture = await createBudgetTask({
      maxTokens: overageLimit,
      maxCostMicros: 1_000_000,
      maxCompletionTokens: 32
    });
    const overageBudget = await claimAndOpen(overageFixture);
    const reservation = await overageBudget.reserveModelTurn({
      provider: "budget-test",
      model: "budget-model",
      inputSummary: request.prompt,
      request,
      requestPayload: { prompt: request.prompt }
    });
    await expect(overageBudget.completeModelTurn(reservation, {
      intent: "test",
      confidence: 1,
      requiredTools: [],
      taskSteps: [],
      finalResponsePlan: "reply",
      finalResponseText: "done",
      toolInputs: {},
      usage: {
        promptTokens: overageLimit,
        completionTokens: 1,
        totalTokens: overageLimit + 1
      }
    }, 10)).rejects.toBeInstanceOf(AgentRuntimeBudgetExceededError);
    await expect(prisma.agentTask.findUniqueOrThrow({
      where: { id: overageFixture.task.id }
    })).resolves.toMatchObject({ tokensUsed: overageLimit + 1 });
    await expect(prisma.lLMCall.findUniqueOrThrow({
      where: { id: reservation.llmCallId }
    })).resolves.toMatchObject({ status: "completed", totalTokens: overageLimit + 1 });
    overageBudget.dispose();
  });

  it("persists a stable limit_exceeded terminal state when the Run deadline is expired", async () => {
    const fixture = await createBudgetTask({
      deadlineAt: new Date(Date.now() - 1_000)
    });

    const result = await runAgentTask(fixture.task.id, {
      workerId: "expired-budget-worker",
      leaseDurationMs: 60_000,
      heartbeatIntervalMs: 30_000
    });

    expect(result).toMatchObject({
      status: "limit_exceeded",
      limitReason: "max_runtime",
      attemptCount: 1
    });
    await expect(prisma.message.count({
      where: { roomId: fixture.room.id }
    })).resolves.toBe(1);
    await expect(prisma.eventLog.count({
      where: {
        agentTaskId: fixture.task.id,
        type: "agent.task.limit_exceeded"
      }
    })).resolves.toBe(1);

    await expect(runAgentTask(fixture.task.id, {
      workerId: "late-retry-worker",
      leaseDurationMs: 60_000
    })).resolves.toMatchObject({
      status: "limit_exceeded",
      limitReason: "max_runtime",
      attemptCount: 1
    });
    await expect(prisma.message.count({
      where: { roomId: fixture.room.id }
    })).resolves.toBe(1);
    await expect(claimAgentTask(fixture.task.id, {
      workerId: "direct-retry-worker",
      leaseDurationMs: 60_000
    }, prisma)).resolves.toMatchObject({ claimed: false });
  });
});

async function createBudgetTask(overrides: Record<string, unknown>) {
  const room = await createTestRoom();
  const agent = await prisma.agent.create({
    data: {
      slug: `budget-agent-${room.id}`,
      displayName: "Budget Agent",
      description: "Verifies persisted runtime budgets"
    }
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      input: { normalizedContent: "run a budget test" },
      ...overrides
    }
  });
  return { room, agent, task };
}

async function claimAndOpen(fixture: Awaited<ReturnType<typeof createBudgetTask>>) {
  const claim = await claimAgentTask(fixture.task.id, {
    workerId: `worker-${fixture.task.id}`,
    leaseDurationMs: 60_000
  }, prisma);
  return openAgentRuntimeBudget({
    taskId: fixture.task.id,
    roomId: fixture.room.id,
    lease: leaseFromClaim(claim)
  });
}

function createRequest(): LLMPlanRequest {
  return {
    prompt: "complete the budget test",
    roomContext: {
      room: { name: "Budget Room", slug: "budget-room" },
      requestedById: null,
      self: null,
      partner: null,
      participants: [],
      recentMessages: [],
      pinnedMemos: [],
      activeSchedules: [],
      semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
      summaries: { global: null, recent: [] }
    },
    availableTools: []
  };
}

function leaseFromClaim(claim: {
  claimed: boolean;
  attemptId: string;
  workerId: string;
  leaseDurationMs: number;
}): AgentTaskLeaseOwnership {
  if (!claim.claimed) throw new Error("AgentTask claim unexpectedly failed.");
  return {
    attemptId: claim.attemptId,
    workerId: claim.workerId,
    leaseDurationMs: claim.leaseDurationMs
  };
}
