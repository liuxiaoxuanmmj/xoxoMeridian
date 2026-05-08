import { prisma } from "@/lib/prisma";
import { detectAgentTarget } from "@/lib/agent-detection";
import { appendChatLog } from "@/lib/chat-log-file";

export async function createHumanMessage(input: {
  roomId: string;
  userId: string;
  content: string;
  forceAgent?: boolean;
}) {
  const detection = detectAgentTarget(input.content, input.forceAgent);
  const agent = detection.isAgentTargeted
    ? await prisma.agent.findUnique({ where: { slug: "life-assistant" } })
    : null;

  const result = await prisma.$transaction(async (tx) => {
    const message = await tx.message.create({
      data: {
        roomId: input.roomId,
        senderId: input.userId,
        senderType: "human",
        content: input.content.trim(),
        targetType: detection.isAgentTargeted ? "agent" : "all",
        targetId: agent?.id,
        metadata: {
          detection,
          forceAgent: Boolean(input.forceAgent)
        }
      }
    });

    let task = null;
    if (detection.isAgentTargeted && agent) {
      task = await tx.agentTask.create({
        data: {
          roomId: input.roomId,
          agentId: agent.id,
          sourceMessageId: message.id,
          requestedById: input.userId,
          status: "pending",
          input: {
            rawContent: input.content,
            normalizedContent: detection.normalizedContent,
            trigger: detection.trigger,
            sourceMessageId: message.id
          }
        }
      });

      await tx.eventLog.create({
        data: {
          roomId: input.roomId,
          actorUserId: input.userId,
          agentTaskId: task.id,
          type: "agent.task.created",
          payload: {
            trigger: detection.trigger,
            sourceMessageId: message.id
          }
        }
      });
    }

    return { message, task };
  });

  await appendChatLog(input.roomId, {
    kind: "message.human",
    messageId: result.message.id,
    senderUserId: input.userId,
    content: result.message.content,
    createdAt: result.message.createdAt
  });

  return result;
}
