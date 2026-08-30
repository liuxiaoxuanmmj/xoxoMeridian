import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { claimAgentTask } from "@/agent/task-claim";
import { prisma } from "@/lib/prisma";
import {
  createTestRoom,
  resetTestDatabase
} from "@/tests/integration/support/database";

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe("AgentTask atomic claim", () => {
  it("allows only one concurrent caller to claim the same task", async () => {
    const room = await createTestRoom();
    const agent = await prisma.agent.create({
      data: {
        slug: "claim-test-agent",
        displayName: "Claim Test Agent",
        description: "Verifies atomic task claiming"
      }
    });
    const task = await prisma.agentTask.create({
      data: {
        roomId: room.id,
        agentId: agent.id,
        input: { normalizedContent: "hello" }
      }
    });

    const claims = await Promise.all(
      Array.from({ length: 12 }, () => claimAgentTask(task.id, prisma))
    );

    expect(claims.filter((claim) => claim.claimed)).toHaveLength(1);
    await expect(
      prisma.agentTask.findUniqueOrThrow({ where: { id: task.id } })
    ).resolves.toMatchObject({
      status: "running",
      error: null,
      completedAt: null,
      finalMessageId: null
    });
  });
});
