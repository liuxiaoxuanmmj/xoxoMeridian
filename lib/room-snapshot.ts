import { prisma } from "@/lib/prisma";
import { listRoomsForUser } from "@/lib/room-list";

export async function getRoomSnapshot(roomId: string, userIdForRoomList?: string) {
  const [
    messages,
    memos,
    scheduledJobs,
    runningTasks,
    recentTasks,
    room,
    rooms
  ] = await Promise.all([
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
    prisma.memo.findMany({
      where: { roomId },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 12
    }),
    prisma.scheduledJob.findMany({
      where: { roomId, enabled: true },
      orderBy: { nextRunAt: "asc" },
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
    }),
    // Sidebar room list piggy-backed onto the snapshot so LeftRail updates in
    // lockstep with the active room (~2s tick). Skipped when no userId.
    userIdForRoomList ? listRoomsForUser(userIdForRoomList) : Promise.resolve(undefined)
  ]);

  const focusStates = room
    ? await prisma.focusState.findMany({
        where: {
          userId: {
            in: room.participants.map((participant) => participant.userId),
          },
        },
        select: {
          userId: true,
          status: true,
          expectedEndAt: true,
        },
      })
    : [];

  const studyStatusByUserId = new Map(
    focusStates.map((state) => [
      state.userId,
      {
        state: state.status,
        expectedEndAt: state.expectedEndAt?.toISOString() ?? null,
      },
    ])
  );

  return {
    room: room
      ? {
          ...room,
          participants: room.participants.map((participant) => ({
            ...participant,
            user: {
              ...participant.user,
              studyStatus: studyStatusByUserId.get(participant.userId) ?? null,
            },
          })),
        }
      : room,
    messages,
    memos,
    scheduledJobs,
    agentStatus: {
      isWorking: runningTasks > 0,
      runningTasks,
      recentTasks
    },
    rooms
  };
}
