import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { taskId: string } }) {
  try {
    const user = await requireCurrentUser();
    const task = await prisma.agentTask.findUnique({
      where: { id: params.taskId },
      include: {
        sourceMessage: true,
        finalMessage: true,
        toolCalls: { orderBy: { startedAt: "asc" } },
        llmCalls: { orderBy: { createdAt: "asc" } },
        eventLogs: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!task) {
      return Response.json({ error: "Agent task not found." }, { status: 404 });
    }

    await assertRoomAccess(task.roomId, user.id);
    return jsonOk({ trace: task });
  } catch (error) {
    return errorToResponse(error);
  }
}
