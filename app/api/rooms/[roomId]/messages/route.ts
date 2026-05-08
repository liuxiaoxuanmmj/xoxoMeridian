import { assertRoomAccess } from "@/lib/access";
import { errorToResponse, jsonOk } from "@/lib/api";
import { requireCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { createHumanMessage } from "@/lib/messages";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rate-limit";
import { messagePostSchema, readJsonBody } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const recent = await prisma.message.findMany({
      where: { roomId: params.roomId },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: {
        sender: { select: { id: true, displayName: true, avatarLabel: true } },
        senderAgent: { select: { id: true, displayName: true, slug: true } },
        finalTask: {
          include: {
            toolCalls: true,
            llmCalls: true
          }
        },
        sourceTask: { select: { id: true, status: true } }
      }
    });
    const messages = recent.reverse();

    return jsonOk(
      { messages },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return errorToResponse(error);
  }
}

export async function POST(request: Request, { params }: { params: { roomId: string } }) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `msg:${user.id}`, 30, 60_000);
    if (limited) return limited;

    const { content, forceAgent } = await readJsonBody(request, messagePostSchema);

    const result = await createHumanMessage({
      roomId: params.roomId,
      userId: user.id,
      content,
      forceAgent
    });

    if (result.task && env.AGENT_TASK_INLINE_RUN) {
      const { runAgentTask } = await import("@/agent/agent-runtime");
      await runAgentTask(result.task.id);
    }

    return jsonOk(result, { status: 201 });
  } catch (error) {
    return errorToResponse(error);
  }
}

// DELETE /api/rooms/[roomId]/messages — wipe conversation state for this room
// (messages, agent tasks, memos/notes/reminders, scheduled jobs, memories,
// summaries, event logs) while keeping the Room + its participants intact.
// Runs inside a single transaction so partial wipes can't leave the room in a
// half-cleared state.
export async function DELETE(
  request: Request,
  { params }: { params: { roomId: string } }
) {
  try {
    const user = await requireCurrentUser();
    await assertRoomAccess(params.roomId, user.id);

    const limited = enforceRateLimit(request, `room-wipe:${user.id}`, 10, 60_000);
    if (limited) return limited;

    const roomId = params.roomId;

    await prisma.$transaction([
      // Order matters: ScheduledJob has no FK to Message, but some Memo/Note/
      // Reminder rows do FK into AgentTask. Deleting AgentTask cascades to its
      // children (ToolCall, LLMCall, EventLog) and sets FK columns on Message/
      // Memo/Note/Reminder to null. The room-level deletes below then drop the
      // rows themselves.
      prisma.scheduledJob.deleteMany({ where: { roomId } }),
      prisma.agentTask.deleteMany({ where: { roomId } }),
      prisma.message.deleteMany({ where: { roomId } }),
      prisma.memo.deleteMany({ where: { roomId } }),
      prisma.note.deleteMany({ where: { roomId } }),
      prisma.reminder.deleteMany({ where: { roomId } }),
      prisma.memory.deleteMany({ where: { roomId } }),
      prisma.messageSummary.deleteMany({ where: { roomId } }),
      prisma.eventLog.deleteMany({ where: { roomId } }),
    ]);

    return jsonOk({ ok: true });
  } catch (error) {
    return errorToResponse(error);
  }
}
