import { prisma } from "@/lib/prisma";
import { detectAgentTarget } from "@/lib/agent-detection";
import { createAgentTaskWithCreatedEvent } from "@/lib/agent-task-dispatch";
import { appendChatLog } from "@/lib/chat-log-file";

const messageInclude = {
  sender: { select: { id: true, displayName: true, avatarLabel: true } },
  senderAgent: { select: { id: true, displayName: true, slug: true } },
  sourceTask: { select: { id: true, status: true } }
} as const;

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
      },
      include: messageInclude
    });

    let task = null;
    if (detection.isAgentTargeted && agent) {
      task = await createAgentTaskWithCreatedEvent(tx, {
        roomId: input.roomId,
        agentId: agent.id,
        sourceMessageId: message.id,
        requestedById: input.userId,
        rawContent: input.content,
        normalizedContent: detection.normalizedContent,
        trigger: detection.trigger
      });
    }

    return { message, task };
  });

  const message =
    result.task
      ? await prisma.message.findUnique({
          where: { id: result.message.id },
          include: messageInclude
        })
      : result.message;

  await appendChatLog(input.roomId, {
    kind: "message.human",
    messageId: result.message.id,
    senderUserId: input.userId,
    content: result.message.content,
    createdAt: result.message.createdAt
  });

  return { message: message ?? result.message, task: result.task };
}
