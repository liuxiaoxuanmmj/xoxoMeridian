import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { StudyDashboard } from "@/components/study/StudyDashboard";
import type { RoomSnapshot } from "@/components/chat/types";

type StudyPageData = {
  currentState: {
    status: "idle" | "focusing";
    plannedMinutes: number;
    startedAt: string | null;
    expectedEndAt: string | null;
  };
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
  };
  chatSnapshot?: RoomSnapshot | null;
};

function makeStudyData(overrides?: Partial<StudyPageData>): StudyPageData {
  return {
    currentState: {
      status: "idle",
      plannedMinutes: 25,
      startedAt: null,
      expectedEndAt: null,
    },
    recentSessions: [],
    stats: { todayCount: 0, todayMinutes: 0, weekCount: 0, weekMinutes: 0 },
    currentUser: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
    chatSnapshot: null,
    ...overrides,
  };
}

describe("StudyDashboard", () => {
  it("renders the idle state CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: {
          currentState: {
            status: "idle",
            plannedMinutes: 25,
            startedAt: null,
            expectedEndAt: null,
          },
          recentSessions: [],
          stats: { todayCount: 0, todayMinutes: 0, weekCount: 0, weekMinutes: 0 },
        },
      })
    );

    expect(html).toContain("开始专注");
    expect(html).toContain("25:00");
  });

  it("renders the focusing state CTA", () => {
    const html = renderToStaticMarkup(
      React.createElement(StudyDashboard, {
        initialData: {
          currentState: {
            status: "focusing",
            plannedMinutes: 25,
            startedAt: "2026-06-29T01:00:00.000Z",
            expectedEndAt: "2026-06-29T01:25:00.000Z",
          },
          recentSessions: [],
          stats: { todayCount: 1, todayMinutes: 25, weekCount: 1, weekMinutes: 25 },
        },
      })
    );

    expect(html).toContain("专注中");
    expect(html).toContain("结束专注");
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
});
