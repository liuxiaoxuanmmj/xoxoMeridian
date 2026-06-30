import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requirePageUser: vi.fn(),
  getStudyPageData: vi.fn(),
  SiteNav: vi.fn(() => null),
  StudyDashboard: vi.fn(() => null),
}));

vi.mock("@/lib/auth", () => ({
  requirePageUser: mocks.requirePageUser,
}));

vi.mock("@/lib/study", () => ({
  getStudyPageData: mocks.getStudyPageData,
}));

vi.mock("@/components/blog/SiteNav", () => ({
  SiteNav: mocks.SiteNav,
}));

vi.mock("@/components/study/StudyDashboard", () => ({
  StudyDashboard: mocks.StudyDashboard,
}));

describe("StudyPage theme", () => {
  it("uses the shared sage page background", async () => {
    mocks.requirePageUser.mockResolvedValueOnce({
      id: "user-1",
      displayName: "Alice",
      avatarLabel: "A",
      profile: { timezone: "Asia/Shanghai" },
    });
    mocks.getStudyPageData.mockResolvedValueOnce({
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
    });

    const { default: StudyPage } = await import("@/app/study/page");
    const element = await StudyPage();

    expect(element.props.className).toContain("bg-sage-50");
    expect(element.props.className).not.toContain("bg-[#f5f0e6]");
  });
});
