import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockAssertRoomAccess,
  mockEnforceRateLimit,
  mockFindUnique,
  mockRequireCurrentUser,
  mockRunAgentTask
} = vi.hoisted(() => ({
  mockAssertRoomAccess: vi.fn(),
  mockEnforceRateLimit: vi.fn(),
  mockFindUnique: vi.fn(),
  mockRequireCurrentUser: vi.fn(),
  mockRunAgentTask: vi.fn()
}));

const mockEnv = vi.hoisted(() => ({
  AGENT_TASK_INLINE_RUN: false,
  NODE_ENV: "test"
}));

vi.mock("@/lib/access", () => ({
  assertRoomAccess: mockAssertRoomAccess
}));

vi.mock("@/lib/auth", () => ({
  requireCurrentUser: mockRequireCurrentUser
}));

vi.mock("@/lib/env", () => ({ env: mockEnv }));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentTask: {
      findUnique: mockFindUnique
    }
  }
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: mockEnforceRateLimit
}));

vi.mock("@/agent/agent-runtime", () => ({
  runAgentTask: mockRunAgentTask
}));

import { POST } from "@/app/api/agent/tasks/[taskId]/run/route";

const task = {
  id: "task-1",
  roomId: "room-1",
  status: "pending"
};

function request() {
  return new Request("http://localhost/api/agent/tasks/task-1/run", {
    method: "POST",
    headers: { "x-forwarded-for": "203.0.113.9" }
  });
}

const params = { params: Promise.resolve({ taskId: "task-1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.AGENT_TASK_INLINE_RUN = false;
  mockRequireCurrentUser.mockResolvedValue({ id: "user-1" });
  mockFindUnique.mockResolvedValue(task);
  mockAssertRoomAccess.mockResolvedValue({ roomId: task.roomId, userId: "user-1" });
  mockEnforceRateLimit.mockReturnValue(null);
  mockRunAgentTask.mockResolvedValue({ ...task, status: "completed" });
});

describe("POST /api/agent/tasks/[taskId]/run", () => {
  it("keeps production execution queued for the Agent Worker", async () => {
    const response = await POST(request(), params);

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      task,
      execution: "queued"
    });
    expect(mockRunAgentTask).not.toHaveBeenCalled();
    expect(mockEnforceRateLimit).not.toHaveBeenCalled();
  });

  it("runs only in explicit inline mode and applies a per-user rate limit", async () => {
    mockEnv.AGENT_TASK_INLINE_RUN = true;

    const response = await POST(request(), params);

    expect(response.status).toBe(200);
    expect(mockEnforceRateLimit).toHaveBeenCalledWith(
      expect.any(Request),
      "agent-task-run:user-1",
      10,
      60_000
    );
    expect(mockRunAgentTask).toHaveBeenCalledWith(task.id);
  });

  it("does not execute an inline task after the run rate limit is reached", async () => {
    mockEnv.AGENT_TASK_INLINE_RUN = true;
    mockEnforceRateLimit.mockReturnValue(new Response("Too many requests", { status: 429 }));

    const response = await POST(request(), params);

    expect(response.status).toBe(429);
    expect(mockRunAgentTask).not.toHaveBeenCalled();
  });
});
