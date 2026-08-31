import { Prisma } from "@prisma/client";
import { z } from "zod";

import {
  AgentTaskLeaseLostError,
  assertAgentTaskLease,
  renewAgentTaskLease
} from "@/agent/task-claim";
import { getBuiltInToolContract } from "@/agent/tool-contracts";
import {
  classifyToolError,
  ToolTimeoutError,
  ToolValidationError
} from "@/agent/tool-errors";
import type { AgentTool, ToolExecutionContext, ToolResult } from "@/agent/types";
import { createMemoDeleteTool, createMemoListTool, createMemoTool, createMemoUpdateTool } from "@/agent/tools/memo-tool";
import { createMemorySetTool, createMemoryRecallTool } from "@/agent/tools/memory-tool";

import {
  createScheduleCancelTool,
  createScheduleCreateTool,
  createScheduleListTool,
  createScheduleUpdateTool
} from "@/agent/tools/schedule-tool";
import { createSearchTool } from "@/agent/tools/search-tool";
import { createTimezoneTool } from "@/agent/tools/timezone-tool";
import { createWeatherTool } from "@/agent/tools/weather-tool";
import { requireToolApproval } from "@/agent/tool-approval";
import { appendChatLog } from "@/lib/chat-log-file";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";

type ToolExecutionOptions = {
  stepKey: string;
};

