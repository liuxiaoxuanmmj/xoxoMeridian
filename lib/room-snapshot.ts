import { prisma } from "@/lib/prisma";

export async function getRoomSnapshot(roomId: string) {
  const [messages, notes, memos, reminders, runningTasks, recentTasks, room] = await Promise.all([
    prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "asc" },
      take: 80,
      include: {
        sender: { select: { id: true, displayName: true, avatarLabel: true } },
        senderAgent: { select: { id: true, displayName: true, slug: true } },
        finalTask: {
          select: {
            id: true,
            status: true,
            toolCalls: { select: { id: true, toolName: true, status: true, durationMs: true, error: true } },
            llmCalls: { select: { id: true, provider: true, model: true, status: true, totalTokens: true } }
          }
        },
        sourceTask: { select: { id: true, status: true } }
      }
    }),
    prisma.note.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 12
    }),
    prisma.memo.findMany({
      where: { roomId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 12
    }),
    prisma.reminder.findMany({
      where: { roomId, status: "pending" },
      orderBy: [{ dueAt: "asc" }, { createdAt: "desc" }],
      take: 12
    }),
    prisma.agentTask.count({
      where: { roomId, status: { in: ["pending", "running"] } }
    }),
    prisma.agentTask.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, status: true, createdAt: true, error: true }
    }),
    prisma.room.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: { include: { profile: true } }
          },
          orderBy: { joinedAt: "asc" }
        }
      }
    })
  ]);

  return {
    room,
    messages,
    notes,
    memos,
    reminders,
    agentStatus: {
      isWorking: runningTasks > 0,
      runningTasks,
      recentTasks
    }
  };
}
