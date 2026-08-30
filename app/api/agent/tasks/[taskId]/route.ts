import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { taskId } = await params;
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      include: {
        agent: true,
        sourceMessage: true,
        finalMessage: true,
        toolCalls: true,
        toolApprovals: { orderBy: { requestedAt: "asc" } },
        llmCalls: true,
        eventLogs: { orderBy: { createdAt: "asc" } }
      }
    });

    if (!task) {
      return Response.json({ error: "Agent task not found." }, { status: 404 });
    }

    await assertRoomAccess(task.roomId, user.id);
    return jsonOk({ task });
  } catch (error) {
    return errorToResponse(error);
  }
}
