import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import {
  NO_TOOL_RETRY,
  ToolTimeoutError,
  TRANSIENT_TOOL_RETRY
} from "@/agent/tool-errors";
import { ToolRegistry } from "@/agent/tool-registry";
import type { AgentTool, ToolExecutionContext } from "@/agent/types";

const tracer = {
  event: vi.fn(),
  startToolCall: vi.fn(),
  completeToolCall: vi.fn(),
  failToolCall: vi.fn()
};

const context = {
  prisma: {},
  taskId: "task-1",
  roomId: "room-1",
  agentId: "agent-1",
  requestedById: null,
  runtimeContext: {},
  tracer
} as unknown as ToolExecutionContext;

describe("ToolRegistry reliability policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let callId = 0;
    tracer.startToolCall.mockImplementation(async () => ({
      id: `call-${++callId}`,
      startedAt: new Date()
    }));
  });

  it("aborts every Tool through the Executor deadline and classifies timeout", async () => {
    const registry = new ToolRegistry({ defaultTimeoutMs: 20 });
    let receivedSignal: AbortSignal | undefined;
    registry.register(createTestTool({
      retry: NO_TOOL_RETRY,
      execute: async (_input, toolContext) => {
        receivedSignal = toolContext.signal;
        return new Promise((_resolve, reject) => {
          toolContext.signal?.addEventListener("abort", () => {
            reject(toolContext.signal?.reason);
          }, { once: true });
        });
      }
    }));

    await expect(registry.execute("test.reliability", {}, context, {
      stepKey: "tool:1"
    })).rejects.toBeInstanceOf(ToolTimeoutError);

    expect(receivedSignal?.aborted).toBe(true);
    expect(tracer.failToolCall).toHaveBeenCalledWith(
      "call-1",
      expect.any(Date),
      "Tool test.reliability timed out after 20ms.",
      "timeout"
    );
  });

  it("retries a transient failure with bounded backoff and then succeeds", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const registry = new ToolRegistry({ defaultTimeoutMs: 100, sleep });
    const execute = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error("connection reset"), {
        code: "ECONNRESET"
      }))
      .mockResolvedValueOnce({ ok: true });
    registry.register(createTestTool({
      retry: TRANSIENT_TOOL_RETRY,
      execute
    }));

    await expect(registry.execute("test.reliability", {}, context, {
      stepKey: "tool:1"
    })).resolves.toEqual({
      toolName: "test.reliability",
      output: { ok: true }
    });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(100);
    expect(tracer.event).toHaveBeenCalledWith("agent.tool.retry.scheduled", {
      toolName: "test.reliability",
      stepKey: "tool:1",
      attempt: 1,
      nextAttempt: 2,
      delayMs: 100,
      errorCategory: "network",
      error: "connection reset"
    });
  });

  it("does not retry a non-retryable Tool failure", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(new Error("invalid business input"));
    const registry = new ToolRegistry({ defaultTimeoutMs: 100, sleep });
    registry.register(createTestTool({ retry: TRANSIENT_TOOL_RETRY, execute }));

    await expect(registry.execute("test.reliability", {}, context, {
      stepKey: "tool:1"
    })).rejects.toMatchObject({
      category: "tool",
      retryable: false,
      message: "invalid business input"
    });
    expect(execute).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("stops after the declared maximum number of transient attempts", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockRejectedValue(new ToolTimeoutError("upstream", 10));
    const registry = new ToolRegistry({ defaultTimeoutMs: 100, sleep });
    registry.register(createTestTool({ retry: TRANSIENT_TOOL_RETRY, execute }));

    await expect(registry.execute("test.reliability", {}, context, {
      stepKey: "tool:1"
    })).rejects.toMatchObject({ category: "timeout" });
    expect(execute).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenNthCalledWith(1, 100);
    expect(sleep).toHaveBeenNthCalledWith(2, 200);
  });

  it("rejects invalid input before permission checks or Tool execution", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const registry = new ToolRegistry({ defaultTimeoutMs: 100 });
    registry.register(createTestTool({
      inputSchema: z.object({ query: z.string().min(1) }).strict(),
      execute
    }));

    await expect(registry.execute("test.reliability", {
      query: "",
      secretPayload: "must-not-appear-in-trace"
    }, context, { stepKey: "tool:1" })).rejects.toMatchObject({
      category: "validation",
      direction: "input",
      retryable: false
    });

    expect(execute).not.toHaveBeenCalled();
    expect(tracer.startToolCall).not.toHaveBeenCalled();
    expect(tracer.event).toHaveBeenCalledWith("agent.tool.validation.failed", {
      toolName: "test.reliability",
      stepKey: "tool:1",
      direction: "input",
      issues: expect.any(Array)
    });
    expect(JSON.stringify(tracer.event.mock.calls)).not.toContain("must-not-appear-in-trace");
  });

  it("rejects invalid output before completion and never retries Validation errors", async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const execute = vi.fn().mockResolvedValue({ ok: "not-a-boolean" });
    const registry = new ToolRegistry({ defaultTimeoutMs: 100, sleep });
    registry.register(createTestTool({ retry: TRANSIENT_TOOL_RETRY, execute }));

    await expect(registry.execute("test.reliability", {}, context, {
      stepKey: "tool:1"
    })).rejects.toMatchObject({
      category: "validation",
      direction: "output",
      retryable: false
    });

    expect(execute).toHaveBeenCalledTimes(1);
    expect(tracer.completeToolCall).not.toHaveBeenCalled();
    expect(tracer.failToolCall).toHaveBeenCalledWith(
      "call-1",
      expect.any(Date),
      expect.stringContaining("output validation failed"),
      "validation"
    );
    expect(sleep).not.toHaveBeenCalled();
  });
});

function createTestTool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    name: "test.reliability",
    description: "Reliability behavior test Tool",
    schema: { type: "object" },
    risk: "low",
    retry: NO_TOOL_RETRY,
    inputSchema: z.object({}).strict(),
    outputSchema: z.object({ ok: z.boolean() }),
    async execute() {
      return { ok: true };
    },
    ...overrides
  };
}
