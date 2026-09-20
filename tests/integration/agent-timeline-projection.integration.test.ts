import type { AgentTaskStatus } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { beginAgentStep } from "@/agent/durable-step";
import { ExecutionTracer } from "@/agent/execution-tracer";
import { claimAgentTask } from "@/agent/task-claim";
import type { AgentTaskLeaseOwnership } from "@/agent/types";
import { prisma } from "@/lib/prisma";
import {
  createAgentLogPost,
  projectAgentTaskTimeline,
  recoverPendingTimelineProjections,
} from "@/lib/agent-posts";
import { createTestRoom, resetTestDatabase } from "@/tests/integration/support/database";

let sequence = 0;

beforeEach(async () => {
  await resetTestDatabase();
  sequence = 0;
});

afterAll(async () => {
  await prisma.$disconnect();
});

function leaseFromClaim(claim: {
  claimed: boolean;
  attemptId: string;
  workerId: string;
  leaseDurationMs: number;
}) {
  if (!claim.claimed) throw new Error("AgentTask claim unexpectedly failed.");
  return {
    attemptId: claim.attemptId,
    workerId: claim.workerId,
    leaseDurationMs: claim.leaseDurationMs,
  } satisfies AgentTaskLeaseOwnership;
}

/** 建立一个 Agent 并完成一个任务，模拟「完成事实已提交」的持久状态。 */
async function completedTaskWithTools(input: {
  toolNames?: string[];
  completedAt?: Date;
  status?: AgentTaskStatus;
} = {}) {
  sequence += 1;
  const room = await createTestRoom();
  const agent = await prisma.agent.create({
    data: {
      slug: `projection-agent-${sequence}`,
      displayName: `小助手 ${sequence}`,
      description: "时间线投影测试",
    },
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      status: input.status ?? "completed",
      completedAt: input.completedAt ?? new Date("2026-09-20T08:00:00.000Z"),
      result: { summary: `结果 ${sequence}` },
      input: { prompt: `提问 ${sequence}` },
    },
  });
  const toolNames = input.toolNames ?? ["weather.get"];
  for (const [index, toolName] of toolNames.entries()) {
    await prisma.toolCall.create({
      data: {
        taskId: task.id,
        stepKey: `${toolName}-${index}`,
        toolName,
        status: "completed",
        durationMs: 10 + index,
      },
    });
  }
  return { room, agent, task };
}

function postsOf(roomId: string) {
  return prisma.post.findMany({ where: { roomId }, orderBy: { slug: "asc" } });
}

