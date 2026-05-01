import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const user = await requireCurrentUser();
    const task = await prisma.agentTask.findUnique({ where: { id: params.taskId } });

    if (!task) {
      return Response.json({ error: "Agent task not found." }, { status: 404 });
    }

    await assertRoomAccess(task.roomId, user.id);
    const { runAgentTask } = await import("@/agent/agent-runtime");
    const result = await runAgentTask(task.id);

    return jsonOk({ task: result });
  } catch (error) {
    return errorToResponse(error);
  }
}
