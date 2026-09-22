import { assertAgentViewer, sendAgentConversationMessage } from "@/lib/agent-conversation";
import { errorToResponse, jsonOk, noStoreResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { enforceRateLimit } from "@/lib/rate-limit";
import { agentConversationMessageSchema, readJsonBody } from "@/lib/validation";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertAgentViewer(request, user.id);
    const limited = enforceRateLimit(request, `agent-conversation:${user.id}`, 30, 60_000);
    if (limited) return noStoreResponse(limited);
    const body = await readJsonBody(request, agentConversationMessageSchema);
    const result = await sendAgentConversationMessage({ userId: user.id, ...body });
    if (!result.replayed && env.AGENT_TASK_INLINE_RUN) {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      await runAgentTask(result.task.id);
    }
    return noStoreResponse(jsonOk(result, { status: result.replayed ? 200 : 201 }));
  } catch (error) {
    return noStoreResponse(errorToResponse(error));
  }
}
