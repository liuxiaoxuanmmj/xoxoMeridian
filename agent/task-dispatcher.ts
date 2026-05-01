import { runAgentTask } from "@/agent/agent-runtime";
import { prisma } from "@/lib/prisma";

export async function dispatchPendingAgentTasks(limit = 3) {
  const pendingTasks = await prisma.agentTask.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit
  });

  const results = [];
  for (const task of pendingTasks) {
    results.push(await runAgentTask(task.id));
  }

  return results;
}