describe("Agent 时间线投影的持久化与恢复", () => {
  it("经真实 ExecutionTracer 完成任务后留下终态与带幂等键的条目", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: { slug: "tracer-agent", displayName: "追踪助手", description: "完成路径测试" },
    });
    const task = await prisma.agentTask.create({
      data: { roomId: room.id, agentId: agent.id, input: { normalizedContent: "完成这个任务" } },
    });
    const lease = leaseFromClaim(
      await claimAgentTask(task.id, { workerId: "worker-projection", leaseDurationMs: 60_000 }, prisma)
    );
    await prisma.toolCall.create({
      data: {
        taskId: task.id,
        stepKey: "weather.get",
        toolName: "weather.get",
        status: "completed",
        durationMs: 7,
      },
    });
    await beginAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease,
      stepKey: "final",
      kind: "final",
      stepInput: { intent: "projection_test", content: "任务已完成" },
    });

    await new ExecutionTracer(prisma, task.id, room.id, lease).completeWithMessage(
      {
        roomId: room.id,
        senderType: "agent",
        senderAgentId: agent.id,
        content: "任务已完成",
        targetType: "all",
      },
      { summary: "完成" }
    );

    // 完成事实与投影终态必须一起存在于持久状态里：否则重启后无从判断这条投影是否已经做过。
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "completed",
      timelineProjectedAt: expect.any(Date),
    });
    const posts = await postsOf(room.id);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({ type: "agent_log", agentTaskId: task.id });

    // 完成路径已经写入，恢复扫描不应再挑中它。
    expect(await recoverPendingTimelineProjections()).toBe(0);
    expect(await postsOf(room.id)).toHaveLength(1);
  });

  it("完成路径中的投影写入失败会被恢复扫描补回，且不影响已提交的完成事实", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: { slug: "failing-agent", displayName: "失败助手", description: "失败恢复测试" },
    });
    const task = await prisma.agentTask.create({
      data: { roomId: room.id, agentId: agent.id, input: { normalizedContent: "写入会失败" } },
    });
    const lease = leaseFromClaim(
      await claimAgentTask(task.id, { workerId: "worker-failing", leaseDurationMs: 60_000 }, prisma)
    );
    await prisma.toolCall.create({
      data: {
        taskId: task.id,
        stepKey: "weather.get",
        toolName: "weather.get",
        status: "completed",
        durationMs: 5,
      },
    });
    await beginAgentStep({
      taskId: task.id,
      roomId: room.id,
      lease,
      stepKey: "final",
      kind: "final",
      stepInput: { intent: "projection_failure", content: "任务已完成" },
    });

    const failure = vi
      .spyOn(prisma.post, "create")
      .mockRejectedValueOnce(new Error("connection reset by peer"));
    try {
      await new ExecutionTracer(prisma, task.id, room.id, lease).completeWithMessage(
        {
          roomId: room.id,
          senderType: "agent",
          senderAgentId: agent.id,
          content: "任务已完成",
          targetType: "all",
        },
        { summary: "完成" }
      );
    } finally {
      failure.mockRestore();
    }

    // 完成事实照常提交：Agent 的回复与任务终态都在，投影失败不该把它们回滚。
    expect(await prisma.message.count({ where: { roomId: room.id } })).toBe(1);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "completed",
      timelineProjectedAt: null,
    });
    expect(await postsOf(room.id)).toHaveLength(0);

    expect(await recoverPendingTimelineProjections()).toBe(1);
    const posts = await postsOf(room.id);
    expect(posts).toHaveLength(1);
    expect(posts[0].agentTaskId).toBe(task.id);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: expect.any(Date),
    });
  });

  it("投影可从持久事实重建，重复执行不产生第二条", async () => {
    const { room, task } = await completedTaskWithTools({ toolNames: ["weather.get", "timezone.compare"] });

    const first = await projectAgentTaskTimeline(task.id);
    expect(first).not.toBeNull();

    const projected = await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(projected.timelineProjectedAt).not.toBeNull();
    const projectedAt = projected.timelineProjectedAt;

    // 重放：终态已推进，直接跳过，不写入也不覆盖已有决策时间。
    expect(await projectAgentTaskTimeline(task.id)).toBeNull();

    const posts = await postsOf(room.id);
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatchObject({
      type: "agent_log",
      agentTaskId: task.id,
    });
    // ToolCall 的读取顺序未定义（本项不改变这一点），只断言两个工具都出现在标题里。
    expect(posts[0].title).toContain("weather.get");
    expect(posts[0].title).toContain("timezone.compare");

    const afterReplay = await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } });
    expect(afterReplay.timelineProjectedAt).toEqual(projectedAt);
  });

  it("崩溃窗口重放：Post 已提交而终态未推进时，重建不会产生第二条", async () => {
    const { room, task } = await completedTaskWithTools();

    expect(await projectAgentTaskTimeline(task.id)).not.toBeNull();

    // 模拟「Post 已写入、timelineProjectedAt 尚未提交」的进程终止。
    await prisma.agentTask.update({ where: { id: task.id }, data: { timelineProjectedAt: null } });
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: null,
    });

    // 真实 PostgreSQL 的唯一键冲突必须被识别为「已投影」，而不是抛出。
    expect(await projectAgentTaskTimeline(task.id)).toBeNull();

    expect(await postsOf(room.id)).toHaveLength(1);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: expect.any(Date),
    });
  });

  it("写入失败后保持未决策，恢复扫描补做且恰好一次", async () => {
    const { room, task } = await completedTaskWithTools();

    const failure = vi
      .spyOn(prisma.post, "create")
      .mockRejectedValueOnce(new Error("connection reset by peer"));
    try {
      await expect(projectAgentTaskTimeline(task.id)).rejects.toThrow("connection reset by peer");
    } finally {
      failure.mockRestore();
    }

    // 失败后不得推进终态，否则该任务的时间线条目会永久丢失。
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      status: "completed",
      timelineProjectedAt: null,
    });
    expect(await postsOf(room.id)).toHaveLength(0);

    expect(await recoverPendingTimelineProjections()).toBe(1);

    const posts = await postsOf(room.id);
    expect(posts).toHaveLength(1);
    expect(posts[0].agentTaskId).toBe(task.id);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: expect.any(Date),
    });

    // 恢复本身也必须幂等：第二轮扫描不再挑中它。
    expect(await recoverPendingTimelineProjections()).toBe(0);
    expect(await postsOf(room.id)).toHaveLength(1);
  });

  it("被节流跳过的任务有显式终态，恢复扫描不再反复重试", async () => {
    const { room, task } = await completedTaskWithTools();
    for (let index = 0; index < 3; index += 1) {
      await createAgentLogPost({
        title: `占位 ${index}`,
        content: "占位",
        roomId: room.id,
      });
    }
    expect(await postsOf(room.id)).toHaveLength(3);

    expect(await projectAgentTaskTimeline(task.id)).toBeNull();

    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: expect.any(Date),
    });
    expect(await recoverPendingTimelineProjections()).toBe(0);
    expect(await postsOf(room.id)).toHaveLength(3);
  });

  it("无 ToolCall 的任务不产生时间线条目，并记为已决策", async () => {
    const { room, task } = await completedTaskWithTools({ toolNames: [] });

    expect(await projectAgentTaskTimeline(task.id)).toBeNull();
    expect(await postsOf(room.id)).toHaveLength(0);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: expect.any(Date),
    });
    expect(await recoverPendingTimelineProjections()).toBe(0);
  });

  it("未完成的任务不进入扫描集合", async () => {
    const { task } = await completedTaskWithTools({ status: "failed" });

    expect(await projectAgentTaskTimeline(task.id)).toBeNull();
    expect(await recoverPendingTimelineProjections()).toBe(0);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })).toMatchObject({
      timelineProjectedAt: null,
    });
  });

  it("恢复扫描按完成时间有界补做，逐条互不影响", async () => {
    const earliest = await completedTaskWithTools({ completedAt: new Date("2026-09-20T01:00:00.000Z") });
    const middle = await completedTaskWithTools({ completedAt: new Date("2026-09-20T02:00:00.000Z") });
    const latest = await completedTaskWithTools({ completedAt: new Date("2026-09-20T03:00:00.000Z") });

    expect(await recoverPendingTimelineProjections(2)).toBe(2);

    expect(await postsOf(earliest.room.id)).toHaveLength(1);
    expect(await postsOf(middle.room.id)).toHaveLength(1);
    expect(await postsOf(latest.room.id)).toHaveLength(0);
    expect(await prisma.agentTask.findUniqueOrThrow({ where: { id: latest.task.id } })).toMatchObject({
      timelineProjectedAt: null,
    });

    expect(await recoverPendingTimelineProjections(2)).toBe(1);
    expect(await postsOf(latest.room.id)).toHaveLength(1);
  });

  it("并发投影同一个任务只收敛到一条时间线条目", async () => {
    const { room, task } = await completedTaskWithTools();

    const outcomes = await Promise.allSettled([
      projectAgentTaskTimeline(task.id),
      projectAgentTaskTimeline(task.id),
    ]);

    expect(outcomes.map((outcome) => outcome.status)).toEqual(["fulfilled", "fulfilled"]);
    const posts = await postsOf(room.id);
    expect(posts).toHaveLength(1);
    expect(posts[0].agentTaskId).toBe(task.id);
  });
});
