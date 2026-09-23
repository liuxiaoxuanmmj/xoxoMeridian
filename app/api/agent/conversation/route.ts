import { assertAgentViewer, clearAgentConversation, getAgentConversationSnapshot } from "@/lib/agent-conversation";
import { errorToResponse, jsonOk, noStoreResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertAgentViewer(request, user.id);
    return noStoreResponse(jsonOk(await getAgentConversationSnapshot(user)));
  } catch (error) {
    return noStoreResponse(errorToResponse(error));
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    assertAgentViewer(request, user.id);
    return noStoreResponse(jsonOk(await clearAgentConversation(user.id)));
  } catch (error) {
    return noStoreResponse(errorToResponse(error));
  }
}
