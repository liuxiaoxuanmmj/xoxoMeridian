import type { StructuredRoomContext } from "@/agent/types";
import { prisma } from "@/lib/prisma";

export async function buildAgentContext(roomId: string) {
  const [room, recentMessages, memos, memories, summaries, scheduledJobs] = await Promise.all([
    prisma.room.findUniqueOrThrow({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              include: { profile: true }
            }
          },
          orderBy: { joinedAt: "asc" }
        }
      }
    }),
    prisma.message.findMany({
      where: { roomId },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        sender: { select: { displayName: true } },
        senderAgent: { select: { displayName: true } }
      }
    }),
    prisma.memo.findMany({ where: { roomId }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 10 }),
    prisma.memory.findMany({ where: { roomId }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.messageSummary.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take: 3 }),
    prisma.scheduledJob.findMany({
      where: { roomId, enabled: true },
      orderBy: { nextRunAt: "asc" },
      take: 20
    })
  ]);

  const messages = recentMessages.reverse();

  const roomContext: StructuredRoomContext = {
    room: { name: room.name, slug: room.slug },
    participants: room.participants.map((participant) => ({
      displayName: participant.user.displayName,
      city: participant.user.profile?.city ?? null,
      timezone: participant.user.profile?.timezone ?? null,
      profileNote: participant.user.profile?.profileNote ?? null
    })),
    recentMessages: messages.map((message) => ({
      from: message.sender?.displayName ?? message.senderAgent?.displayName ?? message.senderType,
      content: message.content,
      at: message.createdAt.toISOString()
    })),
    pinnedMemos: memos.filter((m) => m.pinned).map((m) => ({ title: m.title, content: m.content })),
    activeSchedules: scheduledJobs.map((j) => ({
      jobId: j.id,
      cron: j.cron,
      timezone: j.timezone,
      nextRunAt: j.nextRunAt.toISOString(),
      description:
        (j.payload as { description?: string | null } | null)?.description ?? null
    })),
    semanticMemory: memories.map((m) => ({ key: m.key, value: m.value })),
    summaries: summaries.map((s) => ({ summary: s.summary, createdAt: s.createdAt.toISOString() }))
  };

  return {
    room,
    participants: room.participants,
    recentMessages: messages,
    memos,
    memories,
    summaries,
    scheduledJobs,
    roomContext
  };
}
