import { beforeEach, describe, expect, it, vi } from "vitest";

import { cancelOnlyPlan, scheduleClarificationPrompt } from "@/tests/fixtures/schedule-clarification";

const mocks = vi.hoisted(() => ({
  claimAgentTask: vi.fn(),
  buildAgentContext: vi.fn(),
  createLLMProvider: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateTask: vi.fn(),
  createMessage: vi.fn(),
  markRunning: vi.fn(),
  completeWithMessage: vi.fn(),
  failWithMessage: vi.fn(),
  heartbeatAssertActive: vi.fn(),
  heartbeatStop: vi.fn(),
  withAgentTaskLease: vi.fn(),
  beginAgentStep: vi.fn(),
  completeAgentStep: vi.fn(),
  executeDurableToolStep: vi.fn(),
  tracerEvent: vi.fn(),
  budgetAssertWithinDeadline: vi.fn(),
  budgetAssertCanFinalize: vi.fn(),
  budgetDispose: vi.fn(),
  budgetReserveToolCall: vi.fn(),
  reserveModelTurn: vi.fn(),
  completeModelTurn: vi.fn(),
  failModelTurn: vi.fn()
}));

vi.mock("@/agent/durable-step", () => ({
  AgentStepConflictError: class extends Error {},
  beginAgentStep: mocks.beginAgentStep,
  completeAgentStep: mocks.completeAgentStep,
  executeDurableToolStep: mocks.executeDurableToolStep
}));

vi.mock("@/agent/task-claim", () => ({
  AgentTaskLeaseLostError: class extends Error {},
  claimAgentTask: mocks.claimAgentTask,
  getRuntimeWorkerId: () => "test-worker",
  startAgentTaskHeartbeat: () => ({
    assertActive: mocks.heartbeatAssertActive,
    stop: mocks.heartbeatStop
  }),
  withAgentTaskLease: mocks.withAgentTaskLease
}));

vi.mock("@/agent/llm-provider", () => ({
  createLLMProvider: mocks.createLLMProvider
}));

vi.mock("@/agent/runtime-budget", () => ({
  AgentRuntimeBudget: class {},
  AgentRuntimeBudgetExceededError: class extends Error {},
  getBudgetLimitMessage: () => "limit reached",
  openAgentRuntimeBudget: vi.fn(async () => ({
    signal: new AbortController().signal,
    assertWithinDeadline: mocks.budgetAssertWithinDeadline,
    assertCanFinalize: mocks.budgetAssertCanFinalize,
    reserveToolCall: mocks.budgetReserveToolCall,
    reserveModelTurn: mocks.reserveModelTurn,
    completeModelTurn: mocks.completeModelTurn,
    failModelTurn: mocks.failModelTurn,
    dispose: mocks.budgetDispose
  }))
}));

vi.mock("@/agent/context-builder", () => ({
  buildAgentContext: mocks.buildAgentContext
}));

vi.mock("@/agent/execution-tracer", () => ({
  ExecutionTracer: class {
    event = mocks.tracerEvent;
    markRunning = mocks.markRunning;
    completeWithMessage = mocks.completeWithMessage;
    failWithMessage = mocks.failWithMessage;
  }
}));

vi.mock("@/agent/post-task", () => ({
  runPostTaskHooks: vi.fn()
}));

vi.mock("@/lib/chat-log-file", () => ({
  appendChatLog: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentTask: {
      findUnique: mocks.findUnique,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      update: mocks.updateTask
    },
    message: {
      create: mocks.createMessage
    }
  }
}));

import { runAgentTask } from "@/agent/agent-runtime";

describe("runAgentTask claim handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.withAgentTaskLease.mockImplementation(
      async (_taskId, _lease, operation) => operation({
        agentTask: { update: mocks.updateTask }
      })
    );
  });

  it("does not enter planning when another caller owns the task", async () => {
    const runningTask = {
      id: "task-1",
      roomId: "room-1",
      agentId: "agent-1",
      status: "running"
    };
    mocks.claimAgentTask.mockResolvedValue({
      claimed: false,
      claimedAt: new Date("2026-08-30T00:00:00.000Z"),
      attemptId: "attempt-1",
      workerId: "worker-1",
      leaseDurationMs: 60_000
    });
    mocks.findUnique.mockResolvedValue(runningTask);

    await expect(runAgentTask(runningTask.id)).resolves.toBe(runningTask);

    expect(mocks.createLLMProvider).not.toHaveBeenCalled();
  });

  it("resumes a persisted plan without asking the LLM to plan again", async () => {
    const persistedPlan = {
      intent: "chat_assist",
      confidence: 0.8,
      requiredTools: [],
      taskSteps: ["reply"],
      finalResponsePlan: "reply",
      finalResponseText: "继续执行。",
      toolInputs: {}
    };
    const task = {
      id: "task-2",
      createdAt: new Date("2026-08-30T00:00:00Z"),
      roomId: "room-1",
      agentId: "agent-1",
      requestedById: "user-1",
      status: "running",
      input: { normalizedContent: "continue" },
      plan: persistedPlan,
      agent: { systemPrompt: null }
    };
    const completedTask = { ...task, status: "completed" };
    mocks.claimAgentTask.mockResolvedValue({
      claimed: true,
      claimedAt: new Date("2026-08-30T00:00:00.000Z"),
      attemptId: "attempt-2",
      workerId: "worker-1",
      leaseDurationMs: 60_000
    });
    mocks.findUnique.mockResolvedValue(task);
    mocks.buildAgentContext.mockResolvedValue({
      recentMessages: [],
      memos: [],
      participants: [],
      roomContext: {
        room: { name: "Test", slug: "test" },
        requestedById: null,
        self: null,
        partner: null,
        participants: [],
        recentMessages: [],
        pinnedMemos: [],
        activeSchedules: [],
        semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
        summaries: { global: null, recent: [] }
      }
    });
    mocks.completeWithMessage.mockResolvedValue({
      id: "message-1",
      content: persistedPlan.finalResponseText,
      createdAt: new Date("2026-08-30T00:00:01.000Z")
    });
    mocks.beginAgentStep
      .mockResolvedValueOnce({
        step: { status: "completed", output: persistedPlan },
        resumed: true
      })
      .mockResolvedValueOnce({
        step: { status: "running", output: null },
        resumed: false
      });
    mocks.findUniqueOrThrow.mockResolvedValue(completedTask);

    await expect(runAgentTask(task.id)).resolves.toBe(completedTask);

    expect(mocks.createLLMProvider).not.toHaveBeenCalled();
    expect(mocks.updateTask).not.toHaveBeenCalled();
    expect(mocks.tracerEvent).toHaveBeenCalledWith("agent.plan.resumed", {
      intent: persistedPlan.intent,
      requiredTools: []
    });
  });
});

