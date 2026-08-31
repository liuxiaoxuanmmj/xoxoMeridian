import {
  runAgentTask,
  type RunAgentTaskOptions
} from "@/agent/agent-runtime";
import { prisma } from "@/lib/prisma";

export async function dispatchPendingAgentTasks(
  limit = 3,
  options: RunAgentTaskOptions = {}
) {
  const now = new Date();
  const pendingTasks = await prisma.agentTask.findMany({
    where: {
      OR: [
        { status: "pending" },
        {
          status: "running",
          OR: [
            { leaseExpiresAt: null },
            { leaseExpiresAt: { lte: now } }
          ]
        }
      ]
    },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  const results = [];
  for (const task of pendingTasks) {
    results.push(await runAgentTask(task.id, options));
  }

  return results;
}
