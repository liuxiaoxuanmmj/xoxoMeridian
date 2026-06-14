import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockPostCount, mockPostCreate, mockPostFindUnique } = vi.hoisted(() => ({
  mockPostCount: vi.fn(),
  mockPostCreate: vi.fn(),
  mockPostFindUnique: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    post: {
      count: mockPostCount,
      create: mockPostCreate,
      findUnique: mockPostFindUnique,
    },
  },
}));

import { buildAgentLogContent, createAgentLogPost } from "@/lib/agent-posts";

beforeEach(() => {
  vi.clearAllMocks();
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
    mockPostFindUnique.mockResolvedValue(null);
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
});
