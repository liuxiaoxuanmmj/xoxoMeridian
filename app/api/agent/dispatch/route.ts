import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createHumanMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { agentDispatchSchema, readJsonBody } from "@/lib/validation";
import { getAgentRuntimeBudgetCreateData } from "@/agent/runtime-budget";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();

    const limited = enforceRateLimit(request, `agent-dispatch:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const { roomId, content, sourceMessageId } = await readJsonBody(request, agentDispatchSchema);
    await assertRoomAccess(roomId, user.id);

    if (content) {
      const result = await createHumanMessage({
        roomId,
        userId: user.id,
        content,
        forceAgent: true
      });

      if (result.task && env.AGENT_TASK_INLINE_RUN) {
        const { runAgentTask } = await import("@/agent/agent-runtime");
        await runAgentTask(result.task.id);
      }

      return jsonOk(result, { status: 201 });
    }

    if (!sourceMessageId) {
      return jsonError("Source message id is required.", 400);
    }

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
        ...getAgentRuntimeBudgetCreateData(),
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

    if (env.AGENT_TASK_INLINE_RUN) {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      await runAgentTask(task.id);
    }

    return jsonOk({ task }, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
