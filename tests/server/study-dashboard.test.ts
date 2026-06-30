import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudyDashboard } from "@/components/study/StudyDashboard";
import type { RoomSnapshot } from "@/components/chat/types";

type TimerMode = "focus" | "short" | "long";
type TimerState = "idle" | "running" | "paused";

type StudyPageData = {
  room: { id: string; slug: string; name: string };
  currentUser: { id: string; displayName: string; avatarLabel: string };
  currentState: {
    status: TimerState;
    mode: TimerMode;
    plannedMinutes: number;
    remainingSeconds: number | null;
    startedAt: string | null;
    expectedEndAt: string | null;
    pausedAt: string | null;
  };
  goals: Array<{
    id: string;
    text: string;
    done: boolean;
    sortOrder: number;
    localDate: string;
  }>;
  members: Array<{
    userId: string;
    displayName: string;
    avatarLabel: string;
    online: boolean;
    studyStatus: {
      state: TimerState;
      mode: TimerMode;
      expectedEndAt: string | null;
      lastStudySeenAt: string | null;
    } | null;
    todayFocusMinutes: number;
  }>;
  recentSessions: Array<{
    id: string;
    userId: string;
    startedAt: string;
    endedAt: string;
    actualMinutes: number;
  }>;
  stats: {
    todayCount: number;
    todayMinutes: number;
    weekCount: number;
    weekMinutes: number;
    streakDays: number;
  };
  chatSnapshot: RoomSnapshot | null;
};

function makeStudyData(overrides?: Partial<StudyPageData>): StudyPageData {
  return {
    room: { id: "room-1", slug: "our-room", name: "Our Room" },
    currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
    currentState: {
      status: "idle",
      mode: "focus",
      plannedMinutes: 25,
      remainingSeconds: null,
      startedAt: null,
      expectedEndAt: null,
      pausedAt: null,
    },
    goals: [],
    members: [],
    recentSessions: [],
    stats: { todayCount: 0, todayMinutes: 0, weekCount: 0, weekMinutes: 0, streakDays: 0 },
    chatSnapshot: null,
    ...overrides,
  };
}

describe("StudyDashboard", () => {
  it("renders the idle state CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: makeStudyData({
          currentState: {
            status: "idle",
            mode: "focus",
            plannedMinutes: 25,
            remainingSeconds: null,
            startedAt: null,
            expectedEndAt: null,
            pausedAt: null,
          },
        }),
      })
    );

    expect(html).toContain("开始专注");
    expect(html).toContain("25:00");
  });

  it("renders the running state CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: makeStudyData({
          currentState: {
            status: "running",
            mode: "focus",
            plannedMinutes: 25,
            remainingSeconds: null,
            startedAt: "2026-06-29T01:00:00.000Z",
            expectedEndAt: "2026-06-29T01:25:00.000Z",
            pausedAt: null,
          },
          stats: { todayCount: 1, todayMinutes: 25, weekCount: 1, weekMinutes: 25, streakDays: 0 },
        }),
      })
    );

    expect(html).toContain("专注中");
    expect(html).toContain("停止");
  });

  it("renders the study room mini chat from the shared room snapshot", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: makeStudyData({
          chatSnapshot: {
            room: { id: "room-1", slug: "our-room", name: "Our Room", participants: [] },
            messages: [
              {
                id: "m-1",
                roomId: "room-1",
                senderId: "user-2",
                senderAgentId: null,
                senderType: "human",
                content: "一起加油",
                targetType: "all",
                status: "sent",
                metadata: null,
                createdAt: "2026-06-30T01:00:00.000Z",
                sender: { id: "user-2", displayName: "Bob", avatarLabel: "B" },
              },
            ],
            memos: [],
            scheduledJobs: [],
            agentStatus: { isWorking: false, runningTasks: 0, recentTasks: [] },
          },
        }),
      })
    );
    expect(html).toContain("互相加油");
    expect(html).toContain("一起加油");
  });

  it("renders Figma-style study room sections", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, { initialData: makeStudyData() })
    );

    expect(html).toContain("心流屋");
    expect(html).toContain("今日概览");
    expect(html).toContain("今日清单");
    expect(html).toContain("学习伙伴");
    expect(html).toContain("氛围音效");
    expect(html).toContain("互相加油");
  });

  it("renders real room members in study buddies", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: makeStudyData({
          members: [
            { userId: "user-1", displayName: "Alice", avatarLabel: "A", online: true, studyStatus: { state: "running", mode: "focus", expectedEndAt: "2026-06-30T01:00:00.000Z", lastStudySeenAt: "2026-06-30T01:00:00.000Z" }, todayFocusMinutes: 25 },
            { userId: "user-2", displayName: "Bob", avatarLabel: "B", online: false, studyStatus: { state: "idle", mode: "focus", expectedEndAt: null, lastStudySeenAt: null }, todayFocusMinutes: 0 },
          ],
        }),
      })
    );

    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain("专注中");
  });
});
