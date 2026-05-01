import { prisma } from "@/lib/prisma";

export async function buildAgentContext(roomId: string) {
  const [room, recentMessages, notes, memos, reminders, memories, summaries] = await Promise.all([
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
    prisma.note.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.memo.findMany({ where: { roomId }, orderBy: [{ pinned: "desc" }, { createdAt: "desc" }], take: 10 }),
    prisma.reminder.findMany({ where: { roomId, status: "pending" }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.memory.findMany({ where: { roomId }, orderBy: { updatedAt: "desc" }, take: 10 }),
    prisma.messageSummary.findMany({ where: { roomId }, orderBy: { createdAt: "desc" }, take: 3 })
  ]);

  const messages = recentMessages.reverse();
  const roomContext = [
    `Room: ${room.name}`,
    `Participants: ${room.participants
      .map((participant) => {
        const profile = participant.user.profile;
        return `${participant.user.displayName} (${profile?.city ?? "unknown city"}, ${
          profile?.timezone ?? "unknown timezone"
        })`;
      })
      .join("; ")}`,
    `Recent messages: ${messages
      .map((message) => `${message.sender?.displayName ?? message.senderAgent?.displayName ?? message.senderType}: ${message.content}`)
      .join(" | ")}`,
    `Active reminders: ${reminders.map((reminder) => reminder.title).join("; ") || "none"}`,
    `Pinned memos: ${memos.map((memo) => `${memo.title}: ${memo.content}`).join("; ") || "none"}`,
    `Notes: ${notes.map((note) => note.content).join("; ") || "none"}`
  ].join("\n");

  return {
    room,
    participants: room.participants,
    recentMessages: messages,
    notes,
    memos,
    reminders,
    memories,
    summaries,
    roomContext
  };
}
