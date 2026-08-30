import {
  decideToolApproval,
  ToolApprovalConflictError,
  ToolApprovalNotFoundError
} from "@/agent/tool-approval";
import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonError, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { readJsonBody, toolApprovalDecisionSchema } from "@/lib/validation";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const user = await requireCurrentUser();
    const { taskId } = await params;
    const task = await prisma.agentTask.findUnique({
      where: { id: taskId },
      select: { id: true, roomId: true }
    });
    if (!task) {
      return jsonError("Agent task not found.", 404);
    }

    await assertRoomAccess(task.roomId, user.id);
    const approvals = await prisma.agentToolApproval.findMany({
      where: { taskId },
      orderBy: { requestedAt: "asc" }
    });
    return jsonOk({ approvals });
  } catch (error) {
    return errorToResponse(error);
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
      return jsonError("Agent task not found.", 404);
    }

    await assertRoomAccess(task.roomId, user.id);
    const result = await decideToolApproval({
      taskId,
      approvalId: decision.approvalId,
      decision: decision.decision,
      decidedById: user.id
    });

    if (decision.decision === "approve" && env.AGENT_TASK_INLINE_RUN) {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      const resumedTask = await runAgentTask(taskId);
      return jsonOk({ approval: result.approval, task: resumedTask });
    }

    return jsonOk(result);
  } catch (error) {
    if (error instanceof ToolApprovalNotFoundError) {
      return jsonError(error.message, 404);
    }
    if (error instanceof ToolApprovalConflictError) {
      return jsonError(error.message, 409);
    }
    return errorToResponse(error);
  }
}
