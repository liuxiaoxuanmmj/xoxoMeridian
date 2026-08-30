import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  claimAgentTask: vi.fn(),
  buildAgentContext: vi.fn(),
  createLLMProvider: vi.fn(),
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  updateTask: vi.fn(),
  createMessage: vi.fn(),
  markRunning: vi.fn(),
  markCompleted: vi.fn(),
  tracerEvent: vi.fn()
}));

vi.mock("@/agent/task-claim", () => ({
  claimAgentTask: mocks.claimAgentTask
}));

vi.mock("@/agent/llm-provider", () => ({
  createLLMProvider: mocks.createLLMProvider
}));

vi.mock("@/agent/context-builder", () => ({
  buildAgentContext: mocks.buildAgentContext
}));

vi.mock("@/agent/execution-tracer", () => ({
  ExecutionTracer: class {
    event = mocks.tracerEvent;
    markRunning = mocks.markRunning;
    markCompleted = mocks.markCompleted;
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
      claimedAt: new Date("2026-08-30T00:00:00.000Z")
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
      claimedAt: new Date("2026-08-30T00:00:00.000Z")
    });
    mocks.findUnique.mockResolvedValue(task);
    mocks.buildAgentContext.mockResolvedValue({
      recentMessages: [],
      memos: [],
      participants: [],
      roomContext: {
        room: { name: "Test", slug: "test" },
        participants: [],
        recentMessages: [],
        pinnedMemos: [],
        activeSchedules: [],
        semanticMemory: { aboutHer: [], aboutMe: [], shared: [] },
        summaries: { global: null, recent: [] }
      }
    });
    mocks.createMessage.mockResolvedValue({
      id: "message-1",
      content: persistedPlan.finalResponseText,
      createdAt: new Date("2026-08-30T00:00:01.000Z")
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
