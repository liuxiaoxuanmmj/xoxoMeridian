import { prisma } from "@/lib/prisma";
import { getRoomSnapshot } from "@/lib/room-snapshot";
import type { RoomSnapshot } from "@/components/chat/types";

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

type StudySessionLike = {
  id: string;
  userId: string;
  startedAt: string | Date;
  endedAt: string | Date;
  actualMinutes: number;
  mode?: string | null;
  status?: string | null;
  user?: { displayName: string } | null;
};

export type TimelineFocusInterval = {
  id: string;
  userId: string;
  userDisplayName: string;
  startedAt: string;
  endedAt: string;
  actualMinutes: number;
  lane: 0 | 1;
};

export type TimelineFocusSegment = {
  id: string;
  userId: string;
  userDisplayName: string;
  startedAt: string;
  endedAt: string;
  actualMinutes: number;
  lane: 0 | 1;
  topPx: number;
  heightPx: number;
};

function getLocalDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const day = Number(parts.find((part) => part.type === "day")?.value);
  return { year, month, day };
}

function getDayKey(date: Date, timeZone: string) {
  const { year, month, day } = getLocalDateParts(date, timeZone);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getLocalDateKey(date: Date, timeZone: string): string {
  return getDayKey(date, timeZone);
}

function getWeekKey(date: Date, timeZone: string) {
  const { year, month, day } = getLocalDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = utcDate.getUTCDay(); // 0 = Sunday
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday);
  return utcDate.toISOString().slice(0, 10);
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
  };
}

function extractStreakDays(
  sessions: StudySessionLike[],
  now: Date,
  timeZone: string
): number {
  const dateSet = new Set<string>();
  for (const s of sessions) {
    dateSet.add(getDayKey(new Date(s.startedAt), timeZone));
  }

  const todayKey = getDayKey(now, timeZone);
  if (!dateSet.has(todayKey)) return 0;

  let streak = 0;
  const cursor = new Date(now);
  while (true) {
    const key = getDayKey(cursor, timeZone);
    if (dateSet.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return streak;
}

export function buildStudyStats(
  sessions: StudySessionLike[],
  now: Date,
  timeZone: string
) {
  const todayKey = getDayKey(now, timeZone);
  const weekKey = getWeekKey(now, timeZone);

  const filteredSessions = sessions.filter(
    (s) =>
      (s.mode === undefined || s.mode === null || s.mode === "focus") &&
      (s.status === undefined || s.status === null || s.status === "completed")
  );

  const stats = filteredSessions.reduce(
    (acc, session) => {
      const startedAt = new Date(session.startedAt);
      if (getDayKey(startedAt, timeZone) === todayKey) {
        acc.todayCount += 1;
        acc.todayMinutes += session.actualMinutes;
      }
      if (getWeekKey(startedAt, timeZone) === weekKey) {
        acc.weekCount += 1;
        acc.weekMinutes += session.actualMinutes;
      }
      return acc;
    },
    { todayCount: 0, todayMinutes: 0, weekCount: 0, weekMinutes: 0 }
  );

  return {
    ...stats,
    streakDays: extractStreakDays(filteredSessions, now, timeZone),
  };
}

export function buildTimelineFocusIntervals(
  sessions: StudySessionLike[]
): TimelineFocusInterval[] {
  const sorted = [...sessions].sort(
    (a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
  );
  const orderedUsers = [...new Set(sorted.map((session) => session.userId))];

  return sorted.map((session) => ({
    id: session.id,
    userId: session.userId,
    userDisplayName: session.user?.displayName ?? "Unknown",
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.endedAt).toISOString(),
    actualMinutes: session.actualMinutes,
    lane: Math.max(0, orderedUsers.indexOf(session.userId)) as 0 | 1,
  }));
}

type TimelineMarker = {
  publishedAt: string | Date;
  centerY: number;
};

function interpolateYAt(timestamp: number, markers: TimelineMarker[]) {
  if (markers.length === 0) return 0;
  if (markers.length === 1) return markers[0].centerY;

  const normalized = markers
    .map((marker) => ({
      ts: new Date(marker.publishedAt).getTime(),
      y: marker.centerY,
    }))
    .sort((a, b) => a.ts - b.ts);

  if (timestamp <= normalized[0].ts) return normalized[0].y;
  if (timestamp >= normalized[normalized.length - 1].ts) return normalized[normalized.length - 1].y;

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const left = normalized[index];
    const right = normalized[index + 1];
    if (timestamp >= left.ts && timestamp <= right.ts) {
      const ratio = (timestamp - left.ts) / Math.max(1, right.ts - left.ts);
      return left.y + (right.y - left.y) * ratio;
    }
  }

  return normalized[normalized.length - 1].y;
}

export function projectFocusIntervalsToSegments(
  intervals: TimelineFocusInterval[],
  markers: TimelineMarker[]
): TimelineFocusSegment[] {
  return intervals.map((interval) => {
    const startY = interpolateYAt(new Date(interval.startedAt).getTime(), markers);
    const endY = interpolateYAt(new Date(interval.endedAt).getTime(), markers);

    return {
      ...interval,
      topPx: Math.min(startY, endY),
      heightPx: Math.max(8, Math.abs(endY - startY)),
    };
  });
}

export async function getStudyPageData(
  user: { id: string; displayName: string; avatarLabel: string },
  timeZone: string
) {
  const room = await getStudyRoomForUser(user.id);
  const userId = user.id;
  const now = new Date();
  const statsWindowStart = new Date(now.getTime() - 8 * 24 * 60 * 60 * 1000);
  const todayKey = getLocalDateKey(now, timeZone);
  const localDateParts = getLocalDateParts(now, timeZone);
  const todayStartUtc = new Date(Date.UTC(localDateParts.year, localDateParts.month - 1, localDateParts.day));

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
      startedAt: { gte: todayStartUtc },
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