describe("runAgentTask semantic clarification", () => {
  const planner = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    mocks.claimAgentTask.mockResolvedValue({
      claimed: true,
      claimedAt: new Date("2026-09-13T00:00:00Z"),
      attemptId: "attempt-clarify",
      workerId: "test-worker",
      leaseDurationMs: 60_000
    });
    mocks.findUnique.mockResolvedValue({
      id: "task-clarify", roomId: "room-1", agentId: "agent-1", requestedById: null,
      createdAt: new Date("2026-09-13T00:00:00Z"),
      input: { normalizedContent: scheduleClarificationPrompt },
      plan: null, agent: { systemPrompt: null }
    });
    mocks.buildAgentContext.mockResolvedValue({
      recentMessages: [], memos: [],
      roomContext: { requestedById: null }
    });
    mocks.beginAgentStep.mockResolvedValue({ step: { status: "running", output: null }, resumed: false });
    mocks.reserveModelTurn.mockResolvedValue({ maxCompletionTokens: 1000 });
    mocks.createLLMProvider.mockReturnValue({ name: "test-planner", model: "test-model", plan: planner });
    mocks.completeWithMessage.mockImplementation(async (message) => ({
      ...message, id: "message-clarify", createdAt: new Date("2026-09-13T00:00:01Z")
    }));
  });

  it("asks for clarification after two cancel-only plans without confirming any unexecuted action", async () => {
    const invalidPlan = cancelOnlyPlan("job-1");
    planner.mockResolvedValue(invalidPlan);

    await runAgentTask("task-clarify");

    expect(planner).toHaveBeenCalledTimes(2);
    expect(planner.mock.calls[1][0].validationFeedback.previousPlan).toEqual(invalidPlan);
    expect(mocks.executeDurableToolStep).not.toHaveBeenCalled();
    expect(mocks.tracerEvent).toHaveBeenCalledWith("agent.plan.validation.fallback", expect.objectContaining({
      issueCodes: ["one_shot_promise_without_create"]
    }));
    expect(mocks.completeWithMessage).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringMatching(/(?:具体|确认).*(?:时间|什么时候|日期)/),
      metadata: expect.objectContaining({ intent: "clarify_schedule", toolResults: [] })
    }), expect.objectContaining({ toolResults: [] }));
    const reply = mocks.completeWithMessage.mock.calls[0][0].content;
    expect(reply).not.toMatch(/已经.*(?:取消|创建|更新|安排)|已(?:取消|创建|更新|安排)|帮你取消/);
    expect(reply).not.toBe(invalidPlan.finalResponseText);
    expect(mocks.failWithMessage).not.toHaveBeenCalled();
  });

  it("executes a valid one-shot repair after repeated recurring plans", async () => {
    planner.mockResolvedValue({
      ...cancelOnlyPlan("job-1"),
      requiredTools: ["schedule.create"],
      toolInputs: { "schedule.create": { cron: "0 20 * * *", timezone: "Asia/Shanghai", prompt: "提醒散步" } }
    });
    mocks.executeDurableToolStep.mockResolvedValue({ toolName: "schedule.create", output: { id: "job-new" } });

    await runAgentTask("task-clarify");

    expect(planner).toHaveBeenCalledTimes(2);
    expect(mocks.executeDurableToolStep).toHaveBeenCalledTimes(1);
    expect(mocks.executeDurableToolStep).toHaveBeenCalledWith(expect.objectContaining({
      toolName: "schedule.create", toolInput: expect.objectContaining({ runOnce: true })
    }));
    expect(mocks.completeWithMessage).toHaveBeenCalledOnce();
    expect(mocks.failWithMessage).not.toHaveBeenCalled();
  });

  it("preserves a normal zero-Tool reply without retrying or asking for clarification", async () => {
    mocks.findUnique.mockResolvedValue({
      id: "task-clarify", roomId: "room-1", agentId: "agent-1", requestedById: null,
      createdAt: new Date("2026-09-13T00:00:00Z"),
      input: { normalizedContent: "你好" }, plan: null, agent: { systemPrompt: null }
    });
    planner.mockResolvedValue({
      ...cancelOnlyPlan("job-1"), intent: "chat_assist", requiredTools: [], toolInputs: {}, finalResponseText: "你好。"
    });

    await runAgentTask("task-clarify");

    expect(planner).toHaveBeenCalledOnce();
    expect(mocks.executeDurableToolStep).not.toHaveBeenCalled();
    expect(mocks.completeWithMessage).toHaveBeenCalledWith(expect.objectContaining({ content: "你好。" }), expect.anything());
    expect(mocks.failWithMessage).not.toHaveBeenCalled();
  });
});
