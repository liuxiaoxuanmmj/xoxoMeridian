import { Prisma } from "@prisma/client";

import { getAgentRuntimeBudgetCreateData } from "@/agent/runtime-budget";
import { prisma } from "@/lib/prisma";

type AgentTaskDerivationClient = Pick<
  Prisma.TransactionClient,
  "agentTask" | "eventLog"
>;

type AgentTaskDerivationInput = {
  roomId: string;
  agentId: string;
  sourceMessageId: string;
  requestedById: string;
  rawContent: string;
  normalizedContent: string;
  trigger: string;
};

export async function createAgentTaskWithCreatedEvent(
  client: AgentTaskDerivationClient,
  input: AgentTaskDerivationInput
) {
  const task = await client.agentTask.create({
    data: {
      roomId: input.roomId,
      agentId: input.agentId,
      sourceMessageId: input.sourceMessageId,
      requestedById: input.requestedById,
      status: "pending",
      ...getAgentRuntimeBudgetCreateData(),
      input: {
        rawContent: input.rawContent,
        normalizedContent: input.normalizedContent,
        trigger: input.trigger,
        sourceMessageId: input.sourceMessageId
      }
    }
  });

  await client.eventLog.create({
    data: {
      roomId: input.roomId,
      actorUserId: input.requestedById,
      agentTaskId: task.id,
      type: "agent.task.created",
      payload: {
        trigger: input.trigger,
        sourceMessageId: input.sourceMessageId
      }
    }
  });

  return task;
}

export type ExplicitAgentDispatchResult =
  | { kind: "created"; task: Awaited<ReturnType<typeof createAgentTaskWithCreatedEvent>> }
  | { kind: "existing"; task: Awaited<ReturnType<typeof createAgentTaskWithCreatedEvent>> }
  | { kind: "source-message-not-found" }
  | { kind: "agent-not-found" };

export async function dispatchAgentTaskForSourceMessage(input: {
  roomId: string;
  userId: string;
  sourceMessageId: string;
}): Promise<ExplicitAgentDispatchResult> {
  try {
    return await prisma.$transaction(async (tx) => {
      const sourceMessages = await tx.$queryRaw<Array<{ id: string; content: string }>>`
        SELECT "id", "content"
        FROM "Message"
        WHERE "id" = ${input.sourceMessageId}
          AND "roomId" = ${input.roomId}
        FOR UPDATE
      `;
      const sourceMessage = sourceMessages[0];
      if (!sourceMessage) {
        return { kind: "source-message-not-found" };
      }

      const existingTask = await tx.agentTask.findUnique({
        where: { sourceMessageId: sourceMessage.id }
      });
      if (existingTask) {
        return { kind: "existing", task: existingTask };
      }

      const agent = await tx.agent.findUnique({
        where: { slug: "life-assistant" },
        select: { id: true }
      });
      if (!agent) {
        return { kind: "agent-not-found" };
      }

      const task = await createAgentTaskWithCreatedEvent(tx, {
        roomId: input.roomId,
        agentId: agent.id,
        sourceMessageId: sourceMessage.id,
        requestedById: input.userId,
        rawContent: sourceMessage.content,
        normalizedContent: sourceMessage.content,
        trigger: "explicit-ui"
      });

      return { kind: "created", task };
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existingTask = await prisma.agentTask.findUnique({
        where: { sourceMessageId: input.sourceMessageId }
      });
      if (existingTask?.roomId === input.roomId) {
        return { kind: "existing", task: existingTask };
      }
    }

    throw error;
  }
}
