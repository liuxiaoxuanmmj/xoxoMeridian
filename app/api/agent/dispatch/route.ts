import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { createHumanMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = await request.json();
    const roomId = String(body.roomId ?? "");
    await assertRoomAccess(roomId, user.id);

    if (body.content) {
      const result = await createHumanMessage({
        roomId,
        userId: user.id,
        content: String(body.content),
        forceAgent: true
      });

      if (result.task && process.env.AGENT_TASK_INLINE_RUN !== "false") {
        const { runAgentTask } = await import("@/agent/agent-runtime");
        await runAgentTask(result.task.id);
      }

      return jsonOk(result, { status: 201 });
    }

    const sourceMessageId = String(body.sourceMessageId ?? "");
    const sourceMessage = await prisma.message.findUnique({ where: { id: sourceMessageId } });
    if (!sourceMessage || sourceMessage.roomId !== roomId) {
      return jsonError("Source message not found in this room.", 404);
    }

    const agent = await prisma.agent.findUnique({ where: { slug: "life-assistant" } });
    if (!agent) {
      return jsonError("Agent not found. Run the seed script first.", 404);
    }

    const task = await prisma.agentTask.create({
      data: {
        roomId,
        agentId: agent.id,
        sourceMessageId,
        requestedById: user.id,
        input: {
          rawContent: sourceMessage.content,
          normalizedContent: sourceMessage.content,
          trigger: "explicit-ui",
          sourceMessageId
        }
      }
    });

    await prisma.eventLog.create({
      data: {
        roomId,
        actorUserId: user.id,
        agentTaskId: task.id,
        type: "agent.task.created",
        payload: { trigger: "explicit-ui", sourceMessageId }
      }
    });

    if (process.env.AGENT_TASK_INLINE_RUN !== "false") {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      await runAgentTask(task.id);
    }

    return jsonOk({ task }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
