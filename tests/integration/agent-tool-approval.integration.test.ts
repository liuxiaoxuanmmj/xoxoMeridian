import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ExecutionTracer } from "@/agent/execution-tracer";
import { claimAgentTask } from "@/agent/task-claim";
import {
  decideToolApproval,
  ToolApprovalConflictError,
  ToolApprovalRequiredError
} from "@/agent/tool-approval";
import { createToolRegistry } from "@/agent/tool-registry";
import type { RuntimeContext, ToolExecutionContext } from "@/agent/types";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  createTestUser,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("high-risk Tool approval", () => {
  it("persists approval across Registry reconstruction and deletes once after approval", async () => {
    const fixture = await createDeleteFixture();
    const firstRegistry = createToolRegistry();

    await expect(
      firstRegistry.execute(
        "memo.delete",
        { memoId: fixture.memo.id },
        fixture.context,
        { stepKey: "tool:1" }
      )
    ).rejects.toBeInstanceOf(ToolApprovalRequiredError);

    await expect(prisma.memo.count({ where: { id: fixture.memo.id } })).resolves.toBe(1);
    await expect(
      prisma.toolCall.count({ where: { taskId: fixture.task.id } })
    ).resolves.toBe(0);
    const approval = await prisma.agentToolApproval.findUniqueOrThrow({
      where: {
        taskId_stepKey: {
          taskId: fixture.task.id,
          stepKey: "tool:1"
        }
      }
    });
    expect(approval).toMatchObject({
      status: "pending",
      toolName: "memo.delete",
      risk: "high"
    });
    await expect(
      prisma.agentTask.findUniqueOrThrow({ where: { id: fixture.task.id } })
    ).resolves.toMatchObject({ status: "waiting_approval" });

    await decideToolApproval({
      taskId: fixture.task.id,
      approvalId: approval.id,
      decision: "approve",
      decidedById: fixture.user.id
    });
    await expect(claimAgentTask(fixture.task.id, prisma)).resolves.toMatchObject({
      claimed: true
    });

    const reconstructedRegistry = createToolRegistry();
    const unapprovedMemo = await prisma.memo.create({
      data: {
        roomId: fixture.room.id,
        createdById: fixture.user.id,
        title: "Different memo",
        content: "Approval must not transfer"
      }
    });
    await expect(
      reconstructedRegistry.execute(
        "memo.delete",
        { memoId: unapprovedMemo.id },
        fixture.context,
        { stepKey: "tool:1" }
      )
    ).rejects.toBeInstanceOf(ToolApprovalConflictError);
    await expect(prisma.memo.count({ where: { id: unapprovedMemo.id } })).resolves.toBe(1);

    const firstDelete = await reconstructedRegistry.execute(
      "memo.delete",
      { memoId: fixture.memo.id },
      fixture.context,
      { stepKey: "tool:1" }
    );
    const replayedDelete = await reconstructedRegistry.execute(
      "memo.delete",
      { memoId: fixture.memo.id },
      fixture.context,
      { stepKey: "tool:1" }
    );

    expect(replayedDelete).toEqual(firstDelete);
    await expect(prisma.memo.count({ where: { id: fixture.memo.id } })).resolves.toBe(0);
    await expect(
      prisma.toolCall.count({ where: { taskId: fixture.task.id, status: "completed" } })
    ).resolves.toBe(1);
  });

  it("keeps the memo and terminally cancels the task after rejection", async () => {
    const fixture = await createDeleteFixture();

    await expect(
      createToolRegistry().execute(
        "memo.delete",
        { memoId: fixture.memo.id },
        fixture.context,
        { stepKey: "tool:1" }
      )
    ).rejects.toBeInstanceOf(ToolApprovalRequiredError);
    const approval = await prisma.agentToolApproval.findUniqueOrThrow({
      where: {
        taskId_stepKey: {
          taskId: fixture.task.id,
          stepKey: "tool:1"
        }
      }
    });

    await decideToolApproval({
      taskId: fixture.task.id,
      approvalId: approval.id,
      decision: "reject",
      decidedById: fixture.user.id
    });

    await expect(prisma.memo.count({ where: { id: fixture.memo.id } })).resolves.toBe(1);
    await expect(
      prisma.agentTask.findUniqueOrThrow({ where: { id: fixture.task.id } })
    ).resolves.toMatchObject({
      status: "cancelled",
      error: "High-risk Tool request rejected by user."
    });
    await expect(claimAgentTask(fixture.task.id, prisma)).resolves.toMatchObject({
      claimed: false
    });
  });
});

async function createDeleteFixture() {
  const user = await createTestUser();
  const room = await createTestRoom();
  await prisma.roomParticipant.create({
    data: { roomId: room.id, userId: user.id }
  });
  const agent = await prisma.agent.create({
    data: {
      slug: "approval-test-agent",
      displayName: "Approval Test Agent",
      description: "Verifies high-risk approvals"
    }
  });
  const task = await prisma.agentTask.create({
    data: {
      roomId: room.id,
      agentId: agent.id,
      requestedById: user.id,
      status: "running",
      input: { normalizedContent: "delete memo" },
      plan: {
        intent: "delete_memo",
        confidence: 1,
        requiredTools: ["memo.delete"],
        taskSteps: ["delete memo"],
        finalResponsePlan: "confirm deletion",
        finalResponseText: "已经删除。",
        toolInputs: {}
      }
    }
  });
  const memo = await prisma.memo.create({
    data: {
      roomId: room.id,
      createdById: user.id,
      title: "Protected memo",
      content: "Do not delete without approval"
    }
  });
  const context: ToolExecutionContext = {
    prisma,
    taskId: task.id,
    roomId: room.id,
    agentId: agent.id,
    requestedById: user.id,
    runtimeContext: { participants: [] } as unknown as RuntimeContext,
    tracer: new ExecutionTracer(prisma, task.id, room.id)
  };

  return { user, room, agent, task, memo, context };
}
