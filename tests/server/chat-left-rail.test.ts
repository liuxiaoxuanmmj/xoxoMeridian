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

describe("LeftRail", () => {
  it("does not render the Atlas entry in chat navigation", () => {
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

    expect(html).not.toContain("Atlas");
    expect(html).not.toContain("记忆画板");
    expect(html).not.toContain("/chat/room-1/atlas");
  });
});
