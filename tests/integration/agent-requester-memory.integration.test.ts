import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runAgentTask } from "@/agent/agent-runtime";
import { buildAgentContext } from "@/agent/context-builder";
import { createMemoryRecallTool, createMemorySetTool } from "@/agent/tools/memory-tool";
import type { ToolExecutionContext } from "@/agent/types";
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

async function createFixture() {
  const room = await createTestRoom();
  const alice = await createTestUser({ displayName: "Alice" });
  const bob = await createTestUser({ displayName: "Bob" });

  await Promise.all([
    prisma.userProfile.create({
      data: {
        userId: alice.id,
        city: "Shanghai",
        country: "China",
        timezone: "Asia/Shanghai"
      }
    }),
    prisma.userProfile.create({
      data: {
        userId: bob.id,
        city: "London",
        country: "United Kingdom",
        timezone: "Europe/London"
      }
    })
  ]);
  await prisma.roomParticipant.create({
    data: { roomId: room.id, userId: alice.id, role: "owner" }
  });
  await prisma.roomParticipant.create({
    data: { roomId: room.id, userId: bob.id, role: "member" }
  });

  async function context(requestedById: string | null): Promise<ToolExecutionContext> {
    return {
      prisma,
      taskId: `task-${requestedById ?? "system"}`,
      roomId: room.id,
      agentId: "agent-test",
      requestedById,
      runtimeContext: await buildAgentContext(room.id, requestedById),
      tracer: {} as never
    };
  }

  return { room, alice, bob, context };
}

