import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { taskId } = await params;
    const task = await prisma.agentTask.findUnique({ where: { id: taskId } });

    if (!task) {
      return Response.json({ error: "Agent task not found." }, { status: 404 });
    }

    await assertRoomAccess(task.roomId, user.id);

    if (!env.AGENT_TASK_INLINE_RUN) {
      return jsonOk({
        task,
        execution: "queued",
        message: "任务已入队，将由 Agent Worker 异步处理。"
      }, { status: 202 });
    }

    const limited = enforceRateLimit(request, `agent-task-run:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const { runAgentTask } = await import("@/agent/agent-runtime");
    const result = await runAgentTask(task.id);

    return jsonOk({ task: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
