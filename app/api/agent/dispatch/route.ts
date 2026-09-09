import { assertRoomAccess } from "@/lib/access";
import { dispatchAgentTaskForSourceMessage } from "@/lib/agent-task-dispatch";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createHumanMessage } from "@/lib/messages";
import { enforceRateLimit } from "@/lib/rate-limit";
import { agentDispatchSchema, readJsonBody } from "@/lib/validation";

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

    const result = await dispatchAgentTaskForSourceMessage({
      roomId,
      userId: user.id,
      sourceMessageId
    });
    if (result.kind === "source-message-not-found") {
      return jsonError("Source message not found in this room.", 404);
    }
    if (result.kind === "agent-not-found") {
      return jsonError("Agent not found. Run the seed script first.", 404);
    }

    const { task } = result;

    if (env.AGENT_TASK_INLINE_RUN) {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      await runAgentTask(task.id);
    }

    return jsonOk({ task }, { status: result.kind === "created" ? 201 : 200 });
  } catch (error) {
    return errorToResponse(error);
  }
}
