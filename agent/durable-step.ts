import {
  Prisma,
  type AgentStepKind,
  type AgentStepStatus
} from "@prisma/client";

import {
  AgentTaskLeaseLostError,
  withAgentTaskLease
} from "@/agent/task-claim";
import { ToolApprovalRequiredError } from "@/agent/tool-approval";
import { ToolExecutionError } from "@/agent/tool-errors";
import type { ToolRegistry } from "@/agent/tool-registry";
import type {
  AgentTaskLeaseOwnership,
  ToolExecutionContext,
  ToolResult
} from "@/agent/types";

export class AgentStepConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentStepConflictError";
  }
}

export async function beginAgentStep(input: {
  taskId: string;
  roomId: string;
  lease: AgentTaskLeaseOwnership;
  stepKey: string;
  kind: AgentStepKind;
  stepInput?: unknown;
}) {
  const normalizedInput = normalizeJson(input.stepInput);
  return withAgentTaskLease(input.taskId, input.lease, async (tx) => {
    const existing = await tx.agentStep.findUnique({
      where: {
        taskId_stepKey: {
          taskId: input.taskId,
          stepKey: input.stepKey
        }
      }
    });
    if (existing && (
      existing.kind !== input.kind
      || stableJson(existing.input) !== stableJson(normalizedInput)
    )) {
      throw new AgentStepConflictError(
        `Durable step ${input.stepKey} does not match its persisted kind or input.`
      );
    }
    if (existing?.status === "completed") {
      return { step: existing, resumed: true };
    }

    const startedAt = new Date();
    const step = existing
      ? await tx.agentStep.update({
          where: { id: existing.id },
          data: {
            status: "running",
            attemptCount: { increment: 1 },
            startedAt,
            completedAt: null,
            error: null,
            errorCategory: null
          }
        })
      : await tx.agentStep.create({
          data: {
            taskId: input.taskId,
            stepKey: input.stepKey,
            kind: input.kind,
            status: "running",
            input: normalizedInput,
            attemptCount: 1,
            startedAt
          }
        });
    await tx.agentTask.update({
      where: { id: input.taskId },
      data: { currentStepKey: input.stepKey }
    });
    await tx.eventLog.create({
      data: {
        roomId: input.roomId,
        agentTaskId: input.taskId,
        type: existing ? "agent.step.resumed" : "agent.step.started",
        payload: {
          stepKey: input.stepKey,
          kind: input.kind,
          attemptCount: step.attemptCount,
          attemptId: input.lease.attemptId
        }
      }
    });
    return { step, resumed: Boolean(existing) };
  });
}

export async function completeAgentStep(input: {
  taskId: string;
  roomId: string;
  lease: AgentTaskLeaseOwnership;
  stepKey: string;
  output?: unknown;
  taskData?: Prisma.AgentTaskUpdateInput;
}) {
  const output = normalizeJson(input.output);
  return withAgentTaskLease(input.taskId, input.lease, async (tx) => {
    const completedAt = new Date();
    const updated = await tx.agentStep.updateMany({
      where: {
        taskId: input.taskId,
        stepKey: input.stepKey,
        status: { in: ["pending", "running"] }
      },
      data: {
        status: "completed",
        output,
        error: null,
        errorCategory: null,
        completedAt
      }
    });
    if (updated.count !== 1) {
      throw new AgentStepConflictError(
        `Durable step ${input.stepKey} is not active and cannot complete.`
      );
    }
    await tx.agentTask.update({
      where: { id: input.taskId },
      data: {
        ...input.taskData,
        currentStepKey: null
      }
    });
    await tx.eventLog.create({
      data: {
        roomId: input.roomId,
        agentTaskId: input.taskId,
        type: "agent.step.completed",
        payload: {
          stepKey: input.stepKey,
          attemptId: input.lease.attemptId
        }
      }
    });
    return tx.agentStep.findUniqueOrThrow({
      where: {
        taskId_stepKey: {
          taskId: input.taskId,
          stepKey: input.stepKey
        }
      }
    });
  });
}

