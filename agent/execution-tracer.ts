import type { PrismaClient } from "@prisma/client";

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
    return { id: call.id, startedAt };
  }

  async completeToolCall(toolCallId: string, startedAt: Date, output: unknown) {
    const endedAt = new Date();
    await this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: {
        status: "completed",
        output: output as object,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime()
      }
    });
    await this.event("agent.tool.completed", { toolCallId });
  }

  async failToolCall(toolCallId: string, startedAt: Date, error: string) {
    const endedAt = new Date();
    await this.prisma.toolCall.update({
      where: { id: toolCallId },
      data: {
        status: "failed",
        error,
        endedAt,
        durationMs: endedAt.getTime() - startedAt.getTime()
      }
    });
    await this.event("agent.tool.failed", { toolCallId, error });
  }
}
