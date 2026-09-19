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

function getLocalDateParts(date: Date, timeZone: string, dateFormatter?: Intl.DateTimeFormat) {
  const formatter = dateFormatter ?? new Intl.DateTimeFormat("en-CA", {
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

function getDayKey(date: Date, timeZone: string, formatter?: Intl.DateTimeFormat) {
  const { year, month, day } = getLocalDateParts(date, timeZone, formatter);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function getLocalDateKey(date: Date, timeZone: string): string {
  return getDayKey(date, timeZone);
}

function shiftDateKey(key: string, days: number) {
  const date = new Date(`${key}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getStudyDateWindow(now: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const todayKey = getDayKey(now, timeZone, formatter);
  const startOfDate = (key: string) => {
    const utcDate = Date.parse(`${key}T00:00:00.000Z`);
    // 按本地日期寻找第一毫秒，午夜重复取第一次、午夜跳过取当天首个时刻。
    // 搜索窗口围绕同年月日的 UTC 起点，涵盖跨日时区偏移与 DST。
    let lower = utcDate - 36 * 60 * 60_000;
    let upper = utcDate + 36 * 60 * 60_000;
    while (lower < upper) {
      const middle = Math.floor((lower + upper) / 2);
      if (getDayKey(new Date(middle), timeZone, formatter) < key) {
        lower = middle + 1;
      } else {
        upper = middle;
      }
    }
    return new Date(lower);
  };
  return {
    todayStartUtc: startOfDate(todayKey),
    tomorrowStartUtc: startOfDate(shiftDateKey(todayKey, 1)),
    // 保留八天回看范围，并完整读取这些本地日期。
    statsWindowStart: startOfDate(shiftDateKey(todayKey, -8)),
  };
}

function getWeekKey(date: Date, timeZone: string) {
  const { year, month, day } = getLocalDateParts(date, timeZone);
  const utcDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = utcDate.getUTCDay(); // 0 = Sunday
  utcDate.setUTCDate(utcDate.getUTCDate() - weekday);
  return utcDate.toISOString().slice(0, 10);
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
  // UTC Date 只承载年月日，不代表目标时区中的绝对时刻。
  const cursor = new Date(`${todayKey}T00:00:00.000Z`);
  while (dateSet.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
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
