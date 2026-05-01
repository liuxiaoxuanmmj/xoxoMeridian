import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { createHumanMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const messages = await prisma.message.findMany({
      where: { roomId: params.roomId },
      orderBy: { createdAt: "asc" },
      include: {
        sender: { select: { id: true, displayName: true, avatarLabel: true } },
        senderAgent: { select: { id: true, displayName: true, slug: true } },
        finalTask: {
          include: {
            toolCalls: true,
            llmCalls: true,
            eventLogs: { orderBy: { createdAt: "asc" } }
          }
        },
        sourceTask: { select: { id: true, status: true } }
      }
    });

    return jsonOk({ messages });
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);
    const body = await request.json();
    const content = String(body.content ?? "").trim();

    if (!content) {
      return Response.json({ error: "Message content is required." }, { status: 400 });
    }

    const result = await createHumanMessage({
      roomId: params.roomId,
      userId: user.id,
      content,
      forceAgent: Boolean(body.forceAgent)
    });

    if (result.task && process.env.AGENT_TASK_INLINE_RUN !== "false") {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      await runAgentTask(result.task.id);
    }

    return jsonOk(result, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}
