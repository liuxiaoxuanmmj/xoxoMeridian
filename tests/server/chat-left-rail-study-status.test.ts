/**
 * @vitest-environment jsdom
 */

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(() => ({ push: vi.fn(), refresh: vi.fn() })),
}));

import { LeftRail } from "@/components/chat/LeftRail";

describe("LeftRail study status", () => {
  it("renders 专注中 for participants whose studyStatus is focusing", () => {
    const html = renderToStaticMarkup(
      React.createElement(LeftRail, {
        currentUser: {
          id: "user-1",
          displayName: "Alice",
          avatarLabel: "A",
          profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
        },
        participants: [
          {
            id: "user-1",
            displayName: "Alice",
            avatarLabel: "A",
            profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
            studyStatus: { state: "running", expectedEndAt: "2026-06-29T01:25:00.000Z" },
          },
        ],
        currentRoomId: "room-1",
        rooms: [
          {
            id: "room-1",
            slug: "room-1",
            name: "Room 1",
            createdAt: "2026-06-28T00:00:00.000Z",
            updatedAt: "2026-06-28T00:00:00.000Z",
            messageCount: 3,
          },
        ],
      })
    );

    expect(html).toContain("专注中");
  });

  it("renders 专注中 with the new studyStatus shape (state, mode, lastStudySeenAt)", () => {
    const html = renderToStaticMarkup(
      React.createElement(LeftRail, {
        currentUser: {
          id: "user-1",
          displayName: "Alice",
          avatarLabel: "A",
          profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
        },
        participants: [
          {
            id: "user-1",
            displayName: "Alice",
            avatarLabel: "A",
            profile: { city: "Shanghai", country: "CN", timezone: "Asia/Shanghai" },
            studyStatus: {
              state: "running",
              mode: "focus",
              expectedEndAt: "2026-06-30T01:25:00.000Z",
              lastStudySeenAt: "2026-06-30T01:00:00.000Z",
            },
          },
        ],
        currentRoomId: "room-1",
        rooms: [
          {
            id: "room-1",
            slug: "room-1",
            name: "Room 1",
            createdAt: "2026-06-28T00:00:00.000Z",
            updatedAt: "2026-06-28T00:00:00.000Z",
            messageCount: 3,
          },
        ],
      })
    );

    expect(html).toContain("专注中");
  });
});
