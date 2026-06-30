import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() })),
}));

vi.mock("@/components/chat/useRoomChat", () => ({
  useRoomChat: vi.fn(() => ({
    snapshot: {
      room: {
        id: "room-1",
        name: "Room 1",
        participants: [
          {
            user: {
              id: "user-1",
              displayName: "Alice",
              avatarLabel: "A",
              profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
            },
          },
        ],
      },
      messages: [],
      memos: [],
      scheduledJobs: [],
      agentStatus: {
        isWorking: false,
        runningTasks: 0,
        recentTasks: [],
      },
      rooms: [],
    },
    connState: "open",
    authSyncing: false,
    replaceMessage: vi.fn(),
    removeMessage: vi.fn(),
    appendMessage: vi.fn(),
    sendMessage: vi.fn(),
    roomId: "room-1",
  })),
}));

import { ChatApp } from "@/components/chat/ChatApp";

describe("ChatApp top navigation", () => {
  it("renders a Study entry in the top nav", () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatApp, {
        currentUser: {
          id: "user-1",
          displayName: "Alice",
          avatarLabel: "A",
          profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
        },
        initialSnapshot: {
          room: { id: "room-1", name: "Room 1", participants: [] },
          messages: [],
          memos: [],
          scheduledJobs: [],
          agentStatus: { isWorking: false, runningTasks: 0, recentTasks: [] },
          rooms: [],
        },
      })
    );

    expect(html).toContain(">Study<");
    expect(html).toContain('href="/study"');
  });
});
