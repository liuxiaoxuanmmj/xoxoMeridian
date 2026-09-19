import type { ComponentProps } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";

import { StudyDashboard } from "@/components/study/StudyDashboard";
import { mockServer } from "@/tests/mocks/server";

type StudyData = ComponentProps<typeof StudyDashboard>["initialData"];

function pageData(afterMidnight: boolean): StudyData {
  return {
    room: { id: "calendar-room", slug: "calendar-room", name: "学习房间" },
    currentUser: { id: "self", displayName: "本人", avatarLabel: "我" },
    currentState: {
      status: afterMidnight ? "idle" : "paused", mode: "focus", plannedMinutes: 25,
      remainingSeconds: afterMidnight ? null : 60, startedAt: null, expectedEndAt: null,
      pausedAt: null, sessionKey: "calendar-focus",
    },
    goals: [],
    recentSessions: [],
    chatSnapshot: null,
    members: [
      { userId: "self", displayName: "本人", avatarLabel: "我", online: true, studyStatus: null, todayFocusMinutes: afterMidnight ? 45 : 60 },
      { userId: "partner", displayName: "伙伴", avatarLabel: "伴", online: false, studyStatus: null, todayFocusMinutes: afterMidnight ? 45 : 60 },
    ],
    stats: afterMidnight
      ? { todayCount: 1, todayMinutes: 45, weekCount: 3, weekMinutes: 105, streakDays: 3 }
      : { todayCount: 2, todayMinutes: 60, weekCount: 2, weekMinutes: 60, streakDays: 2 },
  };
}

it("本地午夜前后的服务端统计在本人概览、伙伴列表和刷新后保持一致", async () => {
  mockServer.use(
    http.post("http://localhost:3000/api/study/presence", () => HttpResponse.json({ ok: true })),
    http.post("http://localhost:3000/api/study/stop", () => HttpResponse.json({ ok: true })),
    http.get("http://localhost:3000/api/study", () => HttpResponse.json(pageData(true))),
  );
  const user = userEvent.setup();
  render(<StudyDashboard initialData={pageData(false)} />);
  const overview = within(screen.getByRole("heading", { name: "概览" }).closest("section")!);
  const members = within(screen.getByRole("heading", { name: "学习伙伴" }).closest("section")!);

  await waitFor(() => expect(overview.getByText("1h", { exact: true })).toBeVisible());
  expect(overview.getByText("2 天")).toBeVisible();
  expect(screen.getByText("今日已专注 1h")).toBeVisible();
  expect(members.getAllByText("· 1h", { exact: true })).toHaveLength(2);

  // stop 成功后的真实 GET 刷新路径消费新一天的统计载荷。
  await user.click(screen.getByRole("button", { name: "停止" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "开始专注" })).toBeVisible());
  expect(overview.getByText("45m", { exact: true })).toBeVisible();
  expect(overview.getByText("3 天")).toBeVisible();
  expect(screen.getByText("今日已专注 45m")).toBeVisible();
  expect(members.getAllByText("· 45m", { exact: true })).toHaveLength(2);
});
