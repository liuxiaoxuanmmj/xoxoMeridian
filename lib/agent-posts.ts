import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { writePostWithUniqueSlug } from "@/lib/posts";

type AgentPostInput = {
  title: string;
  content: string;
  roomId: string;
  metadata?: Record<string, unknown>;
  // 幂等键：同一 AgentTask 至多派生一条时间线 Post。
  agentTaskId?: string;
};

export async function createAgentLogPost(input: AgentPostInput) {
  // Throttle: max 3 agent_log posts per room in 10 minutes
  const recentCutoff = new Date(Date.now() - 10 * 60 * 1000);
  const recentCount = await prisma.post.count({
    where: {
      type: "agent_log",
      roomId: input.roomId,
      publishedAt: { gte: recentCutoff },
    },
  });
  if (recentCount >= 3) return null;

  const baseSlug = `agent-log-${Date.now()}`;

  return writePostWithUniqueSlug(baseSlug, (slug) =>
    prisma.post.create({
      data: {
        slug,
        title: input.title,
        content: input.content,
        type: "agent_log",
        roomId: input.roomId,
        publishedAt: new Date(),
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
        agentTaskId: input.agentTaskId,
      },
    })
  );
}

export function buildAgentLogContent(
  task: {
    agent: { displayName: string };
    status: string;
    toolCalls?: { toolName: string }[];
  },
  result: unknown
): string {
  const toolNames = task.toolCalls?.map((tc) => tc.toolName).join(", ") ?? "none";
  return [
    `**Agent**: ${task.agent.displayName}`,
    `**Status**: ${task.status}`,
    `**Tools used**: ${toolNames}`,
    "",
    "## Result",
    "```json",
    JSON.stringify(result, null, 2),
    "```",
  ].join("\n");
}

// 恢复扫描每轮处理的投影上限：避免一次扫描把长积压全部读入内存。
export const TIMELINE_RECOVERY_LIMIT = 5;

// 真实 PostgreSQL 探针结果：Post.agentTaskId 唯一冲突为
// { code: "P2002", meta: { target: ["agentTaskId"] } }。
// 它表示该任务的时间线条目已经存在（崩溃窗口内重放），属于投影已达成的终态而不是需要重试的失败。
function isAgentTaskProjectionConflict(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const { code, meta } = error as { code?: unknown; meta?: { target?: unknown } };
  if (code !== "P2002") return false;
  const target = meta?.target;
  if (typeof target === "string") return target === "agentTaskId";
  return Array.isArray(target) && target.includes("agentTaskId");
}

// 投影决策的 CAS：只有第一个写入者能推进终态，重复调用不覆盖已有时间戳。
async function markTimelineProjected(taskId: string) {
  await prisma.agentTask.updateMany({
    where: { id: taskId, timelineProjectedAt: null },
    data: { timelineProjectedAt: new Date() },
  });
}

/**
 * AgentTask 完成事实 → 时间线 Post 的幂等投影。
 *
 * final Message/AgentStep/AgentTask/EventLog 已经在 lease 事务内提交，因此任务完成是持久事实；
 * 而时间线文章只是它的派生视图。投影失败不能回滚完成事实，但也必须可重建，否则用户会看到
 * Agent 回复「已完成」而 /home 时间线上永久缺少这条 agent_log。
 *
 * 终态由 AgentTask.timelineProjectedAt 表达，幂等由 Post.agentTaskId 唯一约束保证：
 * 写入失败时不推进终态，交给恢复扫描重试；已经写入过 Post 的任务重放时会撞唯一键并被识别为
 * 「已投影」。节流规则与无 ToolCall 规则保持不变，两者都记为已决策，不会被反复重试。
 */
export async function projectAgentTaskTimeline(taskId: string) {
  const task = await prisma.agentTask.findUnique({
    where: { id: taskId },
    include: {
      agent: { select: { displayName: true } },
      room: { select: { kind: true } },
      toolCalls: { select: { toolName: true, status: true, durationMs: true } },
    },
  });
  if (!task) return null;
  if (task.status !== "completed") return null;
  if (task.timelineProjectedAt) return null;

  if (task.room.kind === "agent_private") {
    await markTimelineProjected(taskId);
    return null;
  }

  if (task.toolCalls.length === 0) {
    // 既有规则：没有 ToolCall 的任务不产生时间线条目。
    await markTimelineProjected(taskId);
    return null;
  }

  const toolNames = task.toolCalls.map((tc) => tc.toolName).join(", ");
  let post: { id: string; slug: string } | null = null;
  try {
    post = await createAgentLogPost({
      title: `Agent: ${task.agent.displayName} — ${toolNames}`,
      content: buildAgentLogContent(task, task.result),
      roomId: task.roomId,
      agentTaskId: task.id,
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
  } catch (error) {
    if (!isAgentTaskProjectionConflict(error)) throw error;
  }

  await markTimelineProjected(taskId);
  return post;
}

/**
 * 有界恢复扫描：补做那些「完成事实已提交、投影终态未推进」的任务。
 *
 * 覆盖两类窗口——投影在事务外失败，以及进程在提交与投影之间终止。因为
 * projectAgentTaskTimeline 本身幂等，扫描与并发执行只会收敛到同一条 Post。
 */
export async function recoverPendingTimelineProjections(limit = TIMELINE_RECOVERY_LIMIT) {
  const pending = await prisma.agentTask.findMany({
    where: {
      status: "completed",
      timelineProjectedAt: null,
      toolCalls: { some: {} },
    },
    orderBy: { completedAt: "asc" },
    take: limit,
    select: { id: true },
  });

  let recovered = 0;
  for (const task of pending) {
    try {
      await projectAgentTaskTimeline(task.id);
      recovered += 1;
    } catch (error) {
      console.error("[agent-posts] timeline projection retry failed:", task.id, error);
    }
  }
  return recovered;
}
