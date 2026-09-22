import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { detectAgentTarget } from "@/lib/agent-detection";
import { createAgentTaskWithCreatedEvent } from "@/lib/agent-task-dispatch";
import { appendChatLog } from "@/lib/chat-log-file";

const messageInclude = {
  sender: { select: { id: true, displayName: true, avatarLabel: true } },
  senderAgent: { select: { id: true, displayName: true, slug: true } },
  sourceTask: { select: { id: true, status: true } }
} as const;

// 专属对话由服务端确定 Agent，保留用户的触发词、段落和缩进。
// 调用方的事务同时负责首次建房和请求幂等；消息、任务、created 事件同进同退。
export async function createPrivateHumanMessage(
  tx: Prisma.TransactionClient,
  input: { roomId: string; userId: string; agentId: string; content: string; clientMessageId: string }
) {
  const content = input.content.trim();
  const message = await tx.message.create({
    data: {
      roomId: input.roomId,
      senderId: input.userId,
      senderType: "human",
      targetType: "agent",
      targetId: input.agentId,
      content,
      clientMessageId: input.clientMessageId,
    },
  });
  const task = await createAgentTaskWithCreatedEvent(tx, {
    roomId: input.roomId,
    agentId: input.agentId,
    sourceMessageId: message.id,
    requestedById: input.userId,
    rawContent: content,
    normalizedContent: content,
    trigger: "private-conversation",
  });
  return { message, task };
}

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