export type ToolRegistryOptions = {
  defaultTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

type RegisteredAgentTool = AgentTool & {
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
};

export class ToolRegistry {
  private readonly tools = new Map<string, RegisteredAgentTool>();

  constructor(private readonly options: ToolRegistryOptions = {}) {}

  register(tool: AgentTool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    if (!Number.isInteger(tool.retry.maxAttempts) || tool.retry.maxAttempts < 1) {
      throw new Error(`Tool ${tool.name} must declare retry.maxAttempts >= 1.`);
    }
    if (tool.retry.backoffMs < 0) {
      throw new Error(`Tool ${tool.name} must declare retry.backoffMs >= 0.`);
    }

    const builtInContract = getBuiltInToolContract(tool.name);
    const inputSchema = tool.inputSchema ?? builtInContract?.inputSchema;
    const outputSchema = tool.outputSchema ?? builtInContract?.outputSchema;
    if (!inputSchema || !outputSchema) {
      throw new Error(`Tool ${tool.name} must declare Zod inputSchema and outputSchema.`);
    }

    this.tools.set(tool.name, {
      ...tool,
      schema: z.toJSONSchema(inputSchema),
      inputSchema,
      outputSchema
    });
  }

  list() {
    return Array.from(this.tools.values());
  }

  get(name: string) {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool is not registered or allowed: ${name}`);
    }

    return tool;
  }

  validateOutput(name: string, output: unknown) {
    return validateToolOutput(this.get(name), output);
  }

  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
    options: ToolExecutionOptions
  ): Promise<ToolResult> {
    const tool = this.get(name);
    const parsedInput = tool.inputSchema.safeParse(input);
    if (!parsedInput.success) {
      const validationError = createValidationError(tool.name, "input", parsedInput.error);
      await context.tracer.event("agent.tool.validation.failed", {
        toolName: tool.name,
        stepKey: options.stepKey,
        direction: validationError.direction,
        issues: validationError.issues
      });
      throw validationError;
    }
    const validatedInput = parsedInput.data;
    await requireToolApproval({
      toolName: tool.name,
      risk: tool.risk,
      toolInput: validatedInput,
      stepKey: options.stepKey,
      context
    });

    const timeoutMs = this.options.defaultTimeoutMs ?? env.AGENT_TOOL_TIMEOUT_MS;
    for (let attempt = 1; attempt <= tool.retry.maxAttempts; attempt += 1) {
      try {
        if (tool.effect === "database-write") {
          return await this.executeDatabaseWrite(
            tool,
            validatedInput,
            context,
            options.stepKey,
            timeoutMs
          );
        }
        return await this.executeNonWrite(tool, validatedInput, context, timeoutMs);
      } catch (error) {
        if (error instanceof AgentTaskLeaseLostError) throw error;
        const classified = classifyToolError(error);
        const retryable = classified.retryable
          && tool.retry.retryOn.includes(classified.category)
          && attempt < tool.retry.maxAttempts;
        if (!retryable) throw classified;

        const delayMs = tool.retry.backoffMs * 2 ** (attempt - 1);
        await context.tracer.event("agent.tool.retry.scheduled", {
          toolName: tool.name,
          stepKey: options.stepKey,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          errorCategory: classified.category,
          error: classified.message
        });
        await (this.options.sleep ?? sleep)(delayMs);
      }
    }

    throw new Error(`Tool retry loop exited unexpectedly: ${tool.name}`);
  }

  private async executeNonWrite(
    tool: RegisteredAgentTool,
    input: unknown,
    context: ToolExecutionContext,
    timeoutMs: number
  ): Promise<ToolResult> {
    if (context.lease) {
      await assertAgentTaskLease(context.taskId, context.lease);
    }
    const call = await context.tracer.startToolCall(tool.name, input);

    try {
      const output = validateToolOutput(
        tool,
        await runToolWithDeadline(tool, input, context, timeoutMs)
      );
      if (context.lease) {
        await assertAgentTaskLease(context.taskId, context.lease);
      }
      await context.tracer.completeToolCall(call.id, call.startedAt, output);
      return {
        toolName: tool.name,
        output
      };
    } catch (error) {
      if (error instanceof AgentTaskLeaseLostError) throw error;
      const classified = classifyToolError(error);
      await context.tracer.failToolCall(
        call.id,
        call.startedAt,
        classified.message,
        classified.category
      );
      throw error;
    }
  }

  private async executeDatabaseWrite(
    tool: RegisteredAgentTool,
    input: unknown,
    context: ToolExecutionContext,
    stepKey: string,
    timeoutMs: number
  ): Promise<ToolResult> {
    const startedAt = new Date();
    let committed: {
      toolCallId: string;
      output: unknown;
      durationMs: number;
      replayed: boolean;
    };

    try {
      committed = await prisma.$transaction(async (tx) => {
        if (context.lease) {
          const lease = await renewAgentTaskLease(context.taskId, context.lease, tx);
          if (!lease.renewed) {
            throw new AgentTaskLeaseLostError(
              context.taskId,
              context.lease.attemptId
            );
          }
        }
        const existing = await tx.toolCall.findUnique({
          where: {
            taskId_stepKey: {
              taskId: context.taskId,
              stepKey
            }
          }
        });

        if (existing?.status === "completed") {
          return {
            toolCallId: existing.id,
            output: validateToolOutput(tool, existing.output),
            durationMs: existing.durationMs ?? 0,
            replayed: true
          };
        }

        const call = existing
          ? await tx.toolCall.update({
              where: { id: existing.id },
              data: {
                toolName: tool.name,
                input: toJsonInput(input),
                output: Prisma.DbNull,
                status: "running",
                startedAt,
                endedAt: null,
                durationMs: null,
                error: null
              }
            })
          : await tx.toolCall.create({
              data: {
                taskId: context.taskId,
                stepKey,
                toolName: tool.name,
                input: toJsonInput(input),
                status: "running",
                startedAt
              }
            });

        await tx.eventLog.create({
          data: {
            roomId: context.roomId,
            agentTaskId: context.taskId,
            type: "agent.tool.started",
            payload: { toolName: tool.name, toolCallId: call.id, stepKey }
          }
        });

        const output = validateToolOutput(
          tool,
          await runToolWithDeadline(
            tool,
            input,
            { ...context, prisma: tx },
            timeoutMs
          )
        );
        const endedAt = new Date();
        const durationMs = endedAt.getTime() - startedAt.getTime();

        await tx.toolCall.update({
          where: { id: call.id },
          data: {
            status: "completed",
            output: toJsonInput(output),
            endedAt,
            durationMs
          }
        });
        await tx.eventLog.create({
          data: {
            roomId: context.roomId,
            agentTaskId: context.taskId,
            type: "agent.tool.completed",
            payload: { toolCallId: call.id, stepKey }
          }
        });

        return {
          toolCallId: call.id,
          output,
          durationMs,
          replayed: false
        };
      }, {
        maxWait: timeoutMs,
        timeout: timeoutMs
      });
    } catch (error) {
      await recordFailedDatabaseWrite({
        context,
        toolName: tool.name,
        input,
        stepKey,
        startedAt,
        error
      });
      throw error;
    }

    if (committed.replayed) {
      await context.tracer.event("agent.tool.replayed", {
        toolName: tool.name,
        toolCallId: committed.toolCallId,
        stepKey
      });
    }

    await appendCommittedToolLog({
      context,
      toolCallId: committed.toolCallId,
      toolName: tool.name,
      input,
      output: committed.output,
      durationMs: committed.durationMs,
      replayed: committed.replayed
    });

    return {
      toolName: tool.name,
      output: committed.output
    };
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

async function appendCommittedToolLog(input: {
  context: ToolExecutionContext;
  toolCallId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  durationMs: number;
  replayed: boolean;
}) {
  if (!input.replayed) {
    await appendChatLog(input.context.roomId, {
      kind: "tool.call",
      taskId: input.context.taskId,
      toolCallId: input.toolCallId,
      toolName: input.toolName,
      status: "running",
      input: input.input
    });
  }
  await appendChatLog(input.context.roomId, {
    kind: "tool.call",
    taskId: input.context.taskId,
    toolCallId: input.toolCallId,
    toolName: input.toolName,
    status: "completed",
    output: input.output,
    durationMs: input.durationMs
  });
}

async function recordFailedDatabaseWrite(input: {
  context: ToolExecutionContext;
  toolName: string;
  input: unknown;
  stepKey: string;
  startedAt: Date;
  error: unknown;
}) {
  if (input.error instanceof AgentTaskLeaseLostError) return;
  if (input.context.lease) {
    try {
      await assertAgentTaskLease(input.context.taskId, input.context.lease);
    } catch (error) {
      if (error instanceof AgentTaskLeaseLostError) return;
      throw error;
    }
  }
  const classified = classifyToolError(input.error);
  const message = classified.message;
  const endedAt = new Date();
  const durationMs = endedAt.getTime() - input.startedAt.getTime();

  try {
    const call = await prisma.toolCall.upsert({
      where: {
        taskId_stepKey: {
          taskId: input.context.taskId,
          stepKey: input.stepKey
        }
      },
      create: {
        taskId: input.context.taskId,
        stepKey: input.stepKey,
        toolName: input.toolName,
        input: toJsonInput(input.input),
        status: "failed",
        startedAt: input.startedAt,
        endedAt,
        durationMs,
        error: message
      },
      update: {
        toolName: input.toolName,
        input: toJsonInput(input.input),
        output: Prisma.DbNull,
        status: "failed",
        endedAt,
        durationMs,
        error: message
      }
    });
    await input.context.tracer.event("agent.tool.failed", {
      toolCallId: call.id,
      stepKey: input.stepKey,
      error: message,
      errorCategory: classified.category
    });
    await appendChatLog(input.context.roomId, {
      kind: "tool.call",
      taskId: input.context.taskId,
      toolCallId: call.id,
      toolName: input.toolName,
      status: "failed",
      error: message,
      durationMs
    });
  } catch (traceError) {
    console.error("[agent-runtime] failed to persist database Tool failure", traceError);
  }
}

async function runToolWithDeadline(
  tool: AgentTool,
  input: unknown,
  context: ToolExecutionContext,
  timeoutMs: number
) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(context.signal?.reason);
  if (context.signal?.aborted) {
    forwardAbort();
  } else {
    context.signal?.addEventListener("abort", forwardAbort, { once: true });
  }

  const timeoutError = new ToolTimeoutError(tool.name, timeoutMs);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      controller.abort(timeoutError);
      reject(timeoutError);
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      tool.execute(input, { ...context, signal: controller.signal }),
      timeout
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    context.signal?.removeEventListener("abort", forwardAbort);
  }
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function validateToolOutput(tool: RegisteredAgentTool, output: unknown) {
  const result = tool.outputSchema.safeParse(output);
  if (!result.success) {
    throw createValidationError(tool.name, "output", result.error);
  }
  return result.data;
}

function createValidationError(
  toolName: string,
  direction: "input" | "output",
  error: z.ZodError
) {
  return new ToolValidationError(
    toolName,
    direction,
    error.issues.map((issue) => ({
      path: issue.path.map(String).join("."),
      code: issue.code,
      message: issue.message
    }))
  );
}

export function createToolRegistry() {
  const registry = new ToolRegistry();
  registry.register(createWeatherTool());
  registry.register(createTimezoneTool());
  registry.register(createSearchTool());
  registry.register(createMemoListTool());
  registry.register(createMemoTool());
  registry.register(createMemoUpdateTool());
  registry.register(createMemoDeleteTool());

  registry.register(createScheduleCreateTool());
  registry.register(createScheduleListTool());
  registry.register(createScheduleCancelTool());
  registry.register(createScheduleUpdateTool());
  registry.register(createMemorySetTool());
  registry.register(createMemoryRecallTool());
  return registry;
}
