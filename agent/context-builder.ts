import {
  projectMemoryForRequester,
  visibleMemoryOwnerKeys
} from "@/agent/memory-identity";
import type {
  StructuredRoomContext,
  StructuredRoomParticipant
} from "@/agent/types";
import { resolveParticipantPair } from "@/lib/participant-resolution";
import { prisma } from "@/lib/prisma";

export async function buildAgentContext(
  roomId: string,
  requestedById: string | null
) {
  const room = await prisma.room.findUniqueOrThrow({
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
  });
  const participantViews = room.participants.map(toParticipantView);
  const { self, partner } = resolveParticipantPair(
    participantViews,
    requestedById,
    (participant) => participant.userId
  );
  const effectiveRequestedById = self?.userId ?? null;
  const memoryOwnerKeys = visibleMemoryOwnerKeys(
    effectiveRequestedById,
    room.participants
  );

  const [recentMessages, memos, memories, globalSummary, rangeSummaries, scheduledJobs] = await Promise.all([
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
    prisma.memory.findMany({
      where: {
        roomId,
        ownerKey: { in: memoryOwnerKeys }
      },
      orderBy: { updatedAt: "desc" },
      take: 30
    }),
    prisma.messageSummary.findFirst({ where: { roomId, type: "global" } }),
    prisma.messageSummary.findMany({ where: { roomId, type: "range" }, orderBy: { createdAt: "desc" }, take: 5 }),
    prisma.scheduledJob.findMany({
      where: { roomId, enabled: true },
      orderBy: { nextRunAt: "asc" },
      take: 20
    })
  ]);

  const messages = recentMessages.reverse();

  const categorizedMemories = memories.reduce(
    (acc, m) => {
      const entry = projectMemoryForRequester(
        m,
        effectiveRequestedById,
        room.participants
      );
      if (!entry) return acc;
      if (entry.key.startsWith("her.")) acc.aboutHer.push(entry);
      else if (entry.key.startsWith("me.")) acc.aboutMe.push(entry);
      else if (entry.key.startsWith("shared.")) acc.shared.push(entry);
      return acc;
    },
    { aboutHer: [] as Array<{ key: string; value: string }>, aboutMe: [] as Array<{ key: string; value: string }>, shared: [] as Array<{ key: string; value: string }> }
  );

  const roomContext: StructuredRoomContext = {
    room: { name: room.name, slug: room.slug },
    requestedById: effectiveRequestedById,
    self,
    partner,
    participants: participantViews,
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
    semanticMemory: categorizedMemories,
    summaries: {
      global: globalSummary
        ? { summary: globalSummary.summary, createdAt: globalSummary.createdAt.toISOString() }
        : null,
      recent: rangeSummaries.map((s) => ({ summary: s.summary, createdAt: s.createdAt.toISOString() }))
    }
  };

  return {
    room,
    participants: room.participants,
    recentMessages: messages,
    memos,
    memories,
    globalSummary,
    rangeSummaries,
    scheduledJobs,
    roomContext
  };
}

function toParticipantView(
  participant: {
    userId: string;
    user: {
      displayName: string;
      profile: {
        city: string;
        timezone: string;
        profileNote: string | null;
      } | null;
    };
  }
): StructuredRoomParticipant {
  return {
    userId: participant.userId,
    displayName: participant.user.displayName,
    city: participant.user.profile?.city ?? null,
    timezone: participant.user.profile?.timezone ?? null,
    profileNote: participant.user.profile?.profileNote ?? null
  };
}
