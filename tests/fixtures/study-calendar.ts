export const studyCalendarCases = [
  {
    name: "哈瓦那春季跳过午夜",
    timeZone: "America/Havana",
    today: "2026-03-08",
    previousStart: "2026-03-07T05:00:00.000Z",
    start: "2026-03-08T05:00:00.000Z",
    end: "2026-03-09T04:00:00.000Z",
    now: "2026-03-09T03:30:00.000Z",
  },
  {
    name: "哈瓦那秋季重复午夜",
    timeZone: "America/Havana",
    today: "2026-11-01",
    previousStart: "2026-10-31T04:00:00.000Z",
    start: "2026-11-01T04:00:00.000Z",
    end: "2026-11-02T05:00:00.000Z",
    now: "2026-11-02T04:30:00.000Z",
  },
  {
    name: "纽约春季跳时",
    timeZone: "America/New_York",
    today: "2026-03-08",
    previousStart: "2026-03-07T05:00:00.000Z",
    start: "2026-03-08T05:00:00.000Z",
    end: "2026-03-09T04:00:00.000Z",
    now: "2026-03-09T03:30:00.000Z",
  },
  {
    name: "纽约秋季回退",
    timeZone: "America/New_York",
    today: "2026-11-01",
    previousStart: "2026-10-31T04:00:00.000Z",
    start: "2026-11-01T04:00:00.000Z",
    end: "2026-11-02T05:00:00.000Z",
    now: "2026-11-02T04:30:00.000Z",
  },
  {
    name: "伦敦春季跳时",
    timeZone: "Europe/London",
    today: "2026-03-29",
    previousStart: "2026-03-28T00:00:00.000Z",
    start: "2026-03-29T00:00:00.000Z",
    end: "2026-03-29T23:00:00.000Z",
    now: "2026-03-29T22:30:00.000Z",
  },
  {
    name: "伦敦秋季回退",
    timeZone: "Europe/London",
    today: "2026-10-25",
    previousStart: "2026-10-23T23:00:00.000Z",
    start: "2026-10-24T23:00:00.000Z",
    end: "2026-10-26T00:00:00.000Z",
    now: "2026-10-25T23:30:00.000Z",
  },
  {
    name: "上海普通周日",
    timeZone: "Asia/Shanghai",
    today: "2026-06-28",
    previousStart: "2026-06-26T16:00:00.000Z",
    start: "2026-06-27T16:00:00.000Z",
    end: "2026-06-28T16:00:00.000Z",
    now: "2026-06-28T15:30:00.000Z",
  },
];

export function studyCalendarSessions(scenario: typeof studyCalendarCases[number]) {
  const start = Date.parse(scenario.start);
  return [
    { startedAt: Date.parse(scenario.previousStart) + 12 * 60 * 60_000, actualMinutes: 25 },
    // 虽然结束于今天，仍按 startedAt 归入昨天。
    { startedAt: start - 1, actualMinutes: 10 },
    { startedAt: start, actualMinutes: 25 },
    { startedAt: start + 30 * 60_000, actualMinutes: 35 },
    { startedAt: start, actualMinutes: 5, mode: "short" },
    { startedAt: start, actualMinutes: 15, mode: "long" },
    { startedAt: start, actualMinutes: 90, status: "cancelled" },
  ].map((session, index) => ({
    id: `calendar-${index}`,
    userId: "calendar-user",
    mode: "focus",
    status: "completed",
    ...session,
    startedAt: new Date(session.startedAt).toISOString(),
    endedAt: new Date(session.startedAt + session.actualMinutes * 60_000).toISOString(),
  }));
}
