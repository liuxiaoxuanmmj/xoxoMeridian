import { prisma } from "@/lib/prisma";
import { listRoomsForUser } from "@/lib/room-list";
import { normalizeFocusStatus } from "@/lib/study";

export async function getRoomSnapshot(roomId: string, userIdForRoomList?: string) {
  const [
    messages,
    memos,
    scheduledJobs,
    runningTasks,
    recentTasks,
    pendingApprovals,
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
    prisma.agentToolApproval.findMany({
      where: {
        status: "pending",
        task: { roomId }
      },
      orderBy: { requestedAt: "asc" },
      select: {
        id: true,
        taskId: true,
        toolName: true,
        risk: true,
        input: true,
        requestedAt: true
      }
    }),
    prisma.room.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        name: true,
        participants: {
          select: {
            user: {
              select: {
                id: true,
                displayName: true,
                avatarLabel: true,
                profile: {
                  select: {
                    city: true,
                    country: true,
                    timezone: true,
                  },
                },
              },
            },
          },
          orderBy: { joinedAt: "asc" },
        },
      },
    }),
    // Sidebar room list piggy-backed onto the snapshot so LeftRail updates in
    // lockstep with the active room (~2s tick). Skipped when no userId.
    userIdForRoomList ? listRoomsForUser(userIdForRoomList) : Promise.resolve(undefined)
  ]);

  const focusStates = room
    ? await prisma.focusState.findMany({
        where: {
          userId: {
            in: room.participants.map((participant) => participant.user.id),
          },
        },
        select: {
          userId: true,
          status: true,
          mode: true,
          expectedEndAt: true,
          lastStudySeenAt: true,
        },
      })
    : [];

  const studyStatusByUserId = new Map(
    focusStates.map((state) => [
      state.userId,
      {
        state: normalizeFocusStatus(state.status),
        mode: state.mode,
        expectedEndAt: state.expectedEndAt?.toISOString() ?? null,
        lastStudySeenAt: state.lastStudySeenAt?.toISOString() ?? null,
      },
    ])
  );

  return {
    room: room
      ? {
          ...room,
          participants: room.participants.map((participant) => ({
            user: {
              id: participant.user.id,
              displayName: participant.user.displayName,
              avatarLabel: participant.user.avatarLabel,
              profile: participant.user.profile
                ? {
                    city: participant.user.profile.city,
                    country: participant.user.profile.country,
                    timezone: participant.user.profile.timezone,
                  }
                : null,
              studyStatus: studyStatusByUserId.get(participant.user.id) ?? null,
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
      recentTasks,
      pendingApprovals
    },
    rooms
  };
}
