import type { PrismaClient } from "@prisma/client";

import { createAgentLogPost, buildAgentLogContent } from "@/lib/agent-posts";
import { appendChatLog } from "@/lib/chat-log-file";

export class ExecutionTracer {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly taskId: string,
    private readonly roomId: string
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

  async markRunning() {
    await this.prisma.agentTask.update({
      where: { id: this.taskId },
      data: {
        status: "running",
        startedAt: new Date()
      }
    });
    await this.event("agent.task.running");
  }

  async markCompleted(finalMessageId: string, result: unknown) {
    await this.prisma.agentTask.update({
      where: { id: this.taskId },
      data: {
        status: "completed",
        completedAt: new Date(),
        finalMessageId,
        result: result as object
      }
    });
    await this.event("agent.task.completed", { finalMessageId });

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
  }

  async markFailed(error: string, finalMessageId?: string) {
    await this.prisma.agentTask.update({
      where: { id: this.taskId },
      data: {
        status: "failed",
        completedAt: new Date(),
        finalMessageId,
        error
      }
    });
    await this.event("agent.task.failed", { error, finalMessageId });
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

  async failToolCall(toolCallId: string, startedAt: Date, error: string) {
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
    await this.event("agent.tool.failed", { toolCallId, error });
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
