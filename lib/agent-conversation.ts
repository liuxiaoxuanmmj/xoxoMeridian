import { randomUUID } from "node:crypto";
import { Prisma, type User } from "@prisma/client";

import { assertPrivateRoomMembers } from "@/lib/access";
import type {
  AgentConversationMessage,
  AgentConversationSendResult,
  AgentConversationSnapshot,
  AgentConversationTask,
} from "@/lib/agent-conversation-types";
import { jsonError } from "@/lib/api";
import { appendChatLog } from "@/lib/chat-log-file";
import { createPrivateHumanMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { agentConversationMessageSchema, agentViewerIdSchema, ValidationError } from "@/lib/validation";

export function assertAgentViewer(request: Request, userId: string) {
  const parsed = agentViewerIdSchema.safeParse(request.headers.get("X-Agent-Viewer-Id"));
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  if (parsed.data !== userId) {
    // 身份前置条件只比较认证事实，不替代 owner 授权，也不注销当前有效 Cookie。
    throw jsonError("会话身份已改变，请重新打开小助手。", 401);
  }
}

const taskSelect = {
  id: true,
  status: true,
  sourceMessageId: true,
  finalMessageId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AgentTaskSelect;

function projectTask(task: Prisma.AgentTaskGetPayload<{ select: typeof taskSelect }>): AgentConversationTask {
  return {
    id: task.id,
    status: task.status,
    sourceMessageId: task.sourceMessageId,
    finalMessageId: task.finalMessageId,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
    error: task.status === "failed" ? "这次任务未完成，请稍后重试。"
      : task.status === "limit_exceeded" ? "这次任务已达到执行上限，请缩小请求后重试。"
      : task.status === "cancelled" ? "这次任务已取消。" : null,
  };
}

const messageSelect = {
  id: true,
  clientMessageId: true,
  senderType: true,
  content: true,
  createdAt: true,
  sourceTask: { select: { id: true } },
  finalTask: { select: { id: true } },
} satisfies Prisma.MessageSelect;

function projectMessage(message: Prisma.MessageGetPayload<{ select: typeof messageSelect }>): AgentConversationMessage {
  return {
    id: message.id,
    clientMessageId: message.clientMessageId,
    role: message.senderType === "human" ? "user" : "agent",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
    taskId: message.sourceTask?.id ?? message.finalTask?.id ?? null,
  };
}

export async function getAgentConversationSnapshot(
  user: Pick<User, "id" | "displayName" | "avatarLabel">
): Promise<AgentConversationSnapshot> {
  const [room, agent] = await Promise.all([
    prisma.room.findUnique({
      where: { privateOwnerId: user.id },
      include: { participants: { select: { userId: true } } },
    }),
    prisma.agent.findUnique({
      where: { slug: "life-assistant" },
      select: { id: true, displayName: true, enabled: true },
    }),
  ]);
  const base: AgentConversationSnapshot = {
    currentUser: { id: user.id, displayName: user.displayName, avatarLabel: user.avatarLabel },
    agent: agent ?? { id: null, displayName: "小助手", enabled: false },
    roomId: room?.id ?? null,
    messages: [], tasks: [], pendingApprovals: [],
  };
  if (!room) return base;
  assertPrivateRoomMembers(room);
  if (room.kind !== "agent_private") throw jsonError("Forbidden", 403);

  const [messages, tasks, approvals] = await Promise.all([
    prisma.message.findMany({
      where: {
        roomId: room.id,
        OR: [{ senderType: "human", senderId: user.id }, { senderType: "agent" }],
      },
      select: messageSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
    }),
    prisma.agentTask.findMany({
      where: { roomId: room.id },
      select: taskSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 80,
    }),
    prisma.agentToolApproval.findMany({
      where: { status: "pending", risk: "high", task: { roomId: room.id } },
      select: { id: true, taskId: true, toolName: true, input: true, requestedAt: true },
      orderBy: [{ requestedAt: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    ...base,
    messages: messages.reverse().map(projectMessage),
    tasks: tasks.map(projectTask),
    pendingApprovals: approvals.map((approval) => ({
      ...approval,
      risk: "high",
      input: approval.input && typeof approval.input === "object" && !Array.isArray(approval.input)
        ? approval.input : {},
      requestedAt: approval.requestedAt.toISOString(),
    })),
  };
}

export async function sendAgentConversationMessage(input: {
  userId: string;
  content: string;
  clientMessageId: string;
}): Promise<AgentConversationSendResult> {
  const parsed = agentConversationMessageSchema.safeParse({ content: input.content, clientMessageId: input.clientMessageId });
  if (!parsed.success) throw new ValidationError(parsed.error.issues);
  const { content, clientMessageId } = parsed.data;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        let room = await tx.room.findUnique({
          where: { privateOwnerId: input.userId },
          include: { participants: { select: { userId: true } } },
        });
        if (room) {
          assertPrivateRoomMembers(room);
          if (room.kind !== "agent_private") throw jsonError("Forbidden", 403);
          const existing = await tx.message.findUnique({
            where: { roomId_senderId_clientMessageId: { roomId: room.id, senderId: input.userId, clientMessageId } },
            include: { sourceTask: { select: taskSelect } },
          });
          if (existing) {
            if (existing.content !== content) throw jsonError("这条发送标识已用于不同内容。", 409);
            if (!existing.sourceTask) throw jsonError("这条消息的任务状态不可用。", 409);
            return { roomId: room.id, message: existing, task: existing.sourceTask, replayed: true };
          }
        }

        const agent = await tx.agent.findUnique({ where: { slug: "life-assistant" }, select: { id: true, enabled: true } });
        if (!agent?.enabled) throw jsonError("小助手暂时不可用，请稍后重试。", 503);
        room ??= await tx.room.create({
          data: {
            slug: `agent-private-${randomUUID()}`,
            name: "与小助手的对话",
            kind: "agent_private",
            privateOwnerId: input.userId,
            maxHumanUsers: 1,
            participants: { create: { userId: input.userId, role: "owner" } },
          },
          include: { participants: { select: { userId: true } } },
        });
        const created = await createPrivateHumanMessage(tx, {
          roomId: room.id, userId: input.userId, agentId: agent.id, content, clientMessageId,
        });
        return { roomId: room.id, ...created, replayed: false };
      });

      if (!result.replayed) {
        await appendChatLog(result.roomId, {
          kind: "message.human", messageId: result.message.id, senderUserId: input.userId,
          content: result.message.content, createdAt: result.message.createdAt,
        });
      }
      return {
        currentUserId: input.userId,
        roomId: result.roomId,
        message: projectMessage({ ...result.message, sourceTask: { id: result.task.id }, finalTask: null }),
        task: projectTask(result.task),
        replayed: result.replayed,
      };
    } catch (error) {
      // PostgreSQL 唯一冲突会中止事务；必须离开事务后重读 owner / 消息幂等键。
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue;
      throw error;
    }
  }
}
