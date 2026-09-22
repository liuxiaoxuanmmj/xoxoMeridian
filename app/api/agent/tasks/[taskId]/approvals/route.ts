import {
  decideToolApproval,
  ToolApprovalConflictError,
  ToolApprovalNotFoundError
} from "@/agent/tool-approval";
import { assertRoomAccess } from "@/lib/access";
import { assertAgentViewer } from "@/lib/agent-conversation";
import { errorToResponse, jsonError, jsonOk, noStoreResponse } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { readJsonBody, toolApprovalDecisionSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { taskId } = await params;
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: { id: true, roomId: true }
    });
    if (!task) {
      return noStoreResponse(jsonError("Agent task not found.", 404));
    }

    const membership = await assertRoomAccess(task.roomId, user.id);
    if (membership.room.kind === "agent_private") assertAgentViewer(request, user.id);
    const approvals = await prisma.agentToolApproval.findMany({
      where: { taskId },
      orderBy: { requestedAt: "asc" }
    });
    return noStoreResponse(jsonOk({ approvals }));
  } catch (error) {
    return noStoreResponse(errorToResponse(error));
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { taskId } = await params;
    const decision = await readJsonBody(request, toolApprovalDecisionSchema);
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: { id: true, roomId: true }
    });
    if (!task) {
      return noStoreResponse(jsonError("Agent task not found.", 404));
    }

    const membership = await assertRoomAccess(task.roomId, user.id);
    const isPrivate = membership.room.kind === "agent_private";
    if (isPrivate) assertAgentViewer(request, user.id);
    const result = await decideToolApproval({
      taskId,
      approvalId: decision.approvalId,
      decision: decision.decision,
      decidedById: user.id
    });

    if (decision.decision === "approve" && env.AGENT_TASK_INLINE_RUN) {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      const resumedTask = await runAgentTask(taskId);
      return noStoreResponse(jsonOk(isPrivate
        ? { approval: { id: result.approval.id, status: result.approval.status }, task: { id: resumedTask.id, status: resumedTask.status } }
        : { approval: result.approval, task: resumedTask }));
    }

    return noStoreResponse(jsonOk(isPrivate
      ? { approval: { id: result.approval.id, status: result.approval.status }, task: { id: result.task.id, status: result.task.status } }
      : result));
  } catch (error) {
    if (error instanceof ToolApprovalNotFoundError) {
      return noStoreResponse(jsonError(error.message, 404));
    }
    if (error instanceof ToolApprovalConflictError) {
      return noStoreResponse(jsonError(error.message, 409));
    }
    return noStoreResponse(errorToResponse(error));
  }
}