describe("Agent requester-aware Memory", () => {
  it("keeps same and similar personal facts isolated by absolute owner", async () => {
    const { room, alice, bob, context } = await createFixture();
    const setMemory = createMemorySetTool();

    await setMemory.execute(
      { key: "me.food", value: "Alice 喜欢草莓蛋糕" },
      await context(alice.id)
    );
    await setMemory.execute(
      { key: "me.food", value: "Bob 喜欢巧克力蛋糕" },
      await context(bob.id)
    );
    await setMemory.execute(
      { key: "me.drink", value: "每天早上喝拿铁" },
      await context(alice.id)
    );
    await setMemory.execute(
      { key: "me.breakfast", value: "每天早上喝拿铁" },
      await context(bob.id)
    );
    await setMemory.execute(
      { key: "her.language", value: "Bob 正在学习日语" },
      await context(alice.id)
    );
    await setMemory.execute(
      { key: "me.language", value: "Bob 正在学习英语" },
      await context(bob.id)
    );

    const stored = await prisma.memory.findMany({
      where: { roomId: room.id, userId: { not: null } },
      orderBy: [{ userId: "asc" }, { key: "asc" }]
    });
    expect(stored.filter((memory) => memory.userId === alice.id)).toHaveLength(2);
    expect(stored.filter((memory) => memory.userId === bob.id)).toHaveLength(3);
    expect(stored).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: alice.id, value: "Alice 喜欢草莓蛋糕" }),
      expect.objectContaining({ userId: alice.id, value: "每天早上喝拿铁" }),
      expect.objectContaining({ userId: bob.id, value: "Bob 喜欢巧克力蛋糕" }),
      expect.objectContaining({ userId: bob.id, value: "每天早上喝拿铁" }),
      expect.objectContaining({ userId: bob.id, value: "Bob 正在学习英语" })
    ]));
  });

  it("projects personal facts relative to each requester in context and recall", async () => {
    const { alice, bob, context } = await createFixture();
    const setMemory = createMemorySetTool();
    const recallMemory = createMemoryRecallTool();

    await setMemory.execute(
      { key: "me.preference", value: "Alice 喜欢安静的餐厅" },
      await context(alice.id)
    );
    await setMemory.execute(
      { key: "me.preference", value: "Bob 喜欢热闹的餐厅" },
      await context(bob.id)
    );
    await setMemory.execute(
      { key: "shared.anniversary", value: "纪念日是 10 月 12 日" },
      await context(alice.id)
    );

    const aliceContext = await buildAgentContext(
      (await context(alice.id)).roomId,
      alice.id
    );
    const bobContext = await buildAgentContext(
      (await context(bob.id)).roomId,
      bob.id
    );

    expect(aliceContext.roomContext).toMatchObject({
      requestedById: alice.id,
      self: { userId: alice.id, displayName: "Alice" },
      partner: { userId: bob.id, displayName: "Bob" },
      semanticMemory: {
        aboutMe: [{ key: "me.preference", value: "Alice 喜欢安静的餐厅" }],
        aboutHer: [{ key: "her.preference", value: "Bob 喜欢热闹的餐厅" }],
        shared: [{ key: "shared.anniversary", value: "纪念日是 10 月 12 日" }]
      }
    });
    expect(bobContext.roomContext).toMatchObject({
      requestedById: bob.id,
      self: { userId: bob.id, displayName: "Bob" },
      partner: { userId: alice.id, displayName: "Alice" },
      semanticMemory: {
        aboutMe: [{ key: "me.preference", value: "Bob 喜欢热闹的餐厅" }],
        aboutHer: [{ key: "her.preference", value: "Alice 喜欢安静的餐厅" }],
        shared: [{ key: "shared.anniversary", value: "纪念日是 10 月 12 日" }]
      }
    });

    const aliceRecall = await recallMemory.execute(
      { prefix: "me." },
      await context(alice.id)
    ) as { memories: Array<{ key: string; value: string }> };
    const bobRecall = await recallMemory.execute(
      { prefix: "her." },
      await context(bob.id)
    ) as { memories: Array<{ key: string; value: string }> };
    expect(aliceRecall.memories).toEqual([
      expect.objectContaining({ key: "me.preference", value: "Alice 喜欢安静的餐厅" })
    ]);
    expect(bobRecall.memories).toEqual([
      expect.objectContaining({ key: "her.preference", value: "Alice 喜欢安静的餐厅" })
    ]);
  });

  it("keeps requester-relative context neutral when requestedById is missing", async () => {
    const { room, alice, context } = await createFixture();
    const setMemory = createMemorySetTool();

    await expect(setMemory.execute(
      { key: "me.preference", value: "不能猜测归属" },
      await context(null)
    )).rejects.toThrow(/requester|请求者/i);
    await setMemory.execute(
      { key: "shared.preference", value: "共享事实仍可写入" },
      await context(null)
    );
    await setMemory.execute(
      { key: "me.preference", value: "Alice 的个人事实" },
      await context(alice.id)
    );

    const neutral = await buildAgentContext(room.id, null);
    expect(neutral.roomContext).toMatchObject({
      requestedById: null,
      self: null,
      partner: null,
      semanticMemory: {
        aboutMe: [],
        aboutHer: [],
        shared: [{ key: "shared.preference", value: "共享事实仍可写入" }]
      }
    });
  });

  it("keeps requester identity stable from Planner through Tool execution", async () => {
    const { room, alice, bob } = await createFixture();
    const agent = await prisma.agent.create({
      data: {
        slug: `requester-aware-${room.id}`,
        displayName: "Requester-aware Agent",
        description: "Verifies requester-aware planning and execution"
      }
    });

    const bobTask = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        requestedById: bob.id,
        input: { normalizedContent: "比较一下我们的时差" }
      }
    });
    await runAgentTask(bobTask.id, {
      workerId: `requester-aware-${bobTask.id}`,
      leaseDurationMs: 60_000,
      heartbeatIntervalMs: 30_000
    });
    const bobResult = await prisma.agentTask.findUniqueOrThrow({
      where: { id: bobTask.id },
      include: { steps: true, toolCalls: true }
    });

    expect(bobResult).toMatchObject({ status: "completed" });
    expect(bobResult.steps.find((step) => step.stepKey === "plan")?.input).toMatchObject({
      requestedById: bob.id
    });
    expect(bobResult.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "timezone.compare",
        status: "completed",
        input: {
          fromLabel: "Bob",
          fromTimezone: "Europe/London",
          toLabel: "Alice",
          toTimezone: "Asia/Shanghai"
        },
        output: expect.objectContaining({
          from: expect.objectContaining({
            label: "Bob",
            timezone: "Europe/London"
          }),
          to: expect.objectContaining({
            label: "Alice",
            timezone: "Asia/Shanghai"
          })
        })
      })
    ]);

    const neutralTask = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        requestedById: null,
        input: { normalizedContent: "比较一下我们的时差" }
      }
    });
    await runAgentTask(neutralTask.id, {
      workerId: `requester-neutral-${neutralTask.id}`,
      leaseDurationMs: 60_000,
      heartbeatIntervalMs: 30_000
    });
    const neutralResult = await prisma.agentTask.findUniqueOrThrow({
      where: { id: neutralTask.id },
      include: { steps: true, toolCalls: true }
    });

    expect(neutralResult).toMatchObject({ status: "completed" });
    expect(neutralResult.steps.find((step) => step.stepKey === "plan")?.input).toMatchObject({
      requestedById: null
    });
    expect(neutralResult.toolCalls).toEqual([
      expect.objectContaining({
        toolName: "timezone.compare",
        status: "completed",
        input: {},
        output: expect.objectContaining({
          from: expect.objectContaining({
            label: "本人",
            timezone: "Asia/Shanghai"
          }),
          to: expect.objectContaining({
            label: "对方",
            timezone: "Europe/London"
          })
        })
      })
    ]);
  });
});