export async function failAgentStep(input: {
  taskId: string;
  roomId: string;
  lease: AgentTaskLeaseOwnership;
  stepKey: string;
  error: unknown;
}) {
  if (input.error instanceof AgentTaskLeaseLostError) throw input.error;
  const error = input.error instanceof Error ? input.error.message : "Agent step failed.";
  const errorCategory = input.error instanceof ToolExecutionError
    ? input.error.category
    : "runtime";

  return withAgentTaskLease(input.taskId, input.lease, async (tx) => {
    const updated = await tx.agentStep.updateMany({
      where: {
        taskId: input.taskId,
        stepKey: input.stepKey,
        status: { not: "completed" }
      },
      data: {
        status: "failed",
        error,
        errorCategory,
        completedAt: new Date()
      }
    });
    if (updated.count !== 1) return null;
    await tx.agentTask.update({
      where: { id: input.taskId },
      data: { currentStepKey: null }
    });
    await tx.eventLog.create({
      data: {
        roomId: input.roomId,
        agentTaskId: input.taskId,
        type: "agent.step.failed",
        payload: {
          stepKey: input.stepKey,
          error,
          errorCategory,
          attemptId: input.lease.attemptId
        }
      }
    });
    return tx.agentStep.findUnique({
      where: {
        taskId_stepKey: {
          taskId: input.taskId,
          stepKey: input.stepKey
        }
      }
    });
  });
}

export async function executeDurableToolStep(input: {
  registry: ToolRegistry;
  toolName: string;
  toolInput: unknown;
  stepKey: string;
  context: ToolExecutionContext & { lease: AgentTaskLeaseOwnership };
}): Promise<ToolResult> {
  const checkpoint = await beginAgentStep({
    taskId: input.context.taskId,
    roomId: input.context.roomId,
    lease: input.context.lease,
    stepKey: input.stepKey,
    kind: "tool",
    stepInput: {
      toolName: input.toolName,
      input: input.toolInput
    }
  });
  if (checkpoint.step.status === "completed") {
    const persisted = readToolStepOutput(checkpoint.step.output, input.toolName);
    return {
      toolName: input.toolName,
      output: input.registry.validateOutput(input.toolName, persisted)
    };
  }

  try {
    const result = await input.registry.execute(
      input.toolName,
      input.toolInput,
      input.context,
      { stepKey: input.stepKey }
    );
    await completeAgentStep({
      taskId: input.context.taskId,
      roomId: input.context.roomId,
      lease: input.context.lease,
      stepKey: input.stepKey,
      output: result
    });
    return result;
  } catch (error) {
    if (error instanceof ToolApprovalRequiredError) throw error;
    await failAgentStep({
      taskId: input.context.taskId,
      roomId: input.context.roomId,
      lease: input.context.lease,
      stepKey: input.stepKey,
      error
    });
    throw error;
  }
}

export function readStepOutput<T>(
  value: unknown,
  guard: (value: unknown) => value is T,
  stepKey: string
) {
  if (!guard(value)) {
    throw new AgentStepConflictError(
      `Durable step ${stepKey} has an invalid persisted output.`
    );
  }
  return value;
}

function readToolStepOutput(value: unknown, toolName: string) {
  if (
    typeof value !== "object"
    || value === null
    || (value as { toolName?: unknown }).toolName !== toolName
    || !("output" in value)
  ) {
    throw new AgentStepConflictError(
      `Durable Tool step has an invalid persisted output for ${toolName}.`
    );
  }
  return (value as { output: unknown }).output;
}

function normalizeJson(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === undefined || value === null) return Prisma.JsonNull;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

export type DurableStepSnapshot = {
  stepKey: string;
  kind: AgentStepKind;
  status: AgentStepStatus;
  output: Prisma.JsonValue | null;
};
