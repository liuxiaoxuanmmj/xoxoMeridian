import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockPostCount,
  mockPostCreate,
  mockPostFindUnique,
  mockAgentTaskFindUnique,
  mockAgentTaskUpdateMany,
  mockAgentTaskFindMany,
} = vi.hoisted(() => ({
  mockPostCount: vi.fn(),
  mockPostCreate: vi.fn(),
  mockPostFindUnique: vi.fn(),
  mockAgentTaskFindUnique: vi.fn(),
  mockAgentTaskUpdateMany: vi.fn(),
  mockAgentTaskFindMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    post: {
      count: mockPostCount,
      create: mockPostCreate,
      findUnique: mockPostFindUnique,
    },
    agentTask: {
      findUnique: mockAgentTaskFindUnique,
      updateMany: mockAgentTaskUpdateMany,
      findMany: mockAgentTaskFindMany,
    },
  },
}));

import {
  buildAgentLogContent,
  createAgentLogPost,
  projectAgentTaskTimeline,
  recoverPendingTimelineProjections,
} from "@/lib/agent-posts";

const COMPLETED_AT = new Date("2026-09-20T08:00:00.000Z");

function completedTask(overrides: Record<string, unknown> = {}) {
  return {
    id: "task-1",
    roomId: "room-1",
    room: { kind: "shared" },
    status: "completed",
    result: { summary: "done" },
    completedAt: COMPLETED_AT,
    timelineProjectedAt: null,
    agent: { displayName: "小助手" },
    toolCalls: [{ toolName: "weather.get", status: "completed", durationMs: 12 }],
    ...overrides,
  };
}

function uniqueConflict(target: string[]) {
  return Object.assign(new Error(`Unique constraint failed on the fields: (\`${target.join(",")}\`)`), {
    code: "P2002",
    meta: { modelName: "Post", target },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAgentTaskUpdateMany.mockResolvedValue({ count: 1 });
  mockPostCreate.mockResolvedValue({ id: "post-x", slug: "agent-log-xxx" });
  mockPostCount.mockResolvedValue(0);
});

describe("buildAgentLogContent", () => {
  it("builds markdown summary with tool names", () => {
    const task = {
      agent: { displayName: "小助手" },
      status: "completed",
      toolCalls: [{ toolName: "weather.get" }, { toolName: "timezone.compare" }],
    };
    const result = { city: "Tokyo", temperatureC: 16 };
    const content = buildAgentLogContent(task, result);
    expect(content).toContain("小助手");
    expect(content).toContain("completed");
    expect(content).toContain("weather.get, timezone.compare");
    expect(content).toContain('"city": "Tokyo"');
  });
});

describe("createAgentLogPost", () => {
  it("throttles when too many recent agent_log posts", async () => {
    mockPostCount.mockResolvedValue(3);
    const result = await createAgentLogPost({
      title: "Test",
      content: "Content",
      roomId: "room-1",
    });
    expect(result).toBeNull();
    expect(mockPostCreate).not.toHaveBeenCalled();
  });

  it("creates post when under throttle limit", async () => {
    mockPostCount.mockResolvedValue(1);
    mockPostCreate.mockResolvedValue({ id: "post-x", slug: "agent-log-xxx" });

    const result = await createAgentLogPost({
      title: "Agent: 小助手 — weather.get",
      content: "Test content",
      roomId: "room-1",
      metadata: { taskId: "task-1" },
    });

    expect(result).not.toBeNull();
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          type: "agent_log",
          roomId: "room-1",
        }),
      })
    );
  });

  it("投影写入遇到 slug 冲突时顺延后缀而不是抛出，避免时间线条目丢失", async () => {
    mockPostCount.mockResolvedValue(1);
    mockPostCreate
      .mockRejectedValueOnce(
        Object.assign(new Error("Unique constraint failed on the fields: (`slug`)"), {
          code: "P2002",
          meta: { modelName: "Post", target: ["slug"] },
        })
      )
      .mockResolvedValueOnce({ id: "post-y", slug: "agent-log-xxx-2" });

    const result = await createAgentLogPost({
      title: "Agent: 小助手 — weather.get",
      content: "Test content",
      roomId: "room-1",
    });

    expect(result).toEqual({ id: "post-y", slug: "agent-log-xxx-2" });
    expect(mockPostCreate).toHaveBeenCalledTimes(2);
    expect(mockPostCreate.mock.calls[1][0].data.slug).toMatch(/-2$/);
  });
});

