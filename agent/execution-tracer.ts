import type {
  AgentTaskLimitReason,
  Prisma,
  PrismaClient
} from "@prisma/client";

import { withAgentTaskLease } from "@/agent/task-claim";
import type { AgentTaskLeaseOwnership } from "@/agent/types";
import { createAgentLogPost, buildAgentLogContent } from "@/lib/agent-posts";
import { appendChatLog } from "@/lib/chat-log-file";

export class ExecutionTracer {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly taskId: string,
    private readonly roomId: string,
    private readonly lease?: AgentTaskLeaseOwnership
  ) {}

  async event(type: string, payload?: unknown, actorUserId?: string | null) {
    return this.prisma.eventLog.create({
      data: {
        roomId: this.roomId,
        agentTaskId: this.taskId,
        actorUserId: actorUserId ?? undefined,
        type,
        payload: payload === undefined ? undefined : (payload as object)
      }
    });
  }

  async markRunning(claimedAt: Date) {
    await this.event("agent.task.running", {
      claimedAt,
      attemptId: this.lease?.attemptId,
      workerId: this.lease?.workerId
    });
  }

  async completeWithMessage(
    messageData: Prisma.MessageUncheckedCreateInput,
    result: unknown
  ) {
    if (!this.lease) {
      throw new Error("Agent task completion requires lease ownership.");
    }
    const finalMessage = await withAgentTaskLease(
      this.taskId,
      this.lease,
      async (tx) => {
        const message = await tx.message.create({ data: messageData });
        const finalStep = await tx.agentStep.updateMany({
          where: {
            taskId: this.taskId,
            stepKey: "final",
            kind: "final",
            status: "running"
          },
          data: {
            status: "completed",
            output: {
              finalMessageId: message.id,
              content: message.content
            },
            completedAt: new Date(),
            error: null,
            errorCategory: null
          }
        });
        if (finalStep.count !== 1) {
          throw new Error("Durable final step is not active and cannot complete.");
        }
        await tx.agentTask.update({
          where: { id: this.taskId },
          data: {
            status: "completed",
            completedAt: new Date(),
            finalMessageId: message.id,
            result: result as object,
            currentStepKey: null,
            workerId: null,
            heartbeatAt: null,
            leaseExpiresAt: null
          }
        });
        await tx.eventLog.create({
          data: {
            roomId: this.roomId,
            agentTaskId: this.taskId,
            type: "agent.task.completed",
            payload: {
              finalMessageId: message.id,
              attemptId: this.lease?.attemptId
            }
          }
        });
        return message;
      },
      this.prisma
    );

    // Auto-generate timeline entry for significant agent tasks
    try {
      const task = await this.prisma.agentTask.findUnique({
        where: { id: this.taskId },
        include: { agent: true, toolCalls: true },
      });
      if (task && task.toolCalls.length > 0) {
        const toolNames = task.toolCalls.map((tc) => tc.toolName).join(", ");
        await createAgentLogPost({
          title: `Agent: ${task.agent.displayName} — ${toolNames}`,
          content: buildAgentLogContent(task, result),
          roomId: this.roomId,
          metadata: {
            taskId: task.id,
            agentName: task.agent.displayName,
            status: "completed",
            toolCalls: task.toolCalls.map((tc) => ({
              name: tc.toolName,
              status: tc.status,
              durationMs: tc.durationMs,
            })),
          },
        });
      }
    } catch (e) {
      console.error("[agent-posts] failed to create timeline entry:", e);
    }
    return finalMessage;
  }

  async failWithMessage(
    messageData: Prisma.MessageUncheckedCreateInput,
    error: string
  ) {
    if (!this.lease) {
      throw new Error("Agent task failure requires lease ownership.");
    }
    return withAgentTaskLease(
      this.taskId,
      this.lease,
      async (tx) => {
        const finalMessage = await tx.message.create({ data: messageData });
        const task = await tx.agentTask.findUniqueOrThrow({
          where: { id: this.taskId },
          select: { currentStepKey: true }
        });
        if (task.currentStepKey) {
          await tx.agentStep.updateMany({
            where: {
              taskId: this.taskId,
              stepKey: task.currentStepKey,
              status: { not: "completed" }
            },
            data: {
              status: "failed",
              error,
              errorCategory: "runtime",
              completedAt: new Date()
            }
          });
        }
        await tx.agentTask.update({
          where: { id: this.taskId },
          data: {
            status: "failed",
            completedAt: new Date(),
            finalMessageId: finalMessage.id,
            error,
            currentStepKey: null,
            workerId: null,
            heartbeatAt: null,
            leaseExpiresAt: null
          }
        });
        await tx.eventLog.create({
          data: {
            roomId: this.roomId,
            agentTaskId: this.taskId,
            type: "agent.task.failed",
            payload: {
              error,
              finalMessageId: finalMessage.id,
              attemptId: this.lease?.attemptId
            }
          }
        });
        return finalMessage;
      },
      this.prisma
    );
  }

  async limitExceededWithMessage(
    messageData: Prisma.MessageUncheckedCreateInput,
    reason: AgentTaskLimitReason,
    details: Record<string, unknown>
  ) {
    if (!this.lease) {
      throw new Error("Agent task limit completion requires lease ownership.");
    }
    return withAgentTaskLease(
      this.taskId,
      this.lease,
      async (tx) => {
        const finalMessage = await tx.message.create({ data: messageData });
        const task = await tx.agentTask.findUniqueOrThrow({
          where: { id: this.taskId },
          select: { currentStepKey: true }
        });
        if (task.currentStepKey) {
          await tx.agentStep.updateMany({
            where: {
              taskId: this.taskId,
              stepKey: task.currentStepKey,
              status: { not: "completed" }
            },
            data: {
              status: "failed",
              error: `Runtime budget exceeded: ${reason}`,
              errorCategory: "limit",
              completedAt: new Date()
            }
          });
        }
        await tx.agentTask.update({
          where: { id: this.taskId },
          data: {
            status: "limit_exceeded",
            limitReason: reason,
            completedAt: new Date(),
            finalMessageId: finalMessage.id,
            error: `Runtime budget exceeded: ${reason}`,
            currentStepKey: null,
            workerId: null,
            heartbeatAt: null,
            leaseExpiresAt: null
          }
        });
        await tx.eventLog.create({
          data: {
            roomId: this.roomId,
            agentTaskId: this.taskId,
            type: "agent.task.limit_exceeded",
            payload: {
              reason,
              details,
              finalMessageId: finalMessage.id,
              attemptId: this.lease?.attemptId
            } as Prisma.InputJsonObject
          }
        });
        return finalMessage;
      },
      this.prisma
    );
  }

  async startToolCall(toolName: string, input: unknown) {
    const startedAt = new Date();
    const call = await this.prisma.toolCall.create({
      data: {
        taskId: this.taskId,
        toolName,
        input: input as object,
        status: "running",
        startedAt
      }
    });
    await this.event("agent.tool.started", { toolName, toolCallId: call.id });
    await appendChatLog(this.roomId, {
      kind: "tool.call",
      taskId: this.taskId,
      toolCallId: call.id,
      toolName,
      status: "running",
      input
    });
    return { id: call.id, startedAt };
  }

  async completeToolCall(toolCallId: string, startedAt: Date, output: unknown) {
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();
    await this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: {
        status: "completed",
        output: output as object,
        endedAt,
        durationMs
      }
    });
    await this.event("agent.tool.completed", { toolCallId });
    const tc = await this.prisma.toolCall.findUnique({ where: { id: toolCallId }, select: { toolName: true } });
    await appendChatLog(this.roomId, {
      kind: "tool.call",
      taskId: this.taskId,
      toolCallId,
      toolName: tc?.toolName ?? "",
      status: "completed",
      output,
      durationMs
    });
  }

  async failToolCall(
    toolCallId: string,
    startedAt: Date,
    error: string,
    errorCategory?: string
  ) {
    const endedAt = new Date();
    const durationMs = endedAt.getTime() - startedAt.getTime();
    await this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: {
        status: "failed",
        error,
        endedAt,
        durationMs
      }
    });
    await this.event("agent.tool.failed", { toolCallId, error, errorCategory });
    const tc = await this.prisma.toolCall.findUnique({ where: { id: toolCallId }, select: { toolName: true } });
    await appendChatLog(this.roomId, {
      kind: "tool.call",
      taskId: this.taskId,
      toolCallId,
      toolName: tc?.toolName ?? "",
      status: "failed",
      error,
      durationMs
    });
  }
}
