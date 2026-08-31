import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  runAgentTask: vi.fn()
}));

vi.mock("@/agent/agent-runtime", () => ({
  runAgentTask: mocks.runAgentTask
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentTask: { findMany: mocks.findMany }
  }
}));

import { dispatchPendingAgentTasks } from "@/agent/task-dispatcher";

describe("dispatchPendingAgentTasks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dispatches pending and expired running candidates with the same Worker identity", async () => {
    mocks.findMany.mockResolvedValue([
      { id: "pending-task" },
      { id: "expired-running-task" }
    ]);
    mocks.runAgentTask
      .mockResolvedValueOnce({ id: "pending-task", status: "completed" })
      .mockResolvedValueOnce({ id: "expired-running-task", status: "completed" });

    await expect(dispatchPendingAgentTasks(3, {
      workerId: "worker-1",
      leaseDurationMs: 10_000
    })).resolves.toHaveLength(2);

    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        OR: [
          { status: "pending" },
          {
            status: "running",
            OR: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { lte: expect.any(Date) } }
            ]
          }
        ]
      }
    }));
    expect(mocks.runAgentTask).toHaveBeenNthCalledWith(1, "pending-task", {
      workerId: "worker-1",
      leaseDurationMs: 10_000
    });
    expect(mocks.runAgentTask).toHaveBeenNthCalledWith(2, "expired-running-task", {
      workerId: "worker-1",
      leaseDurationMs: 10_000
    });
  });
});
