import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import { buildStudyStats, getLocalDateKey, getStudyDateWindow } from "@/lib/study-calendar";
import { reconcileExpiredFocusTimer } from "@/lib/study-transitions";
import type { RoomSnapshot } from "@/components/chat/types";

export { buildStudyStats, getLocalDateKey } from "@/lib/study-calendar";

export async function getStudyRoomForUser(userId: string) {
  const participant = await prisma.roomParticipant.findFirst({
    where: { userId },
    include: { room: true },
    orderBy: { joinedAt: "asc" },
  });
  if (!participant) {
    throw new Response("The current user does not belong to a room.", { status: 404 });
  }
  return participant.room;
}

type StudyMode = "focus" | "short" | "long";
type StudyStatus = "idle" | "running" | "paused";
type DbStudyStatus = StudyStatus | "focusing";

export function normalizeFocusStatus(status: DbStudyStatus): StudyStatus {
  return status === "focusing" ? "running" : status;
}

export function serializeFocusState(state: {
  status: DbStudyStatus;
  mode?: StudyMode | null;
  plannedMinutes: number;
  remainingSeconds?: number | null;
  startedAt?: Date | string | null;
  expectedEndAt?: Date | string | null;
  pausedAt?: Date | string | null;
  currentSessionKey?: string | null;
}) {
  const iso = (value: Date | string | null | undefined) =>
    value ? new Date(value).toISOString() : null;

  return {
    status: normalizeFocusStatus(state.status),
    mode: state.mode ?? "focus",
    plannedMinutes: state.plannedMinutes,
    remainingSeconds: state.remainingSeconds ?? null,
    startedAt: iso(state.startedAt),
    expectedEndAt: iso(state.expectedEndAt),
    pausedAt: iso(state.pausedAt),
    sessionKey: state.currentSessionKey ?? null,
  };
}

export async function getStudyPageData(
  user: { id: string; displayName: string; avatarLabel: string },
  timeZone: string
) {
  const userId = user.id;
  const now = new Date();
  await reconcileExpiredFocusTimer(userId, now);
  const room = await getStudyRoomForUser(userId);
  const { statsWindowStart, todayStartUtc, tomorrowStartUtc } = getStudyDateWindow(now, timeZone);
  const todayKey = getLocalDateKey(now, timeZone);

  const [state, goals, recentSessions, statsSessions, participants, memberStates] = await Promise.all([
    prisma.focusState.findUnique({
      where: { userId },
      select: {
        status: true,
        mode: true,
        plannedMinutes: true,
        remainingSeconds: true,
        startedAt: true,
        expectedEndAt: true,
        pausedAt: true,
        currentSessionKey: true,
      },
    }),
    prisma.studyGoal.findMany({
      where: { userId, roomId: room.id, localDate: todayKey },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.focusSession.findMany({
      where: { userId, status: "completed" },
      orderBy: { startedAt: "desc" },
      take: 10,
    }),
    prisma.focusSession.findMany({
      where: {
        userId,
        status: "completed",
        startedAt: { gte: statsWindowStart },
      },
      orderBy: { startedAt: "desc" },
    }),
    prisma.roomParticipant.findMany({
      where: { roomId: room.id },
      include: {
        user: {
          select: { id: true, displayName: true, avatarLabel: true },
        },
      },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.focusState.findMany({
      where: { roomId: room.id },
      select: {
        userId: true,
        status: true,
        mode: true,
        expectedEndAt: true,
        lastStudySeenAt: true,
      },
    }),
  ]);

  const memberStateMap = new Map(
    memberStates.map((fs) => [fs.userId, fs])
  );

  const isOnline = (lastStudySeenAt: Date | null) => {
    if (!lastStudySeenAt) return false;
    return now.getTime() - new Date(lastStudySeenAt).getTime() <= 45_000;
  };

  const memberIds = participants.map((p) => p.userId);

  const todayMemberSessions = await prisma.focusSession.findMany({
    where: {
      userId: { in: memberIds },
      status: "completed",
      mode: "focus",
      startedAt: { gte: todayStartUtc, lt: tomorrowStartUtc },
    },
  });

  const todayMinutesMap = new Map<string, number>();
  for (const session of todayMemberSessions) {
    todayMinutesMap.set(
      session.userId,
      (todayMinutesMap.get(session.userId) ?? 0) + session.actualMinutes
    );
  }

  const members = participants.map((p) => {
    const fs = memberStateMap.get(p.userId);
    const focusStatus = fs ? normalizeFocusStatus(fs.status) : "idle";
    return {
      userId: p.userId,
      displayName: p.user.displayName,
      avatarLabel: p.user.avatarLabel,
      online: isOnline(fs?.lastStudySeenAt ?? null),
      studyStatus: fs
        ? {
            state: focusStatus,
            mode: fs.mode ?? "focus",
            expectedEndAt: fs.expectedEndAt?.toISOString() ?? null,
            lastStudySeenAt: fs.lastStudySeenAt?.toISOString() ?? null,
          }
        : null,
      todayFocusMinutes: todayMinutesMap.get(p.userId) ?? 0,
    };
  });

  const chatSnapshot = await getRoomSnapshot(room.id, user.id) as unknown as RoomSnapshot;

  return {
    room: { id: room.id, slug: room.slug, name: room.name },
    currentUser: { id: user.id, displayName: user.displayName, avatarLabel: user.avatarLabel },
    currentState: state
      ? serializeFocusState(state)
      : {
          status: "idle" as const,
          mode: "focus" as const,
          plannedMinutes: 25,
          remainingSeconds: null,
          startedAt: null,
          expectedEndAt: null,
          pausedAt: null,
          sessionKey: null,
        },
    goals,
    members,
    recentSessions: recentSessions.map((session) => ({
      id: session.id,
      userId: session.userId,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt.toISOString(),
      actualMinutes: session.actualMinutes,
    })),
    stats: buildStudyStats(statsSessions, now, timeZone),
    chatSnapshot,
  };
}