describe("projectAgentTaskTimeline", () => {
  it("投影时带上 AgentTask 幂等键，并在写入后推进终态", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask());

    const result = await projectAgentTaskTimeline("task-1");

    expect(result).toEqual({ id: "post-x", slug: "agent-log-xxx" });
    expect(mockPostCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ agentTaskId: "task-1", type: "agent_log", roomId: "room-1" }),
      })
    );
    expect(mockAgentTaskUpdateMany).toHaveBeenCalledWith({
      where: { id: "task-1", timelineProjectedAt: null },
      data: { timelineProjectedAt: expect.any(Date) },
    });
  });

  it("任务不存在或尚未完成时不写入、也不推进终态", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(null);
    expect(await projectAgentTaskTimeline("task-missing")).toBeNull();

    mockAgentTaskFindUnique.mockResolvedValue(completedTask({ status: "running" }));
    expect(await projectAgentTaskTimeline("task-1")).toBeNull();

    expect(mockPostCreate).not.toHaveBeenCalled();
    expect(mockAgentTaskUpdateMany).not.toHaveBeenCalled();
  });

  it("已推进终态的任务重复投影时不再写入", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask({ timelineProjectedAt: COMPLETED_AT }));

    expect(await projectAgentTaskTimeline("task-1")).toBeNull();
    expect(mockPostCreate).not.toHaveBeenCalled();
    expect(mockAgentTaskUpdateMany).not.toHaveBeenCalled();
  });

  it("无 ToolCall 的任务记为已决策终态，不产生时间线条目", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask({ toolCalls: [] }));

    expect(await projectAgentTaskTimeline("task-1")).toBeNull();
    expect(mockPostCreate).not.toHaveBeenCalled();
    expect(mockAgentTaskUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("节流的任务同样记为已决策终态，避免恢复扫描反复重试", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask());
    mockPostCount.mockResolvedValue(3);

    expect(await projectAgentTaskTimeline("task-1")).toBeNull();
    expect(mockPostCreate).not.toHaveBeenCalled();
    expect(mockAgentTaskUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("撞上 agentTaskId 唯一键说明条目已存在，按已投影处理", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask());
    mockPostCreate.mockRejectedValueOnce(uniqueConflict(["agentTaskId"]));

    expect(await projectAgentTaskTimeline("task-1")).toBeNull();
    expect(mockAgentTaskUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("写入失败时不推进终态，保留给恢复扫描重做", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask());
    mockPostCreate.mockRejectedValue(new Error("connection reset"));

    await expect(projectAgentTaskTimeline("task-1")).rejects.toThrow("connection reset");
    expect(mockAgentTaskUpdateMany).not.toHaveBeenCalled();
  });

  it("slug 冲突不应被误判为投影已完成", async () => {
    mockAgentTaskFindUnique.mockResolvedValue(completedTask());
    mockPostCreate.mockRejectedValue(uniqueConflict(["slug"]));

    await expect(projectAgentTaskTimeline("task-1")).rejects.toThrow(/slug/);
    expect(mockAgentTaskUpdateMany).not.toHaveBeenCalled();
  });
});

describe("recoverPendingTimelineProjections", () => {
  it("只挑选已完成、未决策且有 ToolCall 的任务并按完成时间有界扫描", async () => {
    mockAgentTaskFindMany.mockResolvedValue([]);

    await recoverPendingTimelineProjections(4);

    expect(mockAgentTaskFindMany).toHaveBeenCalledWith({
      where: {
        status: "completed",
        timelineProjectedAt: null,
        toolCalls: { some: {} },
      },
      orderBy: { completedAt: "asc" },
      take: 4,
      select: { id: true },
    });
  });

  it("逐条补做并返回成功条数", async () => {
    mockAgentTaskFindMany.mockResolvedValue([{ id: "task-1" }, { id: "task-2" }]);
    mockAgentTaskFindUnique
      .mockResolvedValueOnce(completedTask({ id: "task-1" }))
      .mockResolvedValueOnce(completedTask({ id: "task-2" }));

    expect(await recoverPendingTimelineProjections()).toBe(2);
    expect(mockPostCreate).toHaveBeenCalledTimes(2);
  });

  it("单条失败不终止整轮扫描，失败任务保持未决策", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockAgentTaskFindMany.mockResolvedValue([{ id: "task-1" }, { id: "task-2" }]);
    mockAgentTaskFindUnique
      .mockResolvedValueOnce(completedTask({ id: "task-1" }))
      .mockResolvedValueOnce(completedTask({ id: "task-2" }));
    mockPostCreate
      .mockRejectedValueOnce(new Error("connection reset"))
      .mockResolvedValueOnce({ id: "post-2", slug: "agent-log-2" });

    try {
      expect(await recoverPendingTimelineProjections()).toBe(1);
      expect(mockAgentTaskUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockAgentTaskUpdateMany).toHaveBeenCalledWith({
        where: { id: "task-2", timelineProjectedAt: null },
        data: { timelineProjectedAt: expect.any(Date) },
      });
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});
