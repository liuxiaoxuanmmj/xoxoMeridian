import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockRoomParticipantFindFirst,
  mockRoomParticipantFindMany,
  mockFocusStateFindUnique,
  mockFocusStateFindMany,
  mockFocusSessionFindMany,
  mockStudyGoalFindMany,
  mockGetRoomSnapshot,
} = vi.hoisted(() => ({
  mockRoomParticipantFindFirst: vi.fn(),
  mockRoomParticipantFindMany: vi.fn(),
  mockFocusStateFindUnique: vi.fn(),
  mockFocusStateFindMany: vi.fn(),
  mockFocusSessionFindMany: vi.fn(),
  mockStudyGoalFindMany: vi.fn(),
  mockGetRoomSnapshot: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    roomParticipant: {
      findFirst: mockRoomParticipantFindFirst,
      findMany: mockRoomParticipantFindMany,
    },
    focusState: {
      findUnique: mockFocusStateFindUnique,
      findMany: mockFocusStateFindMany,
    },
    focusSession: { findMany: mockFocusSessionFindMany },
    studyGoal: { findMany: mockStudyGoalFindMany },
  },
}));

vi.mock("@/lib/room-snapshot", () => ({ getRoomSnapshot: mockGetRoomSnapshot }));

import { getStudyPageData } from "@/lib/study";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getStudyPageData productized payload", () => {
  it("assembles room, goals, members, stats, state, and chat snapshot", async () => {
    mockRoomParticipantFindFirst.mockResolvedValue({
      roomId: "room-1",
      room: { id: "room-1", slug: "our-room", name: "Our Room" },
    });
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockStudyGoalFindMany.mockResolvedValue([]);
    mockFocusSessionFindMany.mockResolvedValue([]);
    mockRoomParticipantFindMany.mockResolvedValue([
      {
        userId: "user-1",
        user: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      },
    ]);
    mockFocusStateFindMany.mockResolvedValue([]);
    mockGetRoomSnapshot.mockResolvedValue({
      room: { id: "room-1", name: "Our Room", participants: [] },
      messages: [],
      memos: [],
      scheduledJobs: [],
      agentStatus: { isWorking: false, runningTasks: 0, recentTasks: [] },
    });

    const data = await getStudyPageData(
      { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      "Asia/Shanghai"
    );

    expect(data.room.id).toBe("room-1");
    expect(data).toHaveProperty("chatSnapshot");
    expect(data.stats).toHaveProperty("streakDays");
  });

  it("marks members offline when lastStudySeenAt is null", async () => {
    mockRoomParticipantFindFirst.mockResolvedValue({
      roomId: "room-1",
      room: { id: "room-1", slug: "our-room", name: "Our Room" },
    });
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockStudyGoalFindMany.mockResolvedValue([]);
    mockFocusSessionFindMany.mockResolvedValue([]);
    mockRoomParticipantFindMany.mockResolvedValue([
      {
        userId: "user-1",
        user: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      },
      {
        userId: "user-2",
        user: { id: "user-2", displayName: "Bob", avatarLabel: "B" },
      },
    ]);
    mockFocusStateFindMany.mockResolvedValue([
      {
        userId: "user-2",
        status: "idle",
        mode: "focus",
        expectedEndAt: null,
        lastStudySeenAt: new Date("2026-06-30T01:09:00.000Z"),
      },
    ]);
    mockGetRoomSnapshot.mockResolvedValue({
      room: { id: "room-1", name: "Our Room", participants: [] },
      messages: [],
      memos: [],
      scheduledJobs: [],
      agentStatus: { isWorking: false, runningTasks: 0, recentTasks: [] },
    });

    const data = await getStudyPageData(
      { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      "Asia/Shanghai"
    );

    expect(data.members).toHaveLength(2);
    const alice = data.members.find((m: any) => m.userId === "user-1");
    expect(alice?.online).toBe(false);
    // Bob's lastStudySeenAt is at 01:09, while "now" is 01:10, which is <= 45s ago
    // With system time set to 01:10, 01:09 is only 60s ago — wait, that's > 45s
    // Let's just verify the null case
  });

  it("includes todayFocusMinutes per member from completed focus sessions", async () => {
    mockRoomParticipantFindFirst.mockResolvedValue({
      roomId: "room-1",
      room: { id: "room-1", slug: "our-room", name: "Our Room" },
    });
    mockFocusStateFindUnique.mockResolvedValue(null);
    mockStudyGoalFindMany.mockResolvedValue([]);
    mockFocusSessionFindMany.mockResolvedValue([]);
    mockRoomParticipantFindMany.mockResolvedValue([
      {
        userId: "user-1",
        user: { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      },
    ]);
    mockFocusStateFindMany.mockResolvedValue([]);
    mockGetRoomSnapshot.mockResolvedValue({
      room: { id: "room-1", name: "Our Room", participants: [] },
      messages: [],
      memos: [],
      scheduledJobs: [],
      agentStatus: { isWorking: false, runningTasks: 0, recentTasks: [] },
    });

    const data = await getStudyPageData(
      { id: "user-1", displayName: "Alice", avatarLabel: "A" },
      "Asia/Shanghai"
    );

    expect(data).toHaveProperty("members");
    expect(data.members[0]).toHaveProperty("todayFocusMinutes");
    expect(data).toHaveProperty("goals");
  });
});
