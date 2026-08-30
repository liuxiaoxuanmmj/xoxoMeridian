import { Prisma, type AgentToolApprovalStatus } from "@prisma/client";

import type { ToolExecutionContext, ToolRisk } from "@/agent/types";
import { prisma } from "@/lib/prisma";

export type ToolApprovalDecision = "approve" | "reject";

export class ToolApprovalRequiredError extends Error {
  constructor(
    readonly approvalId: string,
    readonly taskId: string
  ) {
    super("High-risk Tool requires human approval.");
    this.name = "ToolApprovalRequiredError";
  }
}

export class ToolApprovalNotFoundError extends Error {}

export class ToolApprovalConflictError extends Error {}

export async function requireToolApproval(input: {
  toolName: string;
  risk: ToolRisk;
  toolInput: unknown;
  stepKey: string;
  context: ToolExecutionContext;
}) {
  if (input.risk !== "high") return;

  const existing = await prisma.agentToolApproval.findUnique({
    where: {
      taskId_stepKey: {
        taskId: input.context.taskId,
        stepKey: input.stepKey
      }
    }
  });

  if (existing && !matchesApprovalRequest(existing, input)) {
    throw new ToolApprovalConflictError(
      "Persisted approval does not match the requested Tool or input."
    );
  }
  if (existing?.status === "approved") return;
  if (existing?.status === "rejected") {
    throw new ToolApprovalConflictError("This Tool request was rejected.");
  }

  const approval = await prisma.$transaction(async (tx) => {
    const requested = existing ?? await tx.agentToolApproval.create({
      data: {
        taskId: input.context.taskId,
        stepKey: input.stepKey,
        toolName: input.toolName,
        risk: input.risk,
        input: toJsonInput(input.toolInput)
      }
    });
    const taskUpdate = await tx.agentTask.updateMany({
      where: {
        id: input.context.taskId,
        status: { in: ["running", "waiting_approval"] }
      },
      data: { status: "waiting_approval" }
    });
    if (taskUpdate.count !== 1) {
      throw new ToolApprovalConflictError("Task is not running or waiting for approval.");
    }
    if (!existing) {
      await tx.eventLog.create({
        data: {
          roomId: input.context.roomId,
          agentTaskId: input.context.taskId,
          type: "agent.tool.approval.requested",
          payload: {
            approvalId: requested.id,
            stepKey: input.stepKey,
            toolName: input.toolName,
            risk: input.risk
          }
        }
      });
    }
    return requested;
  });

  throw new ToolApprovalRequiredError(approval.id, input.context.taskId);
}

export async function decideToolApproval(input: {
  taskId: string;
  approvalId: string;
  decision: ToolApprovalDecision;
  decidedById: string;
}) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.agentTask.findUnique({
      where: { id: input.taskId },
      select: { id: true, roomId: true }
    });
    if (!task) {
      throw new ToolApprovalNotFoundError("Agent task not found.");
    }
    const approval = await tx.agentToolApproval.findUnique({
      where: { id: input.approvalId }
    });
    if (!approval || approval.taskId !== input.taskId) {
      throw new ToolApprovalNotFoundError("Tool approval not found for this task.");
    }

    const nextStatus: AgentToolApprovalStatus = input.decision === "approve"
      ? "approved"
      : "rejected";
    const approvalUpdate = await tx.agentToolApproval.updateMany({
      where: {
        id: input.approvalId,
        taskId: input.taskId,
        status: "pending"
      },
      data: {
        status: nextStatus,
        decidedById: input.decidedById,
        decidedAt: new Date()
      }
    });
    if (approvalUpdate.count !== 1) {
      throw new ToolApprovalConflictError("Tool approval has already been decided.");
    }

    const taskStatus = input.decision === "approve" ? "pending" : "cancelled";
    const taskUpdate = await tx.agentTask.updateMany({
      where: {
        id: input.taskId,
        status: "waiting_approval"
      },
      data: {
        status: taskStatus,
        completedAt: input.decision === "reject" ? new Date() : null,
        error: input.decision === "reject" ? "High-risk Tool request rejected by user." : null
      }
    });
    if (taskUpdate.count !== 1) {
      throw new ToolApprovalConflictError("Task is no longer waiting for this approval.");
    }

    await tx.eventLog.create({
      data: {
        roomId: task.roomId,
        actorUserId: input.decidedById,
        agentTaskId: input.taskId,
        type: input.decision === "approve"
          ? "agent.tool.approval.approved"
          : "agent.tool.approval.rejected",
        payload: {
          approvalId: approval.id,
          stepKey: approval.stepKey,
          toolName: approval.toolName
        }
      }
    });

    return {
      approval: await tx.agentToolApproval.findUniqueOrThrow({
        where: { id: approval.id }
      }),
      task: await tx.agentTask.findUniqueOrThrow({
        where: { id: input.taskId }
      })
    };
  });
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function matchesApprovalRequest(
  approval: {
    toolName: string;
    risk: ToolRisk;
    input: Prisma.JsonValue;
  },
  request: {
    toolName: string;
    risk: ToolRisk;
    toolInput: unknown;
  }
) {
  return approval.toolName === request.toolName
    && approval.risk === request.risk
    && stableJson(approval.input) === stableJson(request.toolInput);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(",")}]`;
  }
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}
