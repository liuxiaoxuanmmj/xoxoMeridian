import { Prisma } from "@prisma/client";

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
import { prisma } from "@/lib/prisma";

type ToolExecutionOptions = {
  stepKey: string;
};

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }

    this.tools.set(tool.name, tool);
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

  async execute(
    name: string,
    input: unknown,
    context: ToolExecutionContext,
    options: ToolExecutionOptions
  ): Promise<ToolResult> {
    const tool = this.get(name);
    await requireToolApproval({
      toolName: tool.name,
      risk: tool.risk,
      toolInput: input,
      stepKey: options.stepKey,
      context
    });
    if (tool.effect === "database-write") {
      return this.executeDatabaseWrite(tool, input, context, options.stepKey);
    }

    const call = await context.tracer.startToolCall(tool.name, input);

    try {
      const output = await tool.execute(input, context);
      await context.tracer.completeToolCall(call.id, call.startedAt, output);
      return {
        toolName: tool.name,
        output
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Tool execution failed";
      await context.tracer.failToolCall(call.id, call.startedAt, message);
      throw error;
    }
  }

  private async executeDatabaseWrite(
    tool: AgentTool,
    input: unknown,
    context: ToolExecutionContext,
    stepKey: string
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
            output: existing.output,
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

        const output = await tool.execute(input, {
          ...context,
          prisma: tx
        });
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
  const message = input.error instanceof Error ? input.error.message : "Tool execution failed";
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
      error: message
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
