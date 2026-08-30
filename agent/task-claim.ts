import type { PrismaClient } from "@prisma/client";

import { prisma } from "@/lib/prisma";

type AgentTaskClaimClient = Pick<PrismaClient, "agentTask">;

export async function claimAgentTask(
  taskId: string,
  client: AgentTaskClaimClient = prisma
) {
  const claimedAt = new Date();
  const result = await client.agentTask.updateMany({
    where: {
      id: taskId,
      status: { in: ["pending", "failed"] }
    },
    data: {
      status: "running",
      startedAt: claimedAt,
      completedAt: null,
      finalMessageId: null,
      error: null
    }
  });

  return {
    claimed: result.count === 1,
    claimedAt
  };
}
