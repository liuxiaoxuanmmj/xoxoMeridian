type StudySessionLike = {
  id: string;
  userId: string;
  startedAt: string | Date;
  endedAt: string | Date;
  actualMinutes: number;
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

function getWeekKey(date: Date, timeZone: string) {
  const { year, month, day } = getLocalDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = utcDate.getUTCDay(); // 0 = Sunday
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday);
  return utcDate.toISOString().slice(0, 10);
}

export function buildStudyStats(
  sessions: StudySessionLike[],
  now: Date,
  timeZone: string
) {
  const todayKey = getDayKey(now, timeZone);
  const weekKey = getWeekKey(now, timeZone);

  return sessions.reduce(
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
